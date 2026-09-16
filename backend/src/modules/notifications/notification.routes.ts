import {Router} from 'express';
import {requireAuth} from '../../middleware/auth.js';
import {listNotifications,readNotification} from './notification.controller.js';
export const notificationRouter=Router();
notificationRouter.use(requireAuth); notificationRouter.get('/',listNotifications); notificationRouter.patch('/:id/read',readNotification);
