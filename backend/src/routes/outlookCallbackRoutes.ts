import type { FastifyPluginAsync } from 'fastify';
import { callbackMicrosoft } from '../controllers/outlookCallbackController.js';

const outlookCallbackRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/integracoes/outlook/callback',
    { logLevel: 'silent' },
    callbackMicrosoft
  );
};

export default outlookCallbackRoutes;
