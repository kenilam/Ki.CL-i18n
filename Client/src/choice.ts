import i18next from 'i18next';

import { CHOICE } from 'i18n/constants';

const rememberedLanguage = (): string => {
  try {
    return localStorage.getItem(CHOICE) ?? '';
  } catch {
    return '';
  }
};

const chooseLanguage = (acceptLanguage: string) => {
  try {
    localStorage.setItem(CHOICE, acceptLanguage);
  } catch (error) {
    console.warn(error);
  }

  return i18next.changeLanguage(acceptLanguage);
};

export { chooseLanguage, rememberedLanguage };
