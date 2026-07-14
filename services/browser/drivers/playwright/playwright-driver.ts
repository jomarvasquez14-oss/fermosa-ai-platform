import type { Browser, BrowserContext, Locator, Page } from "playwright";
import { logger } from "@/lib/logger";
import type {
  BrowserDriver,
  BrowserLocator,
  DownloadResult,
  TableData,
  WaitForOptions,
} from "@/services/browser/driver/browser-driver";
import {
  CrmForbiddenError,
  CrmUnavailableError,
  LayoutChangedError,
  NavigationTimeoutError,
} from "@/services/browser/types";

/**
 * PlaywrightBrowserDriver (ADR-033) — the ONLY module in the codebase that
 * touches Playwright (runtime import is lazy, inside `launch()`, so nothing
 * pulls browser binaries into the Next bundle). Everything Playwright is
 * translated at this boundary: TimeoutError → CRM_TIMEOUT, network/crash →
 * CRM_UNAVAILABLE, 401/403 responses → CRM_FORBIDDEN. Cookies live in the
 * in-memory context only — never persisted to disk (CRM_DISCOVERY §5).
 */

export interface PlaywrightDriverOptions {
  /** CRM origin, e.g. https://crm.example.test — relative paths resolve here. */
  baseUrl: string;
  headless?: boolean;
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
  /** Jittered pause before each navigation (0/0 disables). */
  politenessDelayMs?: { min: number; max: number };
}

/**
 * Runs INSIDE the page as a SOURCE STRING, never a TS function: server
 * transpilers (tsx/esbuild keepNames, swc helpers) inject helper calls like
 * `__name(...)` into compiled function bodies, and Playwright would
 * serialize that compiled body into a page where the helpers do not exist.
 * A raw string evaluated as an expression survives every transpiler.
 *
 * It captures a table including what the CRM hides in cells — readonly input
 * values, disabled select selections, action links. Date inputs reject the
 * CRM's malformed values ("1970-10-11 00:00:00"), so the raw `value`
 * attribute is the fallback.
 */
function tableExpression(selector: string, index: number): string {
  return `(() => {
  const table = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
  if (!table) return null;
  const clean = (s) => (s ?? "").replace(/\\s+/g, " ").trim();
  const readCell = (cell) => {
    // Hidden inputs are bookkeeping (treatment_record_id shares the DATE
    // cell — 2026-07-13 profile capture, M0042A); data lives in the first
    // NON-hidden control.
    const control = cell.querySelector("input:not([type=hidden]), select, textarea");
    let value = null;
    let selectedLabel = null;
    if (control && control.tagName === "SELECT") {
      const option = control.selectedIndex >= 0 ? control.options[control.selectedIndex] : null;
      value = option ? option.value : null;
      selectedLabel = option ? clean(option.textContent) : null;
    } else if (control) {
      value = control.value || control.getAttribute("value") || null;
    }
    const links = Array.from(cell.querySelectorAll("a")).map((a) => ({
      href: a.getAttribute("href"),
      title: a.getAttribute("title"),
      text: clean(a.textContent),
    }));
    return { text: clean(cell.innerText ?? cell.textContent), value, selectedLabel, links };
  };
  const headers = Array.from(table.querySelectorAll(":scope > thead th")).map((th) =>
    clean(th.textContent)
  );
  const rows = Array.from(table.querySelectorAll(":scope > tbody > tr")).map((tr) =>
    Array.from(tr.querySelectorAll(":scope > td, :scope > th")).map(readCell)
  );
  return { headers, rows };
})()`;
}

