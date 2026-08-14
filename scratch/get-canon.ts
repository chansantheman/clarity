import { Database } from 'bun:sqlite';

const db = new Database('assets/bible/KJV.db', { readonly: true });
const books = db.query('SELECT id, name FROM KJV_books ORDER BY id').all() as {id: number, name: string}[];

let out = `export type Testament = 'old' | 'new';\n\n`;
out += `export type BookMeta = {\n  id: number;\n  dbName: string;\n  name: string;\n  abbr: string;\n  testament: Testament;\n  chapters: number;\n};\n\n`;
out += `export const BOOKS: readonly BookMeta[] = [\n`;

const getChapters = db.query('SELECT max(chapter) as c FROM KJV_verses WHERE book_id = ?');

for (const b of books) {
    const chapters = (getChapters.get(b.id) as any).c;
    const testament = b.id <= 39 ? 'old' : 'new';
    out += `  { id: ${b.id}, dbName: ${JSON.stringify(b.name)}, name: ${JSON.stringify(b.name)}, abbr: ${JSON.stringify(b.name.substring(0, 3))}, testament: '${testament}', chapters: ${chapters} },\n`;
}
out += `];\n\n`;
out += `export const OLD_TESTAMENT = BOOKS.filter(b => b.testament === 'old');\n`;
out += `export const NEW_TESTAMENT = BOOKS.filter(b => b.testament === 'new');\n`;
out += `export function bookById(id: number): BookMeta | undefined { return BOOKS.find(b => b.id === id); }\n`;
out += `export const TOTAL_CHAPTERS = 1189;\n`;
out += `export const TOTAL_VERSES = 31102;\n`;

console.log(out);
