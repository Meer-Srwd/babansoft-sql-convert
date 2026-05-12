import { handleExpressPath } from './_lib/expressHandler.js';

const authHandlers = {
  register: handleExpressPath('/auth/register'),
  login: handleExpressPath('/auth/login'),
  refresh: handleExpressPath('/auth/refresh'),
  'forgot-password': handleExpressPath('/auth/forgot-password'),
  'resend-confirmation': handleExpressPath('/auth/resend-confirmation'),
  'reset-password': handleExpressPath('/auth/reset-password'),
  logout: handleExpressPath('/auth/logout')
};

export default async function handler(request, response) {
  const incomingUrl = new URL(request.url ?? '/', 'https://babansoft-sql-convert.vercel.app');
  const routeKey = incomingUrl.searchParams.get('route') ?? '';
  const routeHandler = authHandlers[routeKey];

  if (!routeHandler) {
    response.statusCode = 404;
    response.end();
    return;
  }

  incomingUrl.searchParams.delete('route');
  request.url = `${incomingUrl.pathname}${incomingUrl.search}`;

  return routeHandler(request, response);
}