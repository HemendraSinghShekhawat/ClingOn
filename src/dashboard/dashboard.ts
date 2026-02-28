import type {
  Bookmark,
  Tag,
  TagGroup,
  Settings,
  ContentType,
  TagMode,
  SortField,
  SortOrder,
  ExportData,
  PillPosition,
} from "../shared/types";
import * as db from "../shared/db";
import {
  filterByContentType,
  filterByTags,
  filterByText,
  sortBookmarks,
} from "../shared/query-engine";
import { TAG_COLORS, PILL_POSITIONS } from "../shared/constants";

// ── State ────────────────────────────────────────────────

type Panel = "none" | "settings" | "tags" | "export";

interface EditBookmarkState {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  type: ContentType;
}

interface State {
  bookmarks: Bookmark[];
  tags: Tag[];
  tagGroups: TagGroup[];
  settings: Settings;
  pinnedTags: string[];
  // Filter
  searchText: string;
  contentType: "all" | ContentType;
  filterTags: string[];
  tagMode: TagMode;
  sortField: SortField;
  sortOrder: SortOrder;
  // Panels
  panel: Panel;
  // Editing
  editBookmark: EditBookmarkState | null;
  editingTagId: string | null;
  newProviderInput: string;
  // View
  viewMode: "grid" | "table";
}

const S: State = {
  bookmarks: [],
  tags: [],
  tagGroups: [],
  settings: {} as Settings,
  pinnedTags: [],
  searchText: "",
  contentType: "all",
  filterTags: [],
  tagMode: "AND",
  sortField: "createdAt",
  sortOrder: "desc",
  panel: "none",
  editBookmark: null,
  editingTagId: null,
  newProviderInput: "",
  viewMode: "grid",
};

// ── Computed ─────────────────────────────────────────────

function getFiltered(): Bookmark[] {
  let r = [...S.bookmarks];
  r = filterByContentType(r, S.contentType);
  r = filterByTags(r, S.filterTags, S.tagMode);
  r = filterByText(r, S.searchText);
  return sortBookmarks(r, S.sortField, S.sortOrder);
}

function tagById(id: string): Tag | undefined {
  return S.tags.find((t) => t.id === id);
}

function tagUsage(): Map<string, number> {
  const m = new Map<string, number>();
  for (const bm of S.bookmarks)
    for (const tid of bm.tags) m.set(tid, (m.get(tid) ?? 0) + 1);
  return m;
}

// ── Data ─────────────────────────────────────────────────

async function loadData(): Promise<void> {
  const [bookmarks, tags, tagGroups, settings, pinnedTags] = await Promise.all([
    db.getAllBookmarks(),
    db.getAllTags(),
    db.getAllTagGroups(),
    db.getSettings(),
    db.getPinnedTags(),
  ]);
  S.bookmarks = bookmarks;
  S.tags = tags;
  S.tagGroups = tagGroups;
  S.settings = settings;
  S.pinnedTags = pinnedTags;
}

async function refresh(): Promise<void> {
  await loadData();
  renderGrid();
  renderTagFilterChips();
  updateContentTypeTabs();
  // Keep panel open and re-render it if it was showing
  if (S.panel !== "none") renderPanel();
}

// ── Grid ─────────────────────────────────────────────────

function renderGrid(): void {
  const grid = el("db-grid")!;
  const empty = el("db-empty")!;
  const count = el("db-count")!;
  const filtered = getFiltered();

  grid.innerHTML = "";

  if (filtered.length === 0) {
    empty.classList.remove("hidden");
    count.textContent = "0 bookmarks";
    return;
  }
  empty.classList.add("hidden");
  count.textContent = `${filtered.length} bookmark${filtered.length !== 1 ? "s" : ""}`;

  if (S.viewMode === "table") {
    grid.classList.add("db-grid--table");
    grid.appendChild(buildTable(filtered));
  } else {
    grid.classList.remove("db-grid--table");
    for (const bm of filtered) grid.appendChild(buildCard(bm));
  }
}

function buildCard(bm: Bookmark): HTMLElement {
  const card = document.createElement("div");
  card.className = `db-card db-card--${bm.type}`;

  const date = new Date(bm.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const tagChips = bm.tags
    .map((tid) => {
      const t = tagById(tid);
      if (!t) return "";
      return `<span class="db-card-tag" style="background:${t.color}" title="${esc(t.label)}">${t.emoji ? t.emoji + " " : ""}${esc(t.label)}</span>`;
    })
    .filter(Boolean)
    .join("");

  const typeCls =
    bm.type === "ai-chat" ? "db-type-badge--ai" : "db-type-badge--site";
  const typeLabel = bm.type === "ai-chat" ? "AI Chat" : "Site";

  card.innerHTML = `
    <div class="db-card-actions">
      <button class="db-card-btn db-card-edit-btn" title="Edit">✏</button>
      <button class="db-card-btn db-card-delete-btn" title="Delete">✕</button>
    </div>
    <a class="db-card-title" href="${esc(bm.url)}" target="_blank" rel="noopener" title="${esc(bm.title)}">${esc(bm.title || bm.url)}</a>
    <div class="db-card-meta">
      <span class="db-type-badge ${typeCls}">${typeLabel}</span>
      <span>${esc(bm.domain)} · ${esc(date)}</span>
    </div>
    ${bm.notes ? `<p class="db-card-notes">${esc(bm.notes)}</p>` : ""}
    <div class="db-card-tags">${tagChips || '<span class="db-card-no-tags">no tags</span>'}</div>
  `;

  card
    .querySelector(".db-card-edit-btn")!
    .addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditModal(bm);
    });

  card
    .querySelector(".db-card-delete-btn")!
    .addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete "${bm.title || bm.url}"?`)) return;
      await db.deleteBookmark(bm.id);
      await refresh();
    });

  return card;
}

function buildTable(bookmarks: Bookmark[]): HTMLElement {
  const table = document.createElement("table");
  table.className = "db-table";
  table.innerHTML = `
    <thead>
      <tr class="db-table-head">
        <th class="db-th db-th--title">Title</th>
        <th class="db-th db-th--type">Type</th>
        <th class="db-th db-th--tags">Tags</th>
        <th class="db-th db-th--domain">Domain</th>
        <th class="db-th db-th--date">Date</th>
        <th class="db-th db-th--actions"></th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");
  for (const bm of bookmarks) tbody.appendChild(buildRow(bm));
  table.appendChild(tbody);
  return table;
}

