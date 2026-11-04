import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { database } from '../config/database.js';
import {
  STATUS_TAREFA_QUADRO,
  TAREFA_ORIGENS,
  type StatusTarefaQuadro,
  type TarefaQuadro,
  type TarefaQuadroParams,
  type TarefaQuadroQuery,
  type TarefaStatusBody,
} from '../type/tarefasQuadro.js';
import { ApiError } from '../utils/apiError.js';
import { getPagination } from '../utils/pagination.js';
import {
  buildTarefaQuadroFilters,
  parsePositiveId,
} from '../utils/tarefasQuadroQuery.js';

interface CurrentUser {
  id: number;
  equipe_id: number | null;
  cargo: string | null;
}

interface TarefaStatusRequest {
  Params: TarefaQuadroParams;
  Body: TarefaStatusBody;
}

const TASKS_CTE = `
  with tarefas_quadro as (
    select t.id, 'projeto'::text as origem, t.titulo,
           null::text as descricao, t.coluna_kanban::text as status,
           t.prioridade::text as prioridade, t.prazo::date as prazo,
           p.cliente_id, c.nome as cliente_nome, p.id as projeto_id,
           p.nome as projeto_nome, p.status::text as projeto_status,
           null::integer as interacao_id,
           p.equipe_id,
           coalesce(array_agg(distinct tr.usuario_id) filter (where tr.usuario_id is not null), '{}') as responsaveis_ids,
           coalesce(array_agg(distinct u.nome) filter (where u.id is not null), '{}') as responsaveis_nomes,
           t.concluido_em, t.concluido_por
    from public.tarefas t
    join public.projetos p on p.id = t.projeto_id
    left join public.clientes c on c.id = p.cliente_id
    left join public.tarefa_responsavel tr on tr.tarefa_id = t.id
    left join public.usuarios u on u.id = tr.usuario_id
    where ($1::boolean or p.equipe_id = $2)
    group by t.id, p.id, c.nome

    union all

    select ct.id, 'interacao'::text as origem, ct.titulo,
           ct.descricao, ct.status::text as status, ct.prioridade::text as prioridade,
           ct.prazo::date as prazo, ct.cliente_id, c.nome as cliente_nome,
           null::integer as projeto_id, null::text as projeto_nome,
           null::text as projeto_status,
           ct.interacao_id,
           coalesce(assignee.equipe_id, creator.equipe_id, owner.equipe_id) as equipe_id,
           coalesce(array_remove(array[ct.responsavel_id], null), '{}') as responsaveis_ids,
           coalesce(array_remove(array[assignee.nome], null), '{}') as responsaveis_nomes,
           ct.concluido_em, ct.concluido_por
    from public.cliente_tarefas ct
    join public.clientes c on c.id = ct.cliente_id
    join public.usuarios creator on creator.id = ct.criado_por
    left join public.usuarios assignee on assignee.id = ct.responsavel_id
    left join public.usuarios owner on owner.id = c.responsavel_id
    where $1::boolean
       or ct.criado_por = $3
       or ct.responsavel_id = $3
       or c.responsavel_id = $3
       or exists (
         select 1 from public.interacao_participantes ip
         where ip.interacao_id = ct.interacao_id and ip.usuario_id = $3
       )
       or ($2::integer is not null and (
         creator.equipe_id = $2
         or assignee.equipe_id = $2
         or owner.equipe_id = $2
         or exists (
           select 1
           from public.interacao_participantes ip
           join public.usuarios participant on participant.id = ip.usuario_id
           where ip.interacao_id = ct.interacao_id
             and participant.equipe_id = $2
         )
       ))
  )
`;

async function getCurrentUser(
  authUserId: string | undefined
): Promise<CurrentUser> {
  if (!authUserId)
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<CurrentUser>(
    'select id, equipe_id, cargo from public.usuarios where auth_user_id = $1 and ativo = true',
    [authUserId]
  );
  if (!result.rows[0]) {
    throw new ApiError(
      403,
      'PROFILE_INACTIVE',
      'Perfil SafeHub não encontrado ou desativado.'
    );
  }
  return result.rows[0];
}

