import {
  SUPPORTED_LANGUAGE_CODES,
  SUPPORTED_THEMES,
  createDefaultSettings
} from './constants.js';

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw createHttpError(500, 'The account service is not ready right now.');
  }

  return value;
}

function getSupabaseConfig() {
  return {
    url: getRequiredEnv('SUPABASE_URL'),
    anonKey: getRequiredEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  };
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function normalizeFullName(fullName) {
  return String(fullName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeRedirectTo(redirectTo) {
  const value = String(redirectTo ?? '').trim();

  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Unsupported redirect protocol.');
    }

    return url.toString();
  } catch {
    throw createHttpError(400, 'This account link is not available right now.');
  }
}

function validateProfileInput({ fullName, email }) {
  if (fullName.length < 2) {
    throw createHttpError(400, 'Full name must be at least 2 characters long.');
  }

  if (!email || !email.includes('@')) {
    throw createHttpError(400, 'A valid email address is required.');
  }
}

function validatePasswordInput(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw createHttpError(400, 'Password must be at least 8 characters long.');
  }
}

function getRedirectHeaders(redirectTo) {
  const value = normalizeRedirectTo(redirectTo);

  return value
    ? {
        redirect_to: value
      }
    : {};
}

function buildSupabaseHeaders({ useServiceRole = false, accessToken = '', extraHeaders = {}, hasBody = false } = {}) {
  const { anonKey, serviceRoleKey } = getSupabaseConfig();
  const apiKey = useServiceRole ? serviceRoleKey : anonKey;
  const headers = {
    apikey: apiKey,
    ...extraHeaders
  };

  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (useServiceRole) {
    headers.Authorization = `Bearer ${serviceRoleKey}`;
  }

  return headers;
}

async function supabaseRequest(path, { method = 'GET', body, useServiceRole = false, accessToken = '', extraHeaders = {} } = {}) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: buildSupabaseHeaders({
      useServiceRole,
      accessToken,
      extraHeaders,
      hasBody: body !== undefined
    }),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.msg || data.message || data.error_description || data.error || 'Supabase request failed.';
    throw createHttpError(response.status, message);
  }

  return data;
}

function normalizeAuthError(error) {
  const message = String(error.message ?? 'Authentication failed.');

  if (/already/i.test(message) && /registered|exists/i.test(message)) {
    return createHttpError(409, 'An account with that email already exists.');
  }

  if (/invalid login credentials/i.test(message)) {
    return createHttpError(401, 'Invalid email or password.');
  }

  if (/email.*confirmed/i.test(message)) {
    return createHttpError(401, 'Please confirm your email address before signing in.');
  }

  if (/password/i.test(message) && /least|weak|strength/i.test(message)) {
    return createHttpError(400, 'Choose a stronger password and try again.');
  }

  if (error.status === 429 || /rate limit/i.test(message)) {
    return createHttpError(429, 'Please wait a moment and try again.');
  }

  if (/redirect/i.test(message) || /not available|not configured/i.test(message)) {
    return createHttpError(503, 'The account service is not ready right now.');
  }

  if (error.status === 401 && /jwt|token|session/i.test(message)) {
    return createHttpError(401, 'Your session has expired. Please sign in again.');
  }

  if ((error.status ?? 500) >= 500) {
    return createHttpError(503, 'The account service is not ready right now.');
  }

  return createHttpError(error.status ?? 400, 'We could not complete that request right now.');
}

function normalizeRecoveryError(error) {
  const message = String(error.message ?? 'Password reset failed.');

  if (/jwt|token|session|expired|invalid/i.test(message)) {
    return createHttpError(401, 'This password reset link has expired. Please request a new one.');
  }

  return normalizeAuthError(error);
}

function buildFilterQuery(select, filters) {
  const params = new URLSearchParams();
  params.set('select', select);

  Object.entries(filters).forEach(([key, value]) => {
    params.set(key, `eq.${value}`);
  });

  return params.toString();
}

async function fetchSingleRecord(table, filters, select = '*') {
  const query = buildFilterQuery(select, filters);
  const data = await supabaseRequest(`/rest/v1/${table}?${query}`, {
    useServiceRole: true
  });

  return Array.isArray(data) ? data[0] ?? null : null;
}

async function insertRecord(table, payload) {
  const data = await supabaseRequest(`/rest/v1/${table}`, {
    method: 'POST',
    useServiceRole: true,
    extraHeaders: {
      Prefer: 'return=representation'
    },
    body: payload
  });

  return Array.isArray(data) ? data[0] ?? null : data;
}

async function updateRecord(table, filters, payload) {
  const query = buildFilterQuery('*', filters);
  const data = await supabaseRequest(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    useServiceRole: true,
    extraHeaders: {
      Prefer: 'return=representation'
    },
    body: payload
  });

  return Array.isArray(data) ? data[0] ?? null : data;
}