function buildRow(bm: Bookmark): HTMLElement {
  const tr = document.createElement("tr");
  tr.className = `db-table-row db-table-row--${bm.type}`;

  const date = new Date(bm.createdAt).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  // Title cell
  const tdTitle = document.createElement("td");
  tdTitle.className = "db-td db-td--title";
  const link = document.createElement("a");
  link.className = "db-row-title";
  link.href = bm.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = bm.title || bm.url;
  link.title = bm.title || bm.url;
  tdTitle.appendChild(link);

  // Type cell
  const typeCls = bm.type === "ai-chat" ? "db-type-badge--ai" : "db-type-badge--site";
  const typeLabel = bm.type === "ai-chat" ? "AI Chat" : "Site";
  const tdType = document.createElement("td");
  tdType.className = "db-td db-td--type";
  tdType.innerHTML = `<span class="db-type-badge ${typeCls}">${typeLabel}</span>`;

  // Tags cell — first 3 chips + overflow count
  const tdTags = document.createElement("td");
  tdTags.className = "db-td db-td--tags";
  const visibleTags = bm.tags.slice(0, 3);
  const overflow = bm.tags.length - visibleTags.length;
  tdTags.innerHTML = visibleTags.map((tid) => {
    const t = tagById(tid);
    if (!t) return "";
    return `<span class="db-card-tag" style="background:${t.color}" title="${esc(t.label)}">${t.emoji ? t.emoji + " " : ""}${esc(t.label)}</span>`;
  }).filter(Boolean).join("") +
  (overflow > 0 ? `<span class="db-row-tag-overflow">+${overflow}</span>` : "");

  // Domain cell
  const tdDomain = document.createElement("td");
  tdDomain.className = "db-td db-td--domain";
  tdDomain.textContent = bm.domain;

  // Date cell
  const tdDate = document.createElement("td");
  tdDate.className = "db-td db-td--date";
  tdDate.textContent = date;

  // Actions cell
  const tdActions = document.createElement("td");
  tdActions.className = "db-td db-td--actions";
  const editBtn = document.createElement("button");
  editBtn.className = "db-card-btn db-card-edit-btn";
  editBtn.title = "Edit";
  editBtn.textContent = "✏";
  editBtn.addEventListener("click", (e) => { e.preventDefault(); openEditModal(bm); });
  const delBtn = document.createElement("button");
  delBtn.className = "db-card-btn db-card-delete-btn";
  delBtn.title = "Delete";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm(`Delete "${bm.title || bm.url}"?`)) return;
    await db.deleteBookmark(bm.id);
    await refresh();
  });
  tdActions.appendChild(editBtn);
  tdActions.appendChild(delBtn);

  tr.append(tdTitle, tdType, tdTags, tdDomain, tdDate, tdActions);
  return tr;
}

// ── Tag filter bar ────────────────────────────────────────

function renderTagFilterChips(): void {
  const container = el("db-filter-chips")!;
  container.innerHTML = "";

  for (const tid of S.filterTags) {
    const tag = tagById(tid);
    if (!tag) continue;
    const chip = document.createElement("span");
    chip.className = "db-filter-chip";
    chip.innerHTML = `<span>${tag.emoji ? tag.emoji + " " : ""}${esc(tag.label)}</span>`;
    const rm = document.createElement("button");
    rm.className = "db-filter-chip-remove";
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      S.filterTags = S.filterTags.filter((id) => id !== tid);
      renderTagFilterChips();
      renderGrid();
    });
    chip.appendChild(rm);
    container.appendChild(chip);
  }
}

function renderTagPicker(): void {
  const list = el("db-filter-tag-list")!;
  const input = el("db-filter-tag-input") as HTMLInputElement;
  const picker = el("db-filter-tag-picker")!;
  const q = input.value.toLowerCase();
  const selected = new Set(S.filterTags);

  list.innerHTML = "";
  const matches = S.tags
    .filter((t) => !selected.has(t.id))
    .filter(
      (t) =>
        !q ||
        t.label.toLowerCase().includes(q) ||
        t.emoji.toLowerCase().includes(q)
    )
    .slice(0, 10);

  for (const tag of matches) {
    const opt = document.createElement("button");
    opt.className = "db-tag-picker-opt";
    opt.textContent = `${tag.emoji ? tag.emoji + " " : ""}${tag.label}`;
    opt.style.setProperty("--opt-color", tag.color);
    opt.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep focus in input
      S.filterTags = [...S.filterTags, tag.id];
      input.value = "";
      picker.classList.remove("open");
      renderTagFilterChips();
      renderGrid();
    });
    list.appendChild(opt);
  }

  picker.classList.toggle(
    "open",
    list.children.length > 0 || q.length > 0
  );
}

function updateContentTypeTabs(): void {
  document
    .querySelectorAll<HTMLButtonElement>("[data-type-tab]")
    .forEach((btn) => {
      btn.classList.toggle(
        "db-tab--active",
        btn.dataset.typeTab === S.contentType
      );
    });
}

function updateSortSelect(): void {
  const sel = el("db-sort-select") as HTMLSelectElement;
  if (sel) sel.value = `${S.sortField}:${S.sortOrder}`;
}

function updateTagModeRadios(): void {
  document
    .querySelectorAll<HTMLInputElement>('[name="db-tagmode"]')
    .forEach((r) => {
      r.checked = r.value === S.tagMode;
    });
}

// ── Panel ─────────────────────────────────────────────────

