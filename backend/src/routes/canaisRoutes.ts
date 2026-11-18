import type { FastifyInstance } from 'fastify';
import { getCanalById, listCanalUsers, listCanais } from '../controllers/canaisController.js';
import {
  createChannelCall,
  createChannel,
  createChannelMessage,
  getChannelMessage,
  listChannelMembers,
  listChannelMessages,
  publishManualTeamsCall,
} from '../controllers/canalComunicacaoController.js';

export default async function canaisRoutes(fastify: FastifyInstance) {
  fastify.get('/canais', listCanais);
  fastify.get('/canais/usuarios', listCanalUsers);
  fastify.post<{ Body: { nome: string; tipo: 'grupo' | 'equipe' | 'projeto'; membros_ids: number[]; equipe_id?: number; projeto_id?: number } }>('/canais', {
    schema: { body: { type: 'object', required: ['nome', 'tipo', 'membros_ids'], additionalProperties: false, properties: {
      nome: { type: 'string', minLength: 1, maxLength: 100 }, tipo: { type: 'string', enum: ['grupo', 'equipe', 'projeto'] },
      membros_ids: { type: 'array', maxItems: 99, uniqueItems: true, items: { type: 'integer', minimum: 1 } },
      equipe_id: { type: 'integer', minimum: 1 }, projeto_id: { type: 'integer', minimum: 1 },
    } } },
  }, createChannel);
  const channelParams = {
    type: 'object', required: ['id'], additionalProperties: false,
    properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
  };
  fastify.get<{ Params: { id: string } }>(
    '/canais/:id/membros', { schema: { params: channelParams } }, listChannelMembers
  );
  fastify.get<{ Params: { id: string } }>(
    '/canais/:id/mensagens', { schema: { params: channelParams } }, listChannelMessages
  );
  fastify.get<{ Params: { id: string; mensagemId: string } }>(
    '/canais/:id/mensagens/:mensagemId',
    {
      schema: {
        params: {
          type: 'object', required: ['id', 'mensagemId'], additionalProperties: false,
          properties: {
            id: { type: 'string', pattern: '^[1-9]\\d*$' },
            mensagemId: { type: 'string', pattern: '^[1-9]\\d*$' },
          },
        },
      },
    },
    getChannelMessage
  );
  fastify.post<{ Params: { id: string }; Body: { texto: string } }>(
    '/canais/:id/mensagens',
    {
      schema: {
        params: channelParams,
        body: { type: 'object', required: ['texto'], additionalProperties: false, properties: { texto: { type: 'string', minLength: 1, maxLength: 4000 } } },
      },
    },
    createChannelMessage
  );
  fastify.post<{ Params: { id: string }; Body: { titulo: string; inicio: string; fim: string } }>(
    '/canais/:id/chamadas',
    {
      schema: {
        params: channelParams,
        body: { type: 'object', required: ['titulo', 'inicio', 'fim'], additionalProperties: false, properties: { titulo: { type: 'string', minLength: 1, maxLength: 255 }, inicio: { type: 'string', format: 'date-time' }, fim: { type: 'string', format: 'date-time' } } },
      },
    },
    createChannelCall
  );
  fastify.post<{ Params: { id: string }; Body: { titulo: string; inicio: string; fim: string; url: string } }>(
    '/canais/:id/chamadas/link',
    {
      schema: {
        params: channelParams,
        body: { type: 'object', required: ['titulo', 'inicio', 'fim', 'url'], additionalProperties: false, properties: {
          titulo: { type: 'string', minLength: 1, maxLength: 255 },
          inicio: { type: 'string', format: 'date-time' },
          fim: { type: 'string', format: 'date-time' },
          url: { type: 'string', minLength: 1, maxLength: 2000, format: 'uri' },
        } },
      },
    },
    publishManualTeamsCall
  );
  fastify.get('/canais/:id', getCanalById);
}
