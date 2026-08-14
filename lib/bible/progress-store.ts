import type { KvBackend } from '../history-store';
import { KEY } from '../history-schema';
import type { BibleRef } from './ref';
import { chapterKey, parseChapterKey, parseChapterProgress, withFurthest, withVerseRead, type ChapterProgress } from './progress-schema';
import type { TranslationCode } from './canon';

export type BibleProgressStoreDeps = {
  kv: KvBackend;
  verseCountOf: (ref: BibleRef) => number;
  now?: () => number;
  onWarn?: (message: string, detail?: unknown) => void;
  scheduleDeferred?: (fn: () => void) => void;
};

const MAX_QUARANTINE = 50;

export function createBibleProgressStore(deps: BibleProgressStoreDeps) {
  const { kv, verseCountOf } = deps;
  const now = deps.now ?? (() => Date.now());
  const warn = deps.onWarn ?? (() => {});
  const scheduleDeferred = deps.scheduleDeferred ?? ((fn) => setTimeout(fn, 0));

  let progressMap: ReadonlyMap<string, ChapterProgress> | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function quarantine(key: string, raw: string, reason: string) {
    const at = now();
    const qKey = `${KEY.quarantine}${at.toString().padStart(16, '0')}/${key.slice(-24)}`;
    const payload = JSON.stringify({ at, key, reason, raw: raw.slice(0, 4096) });
    try {
      kv.set(qKey, payload);
      if (kv.getString(qKey) !== payload) throw new Error('quarantine verify failed');
      kv.remove(key);
    } catch (error) {
      warn(`[bible-progress] could not quarantine ${key}, leaving it in place`, error);
      return;
    }
    const keys = kv.getAllKeys().filter((k) => k.startsWith(KEY.quarantine)).sort();
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_QUARANTINE))) {
      kv.remove(stale);
    }
  }

  function hydrate(): ReadonlyMap<string, ChapterProgress> {
    if (progressMap) return progressMap;
    const map = new Map<string, ChapterProgress>();
    const deferred: (() => void)[] = [];

    for (const key of kv.getAllKeys().sort()) {
      if (!key.startsWith(KEY.bibleChapter)) continue;
      const raw = kv.getString(key);
      if (raw == null) continue;

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        deferred.push(() => quarantine(key, raw, 'invalid-json'));
        continue;
      }

      const ref = parseChapterKey(key);
      if (!ref) {
        deferred.push(() => quarantine(key, raw, 'invalid-key'));
        continue;
      }

      const maxVerses = verseCountOf(ref);
      const parsed = parseChapterProgress(json, maxVerses);
      
      if (!parsed.ok) {
        deferred.push(() => quarantine(key, raw, parsed.reason));
        continue;
      }

      const progress = parsed.value;
      map.set(key, progress);

      if (!parsed.readOnly && parsed.upgraded) {
        deferred.push(() => {
          if (writeProgress(key, progress)) {
            // Already written
          }
        });
      }
    }

    progressMap = map;

    if (deferred.length > 0) {
      scheduleDeferred(() => {
        for (const task of deferred) {
          try {
            task();
          } catch (error) {
            warn('[bible-progress] deferred repair failed', error);
          }
        }
        notify();
      });
    }

    return progressMap;
  }

  function writeProgress(key: string, p: ChapterProgress): boolean {
    const json = JSON.stringify(p);
    try {
      kv.set(key, json);
      if (kv.getString(key) !== json) throw new Error('verify mismatch');
      return true;
    } catch (error) {
      warn(`[bible-progress] failed to persist ${key}`, error);
      try {
        kv.remove(key);
      } catch {
        // ignore
      }
      return false;
    }
  }

  function update(ref: BibleRef, updater: (p: ChapterProgress) => ChapterProgress): boolean {
    hydrate();
    const key = chapterKey(ref);
    const existing = progressMap!.get(key);
    const current = existing ?? { v: 1, f: 0, r: '' };
    const next = updater(current);
    
    if (existing && existing.v === next.v && existing.f === next.f && existing.r === next.r) {
      return false; // unchanged
    }

    if (writeProgress(key, next)) {
      const newMap = new Map(progressMap!);
      newMap.set(key, next);
      progressMap = newMap;
      notify();
      return true;
    }
    return false;
  }

  return {
    getAll(): ReadonlyMap<string, ChapterProgress> {
      return hydrate();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get(ref: BibleRef): ChapterProgress | undefined {
      return hydrate().get(chapterKey(ref));
    },
    markVerseRead(ref: BibleRef, verse: number): boolean {
      return update(ref, (p) => withVerseRead(p, verse));
    },
    markFurthest(ref: BibleRef, verse: number): boolean {
      return update(ref, (p) => withFurthest(p, verse));
    },
    clearTranslation(code: TranslationCode): void {
      const prefix = `${KEY.bibleChapter}${code}/`;
      let changed = false;
      for (const key of kv.getAllKeys()) {
        if (key.startsWith(prefix)) {
          kv.remove(key);
          changed = true;
        }
      }
      if (changed) {
        progressMap = null;
        notify();
      }
    },
    clearAll(): void {
      let changed = false;
      for (const key of kv.getAllKeys()) {
        if (key.startsWith(KEY.bibleChapter)) {
          kv.remove(key);
          changed = true;
        }
      }
      if (changed) {
        progressMap = null;
        notify();
      }
    },
    getStats() {
      const map = hydrate();
      let versesReadCount = 0;
      for (const p of map.values()) {
        let count = 0;
        for (let i = 0; i < p.r.length; i += 2) {
          let byte = parseInt(p.r.substring(i, i + 2), 16);
          while (byte > 0) {
            if (byte & 1) count++;
            byte >>= 1;
          }
        }
        versesReadCount += count;
      }
      return {
        chapters: map.size,
        versesRead: versesReadCount,
        quarantined: kv.getAllKeys().filter((k) => k.startsWith(KEY.quarantine)).length,
      };
    },
  };
}
