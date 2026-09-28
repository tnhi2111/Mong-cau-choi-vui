/**
 * Progress for *this visit only*.
 *
 * Stored in sessionStorage, so a reload (or a redeploy mid-visit) keeps her place,
 * but closing the tab — or removing it and scanning the QR again — always starts
 * the story from the very beginning. As an extra guard (some mobile browsers
 * restore closed tabs with their session), progress older than SESSION_TTL is ignored.
 * Every access is wrapped: private modes can throw.
 */

const KEY = 'love-story:v2';
const SESSION_TTL = 30 * 60 * 1000;

export interface SavedProgress {
  unlocked: boolean;
  opened: string[];
  finaleSeen: boolean;
}

const empty: SavedProgress = { unlocked: false, opened: [], finaleSeen: false };

function forgetOldProgress() {
  try {
    // earlier versions kept progress forever in localStorage
    localStorage.removeItem('love-story:v1');
  } catch {
    /* ignore */
  }
}

export function loadProgress(): SavedProgress {
  forgetOldProgress();
  try {
    if (new URLSearchParams(location.search).has('reset')) {
      sessionStorage.removeItem(KEY);
      return { ...empty };
    }
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Partial<SavedProgress> & { at?: number };
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > SESSION_TTL) {
      sessionStorage.removeItem(KEY);
      return { ...empty };
    }
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
    sessionStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    /* storage unavailable — progress simply won't persist */
  }
}

export function clearProgress(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
