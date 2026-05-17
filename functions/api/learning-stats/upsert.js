export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
      headers: { 'Content-Type': 'application/json' },
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

  return new Response(JSON.stringify(current), {
    headers: { 'Content-Type': 'application/json' },
  });
}
