import { UserRegistry } from '../durable_objects/UserRegistry.js';

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

  // Get or create singleton Durable Object for user registry
  let userRegistry = null;
  try {
    if (env.USER_REGISTRY) {
      userRegistry = env.USER_REGISTRY.get('default');
    }
  } catch (e) {
    // Durable Object not available, will use fallback
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

  // 注册
  if (pathname === '/api/user-data/register') {
    if (request.method === 'POST') {
      const body = await request.json();
      const { userId, password, name } = body;

      if (!userId || !password || !name) {
        return new Response(JSON.stringify({ error: 'Missing userId, password or name' }), {
          status: 400,
          headers,
        });
      }

      if (userRegistry) {
        try {
          const result = await userRegistry.registerUser(userId, name, password);
          if (result.error) {
            return new Response(JSON.stringify({ error: result.error }), {
              status: result.error === 'User already exists' ? 409 : 400,
              headers,
            });
          }
          return new Response(JSON.stringify(result), { status: 201, headers });
        } catch (e) {
          console.error('Durable Object error:', e);
        }
      }

      return new Response(JSON.stringify({ error: '注册失败' }), {
        status: 500,
        headers,
      });
    }
  }

  // 登陆
  if (pathname === '/api/user-data/login') {
    if (request.method === 'POST') {
      const body = await request.json();
      const { userId, password } = body;

      if (!userId || !password) {
        return new Response(JSON.stringify({ error: 'Missing userId or password' }), {
          status: 400,
          headers,
        });
      }

      if (userRegistry) {
        try {
          const result = await userRegistry.loginUser(userId, password);
          if (result.error) {
            const status = result.error === 'User not found' ? 404 : 401;
            return new Response(JSON.stringify({ error: result.error }), {
              status,
              headers,
            });
          }
          return new Response(JSON.stringify(result), { status: 200, headers });
        } catch (e) {
          console.error('Durable Object error:', e);
        }
      }

      return new Response(JSON.stringify({ error: '登陆失败' }), {
        status: 500,
        headers,
      });
    }
  }

  // 重置密码
  if (pathname === '/api/user-data/reset-password') {
    if (request.method === 'POST') {
      const body = await request.json();
      const { userId, oldPassword, newPassword } = body;

      if (!userId || !oldPassword || !newPassword) {
        return new Response(JSON.stringify({ error: 'Missing userId, oldPassword or newPassword' }), {
          status: 400,
          headers,
        });
      }

      if (userRegistry) {
        try {
          const result = await userRegistry.resetPassword(userId, oldPassword, newPassword);
          if (result.error) {
            const status = result.error === 'User not found' ? 404 : 401;
            return new Response(JSON.stringify({ error: result.error }), {
              status,
              headers,
            });
          }
          return new Response(JSON.stringify(result), { status: 200, headers });
        } catch (e) {
          console.error('Durable Object error:', e);
        }
      }

      return new Response(JSON.stringify({ error: '重置失败' }), {
        status: 500,
        headers,
      });
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

      if (userRegistry) {
        try {
          const result = await userRegistry.syncUser(userId, password);
          if (result.error) {
            return new Response(JSON.stringify({ error: result.error }), {
              status: 401,
              headers,
            });
          }
          return new Response(JSON.stringify(result), { status: 200, headers });
        } catch (e) {
          console.error('Durable Object error:', e);
        }
      }

      return new Response(JSON.stringify({ error: '同步失败' }), {
        status: 500,
        headers,
      });
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

      if (userRegistry) {
        try {
          const result = await userRegistry.upsertUser(userId, password, sentences, history);
          if (result.error) {
            return new Response(JSON.stringify({ error: result.error }), {
              status: 401,
              headers,
            });
          }
          return new Response(JSON.stringify(result), { status: 200, headers });
        } catch (e) {
          console.error('Durable Object error:', e);
        }
      }

      return new Response(JSON.stringify({ error: '更新失败' }), {
        status: 500,
        headers,
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers,
  });
}
