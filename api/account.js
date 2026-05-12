import { handleExpressPath } from './_lib/expressHandler.js';

const accountHandlers = {
  root: handleExpressPath('/account'),
  me: handleExpressPath('/account/me'),
  profile: handleExpressPath('/account/profile'),
  settings: handleExpressPath('/account/settings')
};

export default async function handler(request, response) {
  const incomingUrl = new URL(request.url ?? '/', 'https://babansoft-sql-convert.vercel.app');
  const routeKey = incomingUrl.searchParams.get('route') ?? 'root';
  const routeHandler = accountHandlers[routeKey];

  if (!routeHandler) {
    response.statusCode = 404;
    response.end();
    return;
  }

  incomingUrl.searchParams.delete('route');
  request.url = `${incomingUrl.pathname}${incomingUrl.search}`;

  return routeHandler(request, response);
}