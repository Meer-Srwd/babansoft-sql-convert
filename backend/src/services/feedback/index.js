const SUPPORTED_FEEDBACK_CATEGORIES = ['general', 'bug', 'feature', 'ux', 'pricing', 'support'];

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw createHttpError(500, `${name} is not configured.`);
  }

  return value;
}

function getSupabaseConfig() {
  return {
    url: getRequiredEnv('SUPABASE_URL'),
    serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  };
}

function buildSupabaseHeaders({ hasBody = false, extraHeaders = {} } = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extraHeaders
  };

  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

async function supabaseRequest(path, { method = 'GET', body, extraHeaders = {} } = {}) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: buildSupabaseHeaders({
      hasBody: body !== undefined,
      extraHeaders
    }),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.message || data.error || 'Supabase request failed.';
    throw createHttpError(response.status, message);
  }

  return data;
}

async function insertRecord(table, payload) {
  const data = await supabaseRequest(`/rest/v1/${table}`, {
    method: 'POST',
    extraHeaders: {
      Prefer: 'return=representation'
    },
    body: payload
  });

  return Array.isArray(data) ? data[0] ?? null : data;
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeCategory(value) {
  const category = String(value ?? 'general').trim().toLowerCase();

  if (!SUPPORTED_FEEDBACK_CATEGORIES.includes(category)) {
    throw createHttpError(400, 'Please choose a valid feedback type.');
  }

  return category;
}

function normalizePage(value) {
  const page = normalizeText(value);
  return page ? page.slice(0, 80) : null;
}

function validateFeedback({ fullName, email, message, accountId }) {
  if (!message || message.length < 12) {
    throw createHttpError(400, 'Please enter a longer message so we can understand the issue.');
  }

  if (accountId) {
    return;
  }

  if (fullName.length < 2) {
    throw createHttpError(400, 'Please enter your name.');
  }

  if (!email || !email.includes('@')) {
    throw createHttpError(400, 'Please enter a valid email address.');
  }
}

export async function submitFeedback({
  account = null,
  fullName = '',
  email = '',
  category = 'general',
  message = '',
  page = ''
} = {}) {
  const resolvedFullName = normalizeText(fullName) || normalizeText(account?.fullName);
  const resolvedEmail = normalizeEmail(email) || normalizeEmail(account?.email);
  const resolvedMessage = String(message ?? '').trim();

  validateFeedback({
    fullName: resolvedFullName,
    email: resolvedEmail,
    message: resolvedMessage,
    accountId: account?.id ?? ''
  });

  try {
    const entry = await insertRecord('feedback_entries', {
      user_id: account?.id ?? null,
      reporter_name: resolvedFullName || null,
      reporter_email: resolvedEmail || null,
      category: normalizeCategory(category),
      message: resolvedMessage,
      page: normalizePage(page),
      status: 'new'
    });

    return {
      id: entry?.id ?? '',
      createdAt: entry?.created_at ?? new Date().toISOString()
    };
  } catch (error) {
    if (/feedback_entries|reporter_name|reporter_email|column|relation/i.test(String(error.message ?? ''))) {
      throw createHttpError(503, 'Feedback is temporarily unavailable. Please try again later.');
    }

    throw error;
  }
}