function renderPanel(): void {
  const panel = el("db-panel")!;
  const body = el("db-panel-body")!;
  const titleEl = el("db-panel-title")!;
  const backBtn = el("db-panel-back")!;

  if (S.panel === "none") {
    panel.classList.remove("open");
    return;
  }
  panel.classList.add("open");

  body.innerHTML = "";

  if (S.panel === "settings") {
    titleEl.textContent = "Settings";
    backBtn.classList.add("hidden");
    body.appendChild(buildSettingsContent());
  } else if (S.panel === "tags") {
    titleEl.textContent = "Manage Tags";
    backBtn.classList.remove("hidden");
    body.appendChild(buildTagsContent());
  } else if (S.panel === "export") {
    titleEl.textContent = "Export / Import";
    backBtn.classList.remove("hidden");
    body.appendChild(buildExportContent());
  }
}

// ── Settings panel ────────────────────────────────────────

function buildSettingsContent(): HTMLElement {
  const wrap = document.createElement("div");

  // Active Prompting
  const promptSec = makeSection("Active Prompting");
  promptSec.appendChild(
    makeToggleRow(
      "Prompt for AI Chats",
      "Pulse pill when an AI chat page is untagged",
      S.settings.activePromptingAI,
      async (v) => { S.settings = await db.updateSettings({ activePromptingAI: v }); }
    )
  );
  promptSec.appendChild(
    makeToggleRow(
      "Prompt for Sites",
      "Pulse pill when a matching site is untagged",
      S.settings.activePromptingSites,
      async (v) => { S.settings = await db.updateSettings({ activePromptingSites: v }); }
    )
  );
  wrap.appendChild(promptSec);

  // Pill Position
  const pillSec = makeSection("Pill Position");
  const pillGrid = document.createElement("div");
  pillGrid.className = "db-pill-grid";
  const posLabels: Record<string, string> = {
    "top-right": "↗ Top Right",
    "mid-right": "→ Mid Right",
    "bottom-right": "↘ Bottom Right",
    "left-mid": "← Left Mid",
  };
  for (const pos of PILL_POSITIONS) {
    const btn = document.createElement("button");
    btn.className = `db-pill-pos-btn${S.settings.pillPosition === pos ? " active" : ""}`;
    btn.textContent = posLabels[pos] ?? pos;
    btn.addEventListener("click", async () => {
      S.settings = await db.updateSettings({ pillPosition: pos as PillPosition });
      pillGrid
        .querySelectorAll(".db-pill-pos-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    pillGrid.appendChild(btn);
  }
  pillSec.appendChild(pillGrid);
  wrap.appendChild(pillSec);

  // AI Providers
  const provSec = makeSection("AI Providers");
  const provList = document.createElement("div");
  provList.className = "db-provider-list";
  provList.id = "db-provider-list";
  renderProviderList(provList);
  provSec.appendChild(provList);

  const addRow = document.createElement("div");
  addRow.className = "db-add-provider-row";
  const provInput = document.createElement("input");
  provInput.type = "text";
  provInput.className = "db-text-input";
  provInput.placeholder = "e.g. chat.example.com";
  provInput.value = S.newProviderInput;
  provInput.addEventListener("input", () => { S.newProviderInput = provInput.value; });
  provInput.addEventListener("keydown", async (e) => { if (e.key === "Enter") await addProvider(); });
  const addBtn = document.createElement("button");
  addBtn.className = "db-btn db-btn--primary";
  addBtn.textContent = "Add";
  const addProvider = async () => {
    const domain = provInput.value.trim().toLowerCase();
    if (!domain || S.settings.aiProviders.includes(domain)) return;
    S.settings = await db.updateSettings({
      aiProviders: [...S.settings.aiProviders, domain],
    });
    S.newProviderInput = "";
    provInput.value = "";
    renderProviderList(document.getElementById("db-provider-list")!);
  };
  addBtn.addEventListener("click", addProvider);
  addRow.appendChild(provInput);
  addRow.appendChild(addBtn);
  provSec.appendChild(addRow);
  wrap.appendChild(provSec);

  // Keyboard Shortcut
  const shortcutSec = makeSection("Keyboard Shortcut");
  shortcutSec.appendChild(buildShortcutRow());
  wrap.appendChild(shortcutSec);

  // Links to sub-panels
  const manageSec = makeSection("Manage");
  manageSec.appendChild(
    makeLinkBtn("🏷 Manage Tags", "→", () => { S.panel = "tags"; renderPanel(); })
  );
  manageSec.appendChild(
    makeLinkBtn("↕ Export / Import", "→", () => { S.panel = "export"; renderPanel(); })
  );
  wrap.appendChild(manageSec);

  return wrap;
}

function renderProviderList(container: HTMLElement): void {
  container.innerHTML = "";
  for (const domain of S.settings.aiProviders) {
    const chip = document.createElement("div");
    chip.className = "db-provider-chip";
    const label = document.createElement("span");
    label.textContent = domain;
    const rm = document.createElement("button");
    rm.className = "db-provider-chip-remove";
    rm.textContent = "×";
    rm.title = `Remove ${domain}`;
    rm.addEventListener("click", async () => {
      S.settings = await db.updateSettings({
        aiProviders: S.settings.aiProviders.filter((d) => d !== domain),
      });
      renderProviderList(container);
    });
    chip.appendChild(label);
    chip.appendChild(rm);
    container.appendChild(chip);
  }
}

// ── Tag management panel ──────────────────────────────────

function buildTagsContent(): HTMLElement {
  const wrap = document.createElement("div");
  const usage = tagUsage();
  const sortedGroups = [...S.tagGroups].sort((a, b) => a.order - b.order);

  for (const group of sortedGroups) {
    const sec = document.createElement("div");
    sec.className = "db-tag-group-section";

    const header = document.createElement("div");
    header.className = "db-tag-group-header";

    const lbl = document.createElement("span");
    lbl.className = "db-tag-group-label";
    lbl.textContent = group.label;
    header.appendChild(lbl);

    if (group.id !== "uncategorized") {
      const delBtn = makeIconBtn("✕", "db-icon-btn db-icon-btn--danger");
      delBtn.title = `Delete group "${group.label}"`;
      delBtn.addEventListener("click", async () => {
        if (
          !confirm(
            `Delete group "${group.label}"? Tags will move to Uncategorized.`
          )
        )
          return;
        await db.deleteTagGroup(group.id);
        await loadData();
        renderPanel();
      });
      header.appendChild(delBtn);
    }
    sec.appendChild(header);

    const tagList = document.createElement("div");
    tagList.className = "db-tag-list";

    const groupTags = S.tags.filter((t) => t.groupId === group.id);
    for (const tag of groupTags) {
      tagList.appendChild(buildTagRow(tag, usage.get(tag.id) ?? 0, tagList));
    }
    tagList.appendChild(buildAddTagRow(group.id, tagList, usage));

    sec.appendChild(tagList);
    wrap.appendChild(sec);
  }

  // Add group
  const addGroupRow = document.createElement("div");
  addGroupRow.className = "db-add-group-row";
  const addGroupInput = document.createElement("input");
  addGroupInput.type = "text";
  addGroupInput.className = "db-text-input";
  addGroupInput.placeholder = "New group name…";
  const addGroupBtn = document.createElement("button");
  addGroupBtn.className = "db-btn db-btn--secondary";
  addGroupBtn.textContent = "+ Add Group";
  addGroupBtn.addEventListener("click", async () => {
    const label = addGroupInput.value.trim();
    if (!label) return;
    const id =
      label
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 30) +
      "-" +
      Date.now();
    const maxOrder = Math.max(0, ...S.tagGroups.map((g) => g.order));
    await db.createTagGroup(id, label, maxOrder + 1);
    await loadData();
    renderPanel();
  });
  addGroupRow.appendChild(addGroupInput);
  addGroupRow.appendChild(addGroupBtn);
  wrap.appendChild(addGroupRow);

  return wrap;
}

function buildTagRow(
  tag: Tag,
  usageCount: number,
  tagList: HTMLElement
): HTMLElement {
  const row = document.createElement("div");
  row.className = "db-tag-row";

  if (S.editingTagId === tag.id) {
    // Edit mode
    let selectedColor = tag.color;

    const colorBtn = document.createElement("button");
    colorBtn.className = "db-color-cycle";
    colorBtn.style.background = selectedColor;
    colorBtn.title = "Click to cycle color";
    colorBtn.addEventListener("click", () => {
      const idx = TAG_COLORS.indexOf(selectedColor);
      selectedColor = TAG_COLORS[(idx + 1) % TAG_COLORS.length];
      colorBtn.style.background = selectedColor;
    });

    const emojiIn = document.createElement("input");
    emojiIn.type = "text";
    emojiIn.className = "db-tag-emoji-input";
    emojiIn.value = tag.emoji;
    emojiIn.placeholder = "😀";
    emojiIn.maxLength = 4;

    const labelIn = document.createElement("input");
    labelIn.type = "text";
    labelIn.className = "db-tag-label-input";
    labelIn.value = tag.label;

    const saveBtn = document.createElement("button");
    saveBtn.className = "db-btn db-btn--primary db-btn--sm";
    saveBtn.textContent = "✓";
    saveBtn.addEventListener("click", async () => {
      const newLabel = labelIn.value.trim();
      if (!newLabel) return;
      await db.updateTag(tag.id, {
        label: newLabel,
        emoji: emojiIn.value.trim(),
        color: selectedColor,
      });
      S.editingTagId = null;
      await loadData();
      renderPanel();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "db-btn db-btn--ghost db-btn--sm";
    cancelBtn.textContent = "✕";
    cancelBtn.addEventListener("click", () => {
      S.editingTagId = null;
      renderPanel();
    });

    row.appendChild(colorBtn);
    row.appendChild(emojiIn);
    row.appendChild(labelIn);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);

    // Focus the label input
    requestAnimationFrame(() => labelIn.focus());
  } else {
    // View mode
    const swatch = document.createElement("span");
    swatch.className = "db-tag-swatch";
    swatch.style.background = tag.color;
    swatch.textContent = tag.emoji || "";

    const labelEl = document.createElement("span");
    labelEl.className = "db-tag-row-label";
    labelEl.textContent = tag.label;

    const usageEl = document.createElement("span");
    usageEl.className = "db-tag-usage";
    usageEl.textContent = `×${usageCount}`;

    const isPinned = S.pinnedTags.includes(tag.id);
    const pinBtn = makeIconBtn(
      "📌",
      `db-icon-btn${isPinned ? " db-icon-btn--active" : ""}`
    );
    pinBtn.title = isPinned ? "Unpin" : "Pin to card";
    pinBtn.addEventListener("click", async () => {
      if (isPinned) await db.unpinTag(tag.id);
      else await db.pinTag(tag.id);
      await loadData();
      renderPanel();
    });

    const editBtn = makeIconBtn("✏", "db-icon-btn");
    editBtn.title = "Edit";
    editBtn.addEventListener("click", () => {
      S.editingTagId = tag.id;
      renderPanel();
    });

    const delBtn = makeIconBtn("✕", "db-icon-btn db-icon-btn--danger");
    delBtn.title = `Delete "${tag.label}"`;
    delBtn.addEventListener("click", async () => {
      if (
        !confirm(
          `Delete tag "${tag.label}"? This will remove it from all bookmarks.`
        )
      )
        return;
      await db.deleteTag(tag.id);
      S.filterTags = S.filterTags.filter((id) => id !== tag.id);
      await loadData();
      renderPanel();
      renderGrid();
      renderTagFilterChips();
    });

    row.appendChild(swatch);
    row.appendChild(labelEl);
    row.appendChild(usageEl);
    row.appendChild(pinBtn);
    row.appendChild(editBtn);
    row.appendChild(delBtn);
  }

  return row;
}

function buildAddTagRow(
  groupId: string,
  tagList: HTMLElement,
  usage: Map<string, number>
): HTMLElement {
  const row = document.createElement("div");
  row.className = "db-add-tag-row";

  const emojiIn = document.createElement("input");
  emojiIn.type = "text";
  emojiIn.className = "db-tag-emoji-input";
  emojiIn.placeholder = "😀";
  emojiIn.maxLength = 4;

  const labelIn = document.createElement("input");
  labelIn.type = "text";
  labelIn.className = "db-tag-label-input";
  labelIn.placeholder = "Tag name";

  const addBtn = document.createElement("button");
  addBtn.className = "db-btn db-btn--secondary db-btn--sm";
  addBtn.textContent = "+ Add";

  const doAdd = async () => {
    const label = labelIn.value.trim();
    if (!label) return;
    const id = label
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40);
    if (!id || S.tags.find((t) => t.id === id)) return;
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    const newTag = await db.createTag(
      id,
      label,
      emojiIn.value.trim(),
      color,
      groupId
    );
    S.tags = [...S.tags, newTag];
    emojiIn.value = "";
    labelIn.value = "";
    const newRow = buildTagRow(newTag, 0, tagList);
    tagList.insertBefore(newRow, row);
  };

  addBtn.addEventListener("click", doAdd);
  labelIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAdd();
  });

  row.appendChild(emojiIn);
  row.appendChild(labelIn);
  row.appendChild(addBtn);
  return row;
}

