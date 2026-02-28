import { describe, it, expect } from "vitest";
import {
  filterByTags,
  filterByContentType,
  filterBySection,
  filterByText,
  filterBookmarks,
  sortBookmarks,
} from "../query-engine";
import type { Bookmark, DomainSection, FilterOptions } from "../types";

function bk(overrides: Partial<Bookmark> & { id: string }): Bookmark {
  return {
    url: "https://example.com",
    title: "Test Page",
    notes: "",
    domain: "example.com",
    tags: [],
    type: "site",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

const bookmarks: Bookmark[] = [
  bk({ id: "1", url: "https://chatgpt.com/c/1", domain: "chatgpt.com", type: "ai-chat", tags: ["react", "brainstorming"], title: "React hooks chat", createdAt: 3000 }),
  bk({ id: "2", url: "https://claude.ai/chat/2", domain: "claude.ai", type: "ai-chat", tags: ["python", "debugging"], title: "Python debug session", createdAt: 2000 }),
  bk({ id: "3", url: "https://medium.com/article", domain: "medium.com", type: "site", tags: ["react", "tutorial"], title: "React tutorial article", createdAt: 1000, notes: "great read" }),
];

// --- filterByTags ---

describe("filterByTags", () => {
  it("AND mode: returns bookmarks with all selected tags", () => {
    const result = filterByTags(bookmarks, ["react", "brainstorming"], "AND");
    expect(result.map((b) => b.id)).toEqual(["1"]);
  });

  it("OR mode: returns bookmarks with any selected tag", () => {
    const result = filterByTags(bookmarks, ["react", "python"], "OR");
    expect(result.map((b) => b.id)).toContain("1");
    expect(result.map((b) => b.id)).toContain("2");
    expect(result.map((b) => b.id)).toContain("3");
  });

  it("returns all bookmarks when no tags selected", () => {
    expect(filterByTags(bookmarks, [], "AND").length).toBe(3);
  });
});

// --- filterByContentType ---

describe("filterByContentType", () => {
  it("filters to ai-chat only", () => {
    const result = filterByContentType(bookmarks, "ai-chat");
    expect(result.every((b) => b.type === "ai-chat")).toBe(true);
    expect(result.length).toBe(2);
  });

  it("filters to site only", () => {
    const result = filterByContentType(bookmarks, "site");
    expect(result.every((b) => b.type === "site")).toBe(true);
    expect(result.length).toBe(1);
  });

  it("returns all bookmarks for 'all'", () => {
    expect(filterByContentType(bookmarks, "all").length).toBe(3);
  });
});

// --- filterBySection (legacy) ---

describe("filterBySection", () => {
  const sections: Record<string, DomainSection> = {
    "ai-chats": {
      id: "ai-chats",
      label: "AI Chats",
      domains: ["chatgpt.com", "claude.ai"],
      createdAt: 0,
    },
  };

  it("filters by domain section", () => {
    const result = filterBySection(bookmarks, "ai-chats", sections);
    expect(result.every((b) => ["chatgpt.com", "claude.ai"].includes(b.domain))).toBe(true);
    expect(result.length).toBe(2);
  });

  it("returns all when sectionId is null", () => {
    expect(filterBySection(bookmarks, null, sections).length).toBe(3);
  });

  it("returns all when sectionId does not exist", () => {
    expect(filterBySection(bookmarks, "nonexistent", sections).length).toBe(3);
  });
});

// --- filterByText ---

describe("filterByText", () => {
  it("matches title", () => {
    const result = filterByText(bookmarks, "hooks");
    expect(result.map((b) => b.id)).toEqual(["1"]);
  });

  it("matches notes", () => {
    const result = filterByText(bookmarks, "great read");
    expect(result.map((b) => b.id)).toEqual(["3"]);
  });

  it("matches URL", () => {
    const result = filterByText(bookmarks, "claude.ai");
    expect(result.map((b) => b.id)).toEqual(["2"]);
  });

  it("is case-insensitive", () => {
    const result = filterByText(bookmarks, "REACT");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns all when search text is empty", () => {
    expect(filterByText(bookmarks, "").length).toBe(3);
  });
});

// --- filterBookmarks (combined) ---

describe("filterBookmarks", () => {
  const options: FilterOptions = {
    tags: [],
    tagMode: "AND",
    contentType: "all",
    sectionId: null,
    searchText: "",
  };

  it("applies contentType filter when set", () => {
    const result = filterBookmarks(bookmarks, {}, { ...options, contentType: "ai-chat" });
    expect(result.every((b) => b.type === "ai-chat")).toBe(true);
  });

  it("prefers contentType over sectionId when contentType is not 'all'", () => {
    const sections: Record<string, DomainSection> = {
      blogs: { id: "blogs", label: "Blogs", domains: ["medium.com"], createdAt: 0 },
    };
    // contentType: 'ai-chat' should win over sectionId: 'blogs'
    const result = filterBookmarks(bookmarks, sections, {
      ...options,
      contentType: "ai-chat",
      sectionId: "blogs",
    });
    expect(result.every((b) => b.type === "ai-chat")).toBe(true);
  });

  it("falls back to sectionId when contentType is 'all'", () => {
    const sections: Record<string, DomainSection> = {
      blogs: { id: "blogs", label: "Blogs", domains: ["medium.com"], createdAt: 0 },
    };
    const result = filterBookmarks(bookmarks, sections, {
      ...options,
      contentType: "all",
      sectionId: "blogs",
    });
    expect(result.map((b) => b.id)).toEqual(["3"]);
  });

  it("combines tag + contentType + text filters", () => {
    const result = filterBookmarks(bookmarks, {}, {
      tags: ["react"],
      tagMode: "AND",
      contentType: "ai-chat",
      sectionId: null,
      searchText: "hooks",
    });
    expect(result.map((b) => b.id)).toEqual(["1"]);
  });
});

// --- sortBookmarks ---

describe("sortBookmarks", () => {
  it("sorts by createdAt desc (default)", () => {
    const sorted = sortBookmarks(bookmarks);
    expect(sorted[0].id).toBe("1"); // createdAt: 3000
    expect(sorted[2].id).toBe("3"); // createdAt: 1000
  });

  it("sorts by createdAt asc", () => {
    const sorted = sortBookmarks(bookmarks, "createdAt", "asc");
    expect(sorted[0].id).toBe("3");
  });

  it("sorts by title asc", () => {
    const sorted = sortBookmarks(bookmarks, "title", "asc");
    expect(sorted[0].title.localeCompare(sorted[1].title)).toBeLessThanOrEqual(0);
  });

  it("sorts by domain asc", () => {
    const sorted = sortBookmarks(bookmarks, "domain", "asc");
    const domains = sorted.map((b) => b.domain);
    expect(domains).toEqual([...domains].sort());
  });

  it("does not mutate the input array", () => {
    const original = [...bookmarks];
    sortBookmarks(bookmarks, "title", "asc");
    expect(bookmarks.map((b) => b.id)).toEqual(original.map((b) => b.id));
  });
});
