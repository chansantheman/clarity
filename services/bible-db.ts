import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import type { TranslationCode } from '@/lib/bible/canon';
import { TRANSLATIONS } from '@/lib/bible/canon';

/** The one place a translation code is bound to a bundled file. Adding ASV is
 *  one line here plus one file in assets/bible/. */
const BUNDLED: Partial<Record<TranslationCode, number>> = {
  KJV: require('../assets/bible/KJV.db'),
  BSB: require('../assets/bible/BSB.db'),
};

const open = new Map<TranslationCode, Promise<SQLite.SQLiteDatabase>>();

async function install(code: TranslationCode): Promise<SQLite.SQLiteDatabase> {
  const fileName = `${code}.db`;
  
  let dir: Directory;
  try {
    dir = new Directory(SQLite.defaultDatabaseDirectory);
  } catch (e) {
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
      } else {
         throw new Error(`Unknown translation ${code}`);
      }
    }
  }
  
  // Return the opened DB instance
  return SQLite.openDatabaseAsync(fileName, undefined, dir.uri);
}

export function getDb(code: TranslationCode): Promise<SQLite.SQLiteDatabase> {
  if (!open.has(code)) {
    const promise = install(code).then(async (db) => {
        // Verify the database is not corrupted or truncated
        const res = await db.getFirstAsync<{name: string}>(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [`${code}_verses`]);
        if (!res || res.name !== `${code}_verses`) {
            throw new Error(`Corrupted or truncated database for ${code}`);
        }
        return db;
    });
    open.set(code, promise);
  }
  return open.get(code)!;
}
