export async function apiGet(path) {
  const res = await fetch(path, { headers: { 'Accept': 'application/json' } });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error('API_ERROR');
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error('API_ERROR');
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
