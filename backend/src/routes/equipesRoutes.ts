import type { FastifyInstance } from 'fastify';
import {
  criarEquipes,
  listarEquipes,
} from '../controllers/equipesController.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import type { CriarEquipeBody } from '../type/equipes.js';

export async function equipeRoutes(fastify: FastifyInstance) {
  await fastify.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin);
    admin.get('/equipes', listarEquipes);
    admin.post<{ Body: CriarEquipeBody }>(
      '/equipes',
      {
        schema: {
          body: {
            type: 'object',
            required: ['nome'],
            properties: {
              nome: { type: 'string', minLength: 1, maxLength: 100 },
            },
            additionalProperties: false,
          },
        },
      },
      criarEquipes
    );
  });
}
