function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
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

      try {
        const existingData = await env.KV_STORE.get(`user_${userId}`);
        if (existingData) {
          return new Response(JSON.stringify({ error: 'User already exists' }), {
            status: 409,
            headers,
          });
        }

        const userData = {
          userId,
          name,
          password_hash: simpleHash(password),
          sentences: [],
          history: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await env.KV_STORE.put(`user_${userId}`, JSON.stringify(userData));
        return new Response(JSON.stringify({
          userId,
          name,
          sentences: [],
          history: [],
          updated_at: userData.updated_at,
        }), { status: 201, headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: '注册失败' }), {
          status: 500,
          headers,
        });
      }
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

      try {
        const existingData = await env.KV_STORE.get(`user_${userId}`);
        const existing = existingData ? JSON.parse(existingData) : null;

        if (!existing) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers,
          });
        }

        const passwordHash = simpleHash(password);
        if (existing.password_hash !== passwordHash) {
          return new Response(JSON.stringify({ error: 'Invalid password' }), {
            status: 401,
            headers,
          });
        }

        return new Response(JSON.stringify({
          userId,
          name: existing.name || userId,
          sentences: existing.sentences || [],
          history: existing.history || [],
          updated_at: existing.updated_at || null,
        }), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: '登陆失败' }), {
          status: 500,
          headers,
        });
      }
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

      try {
        const existingData = await env.KV_STORE.get(`user_${userId}`);
        const existing = existingData ? JSON.parse(existingData) : null;

        if (!existing) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers,
          });
        }

        const oldPasswordHash = simpleHash(oldPassword);
        if (existing.password_hash !== oldPasswordHash) {
          return new Response(JSON.stringify({ error: 'Old password incorrect' }), {
            status: 401,
            headers,
          });
        }

        existing.password_hash = simpleHash(newPassword);
        existing.updated_at = new Date().toISOString();
        await env.KV_STORE.put(`user_${userId}`, JSON.stringify(existing));

        return new Response(JSON.stringify({
          ok: true,
          userId,
          message: 'Password reset successfully',
        }), { status: 200, headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: '重置失败' }), {
          status: 500,
          headers,
        });
      }
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers,
  });
}
