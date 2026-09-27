import type { FastifyInstance } from 'fastify';
import { getCanalById, listCanais } from '../controllers/canaisController.js';

export default async function canaisRoutes(fastify: FastifyInstance) {
  fastify.get('/canais', listCanais);
  fastify.get('/canais/:id', getCanalById);
}
