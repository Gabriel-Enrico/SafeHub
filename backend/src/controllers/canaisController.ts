import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';

interface Canal {
  id: number;
  nome: string;
  tipo: string;
}

export async function listCanais() {
  const result = await database.query<Canal>(
    `
      select id, nome, tipo
      from public.canais
      order by id desc
    `
  );

  return result.rows;
}

export async function getCanalById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const result = await database.query<Canal>(
    // $1 é importante: ele passa o id como parâmetro seguro, sem montar SQL com texto da URL.
    'select * from public.canais where id = $1',
    [request.params.id]
  );

  if (result.rows.length === 0) {
    return reply.code(404).send({
      message: 'Canal não encontrado',
    });
  }

  return result.rows[0];
}
