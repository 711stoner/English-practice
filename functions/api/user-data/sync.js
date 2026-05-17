import crypto from 'crypto';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const { userId, password } = body;

  if (!userId || !password) {
    return new Response(JSON.stringify({ error: 'Missing userId or password' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existingData = await env.STORE.get(`user_${userId}`);
  const existing = existingData ? JSON.parse(existingData) : null;
  const passwordHash = hashPassword(password);

  if (existing && existing.password_hash !== passwordHash) {
    return new Response(JSON.stringify({ error: 'Invalid userId or password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
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
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    userId,
    sentences: existing.sentences || [],
    history: existing.history || [],
    updated_at: existing.updated_at || null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
