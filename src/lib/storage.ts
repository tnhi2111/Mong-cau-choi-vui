/** Tiny, crash-proof wrapper around localStorage (private mode can throw). */

const KEY = 'love-story:v1';

export interface SavedProgress {
  unlocked: boolean;
  opened: string[];
  finaleSeen: boolean;
}

const empty: SavedProgress = { unlocked: false, opened: [], finaleSeen: false };

export function loadProgress(): SavedProgress {
  try {
    if (new URLSearchParams(location.search).has('reset')) {
      localStorage.removeItem(KEY);
      return { ...empty };
    }
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Partial<SavedProgress>;
    return {
      unlocked: !!parsed.unlocked,
      opened: Array.isArray(parsed.opened) ? parsed.opened.filter((x) => typeof x === 'string') : [],
      finaleSeen: !!parsed.finaleSeen,
    };
  } catch {
    return { ...empty };
  }
}

export function saveProgress(p: SavedProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable — progress simply won't persist */
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
