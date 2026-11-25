import React from 'react';

// Context
import { useLanguageSelect } from 'i18n/language-select/context';

// Partials
import { Option } from './option';

const Options: React.FunctionComponent = () => {
  const { options } = useLanguageSelect();

  return options.map(({ acceptLanguage }) => {
    return <Option acceptLanguage={acceptLanguage} key={acceptLanguage} />;
  });
};

export { Options };
