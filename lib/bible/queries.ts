import { getDb } from '@/services/bible-db';
import { parseRef } from './ref';
import type { ChapterRef } from './ref';

export type VerseRow = {
  verse: number;
  text: string;
};

export async function fetchChapter(ref: ChapterRef): Promise<VerseRow[]> {
  const { translation, book, chapter } = parseRef(ref);
  const db = await getDb(translation);
  
  // The table name is dynamic based on translation code
  const tableName = `${translation}_verses`;
  
  // Run query
  const rows = await db.getAllAsync<VerseRow>(
    `SELECT verse, text FROM ${tableName} WHERE book_id = ? AND chapter = ? ORDER BY verse ASC`,
    [book, chapter]
  );
  
  return rows;
}
