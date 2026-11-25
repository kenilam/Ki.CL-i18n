import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import express from 'express';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';

import './environment.js';
import { connect } from './database.js';
import { precompressed } from './precompressed.js';
import { schema, type Context } from './schema.js';
import { refresh } from './store.js';
import { copy, namespacesOf, seed, translate, translatedLocales, translationsFor } from './words.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PORT = Number(process.env.I18N_SERVER_PORT || process.env.PORT) || 3501;
const DIST = path.join(root, 'Client/dist');

/** Set in production only: the dev service it copies translations from, since production never translates. */
const TRANSLATIONS_FROM = process.env.TRANSLATIONS_FROM?.replace(/\/$/, '');

const app = express();
const httpServer = createServer(app);
const sockets = new WebSocketServer({ server: httpServer, path: '/api' });
const cleanup = useServer({ schema }, sockets);

const server = new ApolloServer<Context>({
  schema,
  introspection: process.env.GRAPHQL_INTROSPECTION === 'true',
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    { serverWillStart: async () => ({ drainServer: async () => { await cleanup.dispose(); } }) },
  ],
});

/** Dev translates what's missing; production copies it from dev. Either stops quietly and leaves the rest to the nightly run. */
async function fill(only?: string[]): Promise<string[]> {
  const locales = await translatedLocales();

  try {
    if (TRANSLATIONS_FROM) {
      return await copy(TRANSLATIONS_FROM, locales, only);
    }

    const { report } = await translate(locales, only);
    return report;
  } catch (error) {
    console.error('Translations were not filled:', error);
    return [`Not filled: ${error instanceof Error ? error.message : String(error)}`];
  } finally {
    await refresh();
  }
}

async function start() {
  await connect();
  await refresh();
  await server.start();

  app.use(
    '/api',
    express.json({ limit: '1mb' }),
    expressMiddleware(server, {
      context: async ({ req, res }): Promise<Context> => ({ acceptLanguage: req.headers['accept-language'], response: res }),
    }),
  );

  // Each repo sends its English here when it deploys: `{ "<namespace>": { ...its en-US JSON file } }`.
  app.post('/internal/english', express.json({ limit: '5mb' }), async (request, response) => {
    let namespaces;

    try {
      namespaces = namespacesOf(request.body);
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }

    const written = await seed(namespaces);
    const filled = await fill(namespaces.map(({ namespace }) => namespace));
    const report = [...written, ...filled];

    console.log(report.join('\n'));
    response.json({ report });
  });

  // Production asks for the translations of exactly the English it has.
  app.post('/internal/translations', express.json({ limit: '10mb' }), async (request, response) => {
    const asked: unknown = request.body?.asked;

    if (!Array.isArray(asked)) {
      response.status(400).json({ error: 'Expected { asked: [{ acceptLanguage, namespace, field, source }] }.' });
      return;
    }

    response.json({ rows: await translationsFor(asked) });
  });

  // Cloud Scheduler calls this every night, after Gemini's free quota resets.
  app.post('/internal/runs/nightly', async (_request, response) => {
    const report = await fill();

    console.log(report.join('\n'));
    response.json({ report });
  });

  app.use(
    '/i18n',
    precompressed(DIST),
    express.static(DIST, {
      setHeaders(response, file) {
        response.setHeader('Cache-Control', file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );

  httpServer.listen(PORT, () => {
    console.log(`i18n on ${PORT}${TRANSLATIONS_FROM ? `, copying from ${TRANSLATIONS_FROM}` : ', translating'}`);
  });
}

void start();
