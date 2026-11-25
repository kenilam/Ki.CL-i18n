import i18next, { type BackendModule, type ResourceKey } from 'i18next';

import { loadTranslations } from 'i18n/translations';

interface BackendOptions {
  /** Where the gateway answers. */
  uri?: string;
  /** The consumer's own words for when the API can't answer, such as its bundled English. */
  fallback?: (language: string, namespace: string) => Promise<ResourceKey | undefined>;
}

let options: BackendOptions = {};

const load = async (language: string, namespace: string): Promise<ResourceKey> => {
  try {
    const { contentLanguage, translations } = await loadTranslations(language, [namespace], options.uri);
    const [translation] = translations;
    const shown = contentLanguage.split(',')[0]?.trim();

    // A language that stopped being complete is answered in the visitor's next one. Switch to it once this load is stored, so the switcher shows what the page shows.
    if (shown && shown !== language) {
      setTimeout(() => {
        void i18next.changeLanguage(shown);
      });
    }

    if (translation) {
      return translation.resources;
    }

    throw new Error(`No ${language}/${namespace} in the database.`);
  } catch (error) {
    const fallback = await options.fallback?.(language, namespace);

    if (fallback === undefined) {
      throw error;
    }

    console.error(error);
    return fallback;
  }
};

/** Reads each namespace from the database. A consumer plugs it into its own i18next: `i18next.use(backend).init({ backend: { fallback } })`. */
const backend: BackendModule<BackendOptions> = {
  type: 'backend',
  init: (_services, backendOptions) => {
    options = backendOptions ?? {};
  },
  read: (language, namespace, callback) => {
    load(language, namespace).then(
      (resources) => callback(null, resources),
      (error: Error) => callback(error, null),
    );
  },
};

export { backend, type BackendOptions };
