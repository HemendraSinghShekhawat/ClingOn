import { describe, it, expect } from "vitest";
import { globToRegex, matchUrl, findMatchingPatterns, testPattern } from "../url-patterns";
import type { UrlPattern } from "../types";

function pattern(overrides: Partial<UrlPattern> & { pattern: string }): UrlPattern {
  return {
    id: "test",
    isRegex: false,
    isGlob: false,
    autoTags: [],
    promptUser: false,
    enabled: true,
    contentType: "any",
    ...overrides,
  };
}

// --- globToRegex ---

describe("globToRegex", () => {
  it("matches a simple domain glob", () => {
    const re = globToRegex("chatgpt.com/c/*");
    expect(re.test("https://chatgpt.com/c/abc123")).toBe(true);
    expect(re.test("https://chatgpt.com/auth")).toBe(false);
  });

  it("escapes regex special chars in the pattern", () => {
    const re = globToRegex("example.com/path+query");
    expect(re.test("https://example.com/path+query")).toBe(true);
    // The dot should be literal, not match any char
    expect(re.test("https://exampleXcom/path+query")).toBe(false);
  });

  it("* matches across slashes", () => {
    const re = globToRegex("claude.ai/*");
    expect(re.test("https://claude.ai/chat/abc/nested")).toBe(true);
  });

  it("is case-insensitive", () => {
    const re = globToRegex("CHATGPT.COM/C/*");
    expect(re.test("https://chatgpt.com/c/123")).toBe(true);
  });
});

// --- matchUrl ---

describe("matchUrl", () => {
  it("returns false for disabled patterns", () => {
    const p = pattern({ pattern: "chatgpt.com", enabled: false });
    expect(matchUrl("https://chatgpt.com", p)).toBe(false);
  });

  it("matches glob patterns", () => {
    const p = pattern({ pattern: "chatgpt.com/c/*", isGlob: true });
    expect(matchUrl("https://chatgpt.com/c/abc", p)).toBe(true);
    expect(matchUrl("https://chatgpt.com", p)).toBe(false);
  });

  it("matches regex patterns", () => {
    const p = pattern({ pattern: "claude\\.ai\\/chat\\/[a-z0-9]+", isRegex: true });
    expect(matchUrl("https://claude.ai/chat/abc123", p)).toBe(true);
    expect(matchUrl("https://claude.ai/projects", p)).toBe(false);
  });

  it("matches substring patterns (legacy)", () => {
    const p = pattern({ pattern: "gemini.google.com" });
    expect(matchUrl("https://gemini.google.com/app/abc", p)).toBe(true);
    expect(matchUrl("https://google.com", p)).toBe(false);
  });

  it("returns false on invalid regex without throwing", () => {
    const p = pattern({ pattern: "[invalid(regex", isRegex: true });
    expect(matchUrl("https://example.com", p)).toBe(false);
  });
});

// --- findMatchingPatterns ---

describe("findMatchingPatterns", () => {
  const patterns: UrlPattern[] = [
    pattern({ id: "chatgpt", pattern: "chatgpt.com/c/*", isGlob: true }),
    pattern({ id: "claude", pattern: "claude.ai/chat/*", isGlob: true }),
    pattern({ id: "medium", pattern: "medium.com", isGlob: false }),
  ];

  it("accepts UrlPattern[] and returns matching patterns", () => {
    const matches = findMatchingPatterns("https://chatgpt.com/c/123", patterns);
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe("chatgpt");
  });

  it("accepts Record<string, UrlPattern> for legacy compat", () => {
    const record: Record<string, UrlPattern> = {
      chatgpt: pattern({ id: "chatgpt", pattern: "chatgpt.com/c/*", isGlob: true }),
    };
    const matches = findMatchingPatterns("https://chatgpt.com/c/abc", record);
    expect(matches[0].id).toBe("chatgpt");
  });

  it("returns multiple matches when URL matches several patterns", () => {
    const multiPatterns: UrlPattern[] = [
      pattern({ id: "p1", pattern: "example.com" }),
      pattern({ id: "p2", pattern: "example" }),
    ];
    expect(findMatchingPatterns("https://example.com", multiPatterns).length).toBe(2);
  });

  it("returns empty array when no patterns match", () => {
    expect(findMatchingPatterns("https://github.com", patterns)).toEqual([]);
  });
});

// --- testPattern ---

describe("testPattern", () => {
  it("tests glob patterns", () => {
    expect(testPattern("chatgpt.com/c/*", false, true, "https://chatgpt.com/c/abc").matches).toBe(true);
    expect(testPattern("chatgpt.com/c/*", false, true, "https://chatgpt.com").matches).toBe(false);
  });

  it("tests regex patterns", () => {
    expect(testPattern("claude\\.ai", true, false, "https://claude.ai/chat").matches).toBe(true);
  });

  it("tests substring patterns", () => {
    expect(testPattern("medium.com", false, false, "https://medium.com/article").matches).toBe(true);
  });

  it("returns error on invalid regex", () => {
    const result = testPattern("[bad", true, false, "https://example.com");
    expect(result.matches).toBe(false);
    expect(result.error).toBeDefined();
  });
});
