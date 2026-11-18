import type { FastifyInstance } from 'fastify';
import {
  createOportunidade,
  listOportunidadeHistorico,
  listOportunidades,
  updateOportunidadeStage,
  updateOportunidadeNextAction,
  updateOportunidade,
} from '../controllers/oportunidadesController.js';
import { ESTAGIOS_OPORTUNIDADE } from '../type/oportunidades.js';
import type {
  OportunidadeBody,
  OportunidadeParams,
  OportunidadeStageBody,
  OportunidadeNextActionBody,
  OportunidadePatchBody,
} from '../type/oportunidades.js';

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
};

export default async function oportunidadesRoutes(fastify: FastifyInstance) {
  fastify.get('/oportunidades', listOportunidades);

  fastify.post<{ Body: OportunidadeBody }>(
    '/oportunidades',
    {
      schema: {
        body: {
          type: 'object',
          required: ['titulo', 'cliente_id'],
          additionalProperties: false,
          properties: {
            titulo: { type: 'string', minLength: 1, maxLength: 200 },
            cliente_id: { type: 'integer', minimum: 1 },
            valor_estimado: { type: ['number', 'null'], minimum: 0 },
            previsao_fechamento: {
              type: ['string', 'null'],
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            },
            proxima_acao: { type: ['string', 'null'], maxLength: 2000 },
          },
        },
      },
    },
    createOportunidade
  );

  fastify.patch<{ Params: OportunidadeParams; Body: OportunidadeNextActionBody }>(
    '/oportunidades/:id/proxima-acao',
    {
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          required: ['proxima_acao'],
          additionalProperties: false,
          properties: { proxima_acao: { type: ['string', 'null'], maxLength: 2000 } },
        },
      },
    },
    updateOportunidadeNextAction
  );

  fastify.patch<{ Params: OportunidadeParams; Body: OportunidadePatchBody }>(
    '/oportunidades/:id',
    { schema: { params: idParamsSchema, body: {
      type: 'object', additionalProperties: false, minProperties: 1,
      properties: {
        titulo: { type: 'string', minLength: 1, maxLength: 200 },
        cliente_id: { type: 'integer', minimum: 1 },
        responsavel_id: { type: ['integer', 'null'], minimum: 1 },
        valor_estimado: { type: ['number', 'null'], minimum: 0 },
        previsao_fechamento: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        proxima_acao: { type: ['string', 'null'], maxLength: 2000 },
      },
    } } },
    updateOportunidade
  );

  fastify.patch<{ Params: OportunidadeParams; Body: OportunidadeStageBody }>(
    '/oportunidades/:id/estagio',
    {
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          required: ['estagio'],
          additionalProperties: false,
          properties: { estagio: { type: 'string', enum: [...ESTAGIOS_OPORTUNIDADE] } },
        },
      },
    },
    updateOportunidadeStage
  );

  fastify.get<{ Params: OportunidadeParams }>(
    '/oportunidades/:id/historico',
    { schema: { params: idParamsSchema } },
    listOportunidadeHistorico
  );
}
