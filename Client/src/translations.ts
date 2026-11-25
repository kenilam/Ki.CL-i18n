import { acceptLanguage as header } from 'i18n/accept-language';
import { TRANSLATIONS, type Translation } from 'i18n/documents';

type Resources = { [key: string]: string | Resources | Resources[] | string[] };

const INDEX = /^\d+$/;

/** Puts `account.signOut` at `resources.account.signOut`, the shape i18next reads. A numbered step, `lines.0`, makes a list. */
function place(resources: Resources, field: string, value: string): void {
  const path = field.split('.');
  let branch = resources as Record<string, unknown>;

  path.slice(0, -1).forEach((key, index) => {
    branch[key] ??= INDEX.test(path[index + 1] ?? '') ? [] : {};
    branch = branch[key] as Record<string, unknown>;
  });

  branch[path[path.length - 1] ?? ''] = value;
}

/**
 * Each namespace that exists, as i18next resources, and the `Content-Language`
 * the API answered with: the languages the strings came from, which differ
 * from `acceptLanguage` when it isn't complete. Runs without a session, so it
 * works before the consumer has one.
 */
async function loadTranslations(acceptLanguage: string, namespaces: string[], uri = '/api') {
  const response = await fetch(uri, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Accept-Language': header(acceptLanguage), 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName: 'kicl_i18nTranslations', query: TRANSLATIONS, variables: { namespaces } }),
  });

  const body = (await response.json()) as { data?: { i18nTranslations?: Translation[] }; errors?: { message: string }[] };

  if (!body.data?.i18nTranslations) {
    throw new Error(body.errors?.[0]?.message ?? `The translations answered ${response.status}.`);
  }

  const resources = new Map<string, Resources>();

  for (const { field, namespace, value } of body.data.i18nTranslations) {
    const branch = resources.get(namespace) ?? {};

    place(branch, field, value);
    resources.set(namespace, branch);
  }

  return {
    contentLanguage: response.headers.get('Content-Language') ?? '',
    translations: [...resources].map(([namespace, branch]) => ({ namespace, resources: branch })),
  };
}

export { loadTranslations };
