/** The language the files are written in. */
export const SOURCE = 'en-US';

/**
 * The language in the list that a tag means, by its likely script and region,
 * the exact region first: `zh-TW` is `zh-Hant`, `es-AR` is `es`.
 */
export function matchAcceptLanguage(tag: string, languages: string[]): string | undefined {
  let asked: Intl.Locale;

  try {
    asked = new Intl.Locale(tag).maximize();
  } catch {
    return undefined;
  }

  const sameRegion = languages.find((language) => {
    const locale = new Intl.Locale(language).maximize();

    return locale.language === asked.language && locale.script === asked.script && locale.region === asked.region;
  });

  if (sameRegion) {
    return sameRegion;
  }

  return languages.find((language) => {
    const locale = new Intl.Locale(language).maximize();

    return locale.language === asked.language && locale.script === asked.script;
  });
}

/**
 * An `Accept-Language` header as the languages it may be answered in, highest
 * `q` first, `q=0` left out, `en-US` last. Matched among the available
 * languages only, so `es-MX` falls back to `es` before the next range.
 */
export function acceptLanguages(header: string | undefined, available: string[]): string[] {
  const ranges = (header ?? '').split(',').map((range) => {
    const [tag = '', ...parameters] = range.split(';').map((part) => {
      return part.trim();
    });

    const quality = parameters.find((parameter) => {
      return parameter.startsWith('q=');
    });

    return { tag, q: quality ? Number(quality.slice(2)) : 1 };
  });

  const matched = ranges
    .filter(({ tag, q }) => {
      return tag !== '' && tag !== '*' && q > 0;
    })
    .sort((a, b) => {
      return b.q - a.q;
    })
    .map(({ tag }) => {
      return matchAcceptLanguage(tag, available);
    })
    .filter((language) => {
      return language !== undefined;
    });

  return [...new Set([...matched, SOURCE])];
}