// ── Export / Import panel ─────────────────────────────────

function buildExportContent(): HTMLElement {
  const wrap = document.createElement("div");

  // Export
  const exportSec = makeSection("Export");
  const exportDesc = document.createElement("p");
  exportDesc.className = "db-panel-desc";
  exportDesc.textContent = `${S.bookmarks.length} bookmarks · ${S.tags.length} tags · ${S.tagGroups.length} groups`;
  const exportBtn = document.createElement("button");
  exportBtn.className = "db-btn db-btn--primary db-btn--full";
  exportBtn.textContent = "↓ Download JSON";
  exportBtn.addEventListener("click", handleExport);
  exportSec.appendChild(exportDesc);
  exportSec.appendChild(exportBtn);
  wrap.appendChild(exportSec);

  // Import
  const importSec = makeSection("Import");
  const importDesc = document.createElement("p");
  importDesc.className = "db-panel-desc";
  importDesc.textContent =
    "Select a ClingOn JSON export. Merge keeps existing data; Replace overwrites everything.";

  const modeRow = document.createElement("div");
  modeRow.className = "db-import-mode-row";
  for (const mode of ["merge", "replace"] as const) {
    const lbl = document.createElement("label");
    lbl.className = "db-radio-label";
    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = "import-mode";
    inp.value = mode;
    inp.checked = mode === "merge";
    lbl.appendChild(inp);
    lbl.appendChild(
      document.createTextNode(mode === "merge" ? " Merge" : " Replace all")
    );
    modeRow.appendChild(lbl);
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.className = "db-file-input";
  fileInput.id = "db-import-file";

  const fileLbl = document.createElement("label");
  fileLbl.htmlFor = "db-import-file";
  fileLbl.className = "db-btn db-btn--secondary db-btn--full";
  fileLbl.textContent = "↑ Choose JSON file…";

  const status = document.createElement("p");
  status.className = "db-import-status";

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const modeEl = modeRow.querySelector<HTMLInputElement>(
      "input[name='import-mode']:checked"
    );
    const mode = (modeEl?.value ?? "merge") as "merge" | "replace";
    try {
      status.textContent = "Importing…";
      await handleImport(file, mode);
      status.textContent = "✓ Import complete!";
      await refresh();
    } catch (err) {
      status.textContent = `✕ Error: ${(err as Error).message}`;
    }
    fileInput.value = "";
  });

  importSec.appendChild(importDesc);
  importSec.appendChild(modeRow);
  importSec.appendChild(fileInput);
  importSec.appendChild(fileLbl);
  importSec.appendChild(status);
  wrap.appendChild(importSec);

  return wrap;
}

