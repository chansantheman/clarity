export type TranslationCode = 'KJV' | 'BSB';

export const TRANSLATIONS: Record<TranslationCode, { code: TranslationCode; title: string; license: string; bundled: boolean; remoteUrl?: string }> = {
  KJV: { code: 'KJV', title: 'King James Version', license: 'Public Domain / GPL', bundled: true },
  BSB: { code: 'BSB', title: 'Berean Standard Bible', license: 'CC0', bundled: true },
};

export type Testament = 'old' | 'new';

export type BookMeta = {
  /** 1-66, the <CODE>_books.id primary key. Stable across every translation file. */
  id: number;
  /** Exactly as stored in <CODE>_books.name for KJV — kept for debugging and for the prepare script's cross-check, never rendered. */
  dbName: string;
  /** What the UI shows: '1 Samuel', '3 John', 'Revelation'. */
  name: string;
  /** Chapter-list headers and the live top bar: 'Gen', '1 Sam', '3 Jn', 'Rev'. */
  abbr: string;
  testament: Testament;
  /** Verified against the DB by the prepare script. */
  chapters: number;
};

export const BOOKS: readonly BookMeta[] = [
  { id: 1, dbName: "Genesis", name: "Genesis", abbr: "Gen", testament: 'old', chapters: 50 },
  { id: 2, dbName: "Exodus", name: "Exodus", abbr: "Exo", testament: 'old', chapters: 40 },
  { id: 3, dbName: "Leviticus", name: "Leviticus", abbr: "Lev", testament: 'old', chapters: 27 },
  { id: 4, dbName: "Numbers", name: "Numbers", abbr: "Num", testament: 'old', chapters: 36 },
  { id: 5, dbName: "Deuteronomy", name: "Deuteronomy", abbr: "Deu", testament: 'old', chapters: 34 },
  { id: 6, dbName: "Joshua", name: "Joshua", abbr: "Jos", testament: 'old', chapters: 24 },
  { id: 7, dbName: "Judges", name: "Judges", abbr: "Jud", testament: 'old', chapters: 21 },
  { id: 8, dbName: "Ruth", name: "Ruth", abbr: "Rut", testament: 'old', chapters: 4 },
  { id: 9, dbName: "I Samuel", name: "1 Samuel", abbr: "1 Sam", testament: 'old', chapters: 31 },
  { id: 10, dbName: "II Samuel", name: "2 Samuel", abbr: "2 Sam", testament: 'old', chapters: 24 },
  { id: 11, dbName: "I Kings", name: "1 Kings", abbr: "1 Kgs", testament: 'old', chapters: 22 },
  { id: 12, dbName: "II Kings", name: "2 Kings", abbr: "2 Kgs", testament: 'old', chapters: 25 },
  { id: 13, dbName: "I Chronicles", name: "1 Chronicles", abbr: "1 Chr", testament: 'old', chapters: 29 },
  { id: 14, dbName: "II Chronicles", name: "2 Chronicles", abbr: "2 Chr", testament: 'old', chapters: 36 },
  { id: 15, dbName: "Ezra", name: "Ezra", abbr: "Ezr", testament: 'old', chapters: 10 },
  { id: 16, dbName: "Nehemiah", name: "Nehemiah", abbr: "Neh", testament: 'old', chapters: 13 },
  { id: 17, dbName: "Esther", name: "Esther", abbr: "Est", testament: 'old', chapters: 10 },
  { id: 18, dbName: "Job", name: "Job", abbr: "Job", testament: 'old', chapters: 42 },
  { id: 19, dbName: "Psalms", name: "Psalms", abbr: "Psa", testament: 'old', chapters: 150 },
  { id: 20, dbName: "Proverbs", name: "Proverbs", abbr: "Pro", testament: 'old', chapters: 31 },
  { id: 21, dbName: "Ecclesiastes", name: "Ecclesiastes", abbr: "Ecc", testament: 'old', chapters: 12 },
  { id: 22, dbName: "Song of Solomon", name: "Song of Solomon", abbr: "Song", testament: 'old', chapters: 8 },
  { id: 23, dbName: "Isaiah", name: "Isaiah", abbr: "Isa", testament: 'old', chapters: 66 },
  { id: 24, dbName: "Jeremiah", name: "Jeremiah", abbr: "Jer", testament: 'old', chapters: 52 },
  { id: 25, dbName: "Lamentations", name: "Lamentations", abbr: "Lam", testament: 'old', chapters: 5 },
  { id: 26, dbName: "Ezekiel", name: "Ezekiel", abbr: "Eze", testament: 'old', chapters: 48 },
  { id: 27, dbName: "Daniel", name: "Daniel", abbr: "Dan", testament: 'old', chapters: 12 },
  { id: 28, dbName: "Hosea", name: "Hosea", abbr: "Hos", testament: 'old', chapters: 14 },
  { id: 29, dbName: "Joel", name: "Joel", abbr: "Joel", testament: 'old', chapters: 3 },
  { id: 30, dbName: "Amos", name: "Amos", abbr: "Amos", testament: 'old', chapters: 9 },
  { id: 31, dbName: "Obadiah", name: "Obadiah", abbr: "Oba", testament: 'old', chapters: 1 },
  { id: 32, dbName: "Jonah", name: "Jonah", abbr: "Jon", testament: 'old', chapters: 4 },
  { id: 33, dbName: "Micah", name: "Micah", abbr: "Mic", testament: 'old', chapters: 7 },
  { id: 34, dbName: "Nahum", name: "Nahum", abbr: "Nah", testament: 'old', chapters: 3 },
  { id: 35, dbName: "Habakkuk", name: "Habakkuk", abbr: "Hab", testament: 'old', chapters: 3 },
  { id: 36, dbName: "Zephaniah", name: "Zephaniah", abbr: "Zep", testament: 'old', chapters: 3 },
  { id: 37, dbName: "Haggai", name: "Haggai", abbr: "Hag", testament: 'old', chapters: 2 },
  { id: 38, dbName: "Zechariah", name: "Zechariah", abbr: "Zec", testament: 'old', chapters: 14 },
  { id: 39, dbName: "Malachi", name: "Malachi", abbr: "Mal", testament: 'old', chapters: 4 },
  { id: 40, dbName: "Matthew", name: "Matthew", abbr: "Matt", testament: 'new', chapters: 28 },
  { id: 41, dbName: "Mark", name: "Mark", abbr: "Mark", testament: 'new', chapters: 16 },
  { id: 42, dbName: "Luke", name: "Luke", abbr: "Luke", testament: 'new', chapters: 24 },
  { id: 43, dbName: "John", name: "John", abbr: "John", testament: 'new', chapters: 21 },
  { id: 44, dbName: "Acts", name: "Acts", abbr: "Acts", testament: 'new', chapters: 28 },
  { id: 45, dbName: "Romans", name: "Romans", abbr: "Rom", testament: 'new', chapters: 16 },
  { id: 46, dbName: "I Corinthians", name: "1 Corinthians", abbr: "1 Cor", testament: 'new', chapters: 16 },
  { id: 47, dbName: "II Corinthians", name: "2 Corinthians", abbr: "2 Cor", testament: 'new', chapters: 13 },
  { id: 48, dbName: "Galatians", name: "Galatians", abbr: "Gal", testament: 'new', chapters: 6 },
  { id: 49, dbName: "Ephesians", name: "Ephesians", abbr: "Eph", testament: 'new', chapters: 6 },
  { id: 50, dbName: "Philippians", name: "Philippians", abbr: "Phil", testament: 'new', chapters: 4 },
  { id: 51, dbName: "Colossians", name: "Colossians", abbr: "Col", testament: 'new', chapters: 4 },
  { id: 52, dbName: "I Thessalonians", name: "1 Thessalonians", abbr: "1 Thes", testament: 'new', chapters: 5 },
  { id: 53, dbName: "II Thessalonians", name: "2 Thessalonians", abbr: "2 Thes", testament: 'new', chapters: 3 },
  { id: 54, dbName: "I Timothy", name: "1 Timothy", abbr: "1 Tim", testament: 'new', chapters: 6 },
  { id: 55, dbName: "II Timothy", name: "2 Timothy", abbr: "2 Tim", testament: 'new', chapters: 4 },
  { id: 56, dbName: "Titus", name: "Titus", abbr: "Titus", testament: 'new', chapters: 3 },
  { id: 57, dbName: "Philemon", name: "Philemon", abbr: "Phm", testament: 'new', chapters: 1 },
  { id: 58, dbName: "Hebrews", name: "Hebrews", abbr: "Heb", testament: 'new', chapters: 13 },
  { id: 59, dbName: "James", name: "James", abbr: "Jas", testament: 'new', chapters: 5 },
  { id: 60, dbName: "I Peter", name: "1 Peter", abbr: "1 Pet", testament: 'new', chapters: 5 },
  { id: 61, dbName: "II Peter", name: "2 Peter", abbr: "2 Pet", testament: 'new', chapters: 3 },
  { id: 62, dbName: "I John", name: "1 John", abbr: "1 John", testament: 'new', chapters: 5 },
  { id: 63, dbName: "II John", name: "2 John", abbr: "2 John", testament: 'new', chapters: 1 },
  { id: 64, dbName: "III John", name: "3 John", abbr: "3 John", testament: 'new', chapters: 1 },
  { id: 65, dbName: "Jude", name: "Jude", abbr: "Jude", testament: 'new', chapters: 1 },
  { id: 66, dbName: "Revelation of John", name: "Revelation", abbr: "Rev", testament: 'new', chapters: 22 },
];

export const OLD_TESTAMENT = BOOKS.filter(b => b.testament === 'old');
export const NEW_TESTAMENT = BOOKS.filter(b => b.testament === 'new');
export function bookById(id: number): BookMeta | undefined { return BOOKS.find(b => b.id === id); }
export const TOTAL_CHAPTERS = 1189;
export const TOTAL_VERSES = 31102;
