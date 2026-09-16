import { useEffect, useState } from 'react';
import { api } from './api';
import { connectSocket } from './socket';

export type Notification = {
  id: string; type: string; title: string; message: string; readAt: string | null; createdAt: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let mounted = true;
    void api.get('/notifications?limit=50').then(response => {
      if (mounted) setNotifications(response.data.data);
    }).catch(() => undefined);

    const socket = connectSocket();
    if (!socket) return () => { mounted = false; };
    const onCreated = (payload: { notification: Notification }) => {
      setNotifications(current => [payload.notification, ...current.filter(item => item.id !== payload.notification.id)].slice(0, 50));
    };
    const onRead = (payload: { notificationId: string; readAt: string | null }) => {
      setNotifications(current => current.map(item => item.id === payload.notificationId ? { ...item, readAt: payload.readAt } : item));
    };
    socket.on('notification.created', onCreated);
    socket.on('notification.read', onRead);
    return () => { mounted = false; socket.off('notification.created', onCreated); socket.off('notification.read', onRead); };
  }, []);

  const markRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
  };

  return { notifications, unreadCount: notifications.filter(item => !item.readAt).length, markRead };
}
