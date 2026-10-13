import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import type {
  EstagioOportunidade,
  OportunidadeBody,
  OportunidadeParams,
  OportunidadeStageBody,
} from '../type/oportunidades.js';
import { ESTAGIOS_OPORTUNIDADE } from '../type/oportunidades.js';

function parseId(rawId: string): number {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID de oportunidade inválido.');
  }
  return id;
}

async function getResponsavelId(authUserId: string | undefined): Promise<number> {
  if (!authUserId) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{ id: number }>(
    'select id from public.usuarios where auth_user_id = $1 and ativo = true',
    [authUserId]
  );
  if (!result.rows[0]) throw new ApiError(403, 'PROFILE_INACTIVE', 'Perfil SafeHub não encontrado ou desativado.');
  return result.rows[0].id;
}

export async function listOportunidades() {
  const result = await database.query(
    `select o.id, coalesce(nullif(trim(o.titulo), ''), c.nome) as titulo,
            o.cliente_id, c.nome as cliente_nome, o.responsavel_id,
            u.nome as responsavel_nome, o.estagio, o.valor_estimado,
            o.previsao_fechamento
     from public.oportunidades o
     join public.clientes c on c.id = o.cliente_id
     left join public.usuarios u on u.id = o.responsavel_id
     order by o.id desc`
  );
  return { data: result.rows };
}

export async function createOportunidade(
  request: FastifyRequest<{ Body: OportunidadeBody }>,
  reply: FastifyReply
) {
  const titulo = request.body.titulo.trim();
  if (!titulo) throw new ApiError(400, 'VALIDATION_ERROR', 'O título da oportunidade é obrigatório.');
  if (request.body.valor_estimado != null && (!Number.isFinite(request.body.valor_estimado) || request.body.valor_estimado < 0)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'O valor estimado deve ser igual ou maior que zero.');
  }
  const clienteId = request.body.cliente_id;
  const responsavelId = await getResponsavelId(request.user?.id);
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query('lock table public.oportunidades in exclusive mode');
    const cliente = await client.query('select 1 from public.clientes where id = $1', [clienteId]);
    if (!cliente.rowCount) throw new ApiError(404, 'CLIENT_NOT_FOUND', 'Cliente não encontrado.');
    const nextId = await client.query<{ next_id: number }>(
      'select coalesce(max(id), 0) + 1 as next_id from public.oportunidades'
    );
    const inserted = await client.query<{ id: number }>(
      `insert into public.oportunidades
         (id, titulo, cliente_id, responsavel_id, estagio, valor_estimado, previsao_fechamento)
       values ($1, $2, $3, $4, 'prospeccao', $5, $6)
       returning id`,
      [nextId.rows[0].next_id, titulo, clienteId, responsavelId,
        request.body.valor_estimado ?? null, request.body.previsao_fechamento ?? null]
    );
    await client.query(
      `insert into public.oportunidade_historico
         (oportunidade_id, estagio_anterior, estagio_novo, usuario_id)
       values ($1, null, 'prospeccao', $2)`,
      [inserted.rows[0].id, responsavelId]
    );
    const result = await client.query(
      `select o.id, o.titulo, o.cliente_id, c.nome as cliente_nome,
              o.responsavel_id, u.nome as responsavel_nome, o.estagio,
              o.valor_estimado, o.previsao_fechamento
       from public.oportunidades o
       join public.clientes c on c.id = o.cliente_id
       left join public.usuarios u on u.id = o.responsavel_id
       where o.id = $1`,
      [inserted.rows[0].id]
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

export async function updateOportunidadeStage(
  request: FastifyRequest<{ Params: OportunidadeParams; Body: OportunidadeStageBody }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const nextStage: EstagioOportunidade = request.body.estagio;
  if (!ESTAGIOS_OPORTUNIDADE.includes(nextStage)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Estágio de oportunidade inválido.');
  }
  const responsavelId = await getResponsavelId(request.user?.id);
  const client = await database.connect();
  try {
    await client.query('begin');
    const currentResult = await client.query<{ estagio: string | null }>(
      'select estagio from public.oportunidades where id = $1 for update', [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Oportunidade não encontrada.');
    if (current.estagio !== nextStage) {
      await client.query(
        'update public.oportunidades set estagio = $1 where id = $2', [nextStage, id]
      );
      await client.query(
        `insert into public.oportunidade_historico
           (oportunidade_id, estagio_anterior, estagio_novo, usuario_id)
         values ($1, $2, $3, $4)`,
        [id, current.estagio, nextStage, responsavelId]
      );
    }
    const updated = await client.query(
      `select o.id, coalesce(nullif(trim(o.titulo), ''), c.nome) as titulo,
              o.cliente_id, c.nome as cliente_nome, o.responsavel_id,
              u.nome as responsavel_nome, o.estagio, o.valor_estimado,
              o.previsao_fechamento
       from public.oportunidades o
       join public.clientes c on c.id = o.cliente_id
       left join public.usuarios u on u.id = o.responsavel_id
       where o.id = $1`,
      [id]
    );
    await client.query('commit');
    return reply.send(updated.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listOportunidadeHistorico(
  request: FastifyRequest<{ Params: OportunidadeParams }>
) {
  const id = parseId(request.params.id);
  const exists = await database.query('select 1 from public.oportunidades where id = $1', [id]);
  if (!exists.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Oportunidade não encontrada.');
  const result = await database.query(
    `select h.id, h.oportunidade_id, h.estagio_anterior, h.estagio_novo,
            h.alterado_em, h.usuario_id, u.nome as usuario_nome
     from public.oportunidade_historico h
     join public.usuarios u on u.id = h.usuario_id
     where h.oportunidade_id = $1
     order by h.alterado_em desc, h.id desc`,
    [id]
  );
  return { data: result.rows };
}
