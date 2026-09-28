import { birthdayConfig } from '../config/birthday';

/** Replaces {name} and {sender} in any configured text. */
export function fill(text: string): string {
  return text
    .replaceAll('{name}', birthdayConfig.recipientName)
    .replaceAll('{sender}', birthdayConfig.senderName);
}

/** Whole days since the configured start date (null when not set / invalid). */
export function daysTogether(since: string, now = new Date()): number | null {
  if (!since) return null;
  const start = new Date(`${since}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
}

export function assetUrl(path: string): string {
  // Paths in the config are relative to /public; BASE_URL keeps them working in sub-folders.
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