async function deleteRecord(table, filters) {
  const query = buildFilterQuery('*', filters);

  await supabaseRequest(`/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    useServiceRole: true,
    extraHeaders: {
      Prefer: 'return=minimal'
    }
  });
}

function getFallbackFullName(user) {
  const candidate = normalizeFullName(user?.user_metadata?.full_name);

  if (candidate) {
    return candidate;
  }

  return String(user?.email ?? 'User').split('@')[0];
}

async function ensureProfileAndSettings(user) {
  let profile = await fetchSingleRecord('profiles', { id: user.id });

  if (!profile) {
    profile = await insertRecord('profiles', {
      id: user.id,
      full_name: getFallbackFullName(user)
    });
  }

  let settings = await fetchSingleRecord('user_settings', { user_id: user.id });

  if (!settings) {
    settings = await insertRecord('user_settings', {
      user_id: user.id,
      ...createDefaultSettings()
    });
  }

  return { profile, settings };
}

function sanitizeAccount({ user, profile, settings, overrideEmail = '', overrideFullName = '' }) {
  return {
    id: user.id,
    fullName: overrideFullName || normalizeFullName(profile?.full_name || getFallbackFullName(user)),
    email: overrideEmail || normalizeEmail(user.email),
    settings: {
      theme: SUPPORTED_THEMES.includes(settings?.theme) ? settings.theme : createDefaultSettings().theme,
      language: SUPPORTED_LANGUAGE_CODES.includes(settings?.language)
        ? settings.language
        : createDefaultSettings().language
    },
    createdAt: profile?.created_at || user.created_at || new Date().toISOString(),
    updatedAt: settings?.updated_at || profile?.updated_at || user.updated_at || new Date().toISOString()
  };
}

async function signInWithPassword(email, password) {
  try {
    const data = await supabaseRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: {
        email,
        password
      }
    });

    if (!data.access_token || !data.user) {
      throw createHttpError(401, 'Invalid email or password.');
    }

    return data;
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

async function signUpWithPassword({ fullName, email, password, redirectTo = '' }) {
  try {
    return await supabaseRequest('/auth/v1/signup', {
      method: 'POST',
      extraHeaders: getRedirectHeaders(redirectTo),
      body: {
        email,
        password,
        data: {
          full_name: fullName
        }
      }
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

async function sendPasswordResetEmail(email, redirectTo = '') {
  try {
    await supabaseRequest('/auth/v1/recover', {
      method: 'POST',
      extraHeaders: getRedirectHeaders(redirectTo),
      body: {
        email
      }
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

async function resendConfirmationEmail(email, redirectTo = '') {
  try {
    await supabaseRequest('/auth/v1/resend', {
      method: 'POST',
      extraHeaders: getRedirectHeaders(redirectTo),
      body: {
        type: 'signup',
        email
      }
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

async function getSupabaseUser(accessToken) {
  try {
    return await supabaseRequest('/auth/v1/user', {
      accessToken
    });
  } catch (_error) {
    throw createHttpError(401, 'Your session is invalid or has expired.');
  }
}

async function resolveAuthenticatedContext(accessToken) {
  const user = await getSupabaseUser(accessToken);
  const { profile, settings } = await ensureProfileAndSettings(user);

  return {
    user,
    profile,
    settings,
    account: sanitizeAccount({ user, profile, settings })
  };
}

async function updateSupabaseUser(userId, payload) {
  try {
    return await supabaseRequest(`/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      useServiceRole: true,
      body: payload
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

async function updateAuthenticatedSupabaseUser(accessToken, payload) {
  try {
    return await supabaseRequest('/auth/v1/user', {
      method: 'PUT',
      accessToken,
      body: payload
    });
  } catch (error) {
    throw normalizeRecoveryError(error);
  }
}

async function deleteSupabaseUser(userId) {
  try {
    await supabaseRequest(`/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      useServiceRole: true
    });
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export async function registerAccount(payload) {
  const fullName = normalizeFullName(payload.fullName);
  const email = normalizeEmail(payload.email);
  const password = payload.password;
  const redirectTo = payload.redirectTo;

  validateProfileInput({ fullName, email });
  validatePasswordInput(password);

  const session = await signUpWithPassword({ fullName, email, password, redirectTo });

  if (!session?.access_token || !session?.user) {
    return {
      requiresEmailConfirmation: true,
      message: 'Check your email to confirm your account before signing in.'
    };
  }

  const { account } = await resolveAuthenticatedContext(session.access_token);

  return {
    token: session.access_token,
    refreshToken: session.refresh_token,
    account,
    requiresEmailConfirmation: false
  };
}

export async function loginAccount(payload) {
  const email = normalizeEmail(payload.email);
  const password = payload.password;

  if (!email || typeof password !== 'string') {
    throw createHttpError(400, 'Email and password are required.');
  }

  const session = await signInWithPassword(email, password);
  const { account } = await resolveAuthenticatedContext(session.access_token);

  return {
    token: session.access_token,
    refreshToken: session.refresh_token,
    account
  };
}

export async function refreshAccountSession(payload) {
  const refreshToken = String(payload.refreshToken ?? '').trim();

  if (!refreshToken) {
    throw createHttpError(400, 'Refresh token is required.');
  }

  try {
    const session = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: {
        refresh_token: refreshToken
      }
    });
    const { account } = await resolveAuthenticatedContext(session.access_token);

    return {
      token: session.access_token,
      refreshToken: session.refresh_token,
      account
    };
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

export async function getAccount(token) {
  const { account } = await resolveAuthenticatedContext(token);
  return account;
}

export async function logoutAccount(token) {
  try {
    await supabaseRequest('/auth/v1/logout', {
      method: 'POST',
      accessToken: token
    });
  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }
  }
}

export async function requestAccountPasswordReset(payload) {
  const email = normalizeEmail(payload.email);
  const redirectTo = payload.redirectTo;

  if (!email || !email.includes('@')) {
    throw createHttpError(400, 'A valid email address is required.');
  }

  try {
    await sendPasswordResetEmail(email, redirectTo);
  } catch (error) {
    if ((error.status ?? 500) >= 500) {
      throw error;
    }
  }

  return {
    message: 'If that email is registered, we sent a password reset link.'
  };
}

export async function resendAccountConfirmation(payload) {
  const email = normalizeEmail(payload.email);
  const redirectTo = payload.redirectTo;

  if (!email || !email.includes('@')) {
    throw createHttpError(400, 'A valid email address is required.');
  }

  try {
    await resendConfirmationEmail(email, redirectTo);
  } catch (error) {
    if ((error.status ?? 500) >= 500) {
      throw error;
    }
  }

  return {
    message: 'If that account is waiting for confirmation, we sent a new email.'
  };
}

export async function resetAccountPassword(token, payload) {
  const password = payload.password;

  validatePasswordInput(password);

  const user = await updateAuthenticatedSupabaseUser(token, {
    password
  });
  const { profile, settings } = await ensureProfileAndSettings(user);

  return {
    account: sanitizeAccount({ user, profile, settings }),
    message: 'Your password has been updated.'
  };
}

export async function deleteAccount(token) {
  const { user } = await resolveAuthenticatedContext(token);

  await deleteSupabaseUser(user.id);

  try {
    await deleteRecord('profiles', { id: user.id });
  } catch {
    // The auth delete may already have cascaded related profile rows.
  }

  return {
    message: 'Your account has been deleted.'
  };
}

export async function updateAccountProfile(token, payload) {
  const fullName = normalizeFullName(payload.fullName);
  const email = normalizeEmail(payload.email);

  validateProfileInput({ fullName, email });

  const { user, settings } = await resolveAuthenticatedContext(token);

  await updateSupabaseUser(user.id, {
    email,
    user_metadata: {
      ...(user.user_metadata ?? {}),
      full_name: fullName
    }
  });

  const profile =
    (await updateRecord('profiles', { id: user.id }, { full_name: fullName })) ??
    (await fetchSingleRecord('profiles', { id: user.id }));

  return sanitizeAccount({
    user,
    profile,
    settings,
    overrideEmail: email,
    overrideFullName: fullName
  });
}

export async function updateAccountSettings(token, payload) {
  const { user, profile } = await resolveAuthenticatedContext(token);
  const nextTheme = payload.theme ?? createDefaultSettings().theme;
  const nextLanguage = payload.language ?? createDefaultSettings().language;

  if (!SUPPORTED_THEMES.includes(nextTheme)) {
    throw createHttpError(400, 'Theme is not supported.');
  }

  if (!SUPPORTED_LANGUAGE_CODES.includes(nextLanguage)) {
    throw createHttpError(400, 'Language is not supported.');
  }

  let settings;

  try {
    settings =
      (await updateRecord('user_settings', { user_id: user.id }, { theme: nextTheme, language: nextLanguage })) ??
      (await fetchSingleRecord('user_settings', { user_id: user.id }));
  } catch (error) {
    if (/user_settings_language_check/i.test(String(error.message ?? ''))) {
      throw createHttpError(409, 'Sorani is saved on this device for now and will sync to your account later.');
    }

    throw error;
  }

  return sanitizeAccount({ user, profile, settings });
}