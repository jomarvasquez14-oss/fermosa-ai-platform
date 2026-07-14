/**
 * BrowserDriver — the ONLY surface a real browser must implement (ADR-031,
 * extended ADR-033). Everything above this interface (pages, session,
 * navigation, connectors) is browser-agnostic; Playwright exists solely
 * inside `../drivers/playwright/`, the mock solely inside `../drivers/mock/`.
 *
 * Selectors are opaque strings owned by the SelectorRegistry. Structured
 * reads (`table`, `locator`) return plain serializable data so page objects
 * can parse without holding live browser handles.
 */

export interface TableCellLink {
  href: string | null;
  title: string | null;
  text: string;
}

/**
 * One table cell, captured with everything the CRM hides inside cells:
 * readonly `<input>` values, disabled `<select>` selections, action links.
 * `value` falls back to the `value` attribute when the live property is
 * empty (date inputs reject malformed CRM values like "1970-10-11 00:00:00").
 */
export interface TableCell {
  text: string;
  value: string | null;
  selectedLabel: string | null;
  links: TableCellLink[];
}

export interface TableData {
  headers: string[];
  rows: TableCell[][];
}

/** Batched, read-only view over every element matching a selector. */
export interface BrowserLocator {
  count(): Promise<number>;
  texts(): Promise<string[]>;
  values(): Promise<(string | null)[]>;
  attrs(name: string): Promise<(string | null)[]>;
}

export type WaitState = "visible" | "attached" | "hidden";

export interface WaitForOptions {
  state?: WaitState;
  timeoutMs?: number;
}

export interface DownloadResult {
  /** Local filesystem path of the completed download. */
  path: string;
  suggestedFilename: string;
}

export interface BrowserDriver {
  // -- lifecycle ------------------------------------------------------------
  /** Idempotent; drivers also lazy-launch on first navigation. */
  launch(): Promise<void>;
  close(): Promise<void>;

  // -- navigation -----------------------------------------------------------
  /** Absolute URLs pass through; paths resolve against the driver's base URL. */
  goto(url: string): Promise<void>;
  goBack(): Promise<void>;
  reload(): Promise<void>;
  currentUrl(): Promise<string>;

  // -- element actions --------------------------------------------------------
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  /** Select an option by its `value` attribute. */
  select(selector: string, value: string): Promise<void>;
  waitFor(selector: string, options?: WaitForOptions): Promise<void>;

  // -- observation ------------------------------------------------------------
  /** Trimmed inner text of the first match; throws LayoutChangedError if absent. */
  text(selector: string): Promise<string>;
  /** Legacy nullable read — prefer `text()` in new code. */
  readText(selector: string): Promise<string | null>;
  isVisible(selector: string): Promise<boolean>;
  locator(selector: string): BrowserLocator;
  /** Structured capture of the first matching table. */
  table(selector: string): Promise<TableData>;
  /** Structured capture of every matching table, in DOM order. */
  tables(selector: string): Promise<TableData[]>;
  screenshot(): Promise<Uint8Array>;
  /** Click `selector` and capture the resulting download. */
  download(selector: string): Promise<DownloadResult>;
  /** Evaluate a JS expression in the page. Diagnostics only — never parsing. */
  evaluate<T>(script: string): Promise<T>;
}
