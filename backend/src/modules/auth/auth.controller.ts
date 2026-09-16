import type { RequestHandler } from 'express';
import { AuthService } from './auth.service.js';
import { AppError } from '../../utils/app-error.js';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from './auth-cookies.js';
import { env } from '../../config/env.js';

const ttlMatch = /^(\d+)([smhd])$/.exec(env.REFRESH_TOKEN_TTL);
const REFRESH_MAX_AGE = ttlMatch ? Number(ttlMatch[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 } as const)[ttlMatch[2] as 's'|'m'|'h'|'d'] : 604800;

export const register: RequestHandler = async (req, res, next) => { try { const session = await AuthService.register(req.body, res.locals.requestId); setRefreshCookie(res, session.refreshToken, REFRESH_MAX_AGE); res.status(201).json({ success: true, data: { accessToken: session.accessToken } }); } catch (e) { next(e); } };
export const login: RequestHandler = async (req, res, next) => { try { const session = await AuthService.login(req.body, res.locals.requestId, req.ip); setRefreshCookie(res, session.refreshToken, REFRESH_MAX_AGE); res.status(200).json({ success: true, data: { accessToken: session.accessToken } }); } catch (e) { next(e); } };
export const refresh: RequestHandler = async (req, res, next) => { try { const token = getRefreshCookie(req.headers.cookie) ?? req.body.refreshToken; if (!token) return next(new AppError('AUTH_REQUIRED', 'Refresh authentication is required.', 401)); const session = await AuthService.refresh(token, res.locals.requestId); setRefreshCookie(res, session.refreshToken, REFRESH_MAX_AGE); res.status(200).json({ success: true, data: { accessToken: session.accessToken } }); } catch (e) { next(e); } };
export const logout: RequestHandler = async (req, res, next) => { try { const token = getRefreshCookie(req.headers.cookie) ?? req.body.refreshToken; if (token) await AuthService.logout(token); clearRefreshCookie(res); res.status(204).send(); } catch (e) { next(e); } };

export const changePassword: RequestHandler = async (req,res,next) => { try { await AuthService.changePassword(req.auth!.userId, req.body.currentPassword, req.body.newPassword, res.locals.requestId); clearRefreshCookie(res); res.status(204).send(); } catch(e){ next(e); } };
