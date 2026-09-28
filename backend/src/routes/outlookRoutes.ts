import type { FastifyInstance } from 'fastify';
import { startOutlookConnection } from '../controllers/outlookController.js';

export default async function outlookRoutes(fastify: FastifyInstance) {
  // Precisa ter o Supabase Bearer token, igual as outras rotas
  fastify.post('/integracoes/outlook/connect', startOutlookConnection);
}
