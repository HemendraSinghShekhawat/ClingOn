import { createCard, setPillPromptState } from "./card";
import { extractDomain } from "../shared/db";
import { findMatchingPatterns } from "../shared/url-patterns";
import type { Bookmark, Settings, UrlPattern } from "../shared/types";

// ── Bootstrap ────────────────────────────────────────────

const host = document.createElement("div");
host.id = "clingon-root";
document.body.appendChild(host);
createCard(host);

// ── Active prompting + auto-tagging ─────────────────────

(async () => {
  try {
    // Fetch settings, patterns, and current bookmark from the service worker
    // (which has access to the shared extension-origin IndexedDB).
    const { settings, patterns, bookmark } = await new Promise<{
      settings: Settings;
      patterns: UrlPattern[];
      bookmark: Bookmark | null;
    }>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "CONTENT_INIT", url: window.location.href },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    const domain = extractDomain(window.location.href);
    const isAiChat = settings.aiProviders.includes(domain);
    const shouldPrompt = isAiChat
      ? settings.activePromptingAI
      : settings.activePromptingSites;

    // Auto-tag patterns with promptUser: false (fire-and-forget via SW)
    const silentPatterns = findMatchingPatterns(window.location.href, patterns).filter(
      (p) => !p.promptUser && p.autoTags.length > 0
    );
    if (silentPatterns.length > 0) {
      const tagIds = [...new Set(silentPatterns.flatMap((p) => p.autoTags))];
      chrome.runtime.sendMessage({
        type: "AUTO_TAG",
        url: window.location.href,
        title: document.title || window.location.href,
        tagIds,
      });
    }

    // Active prompting: pulse pill for untagged pages
    const isUntagged = !bookmark || bookmark.tags.length === 0;
    const hasMatchingPattern = findMatchingPatterns(
      window.location.href,
      patterns
    ).some((p) => p.promptUser);

    if (shouldPrompt && isUntagged && (isAiChat || hasMatchingPattern)) {
      // Session-level dedup: only prompt once per URL per browser session
      const sessionKey = `co_prompted_${window.location.href}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "1");
        setPillPromptState(true);
      }
    }
  } catch {
    // Silently fail — prompting is optional enhancement
  }
})();
