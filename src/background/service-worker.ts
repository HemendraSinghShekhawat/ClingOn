import { migrateIfNeeded } from "../shared/migrate";
import { findMatchingPatterns } from "../shared/url-patterns";
import * as db from "../shared/db";

// Run migration on install/update
chrome.runtime.onInstalled.addListener(async () => {
  await migrateIfNeeded();
});

// Extension icon click → open dashboard
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_INFO") {
    (async () => {
      const bookmark = await db.getBookmarkByUrl(message.url);
      sendResponse({ bookmark });
    })();
    return true;
  }

  if (message.type === "CHECK_URL_PATTERNS") {
    (async () => {
      const patterns = await db.getAllPatterns();
      const matches = findMatchingPatterns(message.url, patterns);
      sendResponse({ matches });
    })();
    return true;
  }

  if (message.type === "AUTO_TAG") {
    (async () => {
      for (const tagId of message.tagIds as string[]) {
        await db.toggleTagOnBookmark(message.url, message.title, tagId);
      }
      const bookmark = await db.getBookmarkByUrl(message.url);
      sendResponse({ bookmark });
    })();
    return true;
  }

  if (message.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    return false;
  }

  // ── Content script DB proxy ──────────────────────────────────────────────
  // Content scripts run in the page's origin, so their IndexedDB is isolated
  // per site. All reads/writes are routed here so they use the single shared
  // IndexedDB that lives in the extension's origin.

  if (message.type === "LOAD_CARD_DATA") {
    (async () => {
      const [tags, tagGroups, bookmarks, coOccurrence, pinnedTags, settings, bookmark] =
        await Promise.all([
          db.getAllTags(),
          db.getAllTagGroups(),
          db.getAllBookmarks(),
          db.getCoOccurrence(),
          db.getPinnedTags(),
          db.getSettings(),
          db.getBookmarkByUrl(message.url),
        ]);
      sendResponse({ tags, tagGroups, bookmarks, coOccurrence, pinnedTags, settings, bookmark });
    })();
    return true;
  }

  if (message.type === "TOGGLE_TAG") {
    (async () => {
      const bookmark = await db.toggleTagOnBookmark(
        message.url,
        message.title,
        message.tagId,
        message.contentType
      );
      const coOccurrence = await db.getCoOccurrence();
      sendResponse({ bookmark, coOccurrence });
    })();
    return true;
  }

  if (message.type === "CREATE_TAG") {
    (async () => {
      const tag = await db.createTag(
        message.id,
        message.label,
        message.emoji,
        message.color,
        message.group
      );
      sendResponse({ tag });
    })();
    return true;
  }

  if (message.type === "UPDATE_BOOKMARK") {
    (async () => {
      const bookmark = await db.updateBookmark(message.id, message.patch);
      sendResponse({ bookmark });
    })();
    return true;
  }

  if (message.type === "SAVE_BOOKMARK") {
    (async () => {
      const bookmark = await db.saveBookmark(
        message.url,
        message.title,
        message.tags,
        message.notes,
        message.contentType
      );
      sendResponse({ bookmark });
    })();
    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    (async () => {
      await db.updateSettings(message.patch);
      sendResponse({});
    })();
    return true;
  }

  if (message.type === "CONTENT_INIT") {
    (async () => {
      const [settings, patterns, bookmark] = await Promise.all([
        db.getSettings(),
        db.getAllPatterns(),
        db.getBookmarkByUrl(message.url),
      ]);
      sendResponse({ settings, patterns, bookmark });
    })();
    return true;
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidebar") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_SIDEBAR" });
      }
    });
  }
});
