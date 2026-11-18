import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError, errorResponse } from '../utils/apiError.js';
import { getPagination } from '../utils/pagination.js';

interface Canal {
  id: number;
  nome: string;
  tipo: string;
  equipe_id?: number | null;
  equipe_nome?: string | null;
  projeto_id?: number | null;
  projeto_nome?: string | null;
}

async function currentProfile(request: FastifyRequest) {
  if (!request.user?.id)
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{ id: number; cargo: string | null; equipe_id: number | null }>(
    'select id, cargo, equipe_id from public.usuarios where auth_user_id = $1 and ativo = true',
    [request.user.id]
  );
  if (!result.rows[0])
    throw new ApiError(403, 'PROFILE_INACTIVE', 'Perfil SafeHub não encontrado ou desativado.');
  return result.rows[0];
}

export async function listCanais(
  request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>
) {
  const user = await currentProfile(request);
  const isAdmin = user.cargo === 'Administrador';
  const { limit, offset } = getPagination(request);
  const [result, countResult] = await Promise.all([
    database.query<Canal>(
      `
        select c.id, c.nome, c.tipo, c.equipe_id, e.nome as equipe_nome,
               c.projeto_id, p.nome as projeto_nome
        from public.canais c
        left join public.equipes e on e.id = c.equipe_id
        left join public.projetos p on p.id = c.projeto_id
        where $1::boolean or exists (
          select 1 from public.canal_membros cm
          where cm.canal_id = c.id and cm.usuario_id = $2
        )
        order by c.id desc
        limit $3 offset $4
      `,
      [isAdmin, user.id, limit, offset]
    ),
    database.query<{ total: number }>(
      `select count(*)::int as total from public.canais c
       where $1::boolean or exists (
         select 1 from public.canal_membros cm
         where cm.canal_id = c.id and cm.usuario_id = $2
       )`,
      [isAdmin, user.id]
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

export async function listCanalUsers(request: FastifyRequest) {
  await currentProfile(request);
  const result = await database.query<{ id: number; nome: string; equipe_id: number | null }>(
    'select id, nome, equipe_id from public.usuarios where ativo = true order by nome'
  );
  return { data: result.rows };
}

export async function getCanalById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = await currentProfile(request);
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID inválido', {
      id: 'Informe um inteiro maior que zero.',
    });
  }

  const result = await database.query<Canal>(
    // $1 é importante: ele passa o id como parâmetro seguro, sem montar SQL com texto da URL.
    `select c.* from public.canais c
     where c.id = $1 and ($2::boolean or exists (
       select 1 from public.canal_membros cm
       where cm.canal_id = c.id and cm.usuario_id = $3
     ))`,
    [id, user.cargo === 'Administrador', user.id]
  );

  if (result.rows.length === 0) {
    return reply
      .code(404)
      .send(errorResponse('NOT_FOUND', 'Canal não encontrado'));
  }

  return result.rows[0];
}