// ── Edit modal ────────────────────────────────────────────

function openEditModal(bm: Bookmark): void {
  S.editBookmark = {
    id: bm.id,
    title: bm.title,
    notes: bm.notes,
    tags: [...bm.tags],
    type: bm.type,
  };
  renderEditModal();
}

function renderEditModal(): void {
  const overlay = el("db-modal-overlay")!;

  if (!S.editBookmark) {
    overlay.classList.add("hidden");
    return;
  }
  overlay.classList.remove("hidden");

  // Clear and rebuild modal
  overlay.innerHTML = "";
  const modal = document.createElement("div");
  modal.className = "db-modal";
  overlay.appendChild(modal);

  const eb = S.editBookmark;
  const origBm = S.bookmarks.find((b) => b.id === eb.id)!;

  // Header
  const header = document.createElement("div");
  header.className = "db-modal-header";
  const title = document.createElement("h2");
  title.className = "db-modal-title";
  title.textContent = "Edit Bookmark";
  const closeBtn = document.createElement("button");
  closeBtn.className = "db-modal-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeEditModal);
  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "db-modal-body";

  // URL
  body.appendChild(
    makeField("URL", () => {
      const a = document.createElement("a");
      a.className = "db-field-url";
      a.href = origBm.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = origBm.url;
      return a;
    })
  );

  // Title
  body.appendChild(
    makeField("Title", () => {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "db-text-input";
      inp.value = eb.title;
      inp.addEventListener("input", () => { eb.title = inp.value; });
      return inp;
    })
  );

  // Notes
  body.appendChild(
    makeField("Notes", () => {
      const ta = document.createElement("textarea");
      ta.className = "db-textarea";
      ta.rows = 3;
      ta.value = eb.notes;
      ta.addEventListener("input", () => { eb.notes = ta.value; });
      return ta;
    })
  );

  // Type toggle
  body.appendChild(
    makeField(
      "Type",
      () => {
        const btn = document.createElement("button");
        const update = () => {
          btn.textContent = eb.type === "ai-chat" ? "🤖 AI Chat" : "🌐 Site";
          btn.className = `db-type-toggle db-type-toggle--${eb.type === "ai-chat" ? "ai" : "site"}`;
        };
        update();
        btn.addEventListener("click", () => {
          eb.type = eb.type === "ai-chat" ? "site" : "ai-chat";
          update();
        });
        return btn;
      },
      true
    )
  );

  // Tags
  body.appendChild(
    makeField("Tags", () => {
      const tagsWrap = document.createElement("div");
      tagsWrap.className = "db-edit-tags";

      const renderEditTags = () => {
        tagsWrap.innerHTML = "";

        for (const tid of eb.tags) {
          const tag = tagById(tid);
          if (!tag) continue;
          const chip = document.createElement("span");
          chip.className = "db-active-chip";
          chip.style.setProperty("--chip-color", tag.color);
          const lbl = document.createElement("span");
          lbl.textContent = tag.emoji ? `${tag.emoji} ${tag.label}` : tag.label;
          const rm = document.createElement("button");
          rm.className = "db-active-chip-remove";
          rm.textContent = "×";
          rm.addEventListener("click", () => {
            eb.tags = eb.tags.filter((id) => id !== tid);
            renderEditTags();
          });
          chip.appendChild(lbl);
          chip.appendChild(rm);
          tagsWrap.appendChild(chip);
        }

        // Inline tag picker
        const addWrap = document.createElement("div");
        addWrap.className = "db-add-tag-wrap";
        const searchIn = document.createElement("input");
        searchIn.type = "text";
        searchIn.className = "db-tag-search-input";
        searchIn.placeholder = "+ add tag…";

        const dropdown = document.createElement("div");
        dropdown.className = "db-tag-picker-dropdown";

        const updateDropdown = () => {
          dropdown.innerHTML = "";
          const q = searchIn.value.toLowerCase();
          const matches = S.tags
            .filter((t) => !eb.tags.includes(t.id))
            .filter(
              (t) =>
                !q ||
                t.label.toLowerCase().includes(q) ||
                t.emoji.toLowerCase().includes(q)
            )
            .slice(0, 8);

          for (const tag of matches) {
            const opt = document.createElement("button");
            opt.className = "db-tag-picker-opt";
            opt.textContent = `${tag.emoji ? tag.emoji + " " : ""}${tag.label}`;
            opt.style.setProperty("--opt-color", tag.color);
            opt.addEventListener("mousedown", (e) => {
              e.preventDefault();
              eb.tags = [...eb.tags, tag.id];
              searchIn.value = "";
              dropdown.classList.remove("open");
              renderEditTags();
            });
            dropdown.appendChild(opt);
          }

          // Create option
          const q2 = searchIn.value.trim();
          if (q2 && !S.tags.find((t) => t.label.toLowerCase() === q2.toLowerCase())) {
            const createOpt = document.createElement("button");
            createOpt.className = "db-tag-picker-opt db-tag-picker-opt--create";
            createOpt.textContent = `+ Create "${q2}"`;
            createOpt.addEventListener("mousedown", async (e) => {
              e.preventDefault();
              const id = q2
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "")
                .slice(0, 40);
              if (!id) return;
              const color =
                TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
              await db.createTag(id, q2, "", color, "uncategorized");
              await loadData();
              eb.tags = [...eb.tags, id];
              searchIn.value = "";
              dropdown.classList.remove("open");
              renderEditTags();
            });
            dropdown.appendChild(createOpt);
          }

          dropdown.classList.toggle("open", dropdown.children.length > 0);
        };

        searchIn.addEventListener("input", updateDropdown);
        searchIn.addEventListener("focus", updateDropdown);
        searchIn.addEventListener("blur", () => {
          setTimeout(() => dropdown.classList.remove("open"), 150);
        });

        addWrap.appendChild(searchIn);
        addWrap.appendChild(dropdown);
        tagsWrap.appendChild(addWrap);
      };

      renderEditTags();
      return tagsWrap;
    })
  );

  modal.appendChild(body);

  // Footer
  const footer = document.createElement("div");
  footer.className = "db-modal-footer";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "db-btn db-btn--ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeEditModal);
  const saveBtn = document.createElement("button");
  saveBtn.className = "db-btn db-btn--primary";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", async () => {
    await db.updateBookmark(eb.id, {
      title: eb.title,
      notes: eb.notes,
      tags: eb.tags,
      type: eb.type,
    });
    closeEditModal();
    await refresh();
  });
  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  modal.appendChild(footer);
}

