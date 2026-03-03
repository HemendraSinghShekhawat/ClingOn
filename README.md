# ClingOn

A tag-based bookmark manager Chrome extension for organizing AI/LLM chat conversations and web pages. Built as a Manifest V3 extension with TypeScript and Vite.

## Features

- **Inline Pill & Card UI** — A floating pill badge injected on every page via Shadow DOM. Click to open a card overlay for tagging the current page with search, suggestions, and quick-access pinned tags.
- **Tag Intelligence** — Co-occurrence tracking suggests related tags, offers multi-tag combos, and surfaces your most-used tags automatically.
- **Active Prompting & Auto-Tagging** — Detects AI chat sites (Claude, ChatGPT, Gemini, DeepSeek, Perplexity) and prompts you to tag conversations. URL patterns can silently auto-tag matching pages.
- **Dashboard** — Full-page app for browsing, filtering (AND/OR tag modes), sorting, and managing all bookmarks. Supports grid and table views.
- **Tag Management** — Create tags with emoji and color, organize into groups (Topics, Type, Status), pin favorites.
- **Import / Export** — Full JSON export of all data (bookmarks, tags, settings, co-occurrence maps). Import with merge or replace modes.
- **Keyboard Shortcut** — `Alt+N` toggles the sidebar. Keyboard isolation prevents Vimium/Surfingkeys from stealing keystrokes in the search input.
- **Cross-Tab Sync** — All DB operations route through the service worker so every tab shares one IndexedDB instance.
- **Migration Support** — Automatically migrates data from v1/v2 (chrome.storage) to the v3 IndexedDB schema.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict mode, ES2020 target) |
| Build | Vite 7 |
| Tests | Vitest 3 + fake-indexeddb |
| Storage | IndexedDB via `idb` |
| Extension | Chrome Manifest V3 |
| UI | Shadow DOM (content script), vanilla HTML/CSS (dashboard) |

## Project Structure

```
ClingOn/
├── src/
│   ├── shared/              # Core logic & data layer
│   │   ├── db.ts            # IndexedDB wrapper, CRUD, export/import
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── constants.ts     # Default tags, colors, AI providers
│   │   ├── query-engine.ts  # Filtering & sorting
│   │   ├── co-occurrence.ts # Tag intelligence & recommendations
│   │   ├── url-patterns.ts  # URL pattern matching (glob/regex/substring)
│   │   ├── migrate.ts       # V1/V2 → V3 migration
│   │   └── __tests__/       # Unit tests (98 passing)
│   ├── content/             # Content script injected into pages
│   │   ├── content.ts       # Bootstrap, active prompting, auto-tagging
│   │   ├── card.ts          # Shadow DOM pill & card UI
│   │   └── card.css
│   ├── background/
│   │   └── service-worker.ts # Message routing & shared DB proxy
│   ├── dashboard/
│   │   ├── dashboard.ts     # Full-page dashboard app
│   │   ├── dashboard.html
│   │   └── dashboard.css
│   └── manifest.json
├── icons/                   # Extension icons (16–128px)
├── dist/                    # ⬅ Built extension output (load this in Chrome)
├── vite.config.ts
├── vitest.config.ts
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

This outputs the final extension into the **`dist/`** folder.

### Development (watch mode)

```bash
npm run dev
```

Rebuilds on file changes. Reload the extension in Chrome after each rebuild.

### Load the Extension in Chrome

1. Run `npm run build` (or `npm run dev`)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the **`dist/`** folder

> **Important:** The `dist/` directory is where the fully built extension lives. Always point Chrome at `dist/`, not the project root.

### Clean

```bash
npm run clean
```

## Tests

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

98 tests covering the database layer, co-occurrence engine, query engine, and URL pattern matching. Tests use `fake-indexeddb` to mock browser IndexedDB in Node.

## Architecture

```
┌─────────────┐    chrome.runtime     ┌──────────────────┐
│ Content     │ ────────────────────► │ Service Worker   │
│ Script      │   sendMessage         │ (background)     │
│ (per tab)   │ ◄──────────────────── │                  │
│             │     response          │  ┌─────────────┐ │
│ Shadow DOM  │                       │  │  IndexedDB  │ │
│ pill + card │                       │  │  (extension │ │
└─────────────┘                       │  │   origin)   │ │
                                      │  └─────────────┘ │
┌─────────────┐                       └──────────────────┘
│ Dashboard   │  direct DB access
│ (extension  │  (same origin)
│  page)      │
└─────────────┘
```

Content scripts run in the page's origin and can't share IndexedDB across sites. All DB operations from content scripts are routed through the service worker via `chrome.runtime.sendMessage`, which accesses the single extension-origin IndexedDB. The dashboard page runs in the extension's origin and can access the DB directly.

## Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Read the current page URL for tagging |
| `storage` | Legacy data migration from chrome.storage |
| `tabs` | Open dashboard, query active tabs |

## License

MIT
