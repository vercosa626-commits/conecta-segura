import {getDatabase} from '@netlify/database';
import {corsApi} from '../../src/server.js';
import {postgresStore} from '../../src/postgres-store.js';

let store;
function productionStore() {
  if (!store) {
    const pool = getDatabase(process.env.DATABASE_URL ? {connectionString: process.env.DATABASE_URL} : undefined).pool;
    Object.assign(pool.options, {max: 2, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, statement_timeout: 8000, query_timeout: 10000});
    pool.on('error', () => {}); // Never log connection strings or database errors to public responses.
    store = postgresStore(pool);
  }
  return store;
}

export function createHandler({env = process.env, getStore = productionStore} = {}) {
  return async function handler(request, context = {}) {
    const url = new URL(request.url);
    // The function's direct platform URL supports the same paths as the /api rewrite.
    url.pathname = url.pathname.replace(/^\/\.netlify\/functions\/api(?:\/|$)/, '/api/');
    let alerts;
    try { alerts = getStore(); } catch {}
    if (alerts && url.pathname === '/api/config' && request.method === 'GET') {
      try { if (!await alerts.health()) alerts = undefined; } catch { alerts = undefined; }
    }
    const runtime = {...env, ALERT_STORE: alerts};
    const deploymentContext = context.deploy?.context || env.CONTEXT;
    if ((deploymentContext && deploymentContext !== 'production') || context.deploy?.published === false) runtime.LIVE_ALERTS_ENABLED = 'false';
    if (url.pathname === '/api/health' && request.method === 'GET') {
      let connected = false;
      try { connected = !!alerts && await alerts.health(); } catch {}
      return Response.json({backend: true, storage: connected ? 'ready' : 'unavailable', messaging: runtime.LIVE_ALERTS_ENABLED === 'true' ? 'requires-provider-validation' : 'disabled'}, {status: connected ? 200 : 503, headers: {'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
    }
    const response = await corsApi(new Request(url, request), runtime);
    response.headers.set('Netlify-CDN-Cache-Control', 'no-store');
    return response;
  };
}

export default createHandler();
export const config = {rateLimit: {windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain']}};
