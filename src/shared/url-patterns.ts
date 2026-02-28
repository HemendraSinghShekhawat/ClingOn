import type { UrlPattern } from "./types";

// --- Glob support ---

/**
 * Converts a simplified glob pattern to a RegExp.
 * Only `*` is treated as a wildcard (matches any characters, including `/`).
 * All other regex special characters are escaped.
 *
 * Example: "chatgpt.com/c/*" matches "https://chatgpt.com/c/abc123"
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // escape regex specials except *
    .replace(/\*/g, ".*"); // * → .*
  return new RegExp(escaped, "i");
}

// --- Core matching ---

/**
 * Tests a single URL against a UrlPattern.
 * Supports three modes: glob (isGlob), regex (isRegex), substring (default).
 */
export function matchUrl(url: string, pattern: UrlPattern): boolean {
  if (!pattern.enabled) return false;

  try {
    if (pattern.isRegex) {
      return new RegExp(pattern.pattern, "i").test(url);
    }
    if (pattern.isGlob) {
      return globToRegex(pattern.pattern).test(url);
    }
    // Substring match (legacy default)
    return url.toLowerCase().includes(pattern.pattern.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Returns all patterns that match the given URL.
 * Accepts UrlPattern[] (new API) or Record<string, UrlPattern> (legacy).
 */
export function findMatchingPatterns(
  url: string,
  patterns: UrlPattern[] | Record<string, UrlPattern>
): UrlPattern[] {
  const list = Array.isArray(patterns) ? patterns : Object.values(patterns);
  return list.filter((p) => matchUrl(url, p));
}

/**
 * Tests a pattern string against a URL — useful for live preview in settings UI.
 */
export function testPattern(
  pattern: string,
  isRegex: boolean,
  isGlob: boolean,
  testUrl: string
): { matches: boolean; error?: string } {
  try {
    if (isRegex) {
      return { matches: new RegExp(pattern, "i").test(testUrl) };
    }
    if (isGlob) {
      return { matches: globToRegex(pattern).test(testUrl) };
    }
    return { matches: testUrl.toLowerCase().includes(pattern.toLowerCase()) };
  } catch (e) {
    return { matches: false, error: (e as Error).message };
  }
}
