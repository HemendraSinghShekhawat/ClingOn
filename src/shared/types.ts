// --- Core domain types ---

export type ContentType = "ai-chat" | "site";
export type PillPosition = "top-right" | "mid-right" | "bottom-right" | "left-mid";
export type TagMode = "AND" | "OR";
export type SortField = "createdAt" | "title" | "domain";
export type SortOrder = "asc" | "desc";

// --- Entities ---

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  notes: string;
  domain: string;
  tags: string[];
  type: ContentType;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  label: string;
  emoji: string; // empty string '' when not set
  color: string;
  groupId: string;
  createdAt: number;
}

export interface TagGroup {
  id: string;
  label: string;
  order: number;
  createdAt: number;
}

// Legacy — kept for backward compat with popup.ts until Phase 4 rewrite
export interface DomainSection {
  id: string;
  label: string;
  domains: string[];
  createdAt: number;
}

export interface UrlPattern {
  id: string;
  pattern: string;
  isRegex: boolean;
  isGlob: boolean;
  autoTags: string[];
  promptUser: boolean;
  enabled: boolean;
  contentType: ContentType | "any";
}

export interface Settings {
  schemaVersion: number;
  // New fields (v3+)
  pillPosition: PillPosition;
  activePromptingAI: boolean;
  activePromptingSites: boolean;
  aiProviders: string[];
  defaultTagMode: TagMode;
  // Legacy fields — kept for backward compat until Phase 3/4 rewrite
  overlayEnabled: boolean;
  sidebarPosition: "left" | "right";
  autoDetectProviders: boolean;
}

// --- Intelligence ---

export type CoOccurrenceMap = Record<string, Record<string, number>>;

// --- Import / Export ---

export interface ExportData {
  version: number;
  exportedAt: number;
  bookmarks: Bookmark[];
  tags: Tag[];
  tagGroups: TagGroup[];
  urlPatterns: UrlPattern[];
  settings: Settings;
  coOccurrence: CoOccurrenceMap;
  pinnedTags: string[];
}

// --- Legacy schema type (used by storage shim) ---

export interface StorageSchema {
  bookmarks: Record<string, Bookmark>;
  tags: Record<string, Tag>;
  tagGroups: Record<string, TagGroup>;
  domainSections: Record<string, DomainSection>;
  urlPatterns: Record<string, UrlPattern>;
  settings: Settings;
}

// --- Query / Filter ---

export interface FilterOptions {
  tags: string[];
  tagMode: TagMode;
  contentType: "all" | ContentType; // replaces sectionId in v3
  sectionId: string | null; // legacy — kept for popup.ts compat
  searchText: string;
}
