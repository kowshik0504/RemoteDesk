import express from 'express';
import authRoutes from './routes/authRoutes.ts';
import ticketRoutes from './routes/ticketRoutes.ts';
import adminAndActivityRoutes from './routes/adminAndActivityRoutes.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { registerTicketEventHandlers } from './events/ticketEventHandlers.ts';

export function createApiApp(): express.Express {
  registerTicketEventHandlers();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Baseline security headers (avoid X-Frame-Options to preserve preview iframe compatibility)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'resolvedesk-api' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api', adminAndActivityRoutes);

  // Unknown API route 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'API endpoint not found.',
      code: 'ENDPOINT_NOT_FOUND',
    });
  });

  app.use(errorHandler);
  return app;
}
