function sanitizeFeedbackError(message) {
  const value = String(message ?? '').trim();

  if (!value || /request failed/i.test(value)) {
    return 'We could not send your feedback right now. Please try again later.';
  }

  if (/database|schema|table|supabase/i.test(value)) {
    return 'Feedback is temporarily unavailable. Please try again later.';
  }

  return value;
}

async function requestJson(path, { method = 'GET', token = '', body } = {}) {
  const headers = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('We could not send your feedback right now. Please try again later.');
  }

  const data = await response.json().catch(() => ({ error: 'Request failed.' }));

  if (!response.ok) {
    throw new Error(sanitizeFeedbackError(data.error || 'Request failed.'));
  }

  return data;
}

export function submitFeedback(payload, token = '') {
  return requestJson('/api/feedback', {
    method: 'POST',
    token,
    body: payload
  });
}