import { GoogleAuth } from 'google-auth-library';

import { SOURCE } from './language.js';
import { Locales, TranslationRuns, Translations } from './models.js';
import { translateWithModel } from './translateWithModel.js';

export type Locale = { tag: string; prompt?: string };
export type Namespace = { namespace: string; fields: Map<string, string> };
export type Wanted = Map<string, { english: string; source: string }>;
export type Row = { acceptLanguage: string; namespace: string; field: string; value: string; source: string };
type Branch = { [key: string]: unknown };

const PLURAL = /^(.+)_(zero|one|two|few|many|other)$/;

/** `.` joins a field's path, `:` is i18next's namespace separator, and Mongo reads `$` as an operator. */
const RESERVED = /[.:$]/;

const NAMESPACE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Copy links the site's own pages by path, so an address on the site is a dev address leaking into production. */
const SITE_ADDRESS = /https?:\/\/([a-z0-9-]+\.)*ki-cl\.com/i;

const AUDIENCE = 'ki-cl-subgraphs';

export const isBranch = (value: unknown): value is Branch => typeof value === 'object' && value !== null;

/** Every string in a namespace, by its dotted path. A list's items are numbered: `lines.0`. */
export function flatten(branch: Branch, name: string, path: string[] = [], fields = new Map<string, string>()) {
  for (const [key, value] of Object.entries(branch)) {
    if (RESERVED.test(key)) {
      throw new Error(`${name}: the key "${key}" contains ".", ":" or "$".`);
    }

    const field = [...path, key].join('.');

    if (isBranch(value)) {
      flatten(value, name, [...path, key], fields);
    } else if (typeof value === 'string') {
      if (SITE_ADDRESS.test(value)) {
        throw new Error(`${name}: ${field} links the site by its address. Link a page by its path.`);
      }

      fields.set(field, value);
    } else {
      throw new Error(`${name}: ${field} is not a string.`);
    }
  }

  return fields;
}

/** A repo's English as it sends it: `{ "<namespace>": { ...the JSON file } }`. */
export function namespacesOf(body: unknown): Namespace[] {
  if (!isBranch(body) || Array.isArray(body)) {
    throw new Error('Expected an object of namespaces.');
  }

  return Object.entries(body).map(([namespace, contents]) => {
    if (!NAMESPACE.test(namespace)) {
      throw new Error(`"${namespace}" is not a namespace name.`);
    }

    if (!isBranch(contents) || Array.isArray(contents)) {
      throw new Error(`${namespace}: expected an object of keys.`);
    }

    return { namespace, fields: flatten(contents, namespace) };
  });
}

/**
 * The fields a language needs for these English strings, each with the English
 * to translate and the `source` that marks it current. A plural string gets the
 * language's own plural forms, and their `source` is all the English forms, so
 * a change to any of them marks every form stale.
 */
export function wanted(english: Map<string, string>, acceptLanguage: string): Wanted {
  const categories = new Intl.PluralRules(acceptLanguage).resolvedOptions().pluralCategories;
  const fields: Wanted = new Map();

  for (const [field, value] of english) {
    const base = PLURAL.exec(field)?.[1];

    if (base === undefined || !english.has(`${base}_other`)) {
      fields.set(field, { english: value, source: value });
      continue;
    }

    if (fields.has(`${base}_other`)) {
      continue;
    }

    const forms = [...english].filter(([other]) => PLURAL.exec(other)?.[1] === base);
    const source = JSON.stringify(Object.fromEntries(forms));
    const other = english.get(`${base}_other`) ?? '';

    for (const category of new Set([...categories, ...(english.has(`${base}_zero`) ? ['zero'] : [])])) {
      fields.set(`${base}_${category}`, { english: english.get(`${base}_${category}`) ?? other, source });
    }
  }

  return fields;
}

/**
 * A stored field that can't sit beside the new ones: `account` where the file
 * now has `account.title`, or the other way round.
 */
