function sanitizePublicError(message) {
  const value = String(message ?? '').trim();

  if (!value || /request failed/i.test(value)) {
    return 'We could not complete that request right now.';
  }

  if (/sorani is available|saved on this device|language update/i.test(value)) {
    return 'This language is saved on this device for now.';
  }

  if (/supabase|schema|database|table|constraint|column|rest\/v1|grant_type/i.test(value)) {
    return 'We could not complete that request right now.';
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
    throw new Error('Connection failed. Please try again.');
  }

  if (response.status === 204) {
    return {};
  }

  const data = await response.json().catch(() => ({ error: 'Request failed.' }));

  if (!response.ok) {
    throw new Error(sanitizePublicError(data.error || 'Request failed.'));
  }

  return data;
}

export function registerAccount(payload) {
  return requestJson('/api/auth/register', {
    method: 'POST',
    body: payload
  });
}

export function loginAccount(payload) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: payload
  });
}

export function refreshAccountSession(payload) {
  return requestJson('/api/auth/refresh', {
    method: 'POST',
    body: payload
  });
}

export function requestAccountPasswordReset(payload) {
  return requestJson('/api/auth/forgot-password', {
    method: 'POST',
    body: payload
  });
}

export function resendAccountConfirmation(payload) {
  return requestJson('/api/auth/resend-confirmation', {
    method: 'POST',
    body: payload
  });
}

export function resetAccountPassword(token, payload) {
  return requestJson('/api/auth/reset-password', {
    method: 'POST',
    token,
    body: payload
  });
}

export function logoutAccount(token) {
  return requestJson('/api/auth/logout', {
    method: 'POST',
    token
  });
}

export function getAccount(token) {
  return requestJson('/api/account/me', {
    token
  });
}

export function updateAccountProfile(token, payload) {
  return requestJson('/api/account/profile', {
    method: 'PATCH',
    token,
    body: payload
  });
}

export function updateAccountSettings(token, payload) {
  return requestJson('/api/account/settings', {
    method: 'PATCH',
    token,
    body: payload
  });
}

export function deleteAccount(token) {
  return requestJson('/api/account', {
    method: 'DELETE',
    token
  });
}