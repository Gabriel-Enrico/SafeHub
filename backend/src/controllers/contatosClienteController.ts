import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import type { ContatoCliente, ContatoClienteBody, ContatoClienteParams } from '../type/contatosCliente.js';

function parseId(rawId: string, field: string): number {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'VALIDATION_ERROR', `${field} inválido.`);
  return id;
}

async function requireCliente(clienteId: number) {
  const result = await database.query('select 1 from public.clientes where id = $1', [clienteId]);
  if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Empresa não encontrada.');
}

function normalizeEmail(email: string | null | undefined): string | null {
  return typeof email === 'string' ? email.trim().toLowerCase() || null : email ?? null;
}

async function ensureEmailIsUnique(clienteId: number, email: string | null, excludeId?: number) {
  if (!email) return;
  const result = await database.query(
    `select 1 from public.contatos_cliente
     where cliente_id = $1 and lower(btrim(email)) = $2 and arquivado_em is null
       and ($3::int is null or id <> $3) limit 1`,
    [clienteId, email, excludeId ?? null]
  );
  if (result.rowCount) throw new ApiError(409, 'CONTACT_EMAIL_EXISTS', 'Já existe um contato desta empresa com esse e-mail.');
}

export async function listContatosCliente(request: FastifyRequest<{ Params: { id: string } }>) {
  const clienteId = parseId(request.params.id, 'id');
  await requireCliente(clienteId);
  const result = await database.query<ContatoCliente>(
    `select id, cliente_id, nome, cargo, email, telefone, criado_em
     from public.contatos_cliente
     where cliente_id = $1 and arquivado_em is null
     order by nome`, [clienteId]
  );
  return { data: result.rows };
}

export async function createContatoCliente(
  request: FastifyRequest<{ Params: { id: string }; Body: ContatoClienteBody }>,
  reply: FastifyReply
) {
  const clienteId = parseId(request.params.id, 'id');
  await requireCliente(clienteId);
  const nome = request.body.nome.trim();
  const email = normalizeEmail(request.body.email);
  if (!nome) throw new ApiError(400, 'VALIDATION_ERROR', 'O nome do contato é obrigatório.');
  await ensureEmailIsUnique(clienteId, email);
  try {
    const result = await database.query<ContatoCliente>(
      `insert into public.contatos_cliente (cliente_id, nome, cargo, email, telefone)
       values ($1, $2, $3, $4, $5)
       returning id, cliente_id, nome, cargo, email, telefone, criado_em`,
      [clienteId, nome, request.body.cargo?.trim() || null, email, request.body.telefone?.trim() || null]
    );
    return reply.code(201).send(result.rows[0]);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'CONTACT_EMAIL_EXISTS', 'Já existe um contato desta empresa com esse e-mail.');
    }
    throw error;
  }
}

export async function updateContatoCliente(
  request: FastifyRequest<{ Params: ContatoClienteParams; Body: Partial<ContatoClienteBody> }>,
  reply: FastifyReply
) {
  const clienteId = parseId(request.params.id, 'id');
  const contatoId = parseId(request.params.contatoId, 'contatoId');
  await requireCliente(clienteId);
  const fields: Array<[keyof ContatoClienteBody, string]> = [
    ['nome', 'nome'], ['cargo', 'cargo'], ['email', 'email'], ['telefone', 'telefone'],
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];
  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    if (field === 'nome' && typeof value === 'string' && !value.trim()) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'O nome do contato é obrigatório.');
    }
    const normalized = field === 'email' ? normalizeEmail(value as string | null) : typeof value === 'string' ? value.trim() || null : value;
    values.push(normalized);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe algum campo para atualizar.');
  const emailValue = request.body.email === undefined ? undefined : normalizeEmail(request.body.email);
  if (emailValue !== undefined) await ensureEmailIsUnique(clienteId, emailValue, contatoId);
  values.push(clienteId, contatoId);
  try {
    const result = await database.query<ContatoCliente>(
      `update public.contatos_cliente set ${assignments.join(', ')}, atualizado_em = now()
       where cliente_id = $${values.length - 1} and id = $${values.length} and arquivado_em is null
       returning id, cliente_id, nome, cargo, email, telefone, criado_em`, values
    );
    if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Contato não encontrado.');
    return reply.send(result.rows[0]);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'CONTACT_EMAIL_EXISTS', 'Já existe um contato desta empresa com esse e-mail.');
    }
    throw error;
  }
}

export async function deleteContatoCliente(
  request: FastifyRequest<{ Params: ContatoClienteParams }>, reply: FastifyReply
) {
  const clienteId = parseId(request.params.id, 'id');
  const contatoId = parseId(request.params.contatoId, 'contatoId');
  await requireCliente(clienteId);
  const result = await database.query(
    `update public.contatos_cliente set arquivado_em = now(), atualizado_em = now()
     where cliente_id = $1 and id = $2 and arquivado_em is null returning id`, [clienteId, contatoId]
  );
  if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Contato não encontrado.');
  return reply.code(204).send();
}
