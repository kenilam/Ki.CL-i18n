# Ki.CL-i18n

The languages of [ki-cl.com](https://ki-cl.com): a GraphQL subgraph that keeps every translation of the site, and a federated language switcher and [i18next](https://www.i18next.com) backend.

## What it does

- Keeps the languages the site is translated into, and every string in each of them.
- Takes each repo's English when that repo deploys. On dev it translates what's new with a model chain (Gemini, then OpenAI, then Groq); production copies dev's translations and never translates itself.
- Answers `i18nTranslations` in the first complete language the visitor's `Accept-Language` asks for, and streams each language's state on `i18nAcceptLanguagesUpdated`.
- Serves the `i18n` remote: `LanguageSelect`, and a `backend` a page plugs into its own i18next.

## Using it in a page

```tsx
import i18next from 'i18next';
import { backend, LanguageSelect } from 'i18n';

i18next.use(backend).init({ backend: { fallback: async (_language, namespace) => bundledEnglish[namespace] } });

<LanguageSelect />;
```

The page owns its i18next setup and its English fallback. `LanguageSelect` shows and changes the page's language unless it's given a `value` and an `onValueChange`.

## Running it

```bash
make start   # first run: copies .env.template, installs, and runs the standalone page on port 3500
make run.server   # the service on I18N_SERVER_PORT (3501)
```

The standalone page needs a Ki.CL gateway at `KICL_BACKEND_URL` that knows this service: `make registry.local DIR=../Ki.CL-api/.registry-local`.

## License

MIT
