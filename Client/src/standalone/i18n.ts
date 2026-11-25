import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { backend, type BackendOptions } from 'i18n/backend';
import { rememberedLanguage } from 'i18n/choice';
import { NAMESPACE, SOURCE } from 'i18n/constants';
import english from 'i18n/locales/en-US/i18n.json';
import { loadTranslations } from 'i18n/translations';

i18next.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  document.documentElement.dir = i18next.dir(language);
});

/**
 * Run on its own, this page sets up i18next the way any consumer would: it
 * asks which language the visitor gets, plugs in the backend, and keeps its
 * bundled English for when the API can't answer.
 */
const ready = (async () => {
  let lng = SOURCE;

  try {
    const { contentLanguage } = await loadTranslations(rememberedLanguage() || navigator.language, [NAMESPACE]);

    lng = contentLanguage.split(',')[0]?.trim() || lng;
  } catch (error) {
    console.error(error);
  }

  const options: BackendOptions = {
    fallback: async (_language, namespace) => (namespace === NAMESPACE ? english : undefined),
  };

  return i18next.use(backend).use(initReactI18next).init({
    backend: options,
    defaultNS: NAMESPACE,
    fallbackLng: false,
    interpolation: { escapeValue: false },
    load: 'currentOnly',
    lng,
    ns: [NAMESPACE],
  });
})();

export { ready };
