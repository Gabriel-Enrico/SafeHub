import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import type {
  ProjetoBody,
  ProjetoParams,
  ProjetoPatch,
  ProjetoTarefasParams,
  EquipeParams,
  TarefaBody,
  TarefaParams,
  TarefaPatch,
} from '../type/projetos.js';
import { COLUNAS_TAREFA, PRIORIDADES_TAREFA, STATUS_PROJETO } from '../type/projetos.js';

function parseId(rawId: string): number {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'VALIDATION_ERROR', 'ID inválido.');
  return id;
}

async function getCurrentUser(authUserId: string | undefined) {
  if (!authUserId) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{ id: number; equipe_id: number | null; cargo: string | null }>(
    'select id, equipe_id, cargo from public.usuarios where auth_user_id = $1 and ativo = true', [authUserId]
  );
  if (!result.rows[0]) throw new ApiError(403, 'PROFILE_INACTIVE', 'Perfil SafeHub não encontrado ou desativado.');
  return result.rows[0];
}

async function validateProjectReferences(equipeId: number, clienteId: number | undefined) {
  const team = await database.query('select 1 from public.equipes where id = $1', [equipeId]);
  if (!team.rowCount) throw new ApiError(404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
  if (clienteId !== undefined) {
    const client = await database.query('select 1 from public.clientes where id = $1', [clienteId]);
    if (!client.rowCount) throw new ApiError(404, 'CLIENT_NOT_FOUND', 'Cliente não encontrado.');
  }
}

export async function listProjectTeams(request: FastifyRequest) {
  const currentUser = await getCurrentUser(request.user?.id);
  const result = currentUser.cargo === 'Administrador'
    ? await database.query<{ id: number; nome: string }>('select id, nome from public.equipes order by nome')
    : await database.query<{ id: number; nome: string }>('select id, nome from public.equipes where id = $1 order by nome', [currentUser.equipe_id]);
  return { data: result.rows };
}

export async function listProjectTeamMembers(request: FastifyRequest<{ Params: EquipeParams }>) {
  const currentUser = await getCurrentUser(request.user?.id);
  const equipeId = parseId(request.params.equipeId);
  if (currentUser.cargo !== 'Administrador' && currentUser.equipe_id !== equipeId) {
    throw new ApiError(403, 'FORBIDDEN', 'Você não pode consultar usuários de outra equipe.');
  }
  const result = await database.query<{ id: number; nome: string }>(
    'select id, nome from public.usuarios where equipe_id = $1 and ativo = true order by nome', [equipeId]
  );
  return { data: result.rows };
}

export async function listProjects(request: FastifyRequest) {
  const currentUser = await getCurrentUser(request.user?.id);
  const filters = currentUser.cargo === 'Administrador' ? '' : 'where p.equipe_id = $1';
  const result = await database.query(
    `select p.id, p.nome, p.descricao, p.equipe_id, e.nome as equipe_nome,
            p.cliente_id, c.nome as cliente_nome, p.status, p.data_inicio,
            count(t.id)::int as total_tarefas,
            count(t.id) filter (where t.coluna_kanban = 'concluida')::int as tarefas_concluidas
     from public.projetos p
     left join public.equipes e on e.id = p.equipe_id
     left join public.clientes c on c.id = p.cliente_id
     left join public.tarefas t on t.projeto_id = p.id
     ${filters}
     group by p.id, e.nome, c.nome
     order by p.id desc`, currentUser.cargo === 'Administrador' ? [] : [currentUser.equipe_id]
  );
  return { data: result.rows };
}

export async function createProject(
  request: FastifyRequest<{ Body: ProjetoBody }>, reply: FastifyReply
) {
  const body = request.body;
  const nome = body.nome.trim();
  if (!nome) throw new ApiError(400, 'VALIDATION_ERROR', 'O nome do projeto é obrigatório.');
  const currentUser = await getCurrentUser(request.user?.id);
  if (currentUser.cargo !== 'Administrador' && currentUser.equipe_id !== body.equipe_id) {
    throw new ApiError(403, 'FORBIDDEN', 'Você só pode criar projetos para sua equipe.');
  }
  await validateProjectReferences(body.equipe_id, body.cliente_id);

  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query('lock table public.projetos in exclusive mode');
    const nextId = await client.query<{ next_id: number }>(
      'select coalesce(max(id), 0) + 1 as next_id from public.projetos'
    );
    const inserted = await client.query(
      `insert into public.projetos (id, nome, descricao, equipe_id, cliente_id, status, data_inicio)
       values ($1, $2, $3, $4, $5, 'em_planejamento', $6)
       returning id, nome, descricao, equipe_id, cliente_id, status, data_inicio`,
      [nextId.rows[0].next_id, nome, body.descricao?.trim() || null, body.equipe_id,
        body.cliente_id ?? null, body.data_inicio ?? null]
    );
    await client.query('commit');
    return reply.code(201).send(inserted.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProject(
  request: FastifyRequest<{ Params: ProjetoParams; Body: ProjetoPatch }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const currentUser = await getCurrentUser(request.user?.id);
  const existing = await database.query<{ equipe_id: number }>('select equipe_id from public.projetos where id = $1', [id]);
  if (!existing.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.');
  if (currentUser.cargo !== 'Administrador' && currentUser.equipe_id !== existing.rows[0].equipe_id) {
    throw new ApiError(403, 'FORBIDDEN', 'Você não pode gerenciar projetos de outra equipe.');
  }
  if (request.body.equipe_id !== undefined && currentUser.cargo !== 'Administrador' && request.body.equipe_id !== currentUser.equipe_id) {
    throw new ApiError(403, 'FORBIDDEN', 'Você só pode atribuir o projeto à sua equipe.');
  }
  if (request.body.equipe_id !== undefined && request.body.equipe_id !== existing.rows[0].equipe_id) {
    const tasks = await database.query('select 1 from public.tarefas where projeto_id = $1 limit 1', [id]);
    if (tasks.rowCount) throw new ApiError(409, 'PROJECT_HAS_TASKS', 'Não é possível trocar a equipe de um projeto que já possui tarefas.');
  }
  const fields: Array<[keyof ProjetoPatch, string]> = [
    ['nome', 'nome'], ['descricao', 'descricao'], ['equipe_id', 'equipe_id'],
    ['cliente_id', 'cliente_id'], ['data_inicio', 'data_inicio'], ['status', 'status'],
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];
  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    if (field === 'nome' && typeof value === 'string' && !value.trim()) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'O nome do projeto é obrigatório.');
    }
    values.push(typeof value === 'string' ? value.trim() || null : value);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe ao menos um campo para atualizar.');
  if (request.body.equipe_id !== undefined) await validateProjectReferences(request.body.equipe_id, request.body.cliente_id);
  if (request.body.cliente_id) {
    const client = await database.query('select 1 from public.clientes where id = $1', [request.body.cliente_id]);
    if (!client.rowCount) throw new ApiError(404, 'CLIENT_NOT_FOUND', 'Cliente não encontrado.');
  }
  values.push(id);
  const result = await database.query(
    `update public.projetos set ${assignments.join(', ')} where id = $${values.length}
     returning id, nome, descricao, equipe_id, cliente_id, status, data_inicio`, values
  );
  if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.');
  return reply.send(result.rows[0]);
}

export async function listProjectTasks(
  request: FastifyRequest<{ Params: ProjetoTarefasParams }>
) {
  const projectId = parseId(request.params.projetoId);
  const currentUser = await getCurrentUser(request.user?.id);
  const exists = await database.query<{ equipe_id: number }>('select equipe_id from public.projetos where id = $1', [projectId]);
  if (!exists.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.');
  if (currentUser.cargo !== 'Administrador' && currentUser.equipe_id !== exists.rows[0].equipe_id) {
    throw new ApiError(403, 'FORBIDDEN', 'Você não pode consultar tarefas de outra equipe.');
  }
  const result = await database.query(
    `select t.id, t.projeto_id, t.titulo, t.prioridade, t.prazo, t.coluna_kanban,
            coalesce(array_agg(distinct u.id) filter (where u.id is not null), '{}') as responsaveis_ids,
            coalesce(array_agg(distinct u.nome) filter (where u.id is not null), '{}') as responsaveis_nomes
     from public.tarefas t
     left join public.tarefa_responsavel tr on tr.tarefa_id = t.id
     left join public.usuarios u on u.id = tr.usuario_id
     where t.projeto_id = $1
     group by t.id
     order by t.id desc`, [projectId]
  );
  return { data: result.rows };
}

async function saveTaskAssignees(client: PoolClient, taskId: number, ids: number[], equipeId: number) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length) {
    const users = await client.query(
      'select id from public.usuarios where id = any($1::int[]) and ativo = true and equipe_id = $2', [uniqueIds, equipeId]
    );
    if (users.rowCount !== uniqueIds.length) throw new ApiError(400, 'INVALID_ASSIGNEES', 'Um ou mais responsáveis não são usuários ativos.');
  }
  await client.query('delete from public.tarefa_responsavel where tarefa_id = $1', [taskId]);
  for (const userId of uniqueIds) {
    await client.query('insert into public.tarefa_responsavel (tarefa_id, usuario_id) values ($1, $2)', [taskId, userId]);
  }
}

export async function createProjectTask(
  request: FastifyRequest<{ Params: ProjetoTarefasParams; Body: TarefaBody }>, reply: FastifyReply
) {
  const projectId = parseId(request.params.projetoId);
  const titulo = request.body.titulo.trim();
  if (!titulo) throw new ApiError(400, 'VALIDATION_ERROR', 'O título da tarefa é obrigatório.');
  const user = await getCurrentUser(request.user?.id);
  const client = await database.connect();
  try {
    await client.query('begin');
    const project = await client.query<{ equipe_id: number; status: string }>(
      'select equipe_id, status from public.projetos where id = $1 for update', [projectId]
    );
    if (!project.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.');
    if (project.rows[0].equipe_id == null) throw new ApiError(409, 'PROJECT_TEAM_REQUIRED', 'Defina uma equipe no projeto antes de criar tarefas.');
    if (project.rows[0].status === 'concluido') throw new ApiError(409, 'PROJECT_COMPLETED', 'Reabra o projeto antes de criar tarefas.');
    if (user.equipe_id !== project.rows[0].equipe_id && user.cargo !== 'Administrador') {
      throw new ApiError(403, 'FORBIDDEN', 'Somente membros da equipe do projeto podem gerenciar suas tarefas.');
    }
    await client.query('lock table public.tarefas in exclusive mode');
    const nextId = await client.query<{ next_id: number }>('select coalesce(max(id), 0) + 1 as next_id from public.tarefas');
    const inserted = await client.query<{ id: number }>(
      `insert into public.tarefas (id, projeto_id, titulo, prioridade, prazo, coluna_kanban)
       values ($1, $2, $3, $4, $5, 'a_fazer') returning id`,
      [nextId.rows[0].next_id, projectId, titulo, request.body.prioridade ?? 'media', request.body.prazo ?? null]
    );
    await saveTaskAssignees(client, inserted.rows[0].id, request.body.responsaveis_ids ?? [], project.rows[0].equipe_id);
    const result = await client.query(
      `select t.id, t.projeto_id, t.titulo, t.prioridade, t.prazo, t.coluna_kanban,
              coalesce(array_agg(distinct u.id) filter (where u.id is not null), '{}') as responsaveis_ids,
              coalesce(array_agg(distinct u.nome) filter (where u.id is not null), '{}') as responsaveis_nomes
       from public.tarefas t left join public.tarefa_responsavel tr on tr.tarefa_id = t.id
       left join public.usuarios u on u.id = tr.usuario_id where t.id = $1 group by t.id`, [inserted.rows[0].id]
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

export async function updateTask(
  request: FastifyRequest<{ Params: TarefaParams; Body: TarefaPatch }>, reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const user = await getCurrentUser(request.user?.id);
  const client = await database.connect();
  try {
    await client.query('begin');
    const current = await client.query<{ equipe_id: number; projeto_id: number; status: string }>(
      `select p.equipe_id, p.status, t.projeto_id from public.tarefas t join public.projetos p on p.id = t.projeto_id
       where t.id = $1 for update of t`, [id]
    );
    const task = current.rows[0];
    if (!task) throw new ApiError(404, 'NOT_FOUND', 'Tarefa não encontrada.');
    if (task.status === 'concluido') throw new ApiError(409, 'PROJECT_COMPLETED', 'Reabra o projeto antes de atualizar tarefas.');
    if (user.equipe_id !== task.equipe_id && user.cargo !== 'Administrador') {
      throw new ApiError(403, 'FORBIDDEN', 'Somente membros da equipe do projeto podem gerenciar suas tarefas.');
    }
    const fields: Array<[keyof TarefaPatch, string]> = [
      ['titulo', 'titulo'], ['prioridade', 'prioridade'], ['prazo', 'prazo'], ['coluna_kanban', 'coluna_kanban'],
    ];
    const values: unknown[] = [];
    const assignments: string[] = [];
    for (const [field, column] of fields) {
      const value = request.body[field];
      if (value === undefined) continue;
      if (field === 'titulo' && typeof value === 'string' && !value.trim()) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'O título da tarefa é obrigatório.');
      }
      values.push(typeof value === 'string' ? value.trim() || null : value);
      assignments.push(`${column} = $${values.length}`);
    }
    if (assignments.length) {
      values.push(id);
      await client.query(`update public.tarefas set ${assignments.join(', ')} where id = $${values.length}`, values);
    }
    if (request.body.responsaveis_ids !== undefined) await saveTaskAssignees(client, id, request.body.responsaveis_ids, task.equipe_id);
    if (!assignments.length && request.body.responsaveis_ids === undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Informe ao menos um campo para atualizar.');
    }
    const result = await client.query(
      `select t.id, t.projeto_id, t.titulo, t.prioridade, t.prazo, t.coluna_kanban,
              coalesce(array_agg(distinct u.id) filter (where u.id is not null), '{}') as responsaveis_ids,
              coalesce(array_agg(distinct u.nome) filter (where u.id is not null), '{}') as responsaveis_nomes
       from public.tarefas t left join public.tarefa_responsavel tr on tr.tarefa_id = t.id
       left join public.usuarios u on u.id = tr.usuario_id where t.id = $1 group by t.id`, [id]
    );
    await client.query('commit');
    return reply.send(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
