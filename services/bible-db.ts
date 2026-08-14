import { requireOptionalNativeModule } from 'expo';
import type * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import type { TranslationCode } from '@/lib/bible/canon';
import { TRANSLATIONS } from '@/lib/bible/canon';

/** The one place a translation code is bound to a bundled file. Adding ASV is
 * one line here plus one file in assets/bible/. */
const BUNDLED: Partial<Record<TranslationCode, number>> = {
  KJV: require('../assets/bible/KJV.db'),
  BSB: require('../assets/bible/BSB.db'),
};

const open = new Map<TranslationCode, Promise<SQLite.SQLiteDatabase>>();
let sqliteModule: typeof import('expo-sqlite') | null = null;

export class BibleDatabaseUnavailableError extends Error {
  readonly code = 'bible-db-unavailable';

  constructor(cause?: unknown) {
    super('The Bible database is unavailable in this app build. Install a rebuilt Speak the Bible development build.');
    this.name = 'BibleDatabaseUnavailableError';
    if (cause !== undefined) this.cause = cause;
  }

  readonly cause?: unknown;
}

function getSQLite(): typeof import('expo-sqlite') {
  if (sqliteModule) return sqliteModule;

  // Probe the native registry before evaluating expo-sqlite. expo-sqlite's
  // implementation uses the throwing requireNativeModule API internally, so
  // requiring it first would still produce a fatal error on Expo Go or an old
  // development binary. SDK 57's optional probe returns null instead.
  const nativeSQLite = requireOptionalNativeModule('ExpoSQLite');
  if (nativeSQLite == null) throw new BibleDatabaseUnavailableError();

  try {
    sqliteModule = require('expo-sqlite') as typeof import('expo-sqlite');
    return sqliteModule;
  } catch (error) {
    throw new BibleDatabaseUnavailableError(error);
  }
}

async function install(code: TranslationCode): Promise<SQLite.SQLiteDatabase> {
  const sqlite = getSQLite();
  const fileName = `${code}.db`;

  let dir: Directory;
  try {
    dir = new Directory(sqlite.defaultDatabaseDirectory);
  } catch {
    dir = new Directory(Paths.document, 'SQLite');
  }

  if (!dir.exists) dir.create({ intermediates: true });

  const dest = new File(dir, fileName);
  if (!dest.exists) {
    const assetId = BUNDLED[code];
    if (assetId) {
      const asset = Asset.fromModule(assetId);
      await asset.downloadAsync();
      if (asset.localUri) {
        new File(asset.localUri).copy(dest);
      } else {
        throw new Error(`Failed to resolve bundled asset for ${code}`);
      }
    } else {
      const translation = TRANSLATIONS[code];
      if (translation && translation.remoteUrl) {
        throw new Error(`Remote download for ${code} not yet implemented`);
      }
      throw new Error(`Unknown translation ${code}`);
    }
  }

  const db = await sqlite.openDatabaseAsync(fileName, undefined, dir.uri);
  if (!dest.exists) throw new Error(`Database copy for ${code} is missing after install`);
  return db;
}

export function getDb(code: TranslationCode): Promise<SQLite.SQLiteDatabase> {
  if (!open.has(code)) {
    const promise = install(code).then(async (db) => {
      // Verify the database is not corrupted or truncated.
      const sqliteTable = `${code}_verses`;
      const res = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
        ['table', sqliteTable],
      );
      if (!res || res.name !== sqliteTable) {
        throw new Error(`Corrupted or truncated database for ${code}`);
      }
      return db;
    });
    open.set(code, promise);
    void promise.catch(() => {
      // A failed copy/open may be transient. Do not cache a rejected promise
      // forever in this JS context.
      if (open.get(code) === promise) open.delete(code);
    });
  }
  return open.get(code)!;
}
