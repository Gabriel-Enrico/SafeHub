import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import type {
  EstagioOportunidade,
  OportunidadeBody,
  OportunidadeParams,
  OportunidadeNextActionBody,
  OportunidadePatchBody,
  OportunidadeStageBody,
} from '../type/oportunidades.js';
import { ESTAGIOS_OPORTUNIDADE } from '../type/oportunidades.js';
import { recordAudit } from '../utils/audit.js';

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
            o.previsao_fechamento, o.proxima_acao
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
         (id, titulo, cliente_id, responsavel_id, estagio, valor_estimado, previsao_fechamento, proxima_acao)
       values ($1, $2, $3, $4, 'prospeccao', $5, $6, $7)
       returning id`,
      [nextId.rows[0].next_id, titulo, clienteId, responsavelId,
        request.body.valor_estimado ?? null, request.body.previsao_fechamento ?? null,
        request.body.proxima_acao?.trim() || null]
    );
    await client.query(
      `insert into public.oportunidade_historico
         (oportunidade_id, estagio_anterior, estagio_novo, usuario_id)
       values ($1, null, 'prospeccao', $2)`,
      [inserted.rows[0].id, responsavelId]
    );
    await recordAudit(client, responsavelId, 'oportunidade', inserted.rows[0].id, 'criada', {
      titulo, cliente_id: clienteId, estagio: 'prospeccao',
      proxima_acao: request.body.proxima_acao?.trim() || null,
    });
    const result = await client.query(
      `select o.id, o.titulo, o.cliente_id, c.nome as cliente_nome,
              o.responsavel_id, u.nome as responsavel_nome, o.estagio,
              o.valor_estimado, o.previsao_fechamento, o.proxima_acao
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
      await recordAudit(client, responsavelId, 'oportunidade', id, 'estagio_alterado', {
        estagio: { anterior: current.estagio, novo: nextStage },
      });
    }
    const updated = await client.query(
      `select o.id, coalesce(nullif(trim(o.titulo), ''), c.nome) as titulo,
              o.cliente_id, c.nome as cliente_nome, o.responsavel_id,
              u.nome as responsavel_nome, o.estagio, o.valor_estimado,
              o.previsao_fechamento, o.proxima_acao
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

export async function updateOportunidadeNextAction(
  request: FastifyRequest<{ Params: OportunidadeParams; Body: OportunidadeNextActionBody }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const responsavelId = await getResponsavelId(request.user?.id);
  const nextAction = request.body.proxima_acao?.trim() || null;
  const client=await database.connect();
  try {
    await client.query('begin');
    const current=await client.query<{proxima_acao:string|null;estagio:string}>('select proxima_acao,estagio from public.oportunidades where id=$1 for update',[id]);
    if(!current.rows[0]) throw new ApiError(404,'NOT_FOUND','Oportunidade não encontrada.');
    const result=await client.query('update public.oportunidades set proxima_acao=$1 where id=$2 returning id,proxima_acao',[nextAction,id]);
    if(current.rows[0].proxima_acao!==nextAction) {
      await client.query(`insert into public.oportunidade_historico (oportunidade_id,estagio_anterior,estagio_novo,usuario_id,tipo_evento,campo,valor_anterior,valor_novo)
        values ($1,$2,$2,$3,'campo_alterado','proxima_acao',$4,$5)`,[id,current.rows[0].estagio,responsavelId,current.rows[0].proxima_acao,nextAction]);
      await recordAudit(client,responsavelId,'oportunidade',id,'proxima_acao_alterada',{proxima_acao:{anterior:current.rows[0].proxima_acao,novo:nextAction}});
    }
    await client.query('commit');
    return reply.send(result.rows[0]);
  } catch(error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

export async function updateOportunidade(
  request: FastifyRequest<{ Params: OportunidadeParams; Body: OportunidadePatchBody }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const actorId = await getResponsavelId(request.user?.id);
  const body = request.body;
  if (!Object.keys(body).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe ao menos um campo para atualizar.');
  if (body.titulo !== undefined && !body.titulo.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'O título da oportunidade é obrigatório.');
  if (body.valor_estimado != null && (!Number.isFinite(body.valor_estimado) || body.valor_estimado < 0)) throw new ApiError(400, 'VALIDATION_ERROR', 'O valor estimado deve ser igual ou maior que zero.');

  const client = await database.connect();
  try {
    await client.query('begin');
    const currentResult = await client.query<Record<string, unknown>>(
      'select * from public.oportunidades where id=$1 for update', [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Oportunidade não encontrada.');
    if (body.cliente_id !== undefined) {
      const exists = await client.query('select 1 from public.clientes where id=$1', [body.cliente_id]);
      if (!exists.rowCount) throw new ApiError(400, 'INVALID_CLIENT', 'Cliente não encontrado.');
    }
    if (body.responsavel_id != null) {
      const owner = await client.query('select 1 from public.usuarios where id=$1 and ativo=true', [body.responsavel_id]);
      if (!owner.rowCount) throw new ApiError(400, 'INVALID_OWNER', 'Selecione um usuário ativo como responsável.');
    }
    const changes: Array<[keyof OportunidadePatchBody, string]> = [
      ['titulo', 'titulo'], ['cliente_id', 'cliente_id'], ['responsavel_id', 'responsavel_id'],
      ['valor_estimado', 'valor_estimado'], ['previsao_fechamento', 'previsao_fechamento'], ['proxima_acao', 'proxima_acao'],
    ];
    const assignments: string[] = [];
    const values: unknown[] = [];
    const auditChanges: Record<string, { anterior: unknown; novo: unknown }> = {};
    for (const [field, column] of changes) {
      const value = body[field];
      if (value === undefined) continue;
      const normalized = typeof value === 'string' && field !== 'previsao_fechamento' ? value.trim() || null : value;
      const previous = current[column] ?? null;
      if (String(previous ?? '') === String(normalized ?? '')) continue;
      values.push(normalized);
      assignments.push(`${column}=$${values.length}`);
      auditChanges[column] = { anterior: previous, novo: normalized };
    }
    if (assignments.length) {
      values.push(id);
      await client.query(`update public.oportunidades set ${assignments.join(', ')} where id=$${values.length}`, values);
      for (const [field, change] of Object.entries(auditChanges)) {
        const currentStage = String(current.estagio ?? 'prospeccao');
        await client.query(
          `insert into public.oportunidade_historico (oportunidade_id,estagio_anterior,estagio_novo,usuario_id,tipo_evento,campo,valor_anterior,valor_novo)
           values ($1,$2,$2,$3,'campo_alterado',$4,$5,$6)`,
          [id, currentStage, actorId, field, change.anterior == null ? null : String(change.anterior), change.novo == null ? null : String(change.novo)]
        );
      }
      await recordAudit(client, actorId, 'oportunidade', id, 'atualizada', auditChanges);
    }
    const updated = await client.query(
      `select o.id, coalesce(nullif(trim(o.titulo), ''), c.nome) as titulo, o.cliente_id,
              c.nome as cliente_nome, o.responsavel_id, u.nome as responsavel_nome,
              o.estagio, o.valor_estimado, o.previsao_fechamento, o.proxima_acao
       from public.oportunidades o join public.clientes c on c.id=o.cliente_id
       left join public.usuarios u on u.id=o.responsavel_id where o.id=$1`, [id]
    );
    await client.query('commit');
    return reply.send(updated.rows[0]);
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

export async function listOportunidadeHistorico(
  request: FastifyRequest<{ Params: OportunidadeParams }>
) {
  const id = parseId(request.params.id);
  const exists = await database.query('select 1 from public.oportunidades where id = $1', [id]);
  if (!exists.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Oportunidade não encontrada.');
  const result = await database.query(
    `select h.id, h.oportunidade_id, h.estagio_anterior, h.estagio_novo,
            h.tipo_evento, h.campo, h.valor_anterior, h.valor_novo,
            case h.campo
              when 'responsavel_id' then (select u.nome from public.usuarios u where u.id::text=h.valor_anterior)
              when 'cliente_id' then (select c.nome from public.clientes c where c.id::text=h.valor_anterior)
              else null
            end as valor_anterior_exibicao,
            case h.campo
              when 'responsavel_id' then (select u.nome from public.usuarios u where u.id::text=h.valor_novo)
              when 'cliente_id' then (select c.nome from public.clientes c where c.id::text=h.valor_novo)
              else null
            end as valor_novo_exibicao,
            h.alterado_em, h.usuario_id, u.nome as usuario_nome
     from public.oportunidade_historico h
     join public.usuarios u on u.id = h.usuario_id
     where h.oportunidade_id = $1
     order by h.alterado_em desc, h.id desc`,
    [id]
  );
  return { data: result.rows };
}