const collides = (stored: string, fields: Map<string, string>): boolean =>
  [...fields.keys()].some((field) => field.startsWith(`${stored}.`) || stored.startsWith(`${field}.`));

export async function translatedLocales(): Promise<Locale[]> {
  return Locales.find({ tag: { $ne: SOURCE } }, 'tag prompt').sort({ tag: 1 }).lean();
}

/** The English of each namespace, or of the ones named. */
async function englishOf(only?: string[]): Promise<Map<string, Map<string, string>>> {
  const rows = await Translations.find(
    { 'accept-language': SOURCE, ...(only ? { namespace: { $in: only } } : {}) },
    'namespace field value',
  ).lean();
  const namespaces = new Map<string, Map<string, string>>();

  for (const { namespace, field, value } of rows) {
    namespaces.set(namespace, (namespaces.get(namespace) ?? new Map()).set(field, value));
  }

  return namespaces;
}

/** The fields of one language and namespace whose stored translation is missing or older than the English. */
async function staleOf(acceptLanguage: string, namespace: string, english: Map<string, string>): Promise<Wanted> {
  const stored = await Translations.find({ 'accept-language': acceptLanguage, namespace }, 'field source').lean();
  const sources = new Map(stored.map((row) => [row.field, row.source]));

  return new Map([...wanted(english, acceptLanguage)].filter(([field, { source }]) => sources.get(field) !== source));
}

/**
 * Writes a repo's English. New and changed strings are written, and a stored
 * string that can't sit beside a new one is removed. With `prune`, every
 * string the namespace no longer has goes, with its translations.
 */
export async function seed(namespaces: Namespace[], prune = false): Promise<string[]> {
  const report: string[] = [];

  for (const { namespace, fields } of namespaces) {
    const rows = await Translations.find({ 'accept-language': SOURCE, namespace }, 'field value').lean();
    const stored = new Map(rows.map((row) => [row.field, row.value]));
    const changed = [...fields].filter(([field, value]) => value !== stored.get(field));
    const removed = [...stored.keys()].filter((field) => !fields.has(field) && (prune || collides(field, fields)));

    if (changed.length || removed.length) {
      await Translations.bulkWrite([
        ...changed.map(([field, value]) => ({
          updateOne: { filter: { 'accept-language': SOURCE, namespace, field }, update: { $set: { value } }, upsert: true },
        })),
        ...removed.map((field) => ({ deleteOne: { filter: { 'accept-language': SOURCE, namespace, field } } })),
      ]);
    }

    let orphans = 0;

    if (prune) {
      const others = await Translations.find({ 'accept-language': { $ne: SOURCE }, namespace }, 'accept-language field').lean();
      const obsolete = others.filter((row) => !wanted(fields, row['accept-language']).has(row.field));

      orphans = obsolete.length;

      if (orphans) {
        await Translations.deleteMany({ _id: { $in: obsolete.map((row) => row._id) } });
      }
    }

    report.push(`${SOURCE}/${namespace}: ${changed.length} written, ${removed.length + orphans} removed, ${fields.size - changed.length} unchanged`);
  }

  return report;
}

/**
 * Translates every string that is new or changed into the locales, through
 * the model chain. It stops quietly at the model quota, since a free tier is
 * expected to run out, and the next run carries on from there.
 */
