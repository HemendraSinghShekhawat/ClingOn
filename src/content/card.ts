import type {
  Bookmark,
  Tag,
  TagGroup,
  Settings,
  CoOccurrenceMap,
  PillPosition,
  ContentType,
} from "../shared/types";
import { classifyDomain } from "../shared/db";
import { TAG_COLORS, PILL_POSITIONS } from "../shared/constants";
import {
  getRelated,
  getCombos,
  getTopTagsByUsage,
} from "../shared/co-occurrence";
import cardCss from "./card.css?raw";

// ── Service-worker message helper ────────────────────────
// All IndexedDB operations must go through the service worker so they use
// the extension's shared DB (not the per-page-origin DB of the content script).

function sendMsg<T>(msg: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ── State ────────────────────────────────────────────────

interface CardState {
  open: boolean;
  bookmark: Bookmark | null;
  tags: Tag[];
  tagGroups: TagGroup[];
  bookmarks: Bookmark[];
  coOccurrence: CoOccurrenceMap;
  pinnedTags: string[];
  settings: Settings;
  searchText: string;
  promptActive: boolean;
}

let state: CardState = {
  open: false,
  bookmark: null,
  tags: [],
  tagGroups: [],
  bookmarks: [],
  coOccurrence: {},
  pinnedTags: [],
  settings: {} as Settings,
  searchText: "",
  promptActive: false,
};

// ── DOM refs ─────────────────────────────────────────────

let shadowRoot: ShadowRoot;
let pillEl: HTMLElement;
let cardEl: HTMLElement;
let searchInputEl: HTMLInputElement;
let sectionsEl: HTMLElement;
let activeTagsEl: HTMLElement;
let footerTypeBtn: HTMLButtonElement;
let notesTimeout: ReturnType<typeof setTimeout>;

// ── Public API ───────────────────────────────────────────

export function createCard(host: HTMLElement): void {
  shadowRoot = host.attachShadow({ mode: "closed" });

  // Intercept keyboard events at window capture phase.
  //
  // Why window capture and not host bubble (the previous approach)?
  // Extensions like Surfingkeys/Vimium register their key listeners on
  // `document` in CAPTURE phase, which fires AFTER window capture but BEFORE
  // any bubble-phase listeners. The old host-bubble approach ran too late —
  // Surfingkeys had already seen (and acted on) the keystroke.
  //
  // window capture fires first in the event path:
  //   window(capture) → document(capture/Surfingkeys) → … → shadow-input(target)
  //                  ↑ we stop it here
  //
  // Additionally, when our shadow input is focused, `document.activeElement`
  // returns the shadow HOST div (not the inner <input>), so Surfingkeys/Vimium
  // think no input is active and process every keystroke as a binding.
  //
  // For keydown we re-dispatch a synthetic non-bubbling copy directly to the
  // search input so our own handlers (Enter key etc.) still fire.
  // Text insertion is unaffected: it is a native browser action tied to the
  // OS key event and only cancelled by `preventDefault()`, not `stopPropagation()`.
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (!e.isTrusted || !host.matches(":focus-within")) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      // Re-dispatch to shadow input only when it is the focused element,
      // so our keydown handlers (Enter → tag create/toggle) still fire.
      if (shadowRoot.activeElement === searchInputEl) {
        searchInputEl.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: e.key,
            code: e.code,
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: false,
            cancelable: true,
          })
        );
      }
    },
    true // capture phase
  );

  for (const evType of ["keyup", "keypress"] as const) {
    window.addEventListener(
      evType,
      (e: Event) => {
        if (!(e as KeyboardEvent).isTrusted || !host.matches(":focus-within")) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
      },
      true // capture phase
    );
  }

  const style = document.createElement("style");
  style.textContent = cardCss;
  shadowRoot.appendChild(style);

  // Pill
  pillEl = document.createElement("div");
  pillEl.className = "co-pill";
  pillEl.setAttribute("data-pos", "mid-right");
  pillEl.setAttribute("role", "button");
  pillEl.setAttribute("aria-label", "ClingOn — click to tag this page");
  pillEl.setAttribute("tabindex", "0");
  pillEl.addEventListener("click", openCard);
  pillEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openCard();
  });
  shadowRoot.appendChild(pillEl);

  // Card
  cardEl = document.createElement("div");
  cardEl.className = "co-card";
  cardEl.innerHTML = buildCardHTML();
  shadowRoot.appendChild(cardEl);

  // Wire up stable DOM refs
  searchInputEl = cardEl.querySelector<HTMLInputElement>(".co-search-input")!;
  sectionsEl = cardEl.querySelector<HTMLElement>(".co-sections")!;
  activeTagsEl = cardEl.querySelector<HTMLElement>(".co-active")!;
  footerTypeBtn = cardEl.querySelector<HTMLButtonElement>(".co-type-badge")!;

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (state.open && !host.contains(e.target as Node)) closeCard();
  });

  // Search
  searchInputEl.addEventListener("input", () => {
    state.searchText = searchInputEl.value;
    renderSections();
  });

  searchInputEl.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const query = state.searchText.trim();
    if (!query) return;

    // Prefer exact match, then first partial match, then create
    const exact = state.tags.find(
      (t) => t.label.toLowerCase() === query.toLowerCase()
    );
    if (exact) {
      await handleTagToggle(exact.id);
      searchInputEl.value = "";
      state.searchText = "";
      renderSections();
      return;
    }

    const partial = state.tags.find(
      (t) =>
        t.label.toLowerCase().includes(query.toLowerCase()) ||
        t.emoji.toLowerCase().includes(query.toLowerCase())
    );
    if (partial) {
      await handleTagToggle(partial.id);
      searchInputEl.value = "";
      state.searchText = "";
      renderSections();
      return;
    }

    // No match — create and apply
    await handleCreateTag(query);
  });

  // Footer buttons
  cardEl
    .querySelector(".co-type-badge")!
    .addEventListener("click", handleTypeToggle);

  cardEl
    .querySelector(".co-move-btn")!
    .addEventListener("click", handleMovePos);

  cardEl
    .querySelector(".co-browse-btn")!
    .addEventListener("click", handleBrowse);

  // Keyboard shortcut listener (from service-worker)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_SIDEBAR") {
      state.open ? closeCard() : openCard();
    }
  });
}

