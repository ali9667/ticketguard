import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectSocket = () => {
  const token = localStorage.getItem('tg_access');
  if (!token) return null;
  if (socket?.connected) return socket;
  socket ??= io(import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace(/\/api\/v1$/, ''), {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: { token },
    autoConnect: false
  });
  socket.auth = { token };
  socket.connect();
  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const getSocket = () => socket;
