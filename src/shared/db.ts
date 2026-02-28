import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Bookmark,
  Tag,
  TagGroup,
  DomainSection,
  UrlPattern,
  Settings,
  CoOccurrenceMap,
  ContentType,
  ExportData,
} from "./types";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TAG_GROUPS,
  DEFAULT_TAGS,
  DEFAULT_URL_PATTERNS,
  DEFAULT_DOMAIN_SECTIONS,
  SCHEMA_VERSION,
} from "./constants";

// --- IDB Schema ---

interface ClingOnSchema extends DBSchema {
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: {
      "by-domain": string;
      "by-type": string;
      "by-created": number;
    };
  };
  tags: {
    key: string;
    value: Tag;
    indexes: { "by-group": string };
  };
  tagGroups: {
    key: string;
    value: TagGroup;
  };
  urlPatterns: {
    key: string;
    value: UrlPattern;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: { key: string; value: any };
}

// --- DB singleton ---

const DB_NAME = "clingon";
const DB_VERSION = 1;

let _db: IDBPDatabase<ClingOnSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<ClingOnSchema>> {
  if (_db) return _db;
  _db = await openDB<ClingOnSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const bk = db.createObjectStore("bookmarks", { keyPath: "id" });
      bk.createIndex("by-domain", "domain");
      bk.createIndex("by-type", "type");
      bk.createIndex("by-created", "createdAt");

      const tags = db.createObjectStore("tags", { keyPath: "id" });
      tags.createIndex("by-group", "groupId");

      db.createObjectStore("tagGroups", { keyPath: "id" });
      db.createObjectStore("urlPatterns", { keyPath: "id" });
      db.createObjectStore("kv"); // settings, coOccurrence, pinnedTags, domainSections
    },
  });
  return _db;
}