export async function openCard(): Promise<void> {
  if (state.open) {
    closeCard();
    return;
  }
  state.open = true;
  state.promptActive = false;
  pillEl.classList.remove("co-pill--prompt");

  await loadData();
  renderAll();

  cardEl.classList.add("open");
  positionCard();
  searchInputEl.value = "";
  state.searchText = "";
}

export function closeCard(): void {
  state.open = false;
  cardEl.classList.remove("open");
}

export function setPillPromptState(active: boolean): void {
  state.promptActive = active;
  pillEl.classList.toggle("co-pill--prompt", active);
}

// ── Data loading ─────────────────────────────────────────

async function loadData(): Promise<void> {
  const data = await sendMsg<{
    tags: Tag[];
    tagGroups: TagGroup[];
    bookmarks: Bookmark[];
    coOccurrence: CoOccurrenceMap;
    pinnedTags: string[];
    settings: Settings;
    bookmark: Bookmark | null;
  }>({ type: "LOAD_CARD_DATA", url: window.location.href });

  state.tags = data.tags;
  state.tagGroups = data.tagGroups;
  state.bookmarks = data.bookmarks;
  state.coOccurrence = data.coOccurrence;
  state.pinnedTags = data.pinnedTags;
  state.settings = data.settings;
  state.bookmark = data.bookmark;
}

// ── Render ───────────────────────────────────────────────

function renderAll(): void {
  renderPillDot();
  renderTitle();
  renderActiveTags();
  renderSections();
  renderFooter();
}

