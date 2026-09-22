import { getHealthStatus } from '../controllers/healthController.js';

export default async function healthRoutes(fastify, options) {
  fastify.get('/health', getHealthStatus);
}
