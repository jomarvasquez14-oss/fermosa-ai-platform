// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BrowserManager } from "./browser-manager";
import { MockBrowserDriver } from "./drivers/mock-driver";
import { withRetry, withTimeout } from "./policies";
import { SelectorRegistry } from "./selector-registry";
import { browserError } from "./types";
import { PatientSearchPage } from "./pages";

const credentials = { username: "fermosa-audit-bot", password: "test" };

function manager(driver = new MockBrowserDriver()) {
  return {
    driver,
    manager: new BrowserManager(driver, credentials, new SelectorRegistry(), {
      maxAttempts: 3,
      delayMs: 1,
    }),
  };
}

describe("SelectorRegistry", () => {
  const registry = new SelectorRegistry();

  it("resolves versioned selectors and fingerprints", () => {
    expect(registry.version).toBe("crm-selectors/v1");
    expect(registry.selector("login", "username")).toBe("input[name=username]");
    expect(registry.fingerprint("dashboard").length).toBeGreaterThan(0);
  });

  it("unknown selector keys fail loudly as CRM_LAYOUT", () => {
    expect(() => registry.selector("login", "nonexistent")).toThrow(/not defined/);
  });
});

describe("policies", () => {
  it("withRetry retries transient failures then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry({ maxAttempts: 3, delayMs: 1 }, async () => {
      if (++attempts < 3) throw browserError("CRM_UNAVAILABLE", "flaky");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("withRetry gives up after maxAttempts", async () => {
    await expect(
      withRetry({ maxAttempts: 2, delayMs: 1 }, async () => {
        throw browserError("CRM_UNAVAILABLE", "always down");
      })
    ).rejects.toThrow(/always down/);
  });

  it("withRetry never retries captcha/layout/forbidden", async () => {
    let attempts = 0;
    await expect(
      withRetry({ maxAttempts: 5, delayMs: 1 }, async () => {
        attempts++;
        throw browserError("CRM_CHALLENGE", "captcha");
      })
    ).rejects.toThrow(/captcha/);
    expect(attempts).toBe(1);
  });

  it("withTimeout maps expiry to CRM_TIMEOUT", async () => {
    await expect(
      withTimeout(20, "Slow thing", new Promise((resolve) => setTimeout(resolve, 200)))
    ).rejects.toMatchObject({ code: "CRM_TIMEOUT" });
  });
});

describe("session lifecycle", () => {
  it("logs in through the login page and reaches the dashboard", async () => {
    const { manager: m } = manager();
    await m.session.login();
    expect(m.session.status).toBe("authenticated");
    expect((await m.session.healthCheck()).ok).toBe(true);
  });

  it("stops with CRM_CHALLENGE when a captcha appears — never bypassed", async () => {
    const driver = new MockBrowserDriver();
    driver.showCaptcha(true);
    const { manager: m } = manager(driver);
    await expect(m.session.login()).rejects.toMatchObject({ code: "CRM_CHALLENGE" });
  });

  it("detects session expiry and reconnects during navigation", async () => {
    const { driver, manager: m } = manager();
    await m.session.login();
    driver.expireSession();

    const page = await m.navigation.navigateTo("patient-search");
    expect(m.session.status).toBe("authenticated"); // auto-reconnected
    expect(await page.isOpen()).toBe(true);
  });

  it("logout disconnects the session", async () => {
    const { manager: m } = manager();
    await m.session.login();
    await m.session.logout();
    expect(m.session.status).toBe("disconnected");
    await expect(m.navigation.navigateTo("invoice")).rejects.toMatchObject({
      code: "CRM_SESSION",
    });
  });
});

describe("navigation", () => {
  it("navigates with retry through transient network failures", async () => {
    const { driver, manager: m } = manager();
    await m.session.login();
    driver.failNextNavigations(2); // fewer than maxAttempts
    const page = await m.navigation.navigateTo("invoice");
    expect(page.pageId).toBe("invoice");
    expect(m.navigation.history).toContain("invoice");
  });

  it("exhausted network retries surface CRM_UNAVAILABLE", async () => {
    const { driver, manager: m } = manager();
    await m.session.login();
    driver.failNextNavigations(10);
    await expect(m.navigation.navigateTo("invoice")).rejects.toMatchObject({
      code: "CRM_UNAVAILABLE",
    });
  });

  it("layout drift is CRM_LAYOUT naming the missing selector — no retry loops", async () => {
    const { driver, manager: m } = manager();
    await m.session.login();
    driver.breakLayout("/activity-logs");
    await expect(m.navigation.navigateTo("activity-log")).rejects.toThrow(
      /does not match crm-selectors\/v1/
    );
  });

  it("page objects operate through registry selectors only", async () => {
    const { manager: m } = manager();
    await m.session.login();
    const page = (await m.navigation.navigateTo("patient-search")) as PatientSearchPage;
    const results = await page.searchByName("Santos");
    expect(results).toBe(3);
  });

  it("keeps a navigation history for diagnostics", async () => {
    const { manager: m } = manager();
    await m.session.login();
    await m.navigation.navigateTo("patient-search");
    await m.navigation.navigateTo("invoice");
    expect(m.navigation.history).toEqual(["patient-search", "invoice"]);
  });
});
