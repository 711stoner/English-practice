export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await env.STORE.get('learning_stats');
  if (!data) {
    return new Response(JSON.stringify({
      version: 1,
      records: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(data, {
    headers: { 'Content-Type': 'application/json' },
  });
}
