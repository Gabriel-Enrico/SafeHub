import type { FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';

export async function listAuditEvents(request: FastifyRequest<{ Querystring: { limit?: string; entidade?: string } }>) {
  if (!request.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const user = await database.query<{ cargo: string | null }>('select cargo from public.usuarios where auth_user_id=$1 and ativo=true', [request.user.id]);
  if (user.rows[0]?.cargo !== 'Administrador') throw new ApiError(403, 'FORBIDDEN', 'Apenas administradores podem consultar a auditoria.');
  const limit = Math.max(1, Math.min(Number(request.query.limit) || 100, 250));
  const entidade = request.query.entidade?.trim() || null;
  const result = await database.query(
    `select a.id,a.entidade,a.entidade_id,a.acao,a.alteracoes,a.criado_em,a.usuario_id,u.nome as usuario_nome
     from public.auditoria_eventos a left join public.usuarios u on u.id=a.usuario_id
     where ($1::text is null or a.entidade=$1)
     order by a.criado_em desc,a.id desc limit $2`, [entidade,limit]);
  return { data: result.rows };
}
