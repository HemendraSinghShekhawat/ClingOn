import type {
  Bookmark,
  Tag,
  TagGroup,
  DomainSection,
  UrlPattern,
  Settings,
} from "./types";
import {
  DEFAULT_SETTINGS,
  DEFAULT_AI_PROVIDERS,
  SCHEMA_VERSION,
} from "./constants";
import * as db from "./db";

// --- V1 legacy types ---

interface V1Data {
  Context?: string[];
  Purpose?: string[];
  Urgency?: string[];
  Other?: string[];
}

const V1_TAG_MAPPING: Record<string, string> = {
  Context: "reference",
  Purpose: "idea",
  Urgency: "important",
  Other: "uncategorized",
};

// --- V2 legacy types ---

interface V2Settings {
  schemaVersion?: number;
  overlayEnabled?: boolean;
  sidebarPosition?: "left" | "right";
  autoDetectProviders?: boolean;
  defaultTagMode?: "AND" | "OR";
}

interface V2StorageSchema {
  bookmarks?: Record<string, Bookmark>;
  tags?: Record<string, Tag>;
  tagGroups?: Record<string, TagGroup>;
  domainSections?: Record<string, DomainSection>;
  urlPatterns?: Record<string, UrlPattern>;
  settings?: V2Settings;
}

// --- Migration entry point ---

export async function migrateIfNeeded(): Promise<void> {
  // Check if IndexedDB already has v3 data
  const settings = await db.getSettings();
  if (settings.schemaVersion >= SCHEMA_VERSION) return;

  // Read chrome.storage.local to detect v1 or v2 data
  const rawStorage = await chrome.storage.local.get(null);

  const hasV1 = ["Context", "Purpose", "Urgency", "Other"].some(
    (k) => Array.isArray(rawStorage[k]) && rawStorage[k].length > 0
  );

  const hasV2 =
    rawStorage["settings"] !== undefined ||
    rawStorage["bookmarks"] !== undefined;

  if (hasV1) {
    await migrateV1(rawStorage as V1Data);
  } else if (hasV2) {
    await migrateV2(rawStorage as V2StorageSchema);
  } else {
    await db.initializeDB();
  }

  // Clear chrome.storage.local after successful migration
  await chrome.storage.local.clear();
}

// --- V1 migration: raw URL arrays → bookmarks + default schema ---

async function migrateV1(v1: V1Data): Promise<void> {
  await db.initializeDB();

  for (const [category, urls] of Object.entries(v1)) {
    if (!Array.isArray(urls)) continue;
    const tagId = V1_TAG_MAPPING[category] ?? "uncategorized";

    for (const url of urls) {
      if (typeof url !== "string") continue;
      await db.saveBookmark(url, url, [tagId]);
    }
  }
}

// --- V2 migration: Record-based chrome.storage → IndexedDB ---

async function migrateV2(v2: V2StorageSchema): Promise<void> {
  const now = Date.now();

  // Build AI providers list from v2 domain sections
  const aiProviders = buildAiProviders(v2.domainSections);

  // Migrate settings
  const v2Settings = v2.settings ?? {};
  const newSettings: Settings = {
    ...DEFAULT_SETTINGS,
    schemaVersion: SCHEMA_VERSION,
    defaultTagMode: v2Settings.defaultTagMode ?? "AND",
    overlayEnabled: v2Settings.overlayEnabled ?? true,
    sidebarPosition: v2Settings.sidebarPosition ?? "right",
    autoDetectProviders: v2Settings.autoDetectProviders ?? true,
    aiProviders,
  };

  // Migrate tags (add emoji field)
  const tags: Tag[] = Object.values(v2.tags ?? {}).map((t) => ({
    ...t,
    emoji: "",
  }));

  // Migrate tag groups
  const tagGroups: TagGroup[] = Object.values(v2.tagGroups ?? {});

  // Migrate bookmarks (add type field)
  const bookmarks: Bookmark[] = Object.values(v2.bookmarks ?? {}).map((bm) => ({
    ...bm,
    type: db.classifyDomain(bm.domain, aiProviders),
  }));

  // Migrate URL patterns (add isGlob and contentType fields)
  const urlPatterns: UrlPattern[] = Object.values(v2.urlPatterns ?? {}).map(
    (p) => ({
      isGlob: false,
      contentType: "any" as const,
      ...p,
    })
  );

  await db.importAll(
    {
      version: SCHEMA_VERSION,
      exportedAt: now,
      bookmarks,
      tags,
      tagGroups,
      urlPatterns,
      settings: newSettings,
      coOccurrence: {},
      pinnedTags: [],
    },
    "replace"
  );

  // Persist domain sections to kv store (legacy)
  for (const section of Object.values(v2.domainSections ?? {})) {
    await db.saveDomainSection(section);
  }
}

// --- Helpers ---

function buildAiProviders(
  domainSections?: Record<string, DomainSection>
): string[] {
  if (!domainSections) return DEFAULT_AI_PROVIDERS;

  const aiSection = Object.values(domainSections).find(
    (s) => s.id === "ai-chats"
  );
  return aiSection?.domains ?? DEFAULT_AI_PROVIDERS;
}
