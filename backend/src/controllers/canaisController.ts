import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError, errorResponse } from '../utils/apiError.js';
import { getPagination } from '../utils/pagination.js';

interface Canal {
  id: number;
  nome: string;
  tipo: string;
}

export async function listCanais(
  request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>
) {
  const { limit, offset } = getPagination(request);
  const [result, countResult] = await Promise.all([
    database.query<Canal>(
      `
        select id, nome, tipo
        from public.canais
        order by id desc
        limit $1 offset $2
      `,
      [limit, offset]
    ),
    database.query<{ total: number }>(
      'select count(*)::int as total from public.canais'
    ),
  ]);

  return {
    data: result.rows,
    pagination: {
      limit,
      offset,
      total: countResult.rows[0]?.total ?? 0,
    },
  };
}

export async function getCanalById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID inválido', {
      id: 'Informe um inteiro maior que zero.',
    });
  }

  const result = await database.query<Canal>(
    // $1 é importante: ele passa o id como parâmetro seguro, sem montar SQL com texto da URL.
    'select * from public.canais where id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return reply
      .code(404)
      .send(errorResponse('NOT_FOUND', 'Canal não encontrado'));
  }

  return result.rows[0];
}