export async function closeDB(): Promise<void> {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export async function dropDB(): Promise<void> {
  await closeDB();
  await deleteDB(DB_NAME);
}

// --- Helpers ---

export function generateBookmarkId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return "bk_" + Math.abs(hash).toString(36);
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function classifyDomain(
  domain: string,
  aiProviders: string[]
): ContentType {
  return aiProviders.includes(domain) ? "ai-chat" : "site";
}

// --- Init ---

export async function initializeDB(): Promise<void> {
  const db = await getDB();
  const existingSettings = await db.get("kv", "settings");
  if (existingSettings) return;

  const now = Date.now();
  const tx = db.transaction(
    ["tags", "tagGroups", "urlPatterns", "kv"],
    "readwrite"
  );

  for (const group of DEFAULT_TAG_GROUPS) {
    await tx.objectStore("tagGroups").put({ ...group, createdAt: now });
  }
  for (const tag of DEFAULT_TAGS) {
    await tx.objectStore("tags").put({ ...tag, createdAt: now });
  }
  for (const pattern of DEFAULT_URL_PATTERNS) {
    await tx.objectStore("urlPatterns").put(pattern);
  }

  const domainSections: Record<string, DomainSection> = {};
  for (const s of DEFAULT_DOMAIN_SECTIONS) {
    domainSections[s.id] = { ...s, createdAt: now };
  }

  await tx.objectStore("kv").put(DEFAULT_SETTINGS, "settings");
  await tx.objectStore("kv").put({} as CoOccurrenceMap, "coOccurrence");
  await tx.objectStore("kv").put([] as string[], "pinnedTags");
  await tx.objectStore("kv").put(domainSections, "domainSections");
  await tx.done;
}

// --- Bookmarks ---

export async function getBookmarkByUrl(url: string): Promise<Bookmark | null> {
  const db = await getDB();
  return (await db.get("bookmarks", generateBookmarkId(url))) ?? null;
}

export async function getBookmarkById(id: string): Promise<Bookmark | null> {
  const db = await getDB();
  return (await db.get("bookmarks", id)) ?? null;
}

export async function getAllBookmarks(): Promise<Bookmark[]> {
  const db = await getDB();
  return db.getAll("bookmarks");
}

export async function saveBookmark(
  url: string,
  title: string,
  tagIds: string[] = [],
  notes: string = "",
  typeOverride?: ContentType
): Promise<Bookmark> {
  const db = await getDB();
  const id = generateBookmarkId(url);
  const existing = await db.get("bookmarks", id);
  const now = Date.now();

  let type: ContentType;
  if (typeOverride) {
    type = typeOverride;
  } else {
    const settings =
      ((await db.get("kv", "settings")) as Settings | undefined) ??
      DEFAULT_SETTINGS;
    type = classifyDomain(extractDomain(url), settings.aiProviders);
  }

  const bookmark: Bookmark = {
    id,
    url,
    title: title || url,
    notes: existing ? notes || existing.notes : notes,
    domain: extractDomain(url),
    tags: tagIds,
    type,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  await db.put("bookmarks", bookmark);
  return bookmark;
}

export async function updateBookmark(
  id: string,
  updates: Partial<Pick<Bookmark, "title" | "notes" | "tags" | "type">>
): Promise<Bookmark | null> {
  const db = await getDB();
  const bookmark = await db.get("bookmarks", id);
  if (!bookmark) return null;

  const updated: Bookmark = { ...bookmark, ...updates, updatedAt: Date.now() };
  await db.put("bookmarks", updated);
  return updated;
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("bookmarks", id);
}

export async function toggleTagOnBookmark(
  url: string,
  title: string,
  tagId: string,
  typeOverride?: ContentType
): Promise<Bookmark> {
  const existing = await getBookmarkByUrl(url);

  if (!existing) {
    const bm = await saveBookmark(url, title, [tagId], "", typeOverride);
    await incrementCoOccurrence([tagId]);
    return bm;
  }

  const tagIndex = existing.tags.indexOf(tagId);
  const newTags =
    tagIndex === -1
      ? [...existing.tags, tagId]
      : existing.tags.filter((_, i) => i !== tagIndex);

  const updated = (await updateBookmark(existing.id, { tags: newTags }))!;

  // Update co-occurrence only when adding a tag to a multi-tag set
  if (tagIndex === -1 && newTags.length > 1) {
    await incrementCoOccurrence(newTags);
  }

  return updated;
}

// --- Tags ---

export async function getAllTags(): Promise<Tag[]> {
  const db = await getDB();
  return db.getAll("tags");
}

export async function createTag(
  id: string,
  label: string,
  emoji: string,
  color: string,
  groupId: string
): Promise<Tag> {
  const db = await getDB();
  const tag: Tag = { id, label, emoji, color, groupId, createdAt: Date.now() };
  await db.put("tags", tag);
  return tag;
}

export async function updateTag(
  id: string,
  updates: Partial<Pick<Tag, "label" | "emoji" | "color" | "groupId">>
): Promise<Tag | null> {
  const db = await getDB();
  const tag = await db.get("tags", id);
  if (!tag) return null;
  const updated = { ...tag, ...updates };
  await db.put("tags", updated);
  return updated;
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  const tx = db.transaction(["tags", "bookmarks", "kv"], "readwrite");

  const [allBookmarks, coOcc, pinned] = await Promise.all([
    tx.objectStore("bookmarks").getAll(),
    tx.objectStore("kv").get("coOccurrence"),
    tx.objectStore("kv").get("pinnedTags"),
  ]);

  await tx.objectStore("tags").delete(id);

  const affected = (allBookmarks as Bookmark[]).filter((bm) =>
    bm.tags.includes(id)
  );
  await Promise.all(
    affected.map((bm) =>
      tx.objectStore("bookmarks").put({
        ...bm,
        tags: bm.tags.filter((t) => t !== id),
        updatedAt: now,
      })
    )
  );

  const map = (coOcc as CoOccurrenceMap | undefined) ?? {};
  delete map[id];
  for (const key of Object.keys(map)) delete map[key][id];
  await tx.objectStore("kv").put(map, "coOccurrence");

  const pinnedList = (pinned as string[] | undefined) ?? [];
  await tx.objectStore("kv").put(
    pinnedList.filter((t) => t !== id),
    "pinnedTags"
  );

  await tx.done;
}

// --- TagGroups ---

export async function getAllTagGroups(): Promise<TagGroup[]> {
  const db = await getDB();
  return db.getAll("tagGroups");
}

export async function createTagGroup(
  id: string,
  label: string,
  order: number
): Promise<TagGroup> {
  const db = await getDB();
  const group: TagGroup = { id, label, order, createdAt: Date.now() };
  await db.put("tagGroups", group);
  return group;
}

export async function updateTagGroup(
  id: string,
  updates: Partial<Pick<TagGroup, "label" | "order">>
): Promise<TagGroup | null> {
  const db = await getDB();
  const group = await db.get("tagGroups", id);
  if (!group) return null;
  const updated = { ...group, ...updates };
  await db.put("tagGroups", updated);
  return updated;
}

export async function deleteTagGroup(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["tagGroups", "tags"], "readwrite");

  const allTags = await tx.objectStore("tags").getAll();
  await tx.objectStore("tagGroups").delete(id);

  const orphaned = (allTags as Tag[]).filter((t) => t.groupId === id);
  await Promise.all(
    orphaned.map((t) =>
      tx.objectStore("tags").put({ ...t, groupId: "uncategorized" })
    )
  );

  await tx.done;
}

// --- UrlPatterns ---

export async function getAllPatterns(): Promise<UrlPattern[]> {
  const db = await getDB();
  return db.getAll("urlPatterns");
}

export async function savePattern(pattern: UrlPattern): Promise<void> {
  const db = await getDB();
  await db.put("urlPatterns", pattern);
}

export async function deletePattern(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("urlPatterns", id);
}

// --- Settings ---

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  return (
    ((await db.get("kv", "settings")) as Settings | undefined) ??
    DEFAULT_SETTINGS
  );
}

