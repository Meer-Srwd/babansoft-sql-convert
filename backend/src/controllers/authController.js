import {
  deleteAccount,
  getAccount,
  loginAccount,
  logoutAccount,
  requestAccountPasswordReset,
  refreshAccountSession,
  registerAccount,
  resendAccountConfirmation,
  resetAccountPassword,
  updateAccountProfile,
  updateAccountSettings
} from '../services/auth/index.js';

function getBearerToken(request) {
  const authorizationHeader = request.get('authorization') ?? '';

  if (!authorizationHeader.toLowerCase().startsWith('bearer ')) {
    const error = new Error('Authentication is required.');
    error.status = 401;
    throw error;
  }

  return authorizationHeader.slice(7).trim();
}

function buildAuthRedirect(request, authState) {
  const origin = String(request.get('origin') ?? process.env.PUBLIC_APP_URL ?? process.env.APP_URL ?? '').trim();

  if (!origin) {
    return '';
  }

  try {
    const url = new URL(origin);
    url.searchParams.set('auth', authState);
    return url.toString();
  } catch {
    return '';
  }
}

export async function registerController(request, response, next) {
  try {
    const result = await registerAccount({
      ...(request.body ?? {}),
      redirectTo: buildAuthRedirect(request, 'confirm')
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function loginController(request, response, next) {
  try {
    const result = await loginAccount(request.body ?? {});
    response.json(result);
  } catch (error) {
    next(error);
  }
}

export async function refreshController(request, response, next) {
  try {
    const result = await refreshAccountSession(request.body ?? {});
    response.json(result);
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordController(request, response, next) {
  try {
    const result = await requestAccountPasswordReset({
      ...(request.body ?? {}),
      redirectTo: buildAuthRedirect(request, 'reset-password')
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
}

export async function resendConfirmationController(request, response, next) {
  try {
    const result = await resendAccountConfirmation({
      ...(request.body ?? {}),
      redirectTo: buildAuthRedirect(request, 'confirm')
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordController(request, response, next) {
  try {
    const result = await resetAccountPassword(getBearerToken(request), request.body ?? {});
    response.json(result);
  } catch (error) {
    next(error);
  }
}

export async function accountController(request, response, next) {
  try {
    const account = await getAccount(getBearerToken(request));
    response.json({ account });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(request, response, next) {
  try {
    await logoutAccount(getBearerToken(request));
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function updateAccountProfileController(request, response, next) {
  try {
    const account = await updateAccountProfile(getBearerToken(request), request.body ?? {});
    response.json({ account });
  } catch (error) {
    next(error);
  }
}

export async function updateAccountSettingsController(request, response, next) {
  try {
    const account = await updateAccountSettings(getBearerToken(request), request.body ?? {});
    response.json({ account });
  } catch (error) {
    next(error);
  }
}

export async function deleteAccountController(request, response, next) {
  try {
    const result = await deleteAccount(getBearerToken(request));
    response.json(result);
  } catch (error) {
    next(error);
  }
}