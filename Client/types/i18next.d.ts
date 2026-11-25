import 'i18next';

import type i18n from 'i18n/locales/en-US/i18n.json';

/**
 * Keys are checked against the English file, which seeds the database. Kept
 * outside `src`, so it stays out of the types Ki.CL downloads: Ki.CL declares
 * its own namespaces, and two declarations of `resources` would collide.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'i18n';
    resources: {
      i18n: typeof i18n;
    };
  }
}
