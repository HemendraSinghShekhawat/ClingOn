import type {
  Bookmark,
  DomainSection,
  FilterOptions,
  TagMode,
  SortField,
  SortOrder,
  ContentType,
} from "./types";

// --- Individual filters ---

export function filterByTags(
  bookmarks: Bookmark[],
  selectedTags: string[],
  mode: TagMode
): Bookmark[] {
  if (selectedTags.length === 0) return bookmarks;

  return bookmarks.filter((bk) => {
    if (mode === "AND") return selectedTags.every((t) => bk.tags.includes(t));
    return selectedTags.some((t) => bk.tags.includes(t));
  });
}

export function filterByContentType(
  bookmarks: Bookmark[],
  contentType: "all" | ContentType
): Bookmark[] {
  if (contentType === "all") return bookmarks;
  return bookmarks.filter((bk) => bk.type === contentType);
}

// Legacy — kept for backward compat with popup.ts
export function filterBySection(
  bookmarks: Bookmark[],
  sectionId: string | null,
  domainSections: Record<string, DomainSection>
): Bookmark[] {
  if (!sectionId) return bookmarks;

  const section = domainSections[sectionId];
  if (!section) return bookmarks;

  return bookmarks.filter((bk) =>
    section.domains.some(
      (domain) => bk.domain === domain || bk.domain.endsWith("." + domain)
    )
  );
}

export function filterByText(
  bookmarks: Bookmark[],
  searchText: string
): Bookmark[] {
  if (!searchText.trim()) return bookmarks;

  const query = searchText.toLowerCase().trim();
  return bookmarks.filter(
    (bk) =>
      bk.title.toLowerCase().includes(query) ||
      bk.notes.toLowerCase().includes(query) ||
      bk.url.toLowerCase().includes(query)
  );
}

// --- Combined filter ---

/**
 * Applies all active filters in order.
 * Uses `contentType` when set to a non-'all' value; falls back to legacy
 * `sectionId` filtering for popup.ts backward compat.
 */
export function filterBookmarks(
  bookmarks: Bookmark[],
  domainSections: Record<string, DomainSection>,
  options: FilterOptions
): Bookmark[] {
  let results = [...bookmarks];

  results = filterByTags(results, options.tags, options.tagMode);

  // Prefer contentType filter (v3); fall back to sectionId (legacy)
  if (options.contentType && options.contentType !== "all") {
    results = filterByContentType(results, options.contentType);
  } else if (options.sectionId) {
    results = filterBySection(results, options.sectionId, domainSections);
  }

  results = filterByText(results, options.searchText);

  return results;
}

// --- Sort ---

export function sortBookmarks(
  bookmarks: Bookmark[],
  field: SortField = "createdAt",
  order: SortOrder = "desc"
): Bookmark[] {
  return [...bookmarks].sort((a, b) => {
    let cmp: number;
    if (field === "title") {
      cmp = a.title.localeCompare(b.title);
    } else if (field === "domain") {
      cmp = a.domain.localeCompare(b.domain);
    } else {
      cmp = a.createdAt - b.createdAt;
    }
    return order === "desc" ? -cmp : cmp;
  });
}
