import type { FastifyInstance } from 'fastify';
import {
  createTarefaComentario,
  listTarefaComentarios,
  listTarefaHistorico,
  listTarefasQuadro,
  updateTarefaStatus,
} from '../controllers/tarefasQuadroController.js';
import type {
  TarefaComentarioBody,
  TarefaQuadroQuery,
  TarefaStatusBody,
} from '../type/tarefasQuadro.js';
import {
  STATUS_TAREFA_QUADRO,
  TAREFA_ORIGENS,
  TAREFA_VISOES,
} from '../type/tarefasQuadro.js';

const idSchema = { type: 'string', pattern: '^[1-9]\\d*$' };
const taskQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'string', pattern: '^\\d+$' },
    offset: { type: 'string', pattern: '^\\d+$' },
    cliente_id: idSchema,
    projeto_id: idSchema,
    equipe_id: idSchema,
    responsavel_id: idSchema,
    status: { type: 'string', enum: [...STATUS_TAREFA_QUADRO] },
    origem: { type: 'string', enum: [...TAREFA_ORIGENS] },
    visao: { type: 'string', enum: [...TAREFA_VISOES] },
  },
};

export default async function tarefasRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: TarefaQuadroQuery }>(
    '/tarefas/quadro',
    { schema: { querystring: taskQuerySchema } },
    listTarefasQuadro
  );

  fastify.patch<{
    Params: { origem: string; id: string };
    Body: TarefaStatusBody;
  }>(
    '/tarefas/:origem/:id/status',
    {
      schema: {
        params: {
          type: 'object',
          required: ['origem', 'id'],
          additionalProperties: false,
          properties: {
            origem: { type: 'string', enum: [...TAREFA_ORIGENS] },
            id: idSchema,
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: [...STATUS_TAREFA_QUADRO] },
          },
        },
      },
    },
    updateTarefaStatus
  );

  fastify.get<{ Params: { origem: string; id: string } }>(
    '/tarefas/:origem/:id/historico',
    {
      schema: {
        params: {
          type: 'object',
          required: ['origem', 'id'],
          additionalProperties: false,
          properties: {
            origem: { type: 'string', enum: [...TAREFA_ORIGENS] },
            id: idSchema,
          },
        },
      },
    },
    listTarefaHistorico
  );

  fastify.get<{ Params: { origem: string; id: string } }>(
    '/tarefas/:origem/:id/comentarios',
    {
      schema: {
        params: {
          type: 'object',
          required: ['origem', 'id'],
          additionalProperties: false,
          properties: {
            origem: { type: 'string', enum: [...TAREFA_ORIGENS] },
            id: idSchema,
          },
        },
      },
    },
    listTarefaComentarios
  );

  fastify.post<{
    Params: { origem: string; id: string };
    Body: TarefaComentarioBody;
  }>(
    '/tarefas/:origem/:id/comentarios',
    {
      schema: {
        params: {
          type: 'object',
          required: ['origem', 'id'],
          additionalProperties: false,
          properties: {
            origem: { type: 'string', enum: [...TAREFA_ORIGENS] },
            id: idSchema,
          },
        },
        body: {
          type: 'object',
          required: ['comentario'],
          additionalProperties: false,
          properties: {
            comentario: { type: 'string', minLength: 1, maxLength: 5000 },
          },
        },
      },
    },
    createTarefaComentario
  );
}
