import { describe, it, expect } from "vitest";
import { getRelated, getCombos, getTopTagsByUsage } from "../co-occurrence";
import type { CoOccurrenceMap, Bookmark } from "../types";

// --- helpers ---

function map(pairs: [string, string, number][]): CoOccurrenceMap {
  const m: CoOccurrenceMap = {};
  for (const [a, b, score] of pairs) {
    if (!m[a]) m[a] = {};
    if (!m[b]) m[b] = {};
    m[a][b] = score;
    m[b][a] = score;
  }
  return m;
}

function bk(tags: string[]): Bookmark {
  return {
    id: Math.random().toString(36),
    url: "https://example.com",
    title: "Test",
    notes: "",
    domain: "example.com",
    tags,
    type: "site",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// --- getRelated ---

describe("getRelated", () => {
  const allIds = new Set(["react", "javascript", "typescript", "python", "food"]);

  it("returns empty array when no active tags", () => {
    const m = map([["react", "javascript", 5]]);
    expect(getRelated(m, [], allIds)).toEqual([]);
  });

  it("returns co-occurring tags sorted by score", () => {
    const m = map([
      ["react", "javascript", 8],
      ["react", "typescript", 3],
    ]);
    const result = getRelated(m, ["react"], allIds);
    expect(result[0]).toBe("javascript");
    expect(result[1]).toBe("typescript");
  });

  it("excludes already-active tags", () => {
    const m = map([
      ["react", "javascript", 5],
      ["react", "typescript", 4],
    ]);
    expect(getRelated(m, ["react", "javascript"], allIds)).not.toContain("javascript");
  });

  it("excludes tags not in allTagIds (deleted tags)", () => {
    const m = map([["react", "deleted-tag", 10]]);
    const result = getRelated(m, ["react"], new Set(["react"]));
    expect(result).not.toContain("deleted-tag");
  });

  it("accumulates scores across multiple active tags", () => {
    const m = map([
      ["react", "typescript", 3],
      ["javascript", "typescript", 4],
    ]);
    const result = getRelated(m, ["react", "javascript"], allIds);
    // typescript should surface since it co-occurs with both
    expect(result).toContain("typescript");
  });

  it("respects limit parameter", () => {
    const m = map([
      ["react", "javascript", 5],
      ["react", "typescript", 4],
      ["react", "python", 3],
      ["react", "food", 2],
    ]);
    expect(getRelated(m, ["react"], allIds, 2).length).toBe(2);
  });
});

// --- getCombos ---

describe("getCombos", () => {
  const allIds = new Set(["react", "javascript", "typescript", "python", "debugging"]);

  it("returns empty array when no co-occurrence data", () => {
    expect(getCombos({}, allIds)).toEqual([]);
  });

  it("returns pairs with score >= minScore", () => {
    const m = map([
      ["react", "javascript", 5],
      ["react", "python", 1], // below minScore=3
    ]);
    const combos = getCombos(m, allIds, 3);
    expect(combos.length).toBe(1);
    expect(combos[0]).toContain("react");
    expect(combos[0]).toContain("javascript");
  });

  it("returns triples when all pairwise scores qualify", () => {
    const m = map([
      ["react", "javascript", 4],
      ["react", "typescript", 4],
      ["javascript", "typescript", 4],
    ]);
    const combos = getCombos(m, allIds, 3);
    const triple = combos.find((c) => c.length === 3);
    expect(triple).toBeDefined();
    expect(triple).toContain("react");
    expect(triple).toContain("javascript");
    expect(triple).toContain("typescript");
  });

  it("excludes deleted tags from combos", () => {
    const m = map([["react", "deleted", 10]]);
    const combos = getCombos(m, new Set(["react"]), 3);
    expect(combos.every((c) => !c.includes("deleted"))).toBe(true);
  });

  it("deduplicates pairs (a,b) and (b,a)", () => {
    const m = map([["react", "javascript", 5]]);
    const combos = getCombos(m, allIds, 3);
    expect(combos.length).toBe(1);
  });

  it("respects maxResults", () => {
    const m = map([
      ["react", "javascript", 5],
      ["react", "typescript", 4],
      ["python", "debugging", 4],
    ]);
    expect(getCombos(m, allIds, 3, 2).length).toBe(2);
  });
});

// --- getTopTagsByUsage ---

describe("getTopTagsByUsage", () => {
  const allIds = new Set(["react", "javascript", "python", "food"]);

  it("returns empty array for no bookmarks", () => {
    expect(getTopTagsByUsage([], allIds)).toEqual([]);
  });

  it("ranks tags by frequency", () => {
    const bookmarks = [
      bk(["react", "javascript"]),
      bk(["react", "python"]),
      bk(["react"]),
    ];
    const top = getTopTagsByUsage(bookmarks, allIds, 2);
    expect(top[0]).toBe("react"); // 3 uses
    expect(top.length).toBe(2);
  });

  it("excludes deleted tags", () => {
    const bookmarks = [bk(["react", "deleted-tag"])];
    const top = getTopTagsByUsage(bookmarks, new Set(["react"]), 5);
    expect(top).not.toContain("deleted-tag");
  });

  it("respects limit", () => {
    const bookmarks = [bk(["react", "javascript", "python", "food"])];
    expect(getTopTagsByUsage(bookmarks, allIds, 2).length).toBe(2);
  });
});
