import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import type {
  Cliente,
  ClienteBody,
  ClienteListQuery,
  ClienteParams,
  ClientePatch,
} from '../type/clientes.js';
import { ApiError, errorResponse } from '../utils/apiError.js';
import { getPagination } from '../utils/pagination.js';

function parseId(rawId: string): number {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID inválido', {
      id: 'Informe um inteiro maior que zero.',
    });
  }
  return id;
}

async function validateResponsavel(responsavelId: number | null | undefined) {
  if (responsavelId == null) return;
  const result = await database.query(
    'select 1 from public.usuarios where id = $1 and ativo = true',
    [responsavelId]
  );
  if (!result.rowCount)
    throw new ApiError(
      400,
      'INVALID_RESPONSAVEL',
      'Selecione um responsável ativo do SafeHub.'
    );
}

export async function listClientes(
  request: FastifyRequest<{ Querystring: ClienteListQuery }>
) {
  const { limit, offset } = getPagination(request);
  const conditions: string[] = [];
  const values: unknown[] = [];

  const addFilter = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replace('?', `$${values.length}`));
  };

  const {
    nome,
    setor,
    status_pipeline: statusPipeline,
    responsavel_id: responsavelId,
    pais,
    origem_relacionamento: origem,
  } = request.query;
  if (nome?.trim()) addFilter('nome ilike ?', `%${nome.trim()}%`);
  if (setor?.trim()) addFilter('setor ilike ?', `%${setor.trim()}%`);
  if (statusPipeline?.trim())
    addFilter('status_pipeline = ?', statusPipeline.trim());
  if (pais?.trim()) addFilter('pais ilike ?', `%${pais.trim()}%`);
  if (origem?.trim())
    addFilter('origem_relacionamento ilike ?', `%${origem.trim()}%`);
  if (responsavelId !== undefined) {
    const parsedResponsavelId = Number(responsavelId);
    if (!Number.isSafeInteger(parsedResponsavelId) || parsedResponsavelId < 1) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Filtro responsavel_id inválido',
        {
          responsavel_id: 'Informe um inteiro maior que zero.',
        }
      );
    }
    addFilter('responsavel_id = ?', parsedResponsavelId);
  }

  const whereClause =
    conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  const [result, countResult] = await Promise.all([
    database.query<Cliente>(
      `select c.id, c.nome, c.setor, c.status_pipeline, c.responsavel_id, c.pais, c.site, c.origem_relacionamento,
              c.endereco, c.observacoes,
              coalesce((select string_agg(cc.nome, ' ')
                        from public.contatos_cliente cc
                        where cc.cliente_id = c.id and cc.arquivado_em is null), '') as contatos_busca
              , (select i.proxima_acao from public.interacoes i
                 where i.cliente_id = c.id and nullif(trim(i.proxima_acao), '') is not null
                 order by i.data_interacao desc, i.id desc limit 1) as proxima_acao
              , (select max(i.data_interacao) from public.interacoes i where i.cliente_id = c.id) as ultima_interacao_em
                , (select count(*)::int from public.cliente_tarefas ct
                  where ct.cliente_id = c.id and ct.status <> 'concluida')
                 + (select count(*)::int from public.tarefas t
                   join public.projetos p on p.id = t.projeto_id
                   where p.cliente_id = c.id and t.coluna_kanban <> 'concluida') as tarefas_pendentes
       from public.clientes c
       ${whereClause}
       order by c.id desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, limit, offset]
    ),
    database.query<{ total: number }>(
      `select count(*)::int as total from public.clientes ${whereClause}`,
      values
    ),
  ]);

  return {
    data: result.rows,
    pagination: { limit, offset, total: countResult.rows[0]?.total ?? 0 },
  };
}

export async function getClientesIndicadores() {
  const result = await database.query(
    `select count(*)::int as total_clientes,
            count(*) filter (where lower(status_pipeline) in ('novo', 'prospeccao'))::int as em_prospeccao,
            count(*) filter (where lower(status_pipeline) in ('contato', 'em_contato'))::int as em_contato,
            (select count(*)::int from public.interacoes i
             where i.tipo = 'reuniao' and i.data_inicio >= now()) as reunioes_agendadas,
            count(*) filter (where lower(status_pipeline) in ('fechado', 'parceiro'))::int as parceiros,
            (select count(*)::int from public.contatos_cliente cc
             where cc.arquivado_em is null) as contatos_ativos,
            (select count(*)::int from public.interacoes i
             where i.tipo = 'reuniao' and i.status_relacionado = 'reuniao_realizada'
              and i.data_inicio >= date_trunc('month', current_date)
              and i.data_inicio < date_trunc('month', current_date) + interval '1 month') as reunioes_realizadas_periodo,
            (select count(*)::int from public.interacoes i
             where i.tipo = 'solicitacao' and i.status_relacionado in ('solicitacao_aberta', 'aguardando_resposta')) as solicitacoes_pendentes,
            (select count(*)::int from public.cliente_tarefas ct
             where ct.prazo < current_date and ct.status <> 'concluida')
            + (select count(*)::int from public.tarefas t
              join public.projetos p on p.id = t.projeto_id
              where t.prazo < current_date and t.coluna_kanban <> 'concluida' and p.status <> 'concluido') as tarefas_atrasadas
     from public.clientes`
  );
  return result.rows[0];
}

export async function listResponsaveisClientes() {
  const result = await database.query<{ id: number; nome: string }>(
    `select id, nome from public.usuarios where ativo = true order by nome`
  );
  return { data: result.rows };
}

export async function getClienteById(
  request: FastifyRequest<{ Params: ClienteParams }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const result = await database.query<Cliente>(
    `select id, nome, setor, status_pipeline, responsavel_id, pais, site, origem_relacionamento, endereco, observacoes
     from public.clientes where id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return reply
      .code(404)
      .send(errorResponse('NOT_FOUND', 'Cliente não encontrado'));
  }
  return result.rows[0];
}

export async function createCliente(
  request: FastifyRequest<{ Body: ClienteBody }>,
  reply: FastifyReply
) {
  const {
    nome,
    setor = null,
    status_pipeline = 'novo',
    responsavel_id = null,
    pais = null,
    site = null,
    origem_relacionamento = null,
    endereco = null,
    observacoes = null,
  } = request.body;
  if (!nome.trim() || !status_pipeline.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Dados inválidos', {
      nome: !nome.trim() ? 'O nome não pode ficar vazio.' : undefined,
      status_pipeline: !status_pipeline.trim()
        ? 'O status não pode ficar vazio.'
        : undefined,
    });
  }
  const normalizedSite = typeof site === 'string' ? site.trim() || null : site;
  if (normalizedSite) {
    try {
      const parsed = new URL(normalizedSite);
      if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('Invalid protocol');
    } catch {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Informe um site válido, incluindo https://.'
      );
    }
  }
  await validateResponsavel(responsavel_id);

  const client = await database.connect();
  try {
    await client.query('begin');
    // The current table has no identity/sequence for id, so serialize API inserts
    // while assigning the next integer without altering the table definition.
    await client.query('lock table public.clientes in exclusive mode');
    const idResult = await client.query<{ next_id: number }>(
      'select coalesce(max(id), 0) + 1 as next_id from public.clientes'
    );
    const result = await client.query<Cliente>(
      `insert into public.clientes (id, nome, setor, status_pipeline, responsavel_id, pais, site, origem_relacionamento, endereco, observacoes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, nome, setor, status_pipeline, responsavel_id, pais, site, origem_relacionamento, endereco, observacoes`,
      [
        idResult.rows[0].next_id,
        nome.trim(),
        typeof setor === 'string' ? setor.trim() || null : setor,
        status_pipeline.trim(),
        responsavel_id,
        typeof pais === 'string' ? pais.trim() || null : pais,
        normalizedSite,
        typeof origem_relacionamento === 'string'
          ? origem_relacionamento.trim() || null
          : origem_relacionamento,
        typeof endereco === 'string' ? endereco.trim() || null : endereco,
        typeof observacoes === 'string'
          ? observacoes.trim() || null
          : observacoes,
      ]
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

export async function updateCliente(
  request: FastifyRequest<{ Params: ClienteParams; Body: ClientePatch }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const fields: Array<[keyof ClientePatch, string]> = [
    ['nome', 'nome'],
    ['setor', 'setor'],
    ['status_pipeline', 'status_pipeline'],
    ['responsavel_id', 'responsavel_id'],
    ['pais', 'pais'],
    ['site', 'site'],
    ['origem_relacionamento', 'origem_relacionamento'],
    ['endereco', 'endereco'],
    ['observacoes', 'observacoes'],
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];

  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (
        !trimmed &&
        ![
          'setor',
          'pais',
          'site',
          'origem_relacionamento',
          'endereco',
          'observacoes',
        ].includes(field)
      ) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Dados inválidos', {
          [field]: 'O campo não pode ficar vazio.',
        });
      }
      if (field === 'site' && trimmed) {
        try {
          const parsed = new URL(trimmed);
          if (!['http:', 'https:'].includes(parsed.protocol))
            throw new Error('Invalid protocol');
        } catch {
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Informe um site válido, incluindo https://.'
          );
        }
      }
      values.push(trimmed || null);
    } else {
      values.push(value);
    }
    assignments.push(`${column} = $${values.length}`);
  }

  if (assignments.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Nenhum campo para atualizar');
  }

  if (request.body.responsavel_id !== undefined)
    await validateResponsavel(request.body.responsavel_id);

  values.push(id);
  const result = await database.query<Cliente>(
    `update public.clientes
      set ${assignments.join(', ')}
      where id = $${values.length}
      returning id, nome, setor, status_pipeline, responsavel_id, pais, site, origem_relacionamento, endereco, observacoes`,
    values
  );

  if (result.rows.length === 0) {
    return reply
      .code(404)
      .send(errorResponse('NOT_FOUND', 'Cliente não encontrado'));
  }
  return result.rows[0];
}

export async function deleteCliente(
  request: FastifyRequest<{ Params: ClienteParams }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const result = await database.query<{ id: number }>(
    `delete from public.clientes where id = $1 returning id`,
    [id]
  );

  if (result.rows.length === 0) {
    return reply
      .code(404)
      .send(errorResponse('NOT_FOUND', 'Cliente não encontrado'));
  }
  return reply.code(204).send();
}
