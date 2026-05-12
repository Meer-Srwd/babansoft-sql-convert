let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = import('../../backend/src/app.js').then(({ createApp }) => createApp());
  }

  return appPromise;
}

export function handleExpressPath(routePath) {
  return async function handler(request, response) {
    const app = await getApp();
    const incomingUrl = new URL(request.url ?? '/', 'https://babansoft-sql-convert.vercel.app');
    request.url = `${routePath}${incomingUrl.search}`;
    return app(request, response);
  };
}