export async function convertSql(payload) {
  const response = await fetch('/api/convert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({ error: 'Conversion failed.' }));

  if (!response.ok) {
    throw new Error(data.error || 'Conversion failed.');
  }

  return data;
}
