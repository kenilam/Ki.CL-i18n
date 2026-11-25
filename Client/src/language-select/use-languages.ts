import { useSubscription } from '@apollo/client/react';

// Hooks
import { useTranslation } from 'design/hooks';

import { AcceptLanguagesUpdated } from 'i18n/documents';

/** Every language and whether it's ready, through the consumer's Apollo client. Until the first answer, the page's own language. */
const useLanguages = () => {
  const { i18n } = useTranslation();
  const { data, loading } = useSubscription(AcceptLanguagesUpdated, {
    context: { queryDeduplication: false },
  });

  return {
    languages: data?.i18nAcceptLanguagesUpdated ?? [{ acceptLanguage: i18n.language, complete: true, translating: false }],
    loading,
  };
};

export { useLanguages };
