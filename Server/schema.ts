import { readFileSync } from 'node:fs';

import { makeExecutableSchema } from '@graphql-tools/schema';
import type { Response } from 'express';
import { GraphQLError } from 'graphql';

import { acceptLanguages } from './language.js';
import { availableAcceptLanguages, findAcceptLanguageStatuses, findTranslations, type AcceptLanguageStatus, type Translation } from './store.js';

export interface Context {
  acceptLanguage?: string;
  response?: Response;
}

type Update = { i18nAcceptLanguagesUpdated: AcceptLanguageStatus[] };

export const typeDefs = readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8');

const MAX_NAMESPACES = 16;
const NAMESPACE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const POLL_MS = 5_000;

function invalid(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

/**
 * Answers with the statuses now, then again each time they change. An
 * iterator rather than a generator: graphql-ws calls return() when the client
 * leaves, which a generator waiting on a timer would only see at its next yield.
 */
function updates(): AsyncIterableIterator<Update> {
  let last = '';
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;

  const iterator: AsyncIterableIterator<Update> = {
    async next() {
      while (!stopped) {
        const statuses = await findAcceptLanguageStatuses();
        const snapshot = JSON.stringify(statuses);

        if (snapshot !== last) {
          last = snapshot;
          return { done: false, value: { i18nAcceptLanguagesUpdated: statuses } };
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, POLL_MS);
        });
      }

      return { done: true, value: undefined };
    },
    async return() {
      stopped = true;
      clearTimeout(timer);
      wake?.();
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return iterator;
    },
  };

  return iterator;
}

const resolvers = {
  I18nTranslation: {
    id: ({ acceptLanguage, namespace, field }: Translation) => `${acceptLanguage}:${namespace}:${field}`,
  },
  I18nAcceptLanguageStatus: {
    id: ({ acceptLanguage }: AcceptLanguageStatus) => acceptLanguage,
  },
  Query: {
    i18nTranslations: async (_: unknown, { namespaces }: { namespaces: string[] }, { acceptLanguage, response }: Context) => {
      if (!namespaces.length || namespaces.length > MAX_NAMESPACES) {
        throw invalid(`Ask for 1 to ${MAX_NAMESPACES} namespaces.`);
      }

      if (namespaces.some((namespace) => namespace.length > 64 || !NAMESPACE.test(namespace))) {
        throw invalid('A namespace is lower case words joined with "-".');
      }

      const { translations, contentLanguages } = await findTranslations(
        acceptLanguages(acceptLanguage, await availableAcceptLanguages()),
        namespaces,
      );

      if (contentLanguages.length) {
        response?.setHeader('Content-Language', contentLanguages.join(', '));
      }

      return translations;
    },
  },
  Subscription: {
    i18nAcceptLanguagesUpdated: {
      subscribe: () => updates(),
    },
  },
};

export const schema = makeExecutableSchema({ typeDefs, resolvers });
