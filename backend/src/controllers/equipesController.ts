import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import type { CriarEquipeBody, Equipe } from '../type/equipes.js';
import { ApiError } from '../utils/apiError.js';

export async function listarEquipes() {
  const result = await database.query<Equipe>(
    `select id, nome from public.equipes`
  );
  return result.rows;
}

export async function criarEquipes(
  request: FastifyRequest<{ Body: CriarEquipeBody }>,
  reply: FastifyReply
) {
  const { nome } = request.body;
  if (!nome.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Nome inválido', {
      nome: !nome.trim() ? 'O nome não pode ser vazio' : undefined,
    });
  }

  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query('lock table public.equipes in exclusive mode');
    const idResult = await client.query<{ next_id: number }>(
      'select coalesce(max(id), 0) + 1 as next_id from public.equipes'
    );

    const result = await client.query<Equipe>(
      `insert into public.equipes (id, nome)
      values ($1, $2)
      returning id, nome`,
      [idResult.rows[0].next_id, nome.trim()]
    );
    await client.query('commit');
    return reply.code(201).send(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
