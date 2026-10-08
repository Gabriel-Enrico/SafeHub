import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { getSupabaseAdmin } from '../config/supabaseAdmin.js';
import type {
  Usuario,
  UsuarioListQuery,
  UsuarioParams,
  UsuarioPatch,
  UsuarioInviteBody,
} from '../type/usuarios.js';
import { ApiError } from '../utils/apiError.js';
import { getPagination } from '../utils/pagination.js';

function parseId(rawId: string): number {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID de usuário inválido.');
  }
  return id;
}

function requireAuthUserId(request: FastifyRequest): string {
  if (!request.user?.id) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  }
  return request.user.id;
}

export async function getMyPerfil(request: FastifyRequest): Promise<Usuario> {
  const result = await database.query<Usuario>(
    `select id, nome, email, cargo, equipe_id, avatar, ativo
     from public.usuarios where auth_user_id = $1`,
    [requireAuthUserId(request)]
  );
  const usuario = result.rows[0];
  if (!usuario) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado.');
  return usuario;
}

export async function listUsuarios(
  request: FastifyRequest<{ Querystring: UsuarioListQuery }>
) {
  const { limit, offset } = getPagination(request);
  const search = request.query.busca?.trim();
  const filter = search ? 'where nome ilike $1 or email ilike $1' : '';
  const params: unknown[] = search ? [`%${search}%`] : [];
  const [rows, count] = await Promise.all([
    database.query<Usuario>(
      `select id, nome, email, cargo, equipe_id, avatar, ativo
       from public.usuarios ${filter}
       order by id desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    ),
    database.query<{ total: number }>(
      `select count(*)::int as total from public.usuarios ${filter}`,
      params
    ),
  ]);
  return { data: rows.rows, pagination: { limit, offset, total: count.rows[0]?.total ?? 0 } };
}

export async function getUsuarioById(
  request: FastifyRequest<{ Params: UsuarioParams }>,
  reply: FastifyReply
) {
  const result = await database.query<Usuario>(
    `select id, nome, email, cargo, equipe_id, avatar, ativo
     from public.usuarios where id = $1`,
    [parseId(request.params.id)]
  );
  if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Usuário não encontrado.');
  return reply.send(result.rows[0]);
}

export async function inviteUsuario(
  request: FastifyRequest<{ Body: UsuarioInviteBody }>,
  reply: FastifyReply
) {
  const nome = request.body.nome.trim();
  const email = request.body.email.trim().toLowerCase();
  const cargo = request.body.cargo;
  if (!nome || !email) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Nome e e-mail são obrigatórios.');
  }

  const existing = await database.query('select 1 from public.usuarios where lower(email) = $1', [email]);
  if (existing.rowCount) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Já existe um perfil com esse e-mail.');

  const frontendUrl = process.env.SAFEHUB_FRONTEND_URL;
  if (!frontendUrl) throw new ApiError(500, 'CONFIGURATION_ERROR', 'SAFEHUB_FRONTEND_URL não configurada.');

  const admin = getSupabaseAdmin();
  const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${frontendUrl.replace(/\/$/, '')}/?flow=invite`,
    data: { nome },
  });
  if (invitationError || !invitation.user) {
    request.log.error({ err: invitationError }, 'Falha ao convidar usuário pelo Supabase');
    throw new ApiError(400, 'INVITE_FAILED', invitationError?.message ?? 'Não foi possível enviar o convite.');
  }

  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query('lock table public.usuarios in exclusive mode');
    const nextId = await client.query<{ next_id: number }>(
      'select coalesce(max(id), 0) + 1 as next_id from public.usuarios'
    );
    const inserted = await client.query<Usuario>(
      `insert into public.usuarios (id, auth_user_id, nome, email, cargo, equipe_id, avatar, ativo)
       values ($1, $2, $3, $4, $5, $6, $7, true)
       returning id, nome, email, cargo, equipe_id, avatar, ativo`,
      [nextId.rows[0].next_id, invitation.user.id, nome, email, cargo, request.body.equipe_id ?? null, null]
    );
    await client.query('commit');
    return reply.code(201).send(inserted.rows[0]);
  } catch (error) {
    await client.query('rollback');
    const { error: cleanupError } = await admin.auth.admin.deleteUser(invitation.user.id);
    if (cleanupError) request.log.error({ err: cleanupError }, 'Falha ao desfazer usuário convidado após erro no perfil');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUsuario(
  request: FastifyRequest<{ Params: UsuarioParams; Body: UsuarioPatch }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const fields: Array<[keyof UsuarioPatch, string]> = [
    ['nome', 'nome'], ['cargo', 'cargo'], ['equipe_id', 'equipe_id'], ['avatar', 'avatar'], ['ativo', 'ativo'],
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];
  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    if (field === 'nome' && typeof value === 'string' && !value.trim()) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'O nome não pode ficar vazio.');
    }
    values.push(field === 'nome' && typeof value === 'string' ? value.trim() : value);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe pelo menos um campo para atualizar.');

  const client = await database.connect();
  let authBanChange: { userId: string; wasActive: boolean } | undefined;
  try {
    await client.query('begin');
    await client.query('lock table public.usuarios in exclusive mode');
    const currentResult = await client.query<Usuario & { auth_user_id: string }>(
      `select id, auth_user_id, nome, email, cargo, equipe_id, avatar, ativo
       from public.usuarios where id = $1`, [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Usuário não encontrado.');
    if (
      current.auth_user_id === requireAuthUserId(request) &&
      (request.body.ativo === false || request.body.cargo === 'Operador')
    ) {
      throw new ApiError(400, 'SELF_DEACTIVATION', 'Você não pode remover seu próprio acesso administrativo.');
    }
    const removesAdminAccess = current.ativo && current.cargo === 'Administrador' &&
      (request.body.ativo === false || request.body.cargo === 'Operador');
    if (removesAdminAccess) {
      const admins = await client.query<{ total: number }>(
        `select count(*)::int as total from public.usuarios
         where ativo = true and cargo = 'Administrador'`
      );
      if ((admins.rows[0]?.total ?? 0) <= 1) {
        throw new ApiError(400, 'LAST_ADMIN', 'Não é possível desativar o último administrador ativo.');
      }
    }
    if (request.body.ativo !== undefined && request.body.ativo !== current.ativo) {
      const { error: authError } = await getSupabaseAdmin().auth.admin.updateUserById(
        current.auth_user_id,
        { ban_duration: request.body.ativo ? 'none' : '876000h' }
      );
      if (authError) {
        request.log.error({ err: authError, usuarioId: id }, 'Falha ao alterar permissão de login no Supabase Auth');
        throw new ApiError(502, 'AUTH_ACCOUNT_UPDATE_FAILED', 'Não foi possível alterar o acesso de login do usuário.');
      }
      authBanChange = { userId: current.auth_user_id, wasActive: current.ativo };
    }
    values.push(id);
    const result = await client.query<Usuario>(
      `update public.usuarios set ${assignments.join(', ')}
       where id = $${values.length}
       returning id, nome, email, cargo, equipe_id, avatar, ativo`, values
    );
    await client.query('commit');
    return reply.send(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    if (authBanChange) {
      try {
        const { error: rollbackAuthError } = await getSupabaseAdmin().auth.admin.updateUserById(
          authBanChange.userId,
          { ban_duration: authBanChange.wasActive ? 'none' : '876000h' }
        );
        if (rollbackAuthError) request.log.error({ err: rollbackAuthError }, 'Falha ao reverter alteração de bloqueio de login');
      } catch (rollbackAuthError) {
        request.log.error({ err: rollbackAuthError }, 'Falha ao reverter alteração de bloqueio de login');
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateUsuario(
  request: FastifyRequest<{ Params: UsuarioParams }>,
  reply: FastifyReply
) {
  return updateUsuario(
    { ...request, body: { ativo: false } } as FastifyRequest<{ Params: UsuarioParams; Body: UsuarioPatch }>,
    reply
  );
}
