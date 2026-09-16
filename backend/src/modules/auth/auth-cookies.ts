import { serialize, parse } from 'cookie';
import { env } from '../../config/env.js';

const COOKIE_NAME = 'ticketguard_refresh';
const isProduction = env.NODE_ENV === 'production';

export const setRefreshCookie = (res: { append(name: string, value: string): unknown }, token: string, maxAgeSeconds: number) => {
  res.append('Set-Cookie', serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: maxAgeSeconds
  }));
};

export const clearRefreshCookie = (res: { append(name: string, value: string): unknown }) => {
  res.append('Set-Cookie', serialize(COOKIE_NAME, '', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', path: '/api/v1/auth', maxAge: 0 }));
};

export const getRefreshCookie = (cookieHeader: string | undefined) => cookieHeader ? parse(cookieHeader)[COOKIE_NAME] : undefined;
