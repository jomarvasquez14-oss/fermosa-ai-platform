// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Anthropic SDK — tests never call the real API (deterministic, free).
const createMock = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createMock };
  },
}));

import { ClaudeVisionProvider } from "./claude-vision-provider";

const PROMPT = "logbook-extraction/v001";

function image(overrides: Partial<{ bytes: number; mimeType: string }> = {}) {
  return {
    data: new Uint8Array(overrides.bytes ?? 2048),
    mimeType: overrides.mimeType ?? "image/png",
  };
}

function claudeResponse(text: string, inputTokens = 1200, outputTokens = 300) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const VALID_JSON = JSON.stringify({
  schemaVersion: 1,
  pageNumber: 1,
  entries: [
    {
      lineNumber: 1,
      patientName: { value: "Maria Santos", confidence: 0.93, unreadable: false },
      treatment: { value: "Diamond Peel", confidence: 0.97, unreadable: false },
      therapist: { value: "J. Cruz", confidence: 0.9, unreadable: false },
      time: { value: "2:30 PM", confidence: 0.88, unreadable: false },
      boundingBox: null,
      entryConfidence: 0.88,
    },
  ],
  unreadableRegions: [],
  pageConfidence: 0.88,
  notes: null,
});

describe("ClaudeVisionProvider.extractLogbook", () => {
  // Braces matter: `() => createMock.mockReset()` returns the mock function,
  // and vitest treats a function returned from beforeEach as a teardown
  // callback — invoking the mock (and its throwing implementation) on cleanup.
  beforeEach(() => {
    createMock.mockReset();
  });

  it("translates a valid Claude response into the canonical schema with usage/cost", async () => {
    createMock.mockResolvedValue(claudeResponse(VALID_JSON, 1500, 400));
    const provider = new ClaudeVisionProvider("sk-test");

    const result = await provider.extractLogbook({
      image: image(),
      promptVersion: PROMPT,
      model: "claude-sonnet-5",
    });

    expect(result.validation.valid).toBe(true);
    expect(result.extraction?.entries[0]?.patientName.value).toBe("Maria Santos");
    expect(result.meta.provider).toBe("claude");
    expect(result.meta.model).toBe("claude-sonnet-5");
    expect(result.meta.usage).toEqual({
      inputTokens: 1500,
      outputTokens: 400,
      // 1500×$3 + 400×$15 per MTok
      estimatedCostUsd: 0.0105,
    });

    // The versioned prompt artifact (not an inline string) is the system prompt.
    const request = createMock.mock.calls[0]![0] as { system: string; temperature: number };
    expect(request.system).toContain("logbook-extraction v001");
    expect(request.temperature).toBe(0);
  });

  it("strips markdown fences before validation but preserves the raw response", async () => {
    createMock.mockResolvedValue(claudeResponse("```json\n" + VALID_JSON + "\n```"));
    const provider = new ClaudeVisionProvider("sk-test");
    const result = await provider.extractLogbook({ image: image(), promptVersion: PROMPT });
    expect(result.validation.valid).toBe(true);
    expect(result.rawResponse.startsWith("```json")).toBe(true);
  });

  it("turns malformed model output into a validation failure, never an exception", async () => {
    createMock.mockResolvedValue(claudeResponse('{"schemaVersion": 1, "entries": "nope"'));
    const provider = new ClaudeVisionProvider("sk-test");
    const result = await provider.extractLogbook({ image: image(), promptVersion: PROMPT });
    expect(result.validation.valid).toBe(false);
    expect(result.extraction).toBeNull();
    expect(result.validation.issues.length).toBeGreaterThan(0);
    expect(result.rawResponse).toContain("schemaVersion");
  });

  it("fails gracefully when no API key is configured", async () => {
    const provider = new ClaudeVisionProvider(undefined);
    await expect(
      provider.extractLogbook({ image: image(), promptVersion: PROMPT })
    ).rejects.toThrow(/No Anthropic API key is configured/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types before spending a request", async () => {
    const provider = new ClaudeVisionProvider("sk-test");
    await expect(
      provider.extractLogbook({ image: image({ mimeType: "image/heic" }), promptVersion: PROMPT })
    ).rejects.toThrow(/HEIC must be converted/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects images over Claude's 5 MB limit before spending a request", async () => {
    const provider = new ClaudeVisionProvider("sk-test");
    await expect(
      provider.extractLogbook({
        image: image({ bytes: 5 * 1024 * 1024 + 1 }),
        promptVersion: PROMPT,
      })
    ).rejects.toThrow(/up to 5 MB/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, /rejected the API key/],
    [429, /rate-limiting/],
    [529, /temporarily unavailable/],
    [400, /rejected the request/],
  ])("maps HTTP %s to a friendly error", async (status, pattern) => {
    createMock.mockImplementation(() => {
      throw Object.assign(new Error(`http ${status}`), { status });
    });
    const provider = new ClaudeVisionProvider("sk-test");
    await expect(
      provider.extractLogbook({ image: image(), promptVersion: PROMPT })
    ).rejects.toThrow(pattern);
  });

  it("maps timeouts to a friendly error", async () => {
    createMock.mockImplementation(() => {
      const timeout = new Error("timed out");
      timeout.name = "APIConnectionTimeoutError";
      throw timeout;
    });
    const provider = new ClaudeVisionProvider("sk-test");
    await expect(
      provider.extractLogbook({ image: image(), promptVersion: PROMPT })
    ).rejects.toThrow(/did not answer within/);
  });
});
