import Fastify from 'fastify';
import canaisRoutes from './routes/canaisRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

const fastify = Fastify({ logger: true });

await fastify.register(healthRoutes);
await fastify.register(canaisRoutes);

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