export class PlaywrightBrowserDriver implements BrowserDriver {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private readonly options: PlaywrightDriverOptions) {}

  // ---- lifecycle ----------------------------------------------------------

  async launch(): Promise<void> {
    if (this.page) return;
    try {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: this.options.headless ?? true });
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
      this.page.setDefaultNavigationTimeout(this.options.navigationTimeoutMs ?? 30_000);
      this.page.setDefaultTimeout(this.options.actionTimeoutMs ?? 10_000);
      logger.info("Playwright browser launched", { headless: this.options.headless ?? true });
    } catch (error) {
      throw new CrmUnavailableError(
        "Chromium could not be launched — is Playwright installed (pnpm exec playwright install chromium)?",
        { cause: error }
      );
    }
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  // ---- navigation -----------------------------------------------------------

  async goto(url: string): Promise<void> {
    const page = await this.requirePage();
    await this.politenessPause();
    const target = new URL(url, this.options.baseUrl).toString();
    try {
      const response = await page.goto(target, { waitUntil: "domcontentloaded" });
      this.assertResponseAllowed(response?.status(), target);
    } catch (error) {
      throw this.mapNavigationError(error, target);
    }
  }

  async goBack(): Promise<void> {
    const page = await this.requirePage();
    await page.goBack({ waitUntil: "domcontentloaded" });
  }

  async reload(): Promise<void> {
    const page = await this.requirePage();
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  async currentUrl(): Promise<string> {
    const page = await this.requirePage();
    return page.url();
  }

  // ---- element actions --------------------------------------------------------

  async click(selector: string): Promise<void> {
    await this.action(selector, (locator) => locator.click());
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.action(selector, (locator) => locator.fill(value));
  }

  async select(selector: string, value: string): Promise<void> {
    await this.action(selector, async (locator) => {
      await locator.selectOption(value);
    });
  }

  async waitFor(selector: string, options?: WaitForOptions): Promise<void> {
    const page = await this.requirePage();
    try {
      await page
        .locator(selector)
        .first()
        .waitFor({ state: options?.state ?? "visible", timeout: options?.timeoutMs });
    } catch (error) {
      throw this.mapActionError(error, `waitFor(${selector})`);
    }
  }

  // ---- observation ------------------------------------------------------------

  async text(selector: string): Promise<string> {
    const page = await this.requirePage();
    try {
      return ((await page.locator(selector).first().innerText()) ?? "").trim();
    } catch (error) {
      throw this.mapActionError(error, `text(${selector})`);
    }
  }

  async readText(selector: string): Promise<string | null> {
    const page = await this.requirePage();
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) return null;
    const content = await locator.textContent();
    return content === null ? null : content.trim();
  }

  async isVisible(selector: string): Promise<boolean> {
    const page = await this.requirePage();
    return page.locator(selector).first().isVisible();
  }

  locator(selector: string): BrowserLocator {
    const resolve = async (): Promise<Locator> => {
      const page = await this.requirePage();
      return page.locator(selector);
    };
    return {
      count: async () => (await resolve()).count(),
      texts: async () => (await resolve()).allInnerTexts(),
      values: async () => {
        const locator = await resolve();
        const count = await locator.count();
        const values: (string | null)[] = [];
        for (let i = 0; i < count; i++) {
          values.push(
            await locator
              .nth(i)
              .inputValue()
              .catch(() => null)
          );
        }
        return values;
      },
      attrs: async (name: string) => {
        const locator = await resolve();
        const count = await locator.count();
        const attrs: (string | null)[] = [];
        for (let i = 0; i < count; i++) {
          attrs.push(await locator.nth(i).getAttribute(name));
        }
        return attrs;
      },
    };
  }

  async table(selector: string): Promise<TableData> {
    const page = await this.requirePage();
    const data = (await page.evaluate(tableExpression(selector, 0))) as TableData | null;
    if (data === null) {
      throw new LayoutChangedError(`table(${selector}): no matching table on ${page.url()}.`);
    }
    return data;
  }

  async tables(selector: string): Promise<TableData[]> {
    const page = await this.requirePage();
    const count = await page.locator(selector).count();
    const results: TableData[] = [];
    for (let i = 0; i < count; i++) {
      const data = (await page.evaluate(tableExpression(selector, i))) as TableData | null;
      if (data) results.push(data);
    }
    return results;
  }

  async screenshot(): Promise<Uint8Array> {
    const page = await this.requirePage();
    return new Uint8Array(await page.screenshot({ fullPage: true }));
  }

  async download(selector: string): Promise<DownloadResult> {
    const page = await this.requirePage();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(selector).first().click(),
    ]);
    const path = await download.path();
    return { path, suggestedFilename: download.suggestedFilename() };
  }

  async evaluate<T>(script: string): Promise<T> {
    const page = await this.requirePage();
    return page.evaluate(script) as Promise<T>;
  }

  // ---- internals ----------------------------------------------------------

  private async requirePage(): Promise<Page> {
    if (!this.page) await this.launch();
    if (!this.page) {
      throw new CrmUnavailableError("Browser page is not available after launch.");
    }
    return this.page;
  }

  private async action(
    selector: string,
    operation: (locator: Locator) => Promise<void>
  ): Promise<void> {
    const page = await this.requirePage();
    try {
      await operation(page.locator(selector).first());
    } catch (error) {
      throw this.mapActionError(error, `action on ${selector}`);
    }
  }

  private async politenessPause(): Promise<void> {
    const delay = this.options.politenessDelayMs ?? { min: 250, max: 750 };
    if (delay.max <= 0) return;
    const ms = delay.min + Math.random() * Math.max(0, delay.max - delay.min);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertResponseAllowed(status: number | undefined, target: string): void {
    if (status === 401 || status === 403) {
      throw new CrmForbiddenError(
        `The CRM answered ${status} for ${target} — the service account lacks access.`
      );
    }
    if (status !== undefined && status >= 500) {
      throw new CrmUnavailableError(`The CRM answered ${status} for ${target}.`);
    }
  }

  private mapNavigationError(error: unknown, target: string): unknown {
    if (this.isPlaywrightTimeout(error)) {
      return new NavigationTimeoutError(`Navigation to ${target} timed out.`, { cause: error });
    }
    if (error instanceof Error && /net::|ERR_|crash|closed/i.test(error.message)) {
      return new CrmUnavailableError(`The CRM is unreachable at ${target}: ${error.message}`, {
        cause: error,
      });
    }
    return error;
  }

  private mapActionError(error: unknown, what: string): unknown {
    if (this.isPlaywrightTimeout(error)) {
      return new NavigationTimeoutError(`${what} timed out.`, { cause: error });
    }
    return error;
  }

  private isPlaywrightTimeout(error: unknown): boolean {
    return error instanceof Error && error.name === "TimeoutError";
  }
}
