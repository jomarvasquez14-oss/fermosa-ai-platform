// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MockAIProvider } from "./mock-provider";

const provider = new MockAIProvider();

function image(bytes = 4096) {
  return { data: new Uint8Array(bytes), mimeType: "image/png" };
}

describe("MockAIProvider.extractLogbook", () => {
  it("returns a schema-valid extraction for mock-clean", async () => {
    const result = await provider.extractLogbook({
      image: image(),
      promptVersion: "logbook-extraction/v001",
      model: "mock-clean",
    });
    expect(result.validation.valid).toBe(true);
    expect(result.extraction).not.toBeNull();
    expect(result.extraction!.entries.length).toBeGreaterThan(0);
    expect(result.meta).toMatchObject({
      provider: "mock",
      model: "mock-clean",
      promptVersion: "logbook-extraction/v001",
    });
    expect(result.meta.latencyMs).toBeGreaterThan(0);
    expect(result.meta.usage?.inputTokens).toBeGreaterThan(0);
    expect(result.meta.usage?.estimatedCostUsd).toBeGreaterThan(0);
  }, 15000);

  it("is deterministic for the same image bytes and model", async () => {
    const input = {
      image: image(2222),
      promptVersion: "logbook-extraction/v001",
      model: "mock-clean",
    };
    const [a, b] = await Promise.all([
      provider.extractLogbook(input),
      provider.extractLogbook(input),
    ]);
    expect(a.rawResponse).toBe(b.rawResponse);
  }, 15000);

  it("mock-messy produces low-confidence and unreadable material", async () => {
    const result = await provider.extractLogbook({
      image: image(9999),
      promptVersion: "logbook-extraction/v001",
      model: "mock-messy",
    });
    expect(result.validation.valid).toBe(true);
    expect(result.extraction!.pageConfidence).toBeLessThan(0.95);
  }, 15000);

  it("mock-malformed fails validation but preserves the raw response", async () => {
    const result = await provider.extractLogbook({
      image: image(),
      promptVersion: "logbook-extraction/v001",
      model: "mock-malformed",
    });
    expect(result.validation.valid).toBe(false);
    expect(result.extraction).toBeNull();
    expect(result.validation.issues.length).toBeGreaterThan(0);
    expect(result.rawResponse.length).toBeGreaterThan(0);
  }, 15000);

  it("rejects unknown models loudly", async () => {
    await expect(
      provider.extractLogbook({
        image: image(),
        promptVersion: "logbook-extraction/v001",
        model: "gpt-vision-latest",
      })
    ).rejects.toThrow(/no model/);
  });
});
