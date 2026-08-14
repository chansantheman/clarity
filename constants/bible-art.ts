import type { Passage } from '@/types/session';

export type BibleDivisionId =
  | 'law'
  | 'history'
  | 'poetry'
  | 'major'
  | 'minor'
  | 'gospels'
  | 'acts'
  | 'paul'
  | 'general'
  | 'revelation';

export type BibleDivision = {
  id: BibleDivisionId;
  title: string;
  start: number;
  end: number;
  artwork: Passage['artwork'];
};

export const BIBLE_DIVISIONS: readonly BibleDivision[] = [
  { id: 'law', title: 'The Law', start: 1, end: 5, artwork: { base: ['rgba(45,75,230,0.95)', 'rgba(48,44,150,0.88)'], blob: ['rgba(255,130,80,0.95)', 'rgba(240,80,190,0.65)'] } },
  { id: 'history', title: 'History', start: 6, end: 17, artwork: { base: ['rgba(16,130,150,0.92)', 'rgba(24,86,180,0.85)'], blob: ['rgba(120,255,190,0.90)', 'rgba(60,210,255,0.55)'] } },
  { id: 'poetry', title: 'Poetry & Wisdom', start: 18, end: 22, artwork: { base: ['rgba(130,60,220,0.92)', 'rgba(70,50,190,0.85)'], blob: ['rgba(255,190,120,0.92)', 'rgba(255,110,180,0.55)'] } },
  { id: 'major', title: 'Major Prophets', start: 23, end: 27, artwork: { base: ['rgba(190,60,60,0.92)', 'rgba(120,30,90,0.85)'], blob: ['rgba(255,200,120,0.92)', 'rgba(255,120,90,0.55)'] } },
  { id: 'minor', title: 'Minor Prophets', start: 28, end: 39, artwork: { base: ['rgba(200,110,30,0.92)', 'rgba(140,50,60,0.85)'], blob: ['rgba(255,225,150,0.92)', 'rgba(255,150,90,0.55)'] } },
  { id: 'gospels', title: 'Gospels', start: 40, end: 43, artwork: { base: ['rgba(230,190,60,0.92)', 'rgba(190,110,30,0.85)'], blob: ['rgba(255,250,200,0.92)', 'rgba(255,200,110,0.55)'] } },
  { id: 'acts', title: 'The Early Church', start: 44, end: 44, artwork: { base: ['rgba(30,170,120,0.92)', 'rgba(20,110,120,0.85)'], blob: ['rgba(190,255,200,0.90)', 'rgba(90,230,190,0.55)'] } },
  { id: 'paul', title: "Paul's Letters", start: 45, end: 57, artwork: { base: ['rgba(60,90,200,0.92)', 'rgba(40,60,140,0.85)'], blob: ['rgba(180,210,255,0.92)', 'rgba(120,160,255,0.55)'] } },
  { id: 'general', title: 'General Letters', start: 58, end: 65, artwork: { base: ['rgba(90,110,160,0.92)', 'rgba(50,60,110,0.85)'], blob: ['rgba(210,230,255,0.90)', 'rgba(150,180,230,0.55)'] } },
  { id: 'revelation', title: 'Revelation', start: 66, end: 66, artwork: { base: ['rgba(20,20,40,0.95)', 'rgba(70,20,110,0.88)'], blob: ['rgba(255,140,60,0.95)', 'rgba(255,60,140,0.65)'] } },
];

export function divisionForBook(bookId: number): BibleDivision {
  return BIBLE_DIVISIONS.find((division) => bookId >= division.start && bookId <= division.end) ?? BIBLE_DIVISIONS[0];
}
