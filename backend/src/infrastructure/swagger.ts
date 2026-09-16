import { env } from '../config/env.js';

const jsonBody = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object', properties, required } } }
});

export const swaggerSpec = {
  openapi: '3.0.3',
  info: { title: 'TicketGuard API', version: '1.0.0', description: 'Verified ownership. Secure transfer. One valid ticket.' },
  servers: [{ url: `${env.API_URL}/api/v1` }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, refreshCookie: { type: 'apiKey', in: 'cookie', name: 'ticketguard_refresh' } },
    schemas: {
      Error: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' }, requestId: { type: 'string' } } },
      TicketCredential: { type: 'string', example: 'tg1.<identifier>.<secret>' }
    }
  },
  paths: {
    '/health': { get: { summary: 'Liveness check', responses: { '200': { description: 'Service is alive' } } } },
    '/health/ready': { get: { summary: 'Readiness check', responses: { '200': { description: 'Dependencies are ready' }, '503': { description: 'Dependency unavailable' } } } },
    '/auth/register': { post: { summary: 'Register', requestBody: jsonBody({ email: { type: 'string' }, password: { type: 'string' }, firstName: { type: 'string' }, lastName: { type: 'string' } }, ['email','password','firstName','lastName']), responses: { '201': { description: 'Registered' }, '409': { description: 'Email already exists' } } } },
    '/auth/login': { post: { summary: 'Login', requestBody: jsonBody({ email: { type: 'string' }, password: { type: 'string' } }, ['email','password']), responses: { '200': { description: 'Authenticated' }, '401': { description: 'Invalid credentials' } } } },
    '/auth/refresh': { post: { summary: 'Rotate refresh token', security: [{ refreshCookie: [] }], responses: { '200': { description: 'New access token and refresh cookie' }, '401': { description: 'Invalid refresh token' } } } },
    '/auth/logout': { post: { summary: 'Logout', security: [{ refreshCookie: [] }], responses: { '204': { description: 'Logged out' } } } },
    '/users/me': { get: { summary: 'Get current user', security: [{ bearerAuth: [] }], responses: { '200': { description: 'User profile' } } }, patch: { summary: 'Update current user', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated profile' } } } },
    '/events': { get: { summary: 'List published events', responses: { '200': { description: 'Events' } } }, post: { summary: 'Create event', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } } },
    '/orders': { get: { summary: 'List current user orders', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Orders' } } }, post: { summary: 'Create a pending checkout order', security: [{ bearerAuth: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: jsonBody({ items: { type: 'array', items: { type: 'object', properties: { ticketTypeId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['ticketTypeId', 'quantity'] } } }, ['items']), responses: { '201': { description: 'Pending order created' }, '409': { description: 'Inventory or event unavailable' } } } },
    '/orders/{id}': { get: { summary: 'Get current user order', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Order' }, '404': { description: 'Order not found' } } } },
    '/orders/{id}/pay': { post: { summary: 'Complete sandbox payment and issue tickets', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Payment confirmed and tickets issued' }, '409': { description: 'Order expired, invalid, or inventory changed' }, '402': { description: 'Payment failed' } } } },
    '/events/{id}': { get: { summary: 'Get event', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Event' } } } },
    '/events/{id}/publish': { post: { summary: 'Publish event', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Published' } } } },
    '/events/{id}/cancel': { post: { summary: 'Cancel event', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Cancelled' } } } },
    '/events/{id}/ticket-types': { post: { summary: 'Create ticket type', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '201': { description: 'Created' } } } },
    '/events/{id}/scanners': { post: { summary: 'Assign scanner', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '201': { description: 'Assigned' } } } },
    '/events/{eventId}/tickets': { post: { summary: 'Issue tickets', security: [{ bearerAuth: [] }], parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Tickets issued' }, '409': { description: 'Inventory conflict' } } } },
    '/tickets': { get: { summary: 'List owned tickets', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Tickets' } } } },
    '/tickets/{id}': { get: { summary: 'Get owned ticket', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Ticket' } } } },
    '/tickets/{id}/cancel': { post: { summary: 'Cancel ticket', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Cancelled' } } } },
    '/tickets/{id}/transfers': { post: { summary: 'Start ticket transfer', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Transfer started' } } } },
    '/transfers': { get: { summary: 'List transfers for current user', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Transfers' } } } },
    '/transfers/{id}': { get: { summary: 'Get transfer', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Transfer' } } } },
    '/transfers/{id}/accept': { post: { summary: 'Accept transfer', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Accepted' } } } },
    '/transfers/{id}/reject': { post: { summary: 'Reject transfer', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Rejected' } } } },
    '/transfers/{id}/cancel': { post: { summary: 'Cancel transfer', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Cancelled' } } } },
    '/verification/ticket': { post: { summary: 'Verify and check in ticket', security: [{ bearerAuth: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: jsonBody({ credential: { $ref: '#/components/schemas/TicketCredential' } }, ['credential']), responses: { '200': { description: 'Valid and checked in' }, '409': { description: 'Already used or not currently valid' } } } },
    '/notifications': { get: { summary: 'List notifications', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Notifications' } } } },
    '/notifications/{id}/read': { patch: { summary: 'Mark notification read', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Notification updated' } } } },
    '/admin/users': { get: { summary: 'List users', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Users' } } } },
    '/admin/audit-logs': { get: { summary: 'List audit logs', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Audit logs' } } } },
    '/admin/security-events': { get: { summary: 'List security events', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Security events' } } } }
  }
};

(swaggerSpec.paths as Record<string, unknown>)['/auth/change-password'] = {
  post: {
    summary: 'Change password and revoke active refresh sessions',
    security: [{ bearerAuth: [] }],
    requestBody: jsonBody({
      currentPassword: { type: 'string', format: 'password' },
      newPassword: { type: 'string', format: 'password', minLength: 12 }
    }, ['currentPassword', 'newPassword']),
    responses: { '204': { description: 'Password changed' }, '401': { description: 'Invalid current password' } }
  }
};
(swaggerSpec.paths as Record<string, unknown>)['/admin/users/{id}/status'] = {
  patch: {
    summary: 'Activate or suspend a user',
    security: [{ bearerAuth: [] }],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }],
    requestBody: jsonBody({ status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] } }, ['status']),
    responses: { '200': { description: 'User status updated' }, '403': { description: 'Forbidden' }, '409': { description: 'Invalid status transition' } }
  }
};
for (const [path, summary] of Object.entries({
  '/admin/events': 'List all events for administrators',
  '/admin/tickets': 'List tickets for administrators'
})) {
  (swaggerSpec.paths as Record<string, unknown>)[path] = { get: { summary, security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated resources' } } } };
}