function closeEditModal(): void {
  S.editBookmark = null;
  const overlay = el("db-modal-overlay")!;
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
}

// ── Export / Import handlers ──────────────────────────────

async function handleExport(): Promise<void> {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clingon-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleImport(
  file: File,
  mode: "merge" | "replace"
): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as ExportData;
  if (!data.version || !Array.isArray(data.bookmarks)) {
    throw new Error("Invalid ClingOn export file");
  }
  await db.importAll(data, mode);
}

// ── DOM helpers ───────────────────────────────────────────

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Keyboard shortcut recorder ───────────────────────────

function buildKeyString(e: KeyboardEvent): string {
  if (["Control", "Alt", "Meta", "Shift"].includes(e.key)) return "";
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("meta");
  if (e.shiftKey) parts.push("shift");
  parts.push(e.key.toLowerCase());
  return parts.join("+");
}

function formatKey(key: string): string {
  return key
    .split("+")
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join("+");
}

function buildShortcutRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "db-shortcut-row";

  let pendingKey: string | null = null;
  let keyListener: ((e: KeyboardEvent) => void) | null = null;

  const display = document.createElement("span");
  display.className = "db-shortcut-display";

  const recordBtn = document.createElement("button");
  recordBtn.className = "db-btn db-btn--secondary db-btn--sm";

  const clearBtn = document.createElement("button");
  clearBtn.className = "db-btn db-btn--ghost db-btn--sm";
  clearBtn.textContent = "Clear";

  const saveBtn = document.createElement("button");
  saveBtn.className = "db-btn db-btn--primary db-btn--sm";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "db-btn db-btn--ghost db-btn--sm";
  cancelBtn.textContent = "Cancel";

  function refresh() {
    const key = S.settings.cardToggleKey;
    display.textContent = key ? formatKey(key) : "Not set";
    display.className = `db-shortcut-display${key ? "" : " db-shortcut-display--empty"}`;
    recordBtn.textContent = key ? "Change" : "Set shortcut";
    row.classList.remove("db-shortcut-row--recording");
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";
    recordBtn.style.display = "";
    clearBtn.style.display = key ? "" : "none";
  }

  function startRecording() {
    pendingKey = null;
    display.textContent = "Press any key combo…";
    display.className = "db-shortcut-display db-shortcut-display--recording";
    row.classList.add("db-shortcut-row--recording");
    recordBtn.style.display = "none";
    clearBtn.style.display = "none";
    saveBtn.style.display = "";
    saveBtn.disabled = true;
    cancelBtn.style.display = "";

    keyListener = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const key = buildKeyString(e);
      if (!key) return; // modifier-only press
      pendingKey = key;
      display.textContent = formatKey(key);
      saveBtn.disabled = false;
    };
    window.addEventListener("keydown", keyListener, true);
  }

  function stopRecording() {
    if (keyListener) {
      window.removeEventListener("keydown", keyListener, true);
      keyListener = null;
    }
    refresh();
  }

  recordBtn.addEventListener("click", startRecording);
  cancelBtn.addEventListener("click", () => { pendingKey = null; stopRecording(); });

  saveBtn.addEventListener("click", async () => {
    if (!pendingKey) return;
    S.settings = await db.updateSettings({ cardToggleKey: pendingKey });
    chrome.runtime.sendMessage({
      type: "BROADCAST_TO_TABS",
      payload: { type: "SHORTCUT_UPDATED", key: pendingKey },
    });
    pendingKey = null;
    stopRecording();
  });

  clearBtn.addEventListener("click", async () => {
    S.settings = await db.updateSettings({ cardToggleKey: null });
    chrome.runtime.sendMessage({
      type: "BROADCAST_TO_TABS",
      payload: { type: "SHORTCUT_UPDATED", key: null },
    });
    refresh();
  });

  refresh();

  row.appendChild(display);
  row.appendChild(recordBtn);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  row.appendChild(clearBtn);
  return row;
}

