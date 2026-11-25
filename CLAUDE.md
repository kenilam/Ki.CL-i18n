# CLAUDE.md

Ki.CL-i18n owns everything about the site's languages: a GraphQL subgraph behind [Ki.CL-api](https://github.com/kenilam/Ki.CL-api)'s gateway, and the `i18n` remote, with the language switcher and the i18next backend. The rules in `Ki.CL/CLAUDE.md` apply here too. The design is under "Languages" in `federation-plan.md` at the root of the workspace.

## Commands

```bash
make start            # first run: copies .env.template, installs, runs the standalone page
make run              # the standalone page on PORT (3500)
make run.server       # the service on I18N_SERVER_PORT (3501)
make registry.local DIR=../Ki.CL-api/.registry-local   # this service's record for a local gateway
make translations.seed DIR=../Ki.CL/App/locales        # a repo's English by hand; also diff, prune, drop NAMESPACE=
make translations.translate LANGUAGES="fr ja"          # translate what's missing; copy does the same from TRANSLATIONS_FROM
make locales.list     # also locales.add TAG= PROMPT= and locales.remove TAG=
make typecheck
make lint
```

## Server

- It owns the `locales`, `translations` and `translation_runs` collections (`Server/models.ts`). A row of `translations` is one string in one language: `accept-language`, `namespace`, `field` (its dotted path) and `value`, and for a translation, `source`, the English it was made from. A row whose `source` still matches the English is left alone, so a value fixed by hand stays until the English changes.
- `Server/schema.graphql`: `i18nTranslations` (`@public`, and in the gateway's `WHITE_LIST_OPERATION`, since the site needs its words before it has a session) and `i18nAcceptLanguagesUpdated`. Every root field starts with `i18n`, and `Server/Scripts/registry.ts check` fails one that doesn't.
- `Server/store.ts` keeps every string in memory and reads the collections again after a minute, or at once after this service writes to them. A language is complete when it has every `en-US` field of every namespace, compared without plural endings.
- `Server/language.ts` matches an `Accept-Language` header against the complete languages: highest `q` first, the exact region first, then the same language and script (`zh-TW` is `zh-Hant`, `es-AR` is `es`), and `en-US` last. The gateway passes the header through as the browser sent it; each service reads it as it needs.
- Each repo's Cloud Build sends its `en-US` files to `POST /internal/english` before it deploys (the `Words` step in `cloudbuild.yaml`, the same in every repo). The service writes the English, then fills in the other languages (`Server/words.ts`): dev translates what's new or changed with the model chain; production, which has `TRANSLATIONS_FROM` set to dev's service, asks dev's `POST /internal/translations` for exactly the English it has. Either one stops quietly at a failure or the model quota.
- Cloud Scheduler calls `POST /internal/runs/nightly` every day: dev's at 08:30 UTC, just after Gemini's free quota resets, and production's at 11:30 UTC, after dev's can finish. Dev translates what's missing and production copies it. Dev never calls production.
- English that links the site by its address (`https://dev.ki-cl.com/...`) is refused, and so is a copied translation that does: copy links a page by its path.
- The service is private behind Cloud Run's invoker check, with the `ki-cl-subgraphs` audience, and `cloudbuild.yaml` stops a deploy that grants `allUsers`. The gateway, the builds' account, Cloud Scheduler and production's service (as `taxon-visual`) are the callers.

## Client

- `Client/src/index.ts` is the remote's one entry: `LanguageSelect`, `backend`, `loadTranslations`, `chooseLanguage` and `rememberedLanguage`.
- `backend` reads each namespace through `i18nTranslations` with `fetch`, so it works before the consumer has a session. The consumer plugs it into its own i18next and passes its English fallback in the backend options; the remote never calls `init`.
- `LanguageSelect` subscribes to `i18nAcceptLanguagesUpdated` through the consumer's Apollo client. An incomplete language shows as such and can't be picked, unless it is the page's language.
- `Client/src/standalone`: the page this repo serves at `/i18n/`, with its own session gate and Apollo client, set up the way any consumer would set up i18next.
- Words: `Client/src/locales/en-US/i18n.json` holds the switcher's and the standalone page's.
