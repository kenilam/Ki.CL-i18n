import mongoose from 'mongoose';

import { SOURCE } from './language.js';
import { Locales, TranslationRuns, Translations } from './models.js';

export type Translation = { namespace: string; field: string; value: string; acceptLanguage: string };
export type AcceptLanguageStatus = {
  acceptLanguage: string;
  complete: boolean;
  translating: boolean;
};

type Entry = { rows: Translation[] };
type Store = Map<string, Entry>;

const TTL_MS = 60_000;
const CACHED = process.env.NODE_ENV !== 'development';

// A run that hasn't touched its row for this long stopped without clearing it.
const RUN_STALE_MS = 5 * 60_000;

const PLURAL = /_(zero|one|two|few|many|other)$/;

let store: Store | null = null;
let loadedAt = 0;
let loading: Promise<Store> | null = null;
let statuses: AcceptLanguageStatus[] = [];

function keyOf(acceptLanguage: string, namespace: string): string {
  return `${acceptLanguage}:${namespace}`;
}

function statusesOf(tags: string[], grouped: Store, namespaces: Set<string>, running: Set<string>): AcceptLanguageStatus[] {
  const fieldsOf = (acceptLanguage: string, namespace: string) =>
    new Set(
      (grouped.get(keyOf(acceptLanguage, namespace))?.rows ?? []).map(({ field }) => {
        return field.replace(PLURAL, '');
      }),
    );

  return tags.map((acceptLanguage) => {
    // Compared without plural endings: Chinese has only `_other` where English has `_one` and `_other`.
    const complete = [...namespaces].every((namespace) => {
      const translated = fieldsOf(acceptLanguage, namespace);

      return [...fieldsOf(SOURCE, namespace)].every((field) => {
        return translated.has(field);
      });
    });

    return { acceptLanguage, complete, translating: running.has(acceptLanguage) };
  });
}

function load(): Promise<Store> {
  loading ??= Promise.all([
    Translations.find({}, 'accept-language field namespace value').sort({ 'accept-language': 1, namespace: 1, field: 1 }).lean(),
    TranslationRuns.find({ updatedAt: { $gt: new Date(Date.now() - RUN_STALE_MS) } }, 'accept-language').lean(),
    Locales.find({}, 'tag').sort({ tag: 1 }).lean(),
  ])
    .then(([rows, runs, locales]) => {
      const grouped: Store = new Map();
      const namespaces = new Set<string>();

      for (const { 'accept-language': acceptLanguage, field, namespace, value } of rows) {
        const key = keyOf(acceptLanguage, namespace);
        const entry = grouped.get(key) ?? { rows: [] };

        entry.rows.push({ namespace, field, value, acceptLanguage });
        grouped.set(key, entry);

        if (acceptLanguage === SOURCE) {
          namespaces.add(namespace);
        }
      }

      statuses = statusesOf(
        locales.map(({ tag }) => tag),
        grouped,
        namespaces,
        new Set(runs.map((run) => run['accept-language'])),
      );
      store = grouped;
      loadedAt = Date.now();
      return grouped;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

async function current(): Promise<Store> {
  if (!CACHED || !store) {
    return load();
  }

  if (Date.now() - loadedAt > TTL_MS && mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    load().catch((error: unknown) => {
      console.error('Translations did not reload:', error);
    });
  }

  return store;
}

/** Reads the collections again now, after this service wrote to them. */
export async function refresh(): Promise<void> {
  await load();
}

/**
 * Each field of the namespaces, from the first of the languages that has it,
 * and the languages the fields came from, in the same order. The query runs
 * without a session, so it answers from memory, never from a read per request.
 */
export async function findTranslations(
  acceptLanguages: string[],
  namespaces: string[],
): Promise<{ translations: Translation[]; contentLanguages: string[] }> {
  const grouped = await current();
  const used = new Set<string>();

  const translations = namespaces.flatMap((namespace) => {
    const fields = new Map<string, Translation>();

    for (const acceptLanguage of acceptLanguages) {
      for (const row of grouped.get(keyOf(acceptLanguage, namespace))?.rows ?? []) {
        if (!fields.has(row.field)) {
          fields.set(row.field, row);
          used.add(acceptLanguage);
        }
      }
    }

    return [...fields.values()];
  });

  return {
    translations,
    contentLanguages: acceptLanguages.filter((acceptLanguage) => used.has(acceptLanguage)),
  };
}

export async function findAcceptLanguageStatuses(): Promise<AcceptLanguageStatus[]> {
  await current();
  return statuses;
}

/** Every language the site is translated into, complete or not. */
export async function localeTags(): Promise<string[]> {
  await current();
  return statuses.map(({ acceptLanguage }) => acceptLanguage);
}

/** The languages a request may be answered in: each complete one, and always `en-US`. */
export async function availableAcceptLanguages(): Promise<string[]> {
  await current();

  return [
    SOURCE,
    ...statuses.filter(({ complete }) => complete).map(({ acceptLanguage }) => acceptLanguage),
  ];
}
