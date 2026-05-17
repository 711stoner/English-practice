import crypto from 'crypto';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  // Learning Stats
  if (pathname === '/api/learning-stats') {
    if (request.method === 'GET') {
      const data = await env.STORE.get('learning_stats');
      if (!data) {
        return new Response(JSON.stringify({
          version: 1,
          records: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }), { status: 200, headers });
      }
      return new Response(data, { status: 200, headers });
    }
  }

  if (pathname === '/api/learning-stats/upsert') {
    if (request.method === 'POST') {
      const body = await request.json();
      const current = JSON.parse(await env.STORE.get('learning_stats') || JSON.stringify({
        version: 1,
        records: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { date, ...record } = body;
      const normalizedDate = String(date || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, d) => `${y.slice(2)}${mo}${d}`);

      if (!normalizedDate || !/^\d{6}$/.test(normalizedDate)) {
        return new Response(JSON.stringify({ error: 'Invalid date' }), {
          status: 400,
          headers,
        });
      }

      const idx = (current.records || []).findIndex(r => r.date === normalizedDate);
      if (idx >= 0) {
        current.records[idx] = {
          date: normalizedDate,
          ...current.records[idx],
          ...record,
          updated_at: new Date().toISOString(),
        };
      } else {
        current.records.push({
          date: normalizedDate,
          ...record,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      current.updated_at = new Date().toISOString();
      await env.STORE.put('learning_stats', JSON.stringify(current));

      return new Response(JSON.stringify(current), { status: 200, headers });
    }
  }

  // User Data
  if (pathname === '/api/user-data') {
    if (request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers,
        });
      }

      const userData = JSON.parse(await env.STORE.get(`user_${userId}`) || '{}');
      return new Response(JSON.stringify({
        userId,
        sentences: userData.sentences || [],
        history: userData.history || [],
        updated_at: userData.updated_at || null,
      }), { status: 200, headers });
    }
  }

  if (pathname === '/api/user-data/sync') {
    if (request.method === 'POST') {
      const body = await request.json();
      const { userId, password } = body;

      if (!userId || !password) {
        return new Response(JSON.stringify({ error: 'Missing userId or password' }), {
          status: 400,
          headers,
        });
      }

      const existingData = await env.STORE.get(`user_${userId}`);
      const existing = existingData ? JSON.parse(existingData) : null;
      const passwordHash = hashPassword(password);

      if (existing && existing.password_hash !== passwordHash) {
        return new Response(JSON.stringify({ error: 'Invalid userId or password' }), {
          status: 401,
          headers,
        });
      }

      if (!existing) {
        const userData = {
          userId,
          password_hash: passwordHash,
          sentences: [],
          history: [],
          updated_at: new Date().toISOString(),
        };
        await env.STORE.put(`user_${userId}`, JSON.stringify(userData));
        return new Response(JSON.stringify({
          userId,
          sentences: [],
          history: [],
          updated_at: userData.updated_at,
        }), { status: 200, headers });
      }

      return new Response(JSON.stringify({
        userId,
        sentences: existing.sentences || [],
        history: existing.history || [],
        updated_at: existing.updated_at || null,
      }), { status: 200, headers });
    }
  }

  if (pathname === '/api/user-data/upsert') {
    if (request.method === 'POST') {
      const body = await request.json();
      const { userId, password, sentences, history } = body;

      if (!userId || !password) {
        return new Response(JSON.stringify({ error: 'Missing userId or password' }), {
          status: 400,
          headers,
        });
      }

      const existingData = await env.STORE.get(`user_${userId}`);
      const existing = existingData ? JSON.parse(existingData) : null;
      const passwordHash = hashPassword(password);

      if (existing && existing.password_hash !== passwordHash) {
        return new Response(JSON.stringify({ error: 'Invalid userId or password' }), {
          status: 401,
          headers,
        });
      }

      const userData = {
        userId,
        password_hash: existing?.password_hash || passwordHash,
        sentences: sentences || existing?.sentences || [],
        history: (history || existing?.history || []).slice(0, 365),
        updated_at: new Date().toISOString(),
      };

      await env.STORE.put(`user_${userId}`, JSON.stringify(userData));

      return new Response(JSON.stringify({
        ok: true,
        userId,
        updated_at: userData.updated_at,
      }), { status: 200, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers,
  });
}
