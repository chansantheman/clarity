import { bookById, TranslationCode, TRANSLATIONS } from './canon';

export type ChapterRef = `${TranslationCode}:${number}:${number}`;

export type BibleRef = { code: TranslationCode; book: number; chapter: number };

export function parseRef(ref: string | undefined): BibleRef | null {
  if (!ref) return null;
  const parts = ref.split('.');
  if (parts.length !== 3) return null;

  const [translationStr, bookStr, chapterStr] = parts;
  
  if (!TRANSLATIONS[translationStr as TranslationCode]) return null;

  const bookId = parseInt(bookStr, 10);
  const chapter = parseInt(chapterStr, 10);

  if (isNaN(bookId) || isNaN(chapter)) return null;

  const book = bookById(bookId);
  if (!book) return null;

  if (chapter < 1 || chapter > book.chapters) return null;

  return {
    code: translationStr as TranslationCode,
    book: bookId,
    chapter
  };
}

export function formatRef(ref: BibleRef): string {
  return `${ref.code}.${ref.book}.${ref.chapter}`;
}

export function chapterPassageId(ref: BibleRef): string {
  return `bible:${ref.code}:${ref.book}:${ref.chapter}`;
}

export function parseChapterPassageId(id: string): BibleRef | null {
  if (!id.startsWith('bible:')) return null;
  const parts = id.substring(6).split(':');
  if (parts.length !== 3) return null;
  return parseRef(parts.join('.'));
}

export function formatVerseRef(ref: BibleRef, verse: number): string {
  const book = bookById(ref.book);
  return `${book ? book.name : ''} ${ref.chapter}:${verse}`;
}

export function formatChapterRef(ref: BibleRef): string {
  const book = bookById(ref.book);
  return `${book ? book.name : ''} ${ref.chapter}`;
}
