import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initializeDB,
  dropDB,
  saveBookmark,
  getBookmarkByUrl,
  getBookmarkById,
  getAllBookmarks,
  updateBookmark,
  deleteBookmark,
  toggleTagOnBookmark,
  createTag,
  getAllTags,
  updateTag,
  deleteTag,
  createTagGroup,
  getAllTagGroups,
  deleteTagGroup,
  getAllPatterns,
  savePattern,
  deletePattern,
  getSettings,
  updateSettings,
  getCoOccurrence,
  incrementCoOccurrence,
  getPinnedTags,
  setPinnedTags,
  pinTag,
  unpinTag,
  exportAll,
  importAll,
} from "../db";
import { DEFAULT_TAGS, DEFAULT_TAG_GROUPS, DEFAULT_URL_PATTERNS } from "../constants";
import type { UrlPattern } from "../types";

beforeEach(async () => {
  await initializeDB();
});

afterEach(async () => {
  await dropDB();
});

// --- Init ---

describe("initializeDB", () => {
  it("seeds default tags", async () => {
    const tags = await getAllTags();
    expect(tags.length).toBe(DEFAULT_TAGS.length);
    expect(tags.find((t) => t.id === "react")).toBeDefined();
  });

  it("seeds default tag groups", async () => {
    const groups = await getAllTagGroups();
    expect(groups.length).toBe(DEFAULT_TAG_GROUPS.length);
  });

  it("seeds default url patterns", async () => {
    const patterns = await getAllPatterns();
    expect(patterns.length).toBe(DEFAULT_URL_PATTERNS.length);
  });

  it("sets correct schema version in settings", async () => {
    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(3);
  });

  it("does not re-seed on second call", async () => {
    await createTag("custom-tag", "Custom", "🎯", "#ff0000", "topics");
    await initializeDB(); // should be no-op
    const tags = await getAllTags();
    expect(tags.find((t) => t.id === "custom-tag")).toBeDefined();
  });
});

// --- Bookmarks ---

