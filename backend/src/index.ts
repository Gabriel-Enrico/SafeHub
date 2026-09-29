import cors from '@fastify/cors';
import Fastify from 'fastify';
import { requireAuthentication } from './middlewares/authentication.js';
import canaisRoutes from './routes/canaisRoutes.js';
import clientesRoutes from './routes/clientesRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import outlookCallbackRoutes from './routes/outlookCallbackRoutes.js';
import outlookRoutes from './routes/outlookRoutes.js';
import { ApiError, errorResponse } from './utils/apiError.js';

const fastify = Fastify({ logger: true });
fastify.decorateRequest('user', null);

fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof ApiError) {
    return reply
      .code(error.statusCode)
      .send(errorResponse(error.code, error.message, error.details));
  }

  if ('validation' in error && error.validation) {
    return reply.code(400).send(
      errorResponse('VALIDATION_ERROR', 'Dados inválidos', {
        fields: error.validation.map(
          (issue) => issue.instancePath || issue.schemaPath
        ),
      })
    );
  }

  request.log.error(error);
  return reply
    .code(500)
    .send(errorResponse('INTERNAL_ERROR', 'Falha inesperada do SafeHub'));
});

fastify.setNotFoundHandler((_request, reply) => {
  return reply
    .code(404)
    .send(errorResponse('NOT_FOUND', 'Endpoint não encontrado'));
});

const corsOrigins = (
  process.env.CORS_ORIGINS ??
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://localhost:8080'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

await fastify.register(cors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
});

await fastify.register(healthRoutes);
await fastify.register(
  async (api) => {
    await api.register(outlookCallbackRoutes);

    await api.register(async (privado) => {
      privado.addHook('preHandler', requireAuthentication);
      await privado.register(canaisRoutes);
      await privado.register(clientesRoutes);
      await privado.register(outlookRoutes);
    });
  },
  { prefix: '/api/v1' }
);

const start = async (): Promise<void> => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor rodando na porta 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