export async function listTarefasQuadro(
  request: FastifyRequest<{ Querystring: TarefaQuadroQuery }>
) {
  const user = await getCurrentUser(request.user?.id);
  const { limit, offset } = getPagination(request);
  const baseValues = [user.cargo === 'Administrador', user.equipe_id, user.id];
  const filters = buildTarefaQuadroFilters(request.query);
  const values = [...baseValues, ...filters.values];

  const [tasks, count] = await Promise.all([
    database.query<TarefaQuadro>(
      `${TASKS_CTE}
       select tq.* from tarefas_quadro tq ${filters.clause}
       order by tq.prazo nulls last, tq.id desc, tq.origem
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, limit, offset]
    ),
    database.query<{ total: number }>(
      `${TASKS_CTE}
       select count(*)::int as total from tarefas_quadro tq ${filters.clause}`,
      values
    ),
  ]);

  return {
    data: tasks.rows,
    pagination: { limit, offset, total: count.rows[0]?.total ?? 0 },
  };
}

export async function listTarefaHistorico(
  request: FastifyRequest<{ Params: TarefaQuadroParams }>
) {
  const { origem } = request.params;
  if (!TAREFA_ORIGENS.includes(origem as (typeof TAREFA_ORIGENS)[number])) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Origem de tarefa inválida.');
  }
  const taskId = parsePositiveId(request.params.id, 'id');
  const user = await getCurrentUser(request.user?.id);
  const client = await database.connect();
  try {
    await client.query('begin');
    if (origem === 'projeto') {
      const task = await client.query<{ equipe_id: number }>(
        `select p.equipe_id
         from public.tarefas t
         join public.projetos p on p.id = t.projeto_id
         where t.id = $1
         for share of t`,
        [taskId]
      );
      if (!task.rows[0])
        throw new ApiError(404, 'NOT_FOUND', 'Tarefa não encontrada.');
      if (
        user.cargo !== 'Administrador' &&
        task.rows[0].equipe_id !== user.equipe_id
      ) {
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Você não pode consultar o histórico desta tarefa.'
        );
      }
    } else {
      const access = await getInteractionTaskAccess(client, taskId, user);
      if (!access.can_manage)
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Você não pode consultar o histórico desta tarefa.'
        );
    }

    const history = await client.query(
      `select h.id, h.status_anterior, h.status_novo, h.criado_em,
              h.usuario_id, u.nome as usuario_nome
       from public.tarefa_historico h
       join public.usuarios u on u.id = h.usuario_id
       where h.origem = $1 and h.tarefa_id = $2
       order by h.criado_em desc, h.id desc`,
      [origem, taskId]
    );
    await client.query('commit');
    return { data: history.rows };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function getInteractionTaskAccess(
  client: PoolClient,
  taskId: number,
  user: CurrentUser
): Promise<{ can_manage: boolean; status: string }> {
  const result = await client.query<{ can_manage: boolean; status: string }>(
    `select (
       $1::boolean
       or ct.criado_por = $2
       or ct.responsavel_id = $2
       or c.responsavel_id = $2
       or exists (
         select 1 from public.interacao_participantes ip
         where ip.interacao_id = ct.interacao_id and ip.usuario_id = $2
       )
       or ($3::integer is not null and (
         creator.equipe_id = $3
         or assignee.equipe_id = $3
         or owner.equipe_id = $3
         or exists (
           select 1
           from public.interacao_participantes ip
           join public.usuarios participant on participant.id = ip.usuario_id
           where ip.interacao_id = ct.interacao_id
             and participant.equipe_id = $3
         )
       ))
    ) as can_manage,
    ct.status
     from public.cliente_tarefas ct
     join public.clientes c on c.id = ct.cliente_id
     join public.usuarios creator on creator.id = ct.criado_por
     left join public.usuarios assignee on assignee.id = ct.responsavel_id
     left join public.usuarios owner on owner.id = c.responsavel_id
     where ct.id = $4
     for update of ct`,
    [user.cargo === 'Administrador', user.id, user.equipe_id, taskId]
  );
  if (!result.rows[0])
    throw new ApiError(404, 'NOT_FOUND', 'Tarefa não encontrada.');
  return result.rows[0];
}

export async function updateTarefaStatus(
  request: FastifyRequest<TarefaStatusRequest>,
  reply: FastifyReply
) {
  const { origem } = request.params;
  if (!TAREFA_ORIGENS.includes(origem as (typeof TAREFA_ORIGENS)[number])) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Origem de tarefa inválida.');
  }
  const taskId = parsePositiveId(request.params.id, 'id');
  const status = request.body.status as StatusTarefaQuadro;
  if (!STATUS_TAREFA_QUADRO.includes(status)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Status de tarefa inválido.');
  }

  const user = await getCurrentUser(request.user?.id);
  const client = await database.connect();
  try {
    await client.query('begin');

    if (origem === 'projeto') {
      const current = await client.query<{
        equipe_id: number;
        status_projeto: string;
        task_status: string;
      }>(
        `select p.equipe_id, p.status as status_projeto, t.coluna_kanban as task_status
         from public.tarefas t
         join public.projetos p on p.id = t.projeto_id
         where t.id = $1
         for update of t`,
        [taskId]
      );
      if (!current.rows[0])
        throw new ApiError(404, 'NOT_FOUND', 'Tarefa não encontrada.');
      if (
        user.cargo !== 'Administrador' &&
        user.equipe_id !== current.rows[0].equipe_id
      ) {
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Você não pode atualizar tarefas de outra equipe.'
        );
      }
      if (current.rows[0].status_projeto === 'concluido') {
        throw new ApiError(
          409,
          'PROJECT_COMPLETED',
          'Reabra o projeto antes de atualizar tarefas.'
        );
      }
      await client.query(
        `update public.tarefas
         set coluna_kanban = $1,
             concluido_em = case when $1 = 'concluida' then coalesce(concluido_em, now()) else null end,
             concluido_por = case when $1 = 'concluida' then coalesce(concluido_por, $2) else null end
         where id = $3`,
        [status, user.id, taskId]
      );
      if (current.rows[0].task_status !== status) {
        await client.query(
          `insert into public.tarefa_historico (origem, tarefa_id, usuario_id, status_anterior, status_novo)
           values ('projeto', $1, $2, $3, $4)`,
          [taskId, user.id, current.rows[0].task_status, status]
        );
      }
    } else {
      const task = await getInteractionTaskAccess(client, taskId, user);
      if (!task.can_manage)
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Você não pode atualizar esta tarefa.'
        );
      await client.query(
        `update public.cliente_tarefas
         set status = $1,
             concluido_em = case when $1 = 'concluida' then coalesce(concluido_em, now()) else null end,
             concluido_por = case when $1 = 'concluida' then coalesce(concluido_por, $2) else null end
         where id = $3`,
        [status, user.id, taskId]
      );
      if (task.status !== status) {
        await client.query(
          `insert into public.tarefa_historico (origem, tarefa_id, usuario_id, status_anterior, status_novo)
           values ('interacao', $1, $2, $3, $4)`,
          [taskId, user.id, task.status, status]
        );
      }
    }

    await client.query('commit');
    return reply.send({ id: taskId, origem, status });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
