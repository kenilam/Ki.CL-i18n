/**
 * The site's writing by hand, for local work and repairs. A deployed repo sends
 * its English itself (POST /internal/english), and the nightly run fills in
 * what's missing, so none of this is part of a release.
 *
 * Run (MONGODB_DATABASE picks the database, as for the server):
 *   npx tsx Server/Scripts/translations.ts seed ../Ki.CL/App/locales
 *   npx tsx Server/Scripts/translations.ts diff ../Ki.CL/App/locales
 *   npx tsx Server/Scripts/translations.ts prune ../Ki.CL/App/locales
 *   npx tsx Server/Scripts/translations.ts drop resume
 *   npx tsx Server/Scripts/translations.ts translate [accept-language...]
 *   npx tsx Server/Scripts/translations.ts copy [accept-language...]
 *
 * `seed` adds and changes strings and leaves the rest alone, so a page loaded
 * before a release still finds the keys it asks for. `prune` also removes what
 * the files no longer have; run it a release later. `copy` takes translations
 * from TRANSLATIONS_FROM instead of the model, as production does.
 */
import 'server/environment.js';

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import mongoose from 'mongoose';

import { connect } from 'server/database.js';
import { SOURCE } from 'server/language.js';
import { Translations } from 'server/models.js';
import { copy, flatten, isBranch, seed, translate, translatedLocales, wanted, type Namespace } from 'server/words.js';

const USAGE = 'Usage: translations.ts seed|diff|prune <dir> | drop <namespace> | translate|copy [accept-language...]';

function readFiles(directory: string): Namespace[] {
  const root = resolve(directory);
  const folders = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const other = folders.find(({ name }) => name !== SOURCE);

  if (other) {
    throw new Error(`${join(root, other.name)}: only ${SOURCE} is kept in files. The other languages are translated into the database.`);
  }

  const files = folders.flatMap(({ name: folder }) =>
    readdirSync(join(root, folder))
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const path = join(root, folder, name);
        const contents: unknown = JSON.parse(readFileSync(path, 'utf8'));

        if (!isBranch(contents) || Array.isArray(contents)) {
          throw new Error(`${path}: expected an object of keys.`);
        }

        return { namespace: basename(name, '.json'), fields: flatten(contents, path) };
      }),
  );

  if (!files.length) {
    throw new Error(`No ${SOURCE}/<namespace>.json files in ${root}.`);
  }

  return files;
}

async function diff(namespaces: Namespace[]): Promise<number> {
  const locales = await translatedLocales();
  let behind = 0;

  for (const { namespace, fields } of namespaces) {
    const rows = await Translations.find({ namespace }, 'accept-language field value source').lean();
    const english = new Map(rows.filter((row) => row['accept-language'] === SOURCE).map((row) => [row.field, row.value]));
    const changed = [...fields].filter(([field, value]) => value !== english.get(field));

    behind += changed.length;
    console.log(
      changed.length
        ? `${SOURCE}/${namespace}: ${changed.length} behind\n  ${changed.map(([field]) => field).join('\n  ')}`
        : `${SOURCE}/${namespace}: up to date`,
    );

    const untranslated = locales.flatMap(({ tag }) => {
      const sources = new Map(rows.filter((row) => row['accept-language'] === tag).map((row) => [row.field, row.source]));
      const count = [...wanted(fields, tag)].filter(([field, { source }]) => sources.get(field) !== source).length;

      return count ? [`${tag} ${count}`] : [];
    });

    console.log(untranslated.length ? `  not translated: ${untranslated.join(', ')}` : '  translated');
  }

  return behind;
}

async function localesNamed(tags: string[]) {
  const locales = await translatedLocales();
  const unknown = tags.find((tag) => !locales.some((locale) => locale.tag === tag));

  if (unknown) {
    throw new Error(`${unknown} is not one of ${locales.map((locale) => locale.tag).join(', ')}.`);
  }

  const asked = locales.filter((locale) => tags.includes(locale.tag));

  return asked.length ? asked : locales;
}

async function run(): Promise<void> {
  const [command = '', target, ...rest] = process.argv.slice(2);
  const tags = [target, ...rest].filter((tag) => tag !== undefined);

  if (command === 'translate') {
    await connect();

    const { report, failures } = await translate(await localesNamed(tags));

    console.log(report.join('\n') || 'Nothing to translate.');

    if (failures) {
      throw new Error(`${failures} string(s) were not translated. Run translate again to retry them.`);
    }

    return;
  }

  if (command === 'copy') {
    const from = process.env.TRANSLATIONS_FROM;

    if (!from) {
      throw new Error('Set TRANSLATIONS_FROM to the service to copy from.');
    }

    await connect();
    console.log((await copy(from.replace(/\/$/, ''), await localesNamed(tags))).join('\n') || 'Nothing to copy.');
    return;
  }

  if (!target || !['seed', 'diff', 'prune', 'drop'].includes(command)) {
    throw new Error(USAGE);
  }

  if (command === 'drop') {
    await connect();

    const { deletedCount } = await Translations.deleteMany({ namespace: target });

    console.log(`Removed ${deletedCount} string(s) of ${target} (${mongoose.connection.name}).`);
    return;
  }

  // Read before connecting, so a bad file fails without touching the database.
  const namespaces = readFiles(target);

  await connect();

  if (command === 'diff') {
    const behind = await diff(namespaces);

    if (behind) {
      throw new Error(`${mongoose.connection.name} is ${behind} string(s) behind ${target}.`);
    }

    return;
  }

  console.log((await seed(namespaces, command === 'prune')).join('\n'));

  if (command === 'prune') {
    const locales = await translatedLocales();
    const { deletedCount } = await Translations.deleteMany({
      'accept-language': { $nin: [SOURCE, ...locales.map((locale) => locale.tag)] },
    });

    console.log(`Removed ${deletedCount} string(s) of locales that were removed.`);
  }

  console.log(`Done (${mongoose.connection.name}).`);
}

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
