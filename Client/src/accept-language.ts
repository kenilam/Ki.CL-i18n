/** The visitor's pick first, then the browser's languages, each a step lower in `q`. */
const acceptLanguage = (preferred: string): string =>
  [...new Set([preferred, ...navigator.languages])]
    .filter((tag) => tag !== '')
    .map((tag, index) => (index === 0 ? tag : `${tag};q=${Math.max(10 - index, 1) / 10}`))
    .join(',');

export { acceptLanguage };
