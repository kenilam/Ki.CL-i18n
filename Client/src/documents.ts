import { gql, type TypedDocumentNode } from '@apollo/client';

interface AcceptLanguageStatus {
  __typename: 'I18nAcceptLanguageStatus';
  id: string;
  acceptLanguage: string;
  complete: boolean;
  translating: boolean;
}

interface Translation {
  __typename: 'I18nTranslation';
  id: string;
  namespace: string;
  field: string;
  value: string;
}

const AcceptLanguagesUpdated: TypedDocumentNode<{ i18nAcceptLanguagesUpdated: AcceptLanguageStatus[] }> = gql`
  subscription kicl_i18nAcceptLanguagesUpdated {
    i18nAcceptLanguagesUpdated {
      id
      acceptLanguage
      complete
      translating
    }
  }
`;

const TRANSLATIONS = `query kicl_i18nTranslations($namespaces: [String!]!) {
  i18nTranslations(namespaces: $namespaces) {
    id
    namespace
    field
    value
  }
}`;

export { AcceptLanguagesUpdated, TRANSLATIONS, type AcceptLanguageStatus, type Translation };