export async function updateSettings(
  updates: Partial<Settings>
): Promise<Settings> {
  const db = await getDB();
  const current = await getSettings();
  const merged = { ...current, ...updates };
  await db.put("kv", merged, "settings");
  return merged;
}

// --- CoOccurrence ---

export async function getCoOccurrence(): Promise<CoOccurrenceMap> {
  const db = await getDB();
  return (
    ((await db.get("kv", "coOccurrence")) as CoOccurrenceMap | undefined) ?? {}
  );
}

export async function incrementCoOccurrence(tagIds: string[]): Promise<void> {
  if (tagIds.length < 2) return;
  const db = await getDB();
  const map = await getCoOccurrence();

  for (let i = 0; i < tagIds.length; i++) {
    for (let j = i + 1; j < tagIds.length; j++) {
      const a = tagIds[i];
      const b = tagIds[j];
      if (!map[a]) map[a] = {};
      if (!map[b]) map[b] = {};
      map[a][b] = (map[a][b] ?? 0) + 1;
      map[b][a] = (map[b][a] ?? 0) + 1;
    }
  }

  await db.put("kv", map, "coOccurrence");
}

// --- PinnedTags ---

export async function getPinnedTags(): Promise<string[]> {
  const db = await getDB();
  return ((await db.get("kv", "pinnedTags")) as string[] | undefined) ?? [];
}

export async function setPinnedTags(tagIds: string[]): Promise<void> {
  const db = await getDB();
  await db.put("kv", tagIds, "pinnedTags");
}

export async function pinTag(tagId: string): Promise<void> {
  const pinned = await getPinnedTags();
  if (!pinned.includes(tagId)) {
    await setPinnedTags([...pinned, tagId]);
  }
}

export async function unpinTag(tagId: string): Promise<void> {
  await setPinnedTags((await getPinnedTags()).filter((id) => id !== tagId));
}

// --- DomainSections (legacy — for popup.ts backward compat) ---

async function getDomainSectionsFromKV(): Promise<
  Record<string, DomainSection>
> {
  const db = await getDB();
  return (
    ((await db.get("kv", "domainSections")) as
      | Record<string, DomainSection>
      | undefined) ?? {}
  );
}

async function setDomainSectionsInKV(
  sections: Record<string, DomainSection>
): Promise<void> {
  const db = await getDB();
  await db.put("kv", sections, "domainSections");
}

export async function getAllDomainSections(): Promise<
  Record<string, DomainSection>
> {
  return getDomainSectionsFromKV();
}

export async function saveDomainSection(
  section: DomainSection
): Promise<DomainSection> {
  const sections = await getDomainSectionsFromKV();
  sections[section.id] = section;
  await setDomainSectionsInKV(sections);
  return section;
}

export async function deleteDomainSection(id: string): Promise<void> {
  const sections = await getDomainSectionsFromKV();
  delete sections[id];
  await setDomainSectionsInKV(sections);
}

// --- Export / Import ---

export async function exportAll(): Promise<ExportData> {
  const [
    bookmarks,
    tags,
    tagGroups,
    urlPatterns,
    settings,
    coOccurrence,
    pinnedTags,
  ] = await Promise.all([
    getAllBookmarks(),
    getAllTags(),
    getAllTagGroups(),
    getAllPatterns(),
    getSettings(),
    getCoOccurrence(),
    getPinnedTags(),
  ]);

  return {
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    bookmarks,
    tags,
    tagGroups,
    urlPatterns,
    settings,
    coOccurrence,
    pinnedTags,
  };
}

export async function importAll(
  data: ExportData,
  mode: "merge" | "replace"
): Promise<void> {
  const db = await getDB();

  if (mode === "replace") {
    const clearTx = db.transaction(
      ["bookmarks", "tags", "tagGroups", "urlPatterns"],
      "readwrite"
    );
    await Promise.all([
      clearTx.objectStore("bookmarks").clear(),
      clearTx.objectStore("tags").clear(),
      clearTx.objectStore("tagGroups").clear(),
      clearTx.objectStore("urlPatterns").clear(),
    ]);
    await clearTx.done;
  }

  const tx = db.transaction(
    ["bookmarks", "tags", "tagGroups", "urlPatterns", "kv"],
    "readwrite"
  );

  await Promise.all([
    ...data.bookmarks.map((b) => tx.objectStore("bookmarks").put(b)),
    ...data.tags.map((t) => tx.objectStore("tags").put(t)),
    ...data.tagGroups.map((g) => tx.objectStore("tagGroups").put(g)),
    ...data.urlPatterns.map((p) => tx.objectStore("urlPatterns").put(p)),
    tx.objectStore("kv").put(data.settings, "settings"),
    tx.objectStore("kv").put(data.coOccurrence, "coOccurrence"),
    tx.objectStore("kv").put(data.pinnedTags, "pinnedTags"),
  ]);

  await tx.done;
}
