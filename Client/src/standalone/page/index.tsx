import React from 'react';

// Libraries
import classNames from 'classnames';

// Components
import { Heading, Layout, Text } from 'design/components';

// Hooks
import { useTranslation } from 'design/hooks';

import { LanguageSelect } from 'i18n/language-select';

const Page: React.FunctionComponent = () => {
  const { t } = useTranslation('i18n');

  return (
    <Layout gap='wide' justifyItems='start'>
      <main className={classNames('kicl-max-inline-size-columns-8', 'kicl-margin-inline-auto', 'kicl-padding-inline-wide')}>
        <Heading is='h1'>{t('standalone_title')}</Heading>
        <Text>{t('standalone_description')}</Text>
        <LanguageSelect inline={false} />
        <Text>{t('standalone_sample')}</Text>
      </main>
    </Layout>
  );
};

export { Page };
