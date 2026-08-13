/**
 * Mechanically verifies the checkable claims in `docs/plan/*.md`.
 *
 * WHY THIS EXISTS. The plan documents were written by several agents, and two of
 * them fabricated an identifier — one of them inside a section titled "read them,
 * never invent them." Fabrication is not disobedience: a model has no internal
 * signal separating "I read this" from "I inferred this", so an instruction not
 * to invent cannot reliably prevent inventing. The only defence that works is
 * mechanical verification, which is this file.
 *
 * It checks the classes of claim that CAN be checked:
 *   1. every `path/file.ts:123` citation resolves to a real file with that line
 *   2. every Lucide icon named in icon syntax is a real export
 *   3. the KJV structural counts (66 / 1,189 / 31,102), when the DB is present
 *
 * It cannot check prose, judgement, or anything about Expo's docs. Those still
 * need a human or a second agent. Absence of failures here is not proof the
 * documents are correct — it is proof they are not wrong in these specific,
 * cheap-to-check ways.
 *
 * Run: bun scripts/audit-plan-claims.ts
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PLAN_DIR = join(ROOT, 'docs/plan');
const ICON_TYPES = join(ROOT, 'node_modules/lucide-react-native/dist/types/icons');
/** Optional: the audit degrades to a skip rather than failing when absent. */
const KJV_DB = '/Users/chandler/Documents/BibleScroll/Translations/kjv.db';

let failures = 0;
let checks = 0;

function fail(message: string): void {
  failures++;
  console.error(`  ✗ ${message}`);
}
function pass(message: string): void {
  checks++;
  console.log(`  ✓ ${message}`);
}
function section(title: string): void {
  console.log(`\n${title}`);
}

const docs = readdirSync(PLAN_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, body: readFileSync(join(PLAN_DIR, f), 'utf8') }));

// --- 1. file:line citations ---------------------------------------------------
// A fabricated value has no citation, so requiring citations is what makes
// fabrication visible. This verifies the ones that are there actually resolve.

section('file:line citations');
{
  const CITATION = /\b([a-zA-Z0-9_@./-]+\.(?:tsx?|jsx?|json|js))[::](\d+)(?:-(\d+))?\b/g;
  let seen = 0;

  for (const doc of docs) {
    for (const [, path, startRaw, endRaw] of doc.body.matchAll(CITATION)) {
      seen++;

      // Citations into dependencies are quoted for provenance. They are real
      // files, just not repo files, so resolve them under node_modules too.
      const direct = join(ROOT, path);
      const resolved = existsSync(direct)
        ? direct
        : (findByBasename(basename(path)) ?? findInNodeModules(path));
      if (!resolved) {
        fail(`${doc.name}: no such file — ${path}:${startRaw}`);
        continue;
      }

      const lines = readFileSync(resolved, 'utf8').split('\n').length;
      const highest = Number(endRaw ?? startRaw);
      if (highest > lines) {
        fail(`${doc.name}: ${path}:${startRaw} is past end of file (${lines} lines)`);
      }
    }
  }
  if (failures === 0) pass(`${seen} citations resolve to a real file and line`);
}

function findByBasename(name: string): string | null {
  const roots = ['app', 'components', 'hooks', 'lib', 'services', 'constants', 'types', 'scripts', 'plugins'];
  for (const dir of roots) {
    const hit = walk(join(ROOT, dir), name);
    if (hit) return hit;
  }
  for (const top of ['app.json', 'app.config.ts', 'package.json', 'eas.json', 'AGENTS.md']) {
    if (basename(top) === name && existsSync(join(ROOT, top))) return join(ROOT, top);
  }
  return null;
}

/** Resolves a citation that points inside a dependency, e.g.
 * `build/ExpoMetroConfig.js:230` in `@expo/metro-config`. Matching on the
 * suffix is enough: the point is that the cited file exists and is long
 * enough, not which package re-exports it. */
function findInNodeModules(path: string): string | null {
  const modules = join(ROOT, 'node_modules');
  if (!existsSync(modules)) return null;
  const scopes = readdirSync(modules).filter((d) => !d.startsWith('.'));
  for (const scope of scopes) {
    const dirs = scope.startsWith('@')
      ? readdirSync(join(modules, scope)).map((d) => join(scope, d))
      : [scope];
    for (const pkg of dirs) {
      const candidate = join(modules, pkg, path);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function walk(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const hit = walk(full, name);
      if (hit) return hit;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

// --- 2. Lucide icon names -----------------------------------------------------
// AGENTS.md forbids guessing icon names. This proves nobody did.

section('Lucide icon names');
if (!existsSync(ICON_TYPES)) {
  console.log('  – skipped (lucide-react-native not installed)');
} else {
  const real = new Set(
    readdirSync(ICON_TYPES)
      .filter((f) => f.endsWith('.d.ts'))
      .map((f) =>
        f
          .replace(/\.d\.ts$/, '')
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(''),
      ),
  );

  // Only names used in genuine icon syntax — not every PascalCase word in prose.
  const USAGE = /<([A-Z][a-zA-Z0-9]*)\s+size=|icon:\s*`?([A-Z][a-zA-Z0-9]*)|icon=\{([A-Z][a-zA-Z0-9]*)\}/g;
  /** Not icon-name claims: `LucideIcon` is the TypeScript prop type AGENTS.md
   * mandates, and the others stand in for "whichever icon applies". */
  const PLACEHOLDERS = new Set(['SuitIcon', 'Icon', 'LucideIcon']);

  const used = new Set<string>();
  for (const doc of docs) {
    for (const match of doc.body.matchAll(USAGE)) {
      const name = match[1] ?? match[2] ?? match[3];
      if (name && !PLACEHOLDERS.has(name)) used.add(name);
    }
  }

  const bogus = [...used].filter((n) => !real.has(n));
  if (bogus.length) bogus.forEach((n) => fail(`not a Lucide export: ${n}`));
  else pass(`${used.size} icon names all exist in lucide-react-native`);
}

// --- 3. KJV structural counts -------------------------------------------------
// The three numbers the whole data design is built on.

section('KJV database structure');
if (!existsSync(KJV_DB)) {
  console.log(`  – skipped (no database at ${KJV_DB})`);
} else {
  const { Database } = await import('bun:sqlite');
  const db = new Database(KJV_DB, { readonly: true });
  const expected: [string, string, number][] = [
    ['books', 'select count(*) as n from KJV_books', 66],
    ['verses', 'select count(*) as n from KJV_verses', 31102],
    [
      'chapters',
      'select count(*) as n from (select distinct book_id, chapter from KJV_verses)',
      1189,
    ],
  ];
  for (const [label, sql, want] of expected) {
    const got = (db.query(sql).get() as { n: number }).n;
    if (got !== want) fail(`${label}: documents say ${want}, database has ${got}`);
    else pass(`${label} = ${want}`);
  }
  db.close();
}

// --- report -------------------------------------------------------------------

console.log();
if (failures > 0) {
  console.error(`FAILED — ${failures} claim(s) could not be verified.`);
  process.exit(1);
}
console.log(`OK — ${checks} claim group(s) verified. Prose and judgement still need a reader.`);
