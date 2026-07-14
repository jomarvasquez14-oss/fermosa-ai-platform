// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BrowserManager } from "./browser-manager";
import { MockBrowserDriver } from "./drivers/mock/mock-driver";
import { withRetry, withTimeout } from "./policies";
import { SelectorRegistry } from "./selectors";
import { browserError } from "./types";

const credentials = { username: "fermosa-audit-bot", password: "test" };

function makeManager(driver = new MockBrowserDriver()) {
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
    expect(registry.selector("patient-search", "nameInput")).toBe("input[name=search]");
    expect(registry.fingerprint("dashboard").length).toBeGreaterThan(0);
  });

  it("unknown selector keys fail loudly as CRM_LAYOUT", () => {
    expect(() => registry.selector("login", "nonexistent")).toThrow(/not defined/);
  });

  it("capabilities gate unconfirmed selectors (invoice detail is off in v1)", () => {
    expect(registry.capability("invoiceDetail")).toBe(false);
    expect(registry.capability("unknown-capability")).toBe(false);
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
    for (const code of ["CRM_CHALLENGE", "CRM_LAYOUT", "CRM_FORBIDDEN"] as const) {
      let attempts = 0;
      await expect(
        withRetry({ maxAttempts: 5, delayMs: 1 }, async () => {
          attempts++;
          throw browserError(code, code);
        })
      ).rejects.toMatchObject({ code });
      expect(attempts).toBe(1);
    }
  });

  it("withTimeout maps expiry to CRM_TIMEOUT", async () => {
    await expect(
      withTimeout(20, "Slow thing", new Promise((resolve) => setTimeout(resolve, 200)))
    ).rejects.toMatchObject({ code: "CRM_TIMEOUT" });
  });
});

describe("session lifecycle", () => {
  it("logs in through the login page and reaches the dashboard", async () => {
    const { manager } = makeManager();
    await manager.session.login();
    expect(manager.session.status).toBe("authenticated");
    expect((await manager.session.healthCheck()).ok).toBe(true);
  });

  it("performs exactly one login per execution (ensureAuthenticated reuses)", async () => {
    const { manager } = makeManager();
    await manager.session.ensureAuthenticated();
    const firstStatus = manager.session.status;
    await manager.session.ensureAuthenticated();
    expect(firstStatus).toBe("authenticated");
    expect(manager.session.status).toBe("authenticated");
  });

  it("stops with CRM_CHALLENGE when a captcha appears — never bypassed", async () => {
    const driver = new MockBrowserDriver();
    driver.showCaptcha(true);
    const { manager } = makeManager(driver);
    await expect(manager.session.login()).rejects.toMatchObject({ code: "CRM_CHALLENGE" });
  });

  it("dismisses the announcement interstitial after login", async () => {
    const driver = new MockBrowserDriver();
    driver.showAnnouncement(true);
    const { manager } = makeManager(driver);
    await manager.session.login();
    expect(manager.session.status).toBe("authenticated");
    expect(await driver.isVisible("#announcement-modal")).toBe(false);
  });

  it("detects session expiry and reconnects during navigation", async () => {
    const { driver, manager } = makeManager();
    await manager.session.login();
    driver.expireSession();

    const page = await manager.navigation.navigateTo("patient-search");
    expect(manager.session.status).toBe("authenticated"); // auto-reconnected
    expect(await page.isOpen()).toBe(true);
  });

  it("logout disconnects the session through the CRM's own control", async () => {
    const { driver, manager } = makeManager();
    await manager.session.login();
    await manager.session.logout();
    expect(manager.session.status).toBe("disconnected");
    expect(driver.state.authenticated).toBe(false);
    await expect(manager.navigation.navigateTo("invoice")).rejects.toMatchObject({
      code: "CRM_SESSION",
    });
  });
});

describe("navigation", () => {
  it("navigates with retry through transient network failures", async () => {
    const { driver, manager } = makeManager();
    await manager.session.login();
    driver.failNextNavigations(2); // fewer than maxAttempts
    const page = await manager.navigation.navigateTo("invoice");
    expect(page.pageId).toBe("invoice");
    expect(manager.navigation.history).toContain("invoice");
  });

  it("exhausted network retries surface CRM_UNAVAILABLE", async () => {
    const { driver, manager } = makeManager();
    await manager.session.login();
    driver.failNextNavigations(10);
    await expect(manager.navigation.navigateTo("invoice")).rejects.toMatchObject({
      code: "CRM_UNAVAILABLE",
    });
  });

  it("layout drift is CRM_LAYOUT naming the missing selector — no retry loops", async () => {
    const { driver, manager } = makeManager();
    await manager.session.login();
    driver.breakLayout("/activity-logs");
    await expect(manager.navigation.navigateTo("activity-log")).rejects.toThrow(
      /does not match crm-selectors\/v1/
    );
  });

  it("resolves parameterized paths ({cid}) through pathParams", async () => {
    const { driver, manager } = makeManager();
    await manager.session.login();
    const page = await manager.navigation.navigateTo("patient-profile", { cid: "1001" });
    expect(page.pageId).toBe("patient-profile");
    expect(await driver.currentUrl()).toBe("/clients/1001");
  });

  it("keeps a navigation history for diagnostics", async () => {
    const { manager } = makeManager();
    await manager.session.login();
    await manager.navigation.navigateTo("patient-search");
    await manager.navigation.navigateTo("invoice");
    expect(manager.navigation.history).toEqual(["patient-search", "invoice"]);
  });
});