export async function translate(locales: Locale[], only?: string[]): Promise<{ report: string[]; failures: number; limited: boolean }> {
  const namespaces = await englishOf(only);
  const report: string[] = [];
  let failures = 0;

  for (const { tag: acceptLanguage, prompt } of locales) {
    try {
      for (const [namespace, english] of namespaces) {
        const fields = await staleOf(acceptLanguage, namespace, english);

        if (!fields.size) {
          continue;
        }

        // Touched before each namespace, so the switcher's spinner stops for a run that died.
        await TranslationRuns.updateOne({ 'accept-language': acceptLanguage }, { $set: { 'accept-language': acceptLanguage } }, { upsert: true });

        const stale = new Map([...fields].map(([field, { english: text }]) => [field, text]));
        const { translated: written, failed, limited } = await translateWithModel(acceptLanguage, namespace, stale, prompt);

        if (written.size) {
          await Translations.bulkWrite(
            [...written].map(([field, value]) => ({
              updateOne: {
                filter: { 'accept-language': acceptLanguage, namespace, field },
                update: { $set: { value, source: fields.get(field)?.source } },
                upsert: true,
              },
            })),
          );
        }

        failures += failed.length;
        report.push(`${acceptLanguage}/${namespace}: ${written.size} translated, ${failed.length} failed`);

        if (limited) {
          report.push('Stopped at the model quota. The next run carries on from here.');
          return { report, failures, limited };
        }
      }
    } finally {
      await TranslationRuns.deleteOne({ 'accept-language': acceptLanguage });
    }
  }

  return { report, failures, limited: false };
}

/** The stored translations made from exactly the English asked for. Dev answers production with these. */
export async function translationsFor(asked: Omit<Row, 'value'>[]): Promise<Row[]> {
  const groups = new Map<string, Omit<Row, 'value'>[]>();

  for (const row of asked) {
    const key = `${row.acceptLanguage}:${row.namespace}`;

    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const found = await Promise.all(
    [...groups.values()].map(async (rows) => {
      const [{ acceptLanguage, namespace }] = rows as [Omit<Row, 'value'>];
      const stored = await Translations.find(
        { 'accept-language': acceptLanguage, namespace, field: { $in: rows.map(({ field }) => field) } },
        'field value source',
      ).lean();
      const sources = new Map(rows.map(({ field, source }) => [field, source]));

      return stored
        .filter((row) => row.source !== undefined && row.source === sources.get(row.field))
        .map((row) => ({ acceptLanguage, namespace, field: row.field, value: row.value, source: row.source as string }));
    }),
  );

  return found.flat();
}

async function invoke(url: string, body: unknown): Promise<unknown> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (url.startsWith('https://')) {
    const client = await new GoogleAuth().getIdTokenClient(AUDIENCE);

    headers['x-serverless-authorization'] = `Bearer ${await client.idTokenProvider.fetchIdToken(AUDIENCE)}`;
  }

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}.`);
  }

  return response.json();
}

/**
 * Production never translates. It asks dev's service for the translations of
 * exactly the English it has, one language at a time, and writes the ones that
 * still match.
 */
export async function copy(from: string, locales: Locale[], only?: string[]): Promise<string[]> {
  const namespaces = await englishOf(only);
  const report: string[] = [];

  for (const { tag: acceptLanguage } of locales) {
    const asked: Omit<Row, 'value'>[] = [];

    for (const [namespace, english] of namespaces) {
      for (const [field, { source }] of await staleOf(acceptLanguage, namespace, english)) {
        asked.push({ acceptLanguage, namespace, field, source });
      }
    }

    if (!asked.length) {
      continue;
    }

    const answer = (await invoke(`${from}/internal/translations`, { asked })) as { rows?: Row[] };
    const current = new Set(asked.map(({ namespace, field, source }) => `${namespace}:${field}:${source}`));
    const rows = (answer.rows ?? []).filter(
      (row) =>
        row.acceptLanguage === acceptLanguage &&
        current.has(`${row.namespace}:${row.field}:${row.source}`) &&
        !SITE_ADDRESS.test(row.value),
    );

    if (rows.length) {
      await Translations.bulkWrite(
        rows.map(({ namespace, field, value, source }) => ({
          updateOne: {
            filter: { 'accept-language': acceptLanguage, namespace, field },
            update: { $set: { value, source } },
            upsert: true,
          },
        })),
      );
    }

    report.push(`${acceptLanguage}: ${rows.length} copied, ${asked.length - rows.length} not ready on dev`);
  }

  return report;
}
