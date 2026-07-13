/**
 * Test environment shims. jsdom does not implement object URLs or
 * matchMedia; the upload kit relies on both.
 */
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// RTL auto-cleanup only registers when vitest globals are enabled; ours are
// not, so unmount rendered trees between tests explicitly.
afterEach(() => {
  cleanup();
});

if (typeof URL.createObjectURL !== "function") {
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => `blob:vitest-${++counter}`),
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    writable: true,
  });
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
    writable: true,
  });
}