function makeSection(title: string): HTMLElement {
  const sec = document.createElement("div");
  sec.className = "db-settings-section";
  const h = document.createElement("h3");
  h.className = "db-settings-heading";
  h.textContent = title;
  sec.appendChild(h);
  return sec;
}

function makeToggleRow(
  label: string,
  desc: string,
  checked: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "db-toggle-row";
  const text = document.createElement("div");
  text.className = "db-toggle-text";
  const lbl = document.createElement("span");
  lbl.className = "db-toggle-label";
  lbl.textContent = label;
  const dsc = document.createElement("span");
  dsc.className = "db-toggle-desc";
  dsc.textContent = desc;
  text.appendChild(lbl);
  text.appendChild(dsc);
  const toggle = document.createElement("label");
  toggle.className = "db-toggle";
  const inp = document.createElement("input");
  inp.type = "checkbox";
  inp.checked = checked;
  inp.addEventListener("change", () => onChange(inp.checked));
  const slider = document.createElement("span");
  slider.className = "db-toggle-slider";
  toggle.appendChild(inp);
  toggle.appendChild(slider);
  row.appendChild(text);
  row.appendChild(toggle);
  return row;
}

function makeLinkBtn(
  label: string,
  arrow: string,
  onClick: () => void
): HTMLElement {
  const btn = document.createElement("button");
  btn.className = "db-link-btn";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  const arr = document.createElement("span");
  arr.className = "db-link-btn-arrow";
  arr.textContent = arrow;
  btn.appendChild(lbl);
  btn.appendChild(arr);
  btn.addEventListener("click", onClick);
  return btn;
}

function makeIconBtn(text: string, cls: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = cls;
  btn.textContent = text;
  return btn;
}

function makeField(
  label: string,
  buildContent: () => HTMLElement,
  row = false
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `db-field${row ? " db-field--row" : ""}`;
  const lbl = document.createElement("label");
  lbl.className = "db-field-label";
  lbl.textContent = label;
  wrap.appendChild(lbl);
  wrap.appendChild(buildContent());
  return wrap;
}

// ── Shell ─────────────────────────────────────────────────

