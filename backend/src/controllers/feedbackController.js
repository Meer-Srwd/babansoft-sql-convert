import { getAccount } from '../services/auth/index.js';
import { submitFeedback } from '../services/feedback/index.js';

function getOptionalBearerToken(request) {
  const authorizationHeader = request.get('authorization') ?? '';

  if (!authorizationHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return authorizationHeader.slice(7).trim();
}

export async function submitFeedbackController(request, response, next) {
  try {
    const token = getOptionalBearerToken(request);
    let account = null;

    if (token) {
      try {
        account = await getAccount(token);
      } catch (_error) {
        account = null;
      }
    }

    const entry = await submitFeedback({
      ...(request.body ?? {}),
      account
    });

    response.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
}