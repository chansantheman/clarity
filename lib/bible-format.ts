const SCRIPTURE_WPM = 130;

/** User-facing duration estimate for scripture chapters, matching the product
 * spec's calm-narration pace and preserving short chapters as seconds. */
export function formatChapterDuration(words: number): string {
  const seconds = (words / SCRIPTURE_WPM) * 60;
  if (seconds < 60) return `~${Math.max(15, Math.round(seconds / 15) * 15)} sec`;
  return `~${Math.round(seconds / 60)} min`;
}

export function formatReadCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function formatRelativeRead(at: number | null, now = Date.now()): string {
  if (at == null) return 'Not started';
  const days = Math.max(0, Math.floor((now - at) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
