import React from 'react';

// Components
import type { SelectProps } from 'design/components';

// Hooks
import { useTranslation } from 'design/hooks';

import { chooseLanguage } from 'i18n/choice';

// Partials
import { Provider } from './context';
import { Root } from './root';

type LanguageSelectProps = Pick<
  SelectProps,
  'className' | 'inline' | 'placement'
> & {
  onValueChange?: (acceptLanguage: string) => unknown;
  value?: string;
};

/** Shows and changes the page's language unless it's given another value to show and a handler. */
const LanguageSelect: React.FunctionComponent<LanguageSelectProps> = ({
  inline = true,
  onValueChange = chooseLanguage,
  value,
  ...rest
}) => {
  const { i18n } = useTranslation();

  return (
    <Provider inline={inline} value={value ?? i18n.language}>
      <Root {...rest} onValueChange={onValueChange} />
    </Provider>
  );
};

export { LanguageSelect, type LanguageSelectProps };