function buildShell(): void {
  const app = el("app")!;
  app.innerHTML = `
    <header class="db-topbar">
      <span class="db-logo">🏷 ClingOn</span>
      <input id="db-search" class="db-global-search" type="text"
        placeholder="Search bookmarks…" autocomplete="off" spellcheck="false" />
      <button id="db-settings-btn" class="db-settings-btn" title="Settings" aria-label="Settings">⚙</button>
    </header>

    <div class="db-filterbar">
      <div class="db-type-tabs">
        <button class="db-tab db-tab--active" data-type-tab="all">All</button>
        <button class="db-tab" data-type-tab="ai-chat">AI Chats</button>
        <button class="db-tab" data-type-tab="site">Sites</button>
      </div>
      <div class="db-sort">
        <label class="db-sort-label" for="db-sort-select">Sort:</label>
        <select id="db-sort-select" class="db-sort-select">
          <option value="createdAt:desc">Recent</option>
          <option value="createdAt:asc">Oldest</option>
          <option value="title:asc">Title A–Z</option>
          <option value="domain:asc">Domain</option>
        </select>
      </div>
      <div class="db-view-toggle" id="db-view-toggle">
        <button class="db-view-btn db-view-btn--active" data-view="grid" title="Card view">⊞</button>
        <button class="db-view-btn" data-view="table" title="Table view">☰</button>
      </div>
    </div>

    <div class="db-tagfilterbar">
      <span class="db-tagfilter-label">Filter by tags:</span>
      <div id="db-filter-chips" class="db-filter-chips"></div>
      <div class="db-add-filter-wrap">
        <button id="db-add-filter-btn" class="db-add-filter-btn">+ add filter</button>
        <div id="db-filter-tag-picker" class="db-tag-picker">
          <input id="db-filter-tag-input" type="text" class="db-tag-picker-input" placeholder="Search tags…" />
          <div id="db-filter-tag-list" class="db-tag-picker-list"></div>
        </div>
      </div>
      <div class="db-tagmode">
        <label class="db-radio-label">
          <input type="radio" name="db-tagmode" value="AND" checked /> AND
        </label>
        <label class="db-radio-label">
          <input type="radio" name="db-tagmode" value="OR" /> OR
        </label>
      </div>
      <span id="db-count" class="db-count"></span>
    </div>

    <main class="db-content">
      <div id="db-grid" class="db-grid"></div>
      <div id="db-empty" class="db-empty hidden">
        <span class="db-empty-icon">🏷</span>
        <span>No bookmarks yet.</span>
        <span class="db-empty-sub">Browse any page and click the ClingOn pill to add tags.</span>
      </div>
    </main>

    <aside id="db-panel" class="db-panel" aria-label="Panel">
      <div class="db-panel-header">
        <button id="db-panel-back" class="db-panel-back hidden" aria-label="Back">← Back</button>
        <h2 id="db-panel-title" class="db-panel-title">Settings</h2>
        <button id="db-panel-close" class="db-panel-close" aria-label="Close">✕</button>
      </div>
      <div id="db-panel-body" class="db-panel-body"></div>
    </aside>

    <div id="db-modal-overlay" class="db-modal-overlay hidden"></div>
  `;
}

// ── Event wiring ──────────────────────────────────────────

function wireEvents(): void {
  // Global search
  el("db-search")!.addEventListener("input", (e) => {
    S.searchText = (e.target as HTMLInputElement).value;
    renderGrid();
  });

  // Content type tabs
  document
    .querySelectorAll<HTMLButtonElement>("[data-type-tab]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        S.contentType = btn.dataset.typeTab as "all" | ContentType;
        updateContentTypeTabs();
        renderGrid();
      });
    });

  // Sort
  el("db-sort-select")!.addEventListener("change", (e) => {
    const [field, order] = (e.target as HTMLSelectElement).value.split(":");
    S.sortField = field as SortField;
    S.sortOrder = order as SortOrder;
    renderGrid();
  });

  // Tag mode
  document
    .querySelectorAll<HTMLInputElement>('[name="db-tagmode"]')
    .forEach((r) => {
      r.addEventListener("change", () => {
        if (r.checked) {
          S.tagMode = r.value as TagMode;
          renderGrid();
        }
      });
    });

  // Add filter button / picker
  el("db-add-filter-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    const picker = el("db-filter-tag-picker")!;
    const isOpen = picker.classList.contains("open");
    picker.classList.toggle("open", !isOpen);
    if (!isOpen) {
      (el("db-filter-tag-input") as HTMLInputElement).focus();
      renderTagPicker();
    }
  });

  el("db-filter-tag-input")!.addEventListener("input", renderTagPicker);
  el("db-filter-tag-input")!.addEventListener("blur", () => {
    setTimeout(() => el("db-filter-tag-picker")!.classList.remove("open"), 150);
  });

  // View toggle
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      S.viewMode = btn.dataset.view as "grid" | "table";
      localStorage.setItem("db-view-mode", S.viewMode);
      document.querySelectorAll("[data-view]").forEach((b) =>
        b.classList.toggle("db-view-btn--active", b === btn)
      );
      renderGrid();
    });
  });

  // Settings button
  el("db-settings-btn")!.addEventListener("click", () => {
    S.panel = S.panel === "none" ? "settings" : "none";
    renderPanel();
  });

  // Panel close
  el("db-panel-close")!.addEventListener("click", () => {
    S.panel = "none";
    renderPanel();
  });

  // Panel back
  el("db-panel-back")!.addEventListener("click", () => {
    S.panel = "settings";
    S.editingTagId = null;
    renderPanel();
  });

  // Click outside panel to close.
  // Use composedPath() instead of e.target so that clicks on buttons that
  // trigger renderPanel() (which does body.innerHTML = "" and detaches the
  // button from the DOM before the event bubbles here) are still recognised
  // as "inside the panel" and don't immediately close it again.
  document.addEventListener("click", (e) => {
    const panel = el("db-panel")!;
    const settingsBtn = el("db-settings-btn")!;
    const path = e.composedPath();
    if (
      S.panel !== "none" &&
      !path.includes(panel) &&
      !path.includes(settingsBtn)
    ) {
      S.panel = "none";
      renderPanel();
    }
  });

  // Modal overlay click to close
  el("db-modal-overlay")!.addEventListener("click", (e) => {
    if (e.target === el("db-modal-overlay")) closeEditModal();
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (S.editBookmark) {
        closeEditModal();
      } else if (S.panel !== "none") {
        S.panel = "none";
        renderPanel();
      }
    }
  });
}

// ── Init ─────────────────────────────────────────────────

async function init(): Promise<void> {
  buildShell();
  wireEvents();
  updateSortSelect();
  updateTagModeRadios();

  // Restore persisted view mode before first render
  const savedView = localStorage.getItem("db-view-mode");
  if (savedView === "table" || savedView === "grid") {
    S.viewMode = savedView;
    document.querySelectorAll<HTMLElement>("[data-view]").forEach((b) =>
      b.classList.toggle("db-view-btn--active", b.dataset.view === savedView)
    );
  }

  await loadData();
  renderGrid();
  renderTagFilterChips();
  updateContentTypeTabs();
}

init().catch(console.error);
