import express from 'express';
import { authRouter } from './routes/authRoutes.js';
import { convertRouter } from './routes/convertRoutes.js';
import { feedbackRouter } from './routes/feedbackRoutes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use(convertRouter);
  app.use(authRouter);
  app.use(feedbackRouter);

  app.use((error, _request, response, _next) => {
    const status = error.status ?? 500;
    response.status(status).json({
      error: error.message || 'Unexpected server error.'
    });
  });

  return app;
}
