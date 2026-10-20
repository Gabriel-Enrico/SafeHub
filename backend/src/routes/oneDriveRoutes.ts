import type { FastifyInstance } from 'fastify';
import {
  disconnectOneDrive,
  getOneDriveStatus,
  listOneDriveFiles,
  startOneDriveConnection,
} from '../controllers/oneDriveController.js';

export default async function oneDriveRoutes(fastify: FastifyInstance) {
  fastify.post('/integracoes/onedrive/connect', startOneDriveConnection);
  fastify.get('/integracoes/onedrive/status', getOneDriveStatus);
  fastify.delete('/integracoes/onedrive/connect', disconnectOneDrive);
  fastify.get(
    '/integracoes/onedrive/files',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { folderId: { type: 'string', minLength: 1, maxLength: 512 } },
          additionalProperties: false,
        },
      },
    },
    listOneDriveFiles
  );
}