function renderPillDot(): void {
  let dot = pillEl.querySelector<HTMLElement>(".co-pill-dot");
  const count = state.bookmark?.tags.length ?? 0;
  if (count > 0) {
    if (!dot) {
      dot = document.createElement("div");
      dot.className = "co-pill-dot";
      pillEl.appendChild(dot);
    }
  } else {
    dot?.remove();
  }
}

function renderTitle(): void {
  const textEl = cardEl.querySelector<HTMLElement>(".co-title-text")!;
  const domainEl = cardEl.querySelector<HTMLElement>(".co-title-domain")!;
  textEl.textContent = document.title || window.location.href;
  domainEl.textContent = window.location.hostname;
}

function renderActiveTags(): void {
  activeTagsEl.innerHTML = "";
  const activeIds = state.bookmark?.tags ?? [];

  if (activeIds.length === 0) {
    const empty = document.createElement("span");
    empty.className = "co-active-empty";
    empty.textContent = "No tags yet — add from below";
    activeTagsEl.appendChild(empty);
    return;
  }

  for (const tagId of activeIds) {
    const tag = state.tags.find((t) => t.id === tagId);
    if (!tag) continue;
    activeTagsEl.appendChild(createActiveChip(tag));
  }
}

function renderSections(): void {
  sectionsEl.innerHTML = "";

  if (state.searchText.trim()) {
    renderSearchResults();
    return;
  }

  const allTagIds = new Set(state.tags.map((t) => t.id));
  const activeIds = state.bookmark?.tags ?? [];

  // Combos
  const combos = getCombos(state.coOccurrence, allTagIds, 3, 5);
  if (combos.length > 0) {
    sectionsEl.appendChild(
      buildSection("Combos", () => {
        const row = document.createElement("div");
        row.className = "co-section-row";
        for (const tagIds of combos) {
          row.appendChild(createComboChip(tagIds));
        }
        return row;
      })
    );
  }

  // Related (only when tags are active)
  if (activeIds.length > 0) {
    const related = getRelated(state.coOccurrence, activeIds, allTagIds, 6);
    if (related.length > 0) {
      sectionsEl.appendChild(
        buildSection("Related", () => buildChipRow(related))
      );
    }
  }

  // Pinned
  const pinned = state.pinnedTags.filter((id) => allTagIds.has(id));
  if (pinned.length > 0) {
    sectionsEl.appendChild(
      buildSection("Pinned", () => buildChipRow(pinned))
    );
  }

  // Top (exclude pinned to avoid duplication)
  const top = getTopTagsByUsage(state.bookmarks, allTagIds, 8).filter(
    (id) => !pinned.includes(id) && !activeIds.includes(id)
  );
  if (top.length > 0) {
    sectionsEl.appendChild(buildSection("Top", () => buildChipRow(top)));
  }

  // Fallback: if no sections rendered, show all tags flat
  if (sectionsEl.children.length === 0) {
    const allIds = state.tags
      .filter((t) => !activeIds.includes(t.id))
      .slice(0, 12)
      .map((t) => t.id);
    if (allIds.length > 0) {
      sectionsEl.appendChild(buildSection("Tags", () => buildChipRow(allIds)));
    }
  }
}

function renderSearchResults(): void {
  const query = state.searchText.toLowerCase().trim();
  const matches = state.tags.filter(
    (t) =>
      t.label.toLowerCase().includes(query) ||
      t.emoji.toLowerCase().includes(query)
  );

  const section = buildSection("Results", () => {
    const row = document.createElement("div");
    row.className = "co-section-row co-section-row--wrap";

    for (const tag of matches.slice(0, 12)) {
      row.appendChild(createTagChip(tag, () => handleTagToggle(tag.id)));
    }

    // Create tag option when no exact match
    const exactMatch = state.tags.some(
      (t) => t.label.toLowerCase() === query
    );
    if (!exactMatch && query.length > 0) {
      row.appendChild(createCreateChip(state.searchText.trim()));
    }

    return row;
  });

  sectionsEl.appendChild(section);
}

