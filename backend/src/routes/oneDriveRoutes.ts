import type { FastifyInstance } from 'fastify';
import {
  disconnectOneDrive,
  getOneDriveStatus,
  listOneDriveFiles,
  startOneDriveConnection,
} from '../controllers/oneDriveController.js';
import type { LibraryPatch } from '../controllers/oneDriveLibraryController.js';
import {
  createOneDriveLibraryItem,
  deleteOneDriveLibraryItem,
  listOneDriveLibrary,
  updateOneDriveLibraryItem,
} from '../controllers/oneDriveLibraryController.js';

const idParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
};
const linkType = {
  type: ['string', 'null'],
  enum: [
    'cliente',
    'projeto',
    'edital',
    'tarefa_projeto',
    'tarefa_cliente',
    null,
  ],
};

export default async function oneDriveRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/integracoes/onedrive/library',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            busca: { type: 'string', maxLength: 200 },
            categoria: { type: 'string', maxLength: 120 },
          },
        },
      },
    },
    listOneDriveLibrary
  );
  fastify.post(
    '/integracoes/onedrive/library',
    {
      schema: {
        body: {
          type: 'object',
          required: ['drive_item_id', 'nome', 'web_url', 'categoria'],
          additionalProperties: false,
          properties: {
            drive_item_id: { type: 'string', minLength: 1, maxLength: 512 },
            nome: { type: 'string', minLength: 1, maxLength: 255 },
            web_url: {
              type: 'string',
              minLength: 1,
              maxLength: 2000,
              format: 'uri',
            },
            categoria: { type: 'string', minLength: 1, maxLength: 120 },
            versao: { type: 'string', maxLength: 60 },
            revisar_em: {
              type: ['string', 'null'],
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            },
            equipe_id: { type: ['integer', 'null'], minimum: 1 },
            vinculo_tipo: linkType,
            vinculo_id: { type: ['integer', 'null'], minimum: 1 },
          },
        },
      },
    },
    createOneDriveLibraryItem
  );
  fastify.patch<{ Params: { id: string }; Body: LibraryPatch }>(
    '/integracoes/onedrive/library/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            categoria: { type: 'string', minLength: 1, maxLength: 120 },
            versao: { type: 'string', maxLength: 60 },
            revisar_em: {
              type: ['string', 'null'],
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            },
            equipe_id: { type: ['integer', 'null'], minimum: 1 },
            vinculo_tipo: linkType,
            vinculo_id: { type: ['integer', 'null'], minimum: 1 },
          },
        },
      },
    },
    updateOneDriveLibraryItem
  );
  fastify.delete<{ Params: { id: string } }>(
    '/integracoes/onedrive/library/:id',
    {
      schema: { params: idParams },
    },
    deleteOneDriveLibraryItem
  );

  fastify.post('/integracoes/onedrive/connect', startOneDriveConnection);
  fastify.get('/integracoes/onedrive/status', getOneDriveStatus);
  fastify.delete('/integracoes/onedrive/connect', disconnectOneDrive);
  fastify.get(
    '/integracoes/onedrive/files',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            folderId: { type: 'string', minLength: 1, maxLength: 512 },
            busca: { type: 'string', minLength: 1, maxLength: 200 },
          },
          additionalProperties: false,
        },
      },
    },
    listOneDriveFiles
  );
}
