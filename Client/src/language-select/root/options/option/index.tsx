import React from 'react';

// Components
import { SelectItem } from 'design/components';

// Hooks
import { useTranslation } from 'design/hooks';

// Context
import { useLanguageSelect } from 'i18n/language-select/context';

// Partials
import { flagOf } from 'i18n/language-select/root/flag-of';
import { NAMESPACE } from 'i18n/constants';

type Props = Pick<
  ReturnType<typeof useLanguageSelect>['options'][number],
  'acceptLanguage'
>;

const Option: React.FunctionComponent<Props> = ({ acceptLanguage }) => {
  const { t } = useTranslation(NAMESPACE);
  const { options } = useLanguageSelect();
  const option = options.find((item) => {
    return item.acceptLanguage === acceptLanguage;
  });

  if (!option) {
    return null;
  }

  const { available, complete, name, translating } = option;

  const note =
    complete === false
      ? t('incomplete', {
          context: translating ? 'translating' : undefined,
        })
      : undefined;

  return (
    <SelectItem
      aria-busy={translating}
      disabled={!available}
      lang={acceptLanguage}
      title={note}
      value={acceptLanguage}
    >
      <bdi>{name}</bdi> {flagOf(acceptLanguage)}
    </SelectItem>
  );
};

export { Option };
