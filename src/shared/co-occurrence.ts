/**
 * Pure functions over CoOccurrenceMap — no DB access.
 * The DB layer (db.ts) handles persistence; this module handles computation.
 */
import type { CoOccurrenceMap, Bookmark } from "./types";

/**
 * Returns tag IDs that co-occur most frequently with the given active tags,
 * excluding tags already active and tags that no longer exist.
 */
export function getRelated(
  map: CoOccurrenceMap,
  activeTagIds: string[],
  allTagIds: Set<string>,
  limit: number = 6
): string[] {
  if (activeTagIds.length === 0) return [];

  const scores: Record<string, number> = {};

  for (const tagId of activeTagIds) {
    const related = map[tagId] ?? {};
    for (const [relatedId, score] of Object.entries(related)) {
      if (activeTagIds.includes(relatedId)) continue; // already active
      if (!allTagIds.has(relatedId)) continue; // tag was deleted
      scores[relatedId] = (scores[relatedId] ?? 0) + score;
    }
  }

  return Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * Returns tag combos (pairs or triples) where every pairwise co-occurrence
 * score is >= minScore, sorted by minimum pairwise score descending.
 *
 * A combo chip lets the user apply multiple tags at once.
 */
export function getCombos(
  map: CoOccurrenceMap,
  allTagIds: Set<string>,
  minScore: number = 3,
  maxResults: number = 5
): string[][] {
  // Collect qualifying pairs (deduplicated)
  const seen = new Set<string>();
  const pairs: { tags: [string, string]; score: number }[] = [];

  for (const [tagA, related] of Object.entries(map)) {
    if (!allTagIds.has(tagA)) continue;
    for (const [tagB, score] of Object.entries(related)) {
      if (!allTagIds.has(tagB)) continue;
      const key = [tagA, tagB].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      if (score >= minScore) {
        pairs.push({ tags: [tagA, tagB].sort() as [string, string], score });
      }
    }
  }

  // Try to grow pairs into triples
  const triples: { tags: string[]; score: number }[] = [];
  for (const { tags: [a, b], score: abScore } of pairs) {
    for (const c of Object.keys(map)) {
      if (c === a || c === b) continue;
      if (!allTagIds.has(c)) continue;
      const ac = map[a]?.[c] ?? 0;
      const bc = map[b]?.[c] ?? 0;
      if (ac >= minScore && bc >= minScore) {
        const tripleKey = [a, b, c].sort().join("|");
        if (!seen.has(tripleKey)) {
          seen.add(tripleKey);
          triples.push({
            tags: [a, b, c].sort(),
            score: Math.min(abScore, ac, bc),
          });
        }
      }
    }
  }

  // Merge: prefer triples, skip pairs that are subsets of a triple
  const tripleTagSets = triples.map((t) => new Set(t.tags));
  const nonSubsetPairs = pairs.filter(
    ({ tags }) => !tripleTagSets.some((s) => tags.every((t) => s.has(t)))
  );

  return [...triples, ...nonSubsetPairs]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((c) => c.tags);
}

/**
 * Returns top N tag IDs by frequency of use across all bookmarks.
 * Used to populate the "Top" section in the quick tag card.
 */
export function getTopTagsByUsage(
  bookmarks: Bookmark[],
  allTagIds: Set<string>,
  limit: number = 8
): string[] {
  const counts: Record<string, number> = {};

  for (const bm of bookmarks) {
    for (const tagId of bm.tags) {
      if (!allTagIds.has(tagId)) continue;
      counts[tagId] = (counts[tagId] ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => id);
}
