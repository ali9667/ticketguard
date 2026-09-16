import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pinoHttp = require('pino-http') as typeof import('pino-http').default;
import { env } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { eventRouter } from './modules/events/event.routes.js';
import { ticketRouter } from './modules/tickets/ticket.routes.js';
import { transferRouter } from './modules/transfers/transfer.routes.js';
import { verificationRouter } from './modules/verification/verification.routes.js';
import { notificationRouter } from './modules/notifications/notification.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { orderRouter } from './modules/orders/order.routes.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './infrastructure/swagger.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(requestId);
app.use(pinoHttp({ logger }));

app.get('/api/v1', (_req, res) => {
  res.status(200).json({ success: true, data: { name: 'TicketGuard API', version: 'v1' } });
});

app.use('/api/v1', healthRouter);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/events', eventRouter);
app.use('/api/v1/tickets', ticketRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1', transferRouter);
app.use('/api/v1/verification', verificationRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/admin', adminRouter);
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'RESOURCE_NOT_FOUND', message: 'Route not found.' },
    requestId: res.locals.requestId
  });
});
app.use(errorHandler);
