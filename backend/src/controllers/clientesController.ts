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
  } = request.query;
  if (nome?.trim()) addFilter('nome ilike ?', `%${nome.trim()}%`);
  if (setor?.trim()) addFilter('setor ilike ?', `%${setor.trim()}%`);
  if (statusPipeline?.trim())
    addFilter('status_pipeline = ?', statusPipeline.trim());
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
      `select id, nome, setor, status_pipeline, responsavel_id
       from public.clientes
       ${whereClause}
       order by id desc
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

export async function getClienteById(
  request: FastifyRequest<{ Params: ClienteParams }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const result = await database.query<Cliente>(
    `select id, nome, setor, status_pipeline, responsavel_id
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
  } = request.body;
  if (!nome.trim() || !status_pipeline.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Dados inválidos', {
      nome: !nome.trim() ? 'O nome não pode ficar vazio.' : undefined,
      status_pipeline: !status_pipeline.trim()
        ? 'O status não pode ficar vazio.'
        : undefined,
    });
  }

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
      `insert into public.clientes (id, nome, setor, status_pipeline, responsavel_id)
       values ($1, $2, $3, $4, $5)
       returning id, nome, setor, status_pipeline, responsavel_id`,
      [
        idResult.rows[0].next_id,
        nome.trim(),
        typeof setor === 'string' ? setor.trim() || null : setor,
        status_pipeline.trim(),
        responsavel_id,
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
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];

  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed && field !== 'setor') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Dados inválidos', {
          [field]: 'O campo não pode ficar vazio.',
        });
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

  values.push(id);
  const result = await database.query<Cliente>(
    `update public.clientes
      set ${assignments.join(', ')}
      where id = $${values.length}
      returning id, nome, setor, status_pipeline, responsavel_id`,
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