function renderFooter(): void {
  const type = state.bookmark?.type ?? detectCurrentType();
  footerTypeBtn.textContent = type === "ai-chat" ? "AI Chat" : "Site";
  footerTypeBtn.className = `co-type-badge co-footer-btn ${
    type === "ai-chat" ? "co-type-badge--ai" : "co-type-badge--site"
  }`;
}

// ── DOM builders ─────────────────────────────────────────

function buildCardHTML(): string {
  return `
    <div class="co-title">
      <span class="co-title-text"></span>
      <span class="co-title-domain"></span>
    </div>
    <div class="co-active"></div>
    <div class="co-sections"></div>
    <div class="co-search">
      <input class="co-search-input" type="text" placeholder="🔍 search or create tag…" autocomplete="off" spellcheck="false" />
    </div>
    <div class="co-footer">
      <button class="co-type-badge co-type-badge--site co-footer-btn">Site</button>
      <button class="co-footer-btn co-move-btn">↕ Move</button>
      <button class="co-footer-btn co-browse-btn">Browse →</button>
    </div>
  `;
}

function buildSection(
  label: string,
  buildContent: () => HTMLElement
): HTMLElement {
  const section = document.createElement("div");
  section.className = "co-section";

  const labelEl = document.createElement("div");
  labelEl.className = "co-section-label";
  labelEl.textContent = label;

  section.appendChild(labelEl);
  section.appendChild(buildContent());
  return section;
}

function buildChipRow(tagIds: string[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "co-section-row";
  for (const id of tagIds) {
    const tag = state.tags.find((t) => t.id === id);
    if (tag) row.appendChild(createTagChip(tag, () => handleTagToggle(id)));
  }
  return row;
}

function createActiveChip(tag: Tag): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "co-active-chip";
  chip.style.setProperty("--chip-color", tag.color);

  const label = document.createElement("span");
  label.textContent = tag.emoji ? `${tag.emoji} ${tag.label}` : tag.label;

  const remove = document.createElement("button");
  remove.className = "co-active-chip-remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Remove ${tag.label}`);
  remove.addEventListener("click", (e) => {
    e.stopPropagation();
    handleTagToggle(tag.id);
  });

  chip.appendChild(label);
  chip.appendChild(remove);
  return chip;
}

function createTagChip(tag: Tag, onClick: () => void): HTMLElement {
  const chip = document.createElement("button");
  chip.className = "co-chip";
  chip.textContent = tag.emoji ? `${tag.emoji} ${tag.label}` : tag.label;
  chip.title = tag.label;
  chip.addEventListener("click", onClick);
  return chip;
}

