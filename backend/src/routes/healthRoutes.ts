import { getHealthStatus } from '../controllers/healthController.js';
import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', getHealthStatus);
}
