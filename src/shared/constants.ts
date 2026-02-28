import type { Tag, TagGroup, DomainSection, Settings, UrlPattern } from "./types";

export const SCHEMA_VERSION = 3;

export const TAG_COLORS = [
  "#4A90D9", // Blue
  "#50B86C", // Green
  "#E8913A", // Orange
  "#D94A4A", // Red
  "#9B59B6", // Purple
  "#1ABC9C", // Teal
  "#F39C12", // Yellow
  "#E74C8B", // Pink
  "#607D8B", // Blue Grey
  "#795548", // Brown
];

export const PILL_POSITIONS = [
  "top-right",
  "mid-right",
  "bottom-right",
  "left-mid",
] as const;

export const DEFAULT_AI_PROVIDERS: string[] = [
  "claude.ai",
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
  "chat.deepseek.com",
  "perplexity.ai",
];

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  pillPosition: "mid-right",
  activePromptingAI: true,
  activePromptingSites: false,
  aiProviders: DEFAULT_AI_PROVIDERS,
  defaultTagMode: "AND",
  // Legacy fields
  overlayEnabled: true,
  sidebarPosition: "right",
  autoDetectProviders: true,
};

export const DEFAULT_TAG_GROUPS: TagGroup[] = [
  { id: "topics", label: "Topics", order: 0, createdAt: 0 },
  { id: "type", label: "Type", order: 1, createdAt: 0 },
  { id: "status", label: "Status", order: 2, createdAt: 0 },
  { id: "uncategorized", label: "Uncategorized", order: 3, createdAt: 0 },
];

export const DEFAULT_TAGS: Tag[] = [
  // Topics
  { id: "programming", label: "Programming", emoji: "💻", color: TAG_COLORS[0], groupId: "topics", createdAt: 0 },
  { id: "javascript", label: "JavaScript", emoji: "⚡", color: TAG_COLORS[1], groupId: "topics", createdAt: 0 },
  { id: "python", label: "Python", emoji: "🐍", color: TAG_COLORS[2], groupId: "topics", createdAt: 0 },
  { id: "react", label: "React", emoji: "⚛️", color: TAG_COLORS[5], groupId: "topics", createdAt: 0 },
  { id: "system-design", label: "System Design", emoji: "📐", color: TAG_COLORS[4], groupId: "topics", createdAt: 0 },
  // Type
  { id: "brainstorming", label: "Brainstorming", emoji: "🧠", color: TAG_COLORS[6], groupId: "type", createdAt: 0 },
  { id: "reference", label: "Reference", emoji: "📌", color: TAG_COLORS[0], groupId: "type", createdAt: 0 },
  { id: "tutorial", label: "Tutorial", emoji: "📖", color: TAG_COLORS[1], groupId: "type", createdAt: 0 },
  { id: "debugging", label: "Debugging", emoji: "🔧", color: TAG_COLORS[3], groupId: "type", createdAt: 0 },
  { id: "idea", label: "Idea", emoji: "💡", color: TAG_COLORS[7], groupId: "type", createdAt: 0 },
  // Status
  { id: "to-revisit", label: "To Revisit", emoji: "🔁", color: TAG_COLORS[6], groupId: "status", createdAt: 0 },
  { id: "important", label: "Important", emoji: "⭐", color: TAG_COLORS[3], groupId: "status", createdAt: 0 },
  { id: "archived", label: "Archived", emoji: "📦", color: TAG_COLORS[8], groupId: "status", createdAt: 0 },
];

// Default URL patterns for AI chat pages (glob-based)
export const DEFAULT_URL_PATTERNS: UrlPattern[] = [
  { id: "chatgpt-chat", pattern: "chatgpt.com/c/*", isRegex: false, isGlob: true, autoTags: [], promptUser: true, enabled: true, contentType: "ai-chat" },
  { id: "claude-chat", pattern: "claude.ai/chat/*", isRegex: false, isGlob: true, autoTags: [], promptUser: true, enabled: true, contentType: "ai-chat" },
  { id: "gemini-chat", pattern: "gemini.google.com/app/*", isRegex: false, isGlob: true, autoTags: [], promptUser: true, enabled: true, contentType: "ai-chat" },
  { id: "deepseek-chat", pattern: "chat.deepseek.com/*", isRegex: false, isGlob: true, autoTags: [], promptUser: true, enabled: true, contentType: "ai-chat" },
  { id: "perplexity-search", pattern: "perplexity.ai/search/*", isRegex: false, isGlob: true, autoTags: [], promptUser: true, enabled: true, contentType: "ai-chat" },
];

// Legacy — kept for migration and popup.ts backward compat
export const DEFAULT_DOMAIN_SECTIONS: DomainSection[] = [
  {
    id: "ai-chats",
    label: "AI Chats",
    domains: DEFAULT_AI_PROVIDERS,
    createdAt: 0,
  },
  {
    id: "blogs",
    label: "Blogs",
    domains: ["medium.com", "dev.to", "hashnode.dev"],
    createdAt: 0,
  },
  {
    id: "docs",
    label: "Docs",
    domains: ["developer.mozilla.org", "docs.python.org"],
    createdAt: 0,
  },
];
