import { NotificationService } from '../notification.service.js';
import { emitToUser } from '../../../infrastructure/websocket/socket.js';

jest.mock('../../../infrastructure/websocket/socket.js', () => ({ emitToUser: jest.fn() }));

describe('NotificationService', () => {
  it('emits only a safe persisted notification payload', () => {
    NotificationService.emitCommittedNotification({
      id: 'n1', userId: 'u1', type: 'TRANSFER_ACCEPTED', title: 'Accepted', message: 'Done',
      createdAt: new Date('2026-01-01T00:00:00.000Z'), readAt: null
    });
    expect(emitToUser).toHaveBeenCalledWith('u1', 'notification.created', {
      notification: { id: 'n1', type: 'TRANSFER_ACCEPTED', title: 'Accepted', message: 'Done', createdAt: '2026-01-01T00:00:00.000Z', readAt: null }
    });
  });
});