function createComboChip(tagIds: string[]): HTMLElement {
  const chip = document.createElement("button");
  chip.className = "co-chip co-chip--combo";

  const tags = tagIds
    .map((id) => state.tags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  chip.textContent = tags.map((t) => t.emoji || t.label).join(" + ");
  chip.title = `Apply: ${tags.map((t) => t.label).join(", ")}`;
  chip.addEventListener("click", () => handleComboApply(tagIds));
  return chip;
}

function createCreateChip(label: string): HTMLElement {
  const chip = document.createElement("button");
  chip.className = "co-chip co-chip--create";
  chip.textContent = `+ Create "${label}"`;
  chip.addEventListener("click", () => handleCreateTag(label));
  return chip;
}

// ── Event handlers ───────────────────────────────────────

async function handleTagToggle(tagId: string): Promise<void> {
  const type = detectCurrentType();
  const { bookmark, coOccurrence } = await sendMsg<{
    bookmark: Bookmark;
    coOccurrence: CoOccurrenceMap;
  }>({
    type: "TOGGLE_TAG",
    url: window.location.href,
    title: document.title || window.location.href,
    tagId,
    contentType: type,
  });
  state.bookmark = bookmark;
  state.coOccurrence = coOccurrence;
  renderActiveTags();
  renderSections();
  renderPillDot();
  renderFooter();
}

async function handleComboApply(tagIds: string[]): Promise<void> {
  const type = detectCurrentType();
  const url = window.location.href;
  const title = document.title || url;

  for (const tagId of tagIds) {
    // Only add tags not already present
    if (!state.bookmark?.tags.includes(tagId)) {
      const { bookmark, coOccurrence } = await sendMsg<{
        bookmark: Bookmark;
        coOccurrence: CoOccurrenceMap;
      }>({ type: "TOGGLE_TAG", url, title, tagId, contentType: type });
      state.bookmark = bookmark;
      state.coOccurrence = coOccurrence;
    }
  }
  renderActiveTags();
  renderSections();
  renderPillDot();
}

async function handleCreateTag(label: string): Promise<void> {
  const id = label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
  if (!id) return;

  // Don't duplicate
  if (state.tags.find((t) => t.id === id)) {
    await handleTagToggle(id);
    return;
  }

  const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
  const { tag: newTag } = await sendMsg<{ tag: Tag }>({
    type: "CREATE_TAG",
    id,
    label,
    emoji: "",
    color,
    group: "uncategorized",
  });
  state.tags = [...state.tags, newTag];

  // Clear search and apply tag
  searchInputEl.value = "";
  state.searchText = "";
  await handleTagToggle(id);
}

async function handleTypeToggle(): Promise<void> {
  const current = state.bookmark?.type ?? detectCurrentType();
  const next: ContentType = current === "ai-chat" ? "site" : "ai-chat";

  if (state.bookmark) {
    const { bookmark } = await sendMsg<{ bookmark: Bookmark }>({
      type: "UPDATE_BOOKMARK",
      id: state.bookmark.id,
      patch: { type: next },
    });
    state.bookmark = bookmark;
  } else {
    // Create a bookmark with the overridden type to persist the choice
    const { bookmark } = await sendMsg<{ bookmark: Bookmark }>({
      type: "SAVE_BOOKMARK",
      url: window.location.href,
      title: document.title || window.location.href,
      tags: [],
      notes: "",
      contentType: next,
    });
    state.bookmark = bookmark;
  }
  renderFooter();
}

function handleMovePos(): void {
  const positions = PILL_POSITIONS as readonly PillPosition[];
  const current = (state.settings.pillPosition as PillPosition) ?? "mid-right";
  const idx = positions.indexOf(current);
  const next = positions[(idx + 1) % positions.length];

  state.settings.pillPosition = next;
  sendMsg({ type: "UPDATE_SETTINGS", patch: { pillPosition: next } });

  pillEl.setAttribute("data-pos", next);
  positionCard();
}

function handleBrowse(): void {
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
}

// ── Positioning ──────────────────────────────────────────

function positionCard(): void {
  const pos =
    (state.settings.pillPosition as PillPosition | undefined) ?? "mid-right";
  const pillRect = pillEl.getBoundingClientRect();
  const GAP = 6;

  // Horizontal
  if (pos === "left-mid") {
    cardEl.style.left = `${pillRect.right + GAP}px`;
    cardEl.style.right = "auto";
  } else {
    cardEl.style.right = `${window.innerWidth - pillRect.left + GAP}px`;
    cardEl.style.left = "auto";
  }

  // Vertical — center on pill, clamp to viewport
  const cardH = Math.min(cardEl.scrollHeight || 400, 500);
  const idealTop = pillRect.top + pillRect.height / 2 - cardH / 2;
  const top = Math.max(8, Math.min(window.innerHeight - cardH - 8, idealTop));
  cardEl.style.top = `${top}px`;
}

// ── Helpers ──────────────────────────────────────────────

function detectCurrentType(): ContentType {
  return classifyDomain(
    window.location.hostname,
    state.settings.aiProviders ?? []
  );
}