describe("saveBookmark", () => {
  it("creates a new bookmark", async () => {
    const bm = await saveBookmark("https://chatgpt.com/c/123", "Chat 1", ["react"]);
    expect(bm.id).toBeDefined();
    expect(bm.url).toBe("https://chatgpt.com/c/123");
    expect(bm.tags).toEqual(["react"]);
    expect(bm.domain).toBe("chatgpt.com");
  });

  it("classifies AI chat domains correctly", async () => {
    const aiChat = await saveBookmark("https://chatgpt.com/c/123", "Chat");
    expect(aiChat.type).toBe("ai-chat");
  });

  it("classifies non-AI domains as site", async () => {
    const site = await saveBookmark("https://medium.com/article", "Article");
    expect(site.type).toBe("site");
  });

  it("preserves createdAt on update", async () => {
    const first = await saveBookmark("https://example.com", "Page");
    await new Promise((r) => setTimeout(r, 5));
    const second = await saveBookmark("https://example.com", "Page updated");
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it("preserves existing notes when notes arg is empty", async () => {
    await saveBookmark("https://example.com", "Page", [], "my note");
    const updated = await saveBookmark("https://example.com", "Page", [], "");
    expect(updated.notes).toBe("my note");
  });
});

describe("getBookmarkByUrl", () => {
  it("returns null for unknown URL", async () => {
    expect(await getBookmarkByUrl("https://unknown.com")).toBeNull();
  });

  it("retrieves saved bookmark by URL", async () => {
    await saveBookmark("https://claude.ai/chat/abc", "Claude chat");
    const bm = await getBookmarkByUrl("https://claude.ai/chat/abc");
    expect(bm?.domain).toBe("claude.ai");
    expect(bm?.type).toBe("ai-chat");
  });
});

describe("getAllBookmarks", () => {
  it("returns all saved bookmarks", async () => {
    await saveBookmark("https://a.com", "A");
    await saveBookmark("https://b.com", "B");
    const all = await getAllBookmarks();
    expect(all.length).toBe(2);
  });
});

describe("updateBookmark", () => {
  it("updates title and notes", async () => {
    const bm = await saveBookmark("https://example.com", "Old title");
    const updated = await updateBookmark(bm.id, { title: "New title", notes: "note" });
    expect(updated?.title).toBe("New title");
    expect(updated?.notes).toBe("note");
  });

  it("returns null for unknown id", async () => {
    expect(await updateBookmark("nonexistent", { title: "x" })).toBeNull();
  });
});

describe("deleteBookmark", () => {
  it("removes bookmark", async () => {
    const bm = await saveBookmark("https://example.com", "Page");
    await deleteBookmark(bm.id);
    expect(await getBookmarkById(bm.id)).toBeNull();
  });
});

// --- toggleTagOnBookmark ---

describe("toggleTagOnBookmark", () => {
  it("creates bookmark with tag on first toggle", async () => {
    const bm = await toggleTagOnBookmark("https://chatgpt.com/c/1", "Chat", "react");
    expect(bm.tags).toContain("react");
    expect(bm.type).toBe("ai-chat");
  });

  it("adds tag to existing bookmark", async () => {
    await toggleTagOnBookmark("https://example.com", "Page", "react");
    const bm = await toggleTagOnBookmark("https://example.com", "Page", "javascript");
    expect(bm.tags).toContain("react");
    expect(bm.tags).toContain("javascript");
  });

  it("removes tag if already present", async () => {
    await toggleTagOnBookmark("https://example.com", "Page", "react");
    const bm = await toggleTagOnBookmark("https://example.com", "Page", "react");
    expect(bm.tags).not.toContain("react");
  });

  it("updates co-occurrence when adding tag to multi-tag bookmark", async () => {
    await toggleTagOnBookmark("https://example.com", "Page", "react");
    await toggleTagOnBookmark("https://example.com", "Page", "javascript");
    const map = await getCoOccurrence();
    expect(map["react"]?.["javascript"]).toBeGreaterThan(0);
    expect(map["javascript"]?.["react"]).toBeGreaterThan(0);
  });
});

// --- Tags ---

describe("createTag / getAllTags / updateTag / deleteTag", () => {
  it("creates a tag with emoji", async () => {
    const tag = await createTag("interview", "Interview Prep", "🎯", "#ff0000", "topics");
    const all = await getAllTags();
    expect(all.find((t) => t.id === "interview")).toBeDefined();
    expect(tag.emoji).toBe("🎯");
  });

  it("updates tag label and emoji", async () => {
    await createTag("test-tag", "Test", "🔵", "#0000ff", "topics");
    const updated = await updateTag("test-tag", { label: "Updated", emoji: "🟢" });
    expect(updated?.label).toBe("Updated");
    expect(updated?.emoji).toBe("🟢");
  });

  it("returns null when updating nonexistent tag", async () => {
    expect(await updateTag("ghost", { label: "X" })).toBeNull();
  });

  it("deleteTag removes tag from all bookmarks", async () => {
    await saveBookmark("https://example.com", "Page", ["react", "javascript"]);
    await deleteTag("react");
    const bm = await getBookmarkByUrl("https://example.com");
    expect(bm?.tags).not.toContain("react");
    expect(bm?.tags).toContain("javascript");
  });

  it("deleteTag removes tag from pinned list", async () => {
    await pinTag("react");
    await deleteTag("react");
    const pinned = await getPinnedTags();
    expect(pinned).not.toContain("react");
  });

  it("deleteTag cleans co-occurrence data", async () => {
    await incrementCoOccurrence(["react", "javascript"]);
    await deleteTag("react");
    const map = await getCoOccurrence();
    expect(map["react"]).toBeUndefined();
    expect(map["javascript"]?.["react"]).toBeUndefined();
  });
});

// --- TagGroups ---

describe("createTagGroup / deleteTagGroup", () => {
  it("creates a tag group", async () => {
    await createTagGroup("work", "Work", 4);
    const groups = await getAllTagGroups();
    expect(groups.find((g) => g.id === "work")).toBeDefined();
  });

  it("deleteTagGroup moves tags to uncategorized", async () => {
    await createTagGroup("temp-group", "Temp", 5);
    await createTag("temp-tag", "Temp Tag", "🔴", "#ff0000", "temp-group");
    await deleteTagGroup("temp-group");
    const tags = await getAllTags();
    expect(tags.find((t) => t.id === "temp-tag")?.groupId).toBe("uncategorized");
  });
});

// --- UrlPatterns ---

describe("savePattern / getAllPatterns / deletePattern", () => {
  it("saves a custom pattern", async () => {
    const pattern: UrlPattern = {
      id: "custom",
      pattern: "example.com/*",
      isRegex: false,
      isGlob: true,
      autoTags: ["reference"],
      promptUser: false,
      enabled: true,
      contentType: "site",
    };
    await savePattern(pattern);
    const all = await getAllPatterns();
    expect(all.find((p) => p.id === "custom")).toBeDefined();
  });

  it("deletes a pattern", async () => {
    await deletePattern("chatgpt-chat");
    const all = await getAllPatterns();
    expect(all.find((p) => p.id === "chatgpt-chat")).toBeUndefined();
  });
});

// --- Settings ---

describe("getSettings / updateSettings", () => {
  it("returns defaults after init", async () => {
    const s = await getSettings();
    expect(s.pillPosition).toBe("mid-right");
    expect(s.activePromptingAI).toBe(true);
    expect(s.aiProviders).toContain("chatgpt.com");
  });

  it("updates specific settings fields", async () => {
    const updated = await updateSettings({ pillPosition: "top-right" });
    expect(updated.pillPosition).toBe("top-right");
    expect(updated.activePromptingAI).toBe(true); // unchanged
  });
});

// --- CoOccurrence ---

describe("incrementCoOccurrence / getCoOccurrence", () => {
  it("increments scores for all pairs in a tag set", async () => {
    await incrementCoOccurrence(["react", "javascript", "typescript"]);
    const map = await getCoOccurrence();
    expect(map["react"]["javascript"]).toBe(1);
    expect(map["react"]["typescript"]).toBe(1);
    expect(map["javascript"]["typescript"]).toBe(1);
    expect(map["javascript"]["react"]).toBe(1);
  });

  it("accumulates scores across multiple increments", async () => {
    await incrementCoOccurrence(["react", "javascript"]);
    await incrementCoOccurrence(["react", "javascript"]);
    const map = await getCoOccurrence();
    expect(map["react"]["javascript"]).toBe(2);
  });

  it("does nothing for single-tag sets", async () => {
    await incrementCoOccurrence(["react"]);
    const map = await getCoOccurrence();
    expect(Object.keys(map).length).toBe(0);
  });
});

// --- PinnedTags ---

describe("pinTag / unpinTag / getPinnedTags", () => {
  it("pins and retrieves tags", async () => {
    await pinTag("react");
    await pinTag("javascript");
    const pinned = await getPinnedTags();
    expect(pinned).toContain("react");
    expect(pinned).toContain("javascript");
  });

  it("does not duplicate pinned tags", async () => {
    await pinTag("react");
    await pinTag("react");
    const pinned = await getPinnedTags();
    expect(pinned.filter((t) => t === "react").length).toBe(1);
  });

  it("unpins a tag", async () => {
    await pinTag("react");
    await unpinTag("react");
    expect(await getPinnedTags()).not.toContain("react");
  });

  it("setPinnedTags replaces all pinned tags", async () => {
    await pinTag("react");
    await setPinnedTags(["javascript", "python"]);
    const pinned = await getPinnedTags();
    expect(pinned).toEqual(["javascript", "python"]);
  });
});

// --- Export / Import ---

describe("exportAll / importAll", () => {
  it("exports all data including bookmarks, tags, settings", async () => {
    await saveBookmark("https://chatgpt.com/c/1", "Chat", ["react"]);
    const data = await exportAll();
    expect(data.bookmarks.length).toBe(1);
    expect(data.tags.length).toBeGreaterThan(0);
    expect(data.settings.schemaVersion).toBe(3);
  });

  it("importAll replace clears and re-imports", async () => {
    await saveBookmark("https://example.com", "Old");
    const snapshot = await exportAll();

    await saveBookmark("https://new-site.com", "New");
    expect((await getAllBookmarks()).length).toBe(2);

    await importAll(snapshot, "replace");
    expect((await getAllBookmarks()).length).toBe(1);
  });

  it("importAll merge adds to existing data", async () => {
    await saveBookmark("https://existing.com", "Existing");
    const snapshot = await exportAll();

    await dropDB();
    await initializeDB();
    await saveBookmark("https://new.com", "New");

    await importAll(snapshot, "merge");
    const all = await getAllBookmarks();
    expect(all.find((b) => b.url === "https://existing.com")).toBeDefined();
    expect(all.find((b) => b.url === "https://new.com")).toBeDefined();
  });
});
