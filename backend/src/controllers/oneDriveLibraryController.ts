import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';

const LINK_TABLES = {
  cliente: 'public.clientes',
  projeto: 'public.projetos',
  edital: 'public.editais',
  tarefa_projeto: 'public.tarefas',
  tarefa_cliente: 'public.cliente_tarefas',
} as const;
type LinkType = keyof typeof LINK_TABLES;
type LibraryBody = {
  drive_item_id: string;
  nome: string;
  web_url: string;
  categoria: string;
  versao?: string;
  revisar_em?: string | null;
  equipe_id?: number | null;
  vinculo_tipo?: LinkType | null;
  vinculo_id?: number | null;
};
export type LibraryPatch = Partial<
  Omit<LibraryBody, 'drive_item_id' | 'nome' | 'web_url'>
>;
type CurrentUser = {
  id: number;
  equipe_id: number | null;
  cargo: string | null;
};

async function getCurrentUser(
  authUserId: string | undefined
): Promise<CurrentUser> {
  if (!authUserId)
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<CurrentUser>(
    'select id, equipe_id, cargo from public.usuarios where auth_user_id = $1 and ativo = true',
    [authUserId]
  );
  if (!result.rows[0])
    throw new ApiError(
      403,
      'PROFILE_INACTIVE',
      'Perfil SafeHub não encontrado.'
    );
  return result.rows[0];
}

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID inválido.');
  return id;
}

function validateWebUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'O link do OneDrive deve usar HTTPS.'
    );
  }
}

async function validateLink(
  type: LinkType | null | undefined,
  id: number | null | undefined
) {
  if (type == null && id == null) return;
  if (!type || id == null || !LINK_TABLES[type])
    throw new ApiError(
      400,
      'INVALID_LINK',
      'Selecione um tipo e um registro válido para o vínculo.'
    );
  const table = LINK_TABLES[type];
  const result = await database.query(`select 1 from ${table} where id = $1`, [
    id,
  ]);
  if (!result.rowCount)
    throw new ApiError(
      404,
      'LINK_NOT_FOUND',
      'O registro vinculado não foi encontrado.'
    );
}

async function validateTeam(
  user: CurrentUser,
  teamId: number | null | undefined
) {
  if (teamId == null) return;
  if (user.cargo !== 'Administrador' && user.equipe_id !== teamId)
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Você só pode compartilhar na sua equipe.'
    );
  const team = await database.query(
    'select 1 from public.equipes where id = $1',
    [teamId]
  );
  if (!team.rowCount)
    throw new ApiError(404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
}

export async function listOneDriveLibrary(
  request: FastifyRequest<{
    Querystring: { busca?: string; categoria?: string };
  }>
) {
  const user = await getCurrentUser(request.user?.id);
  const search = request.query.busca?.trim() || null;
  const category = request.query.categoria?.trim() || null;
  const result = await database.query(
    `select d.id, d.drive_item_id, d.nome, d.web_url, d.categoria, d.versao,
            d.revisar_em, d.proprietario_id, owner.nome as proprietario_nome,
            d.equipe_id, team.nome as equipe_nome, d.vinculo_tipo, d.vinculo_id,
            d.criado_em, d.atualizado_em
     from public.biblioteca_documentos d
     left join public.usuarios owner on owner.id = d.proprietario_id
     left join public.equipes team on team.id = d.equipe_id
     where ($1::boolean or d.proprietario_id = $2 or d.criado_por = $2 or d.equipe_id = $3)
       and ($4::text is null or d.nome ilike '%' || $4 || '%')
       and ($5::text is null or d.categoria = $5)
     order by d.categoria, d.nome`,
    [user.cargo === 'Administrador', user.id, user.equipe_id, search, category]
  );
  return { data: result.rows };
}

export async function createOneDriveLibraryItem(
  request: FastifyRequest<{ Body: LibraryBody }>,
  reply: FastifyReply
) {
  const user = await getCurrentUser(request.user?.id);
  const body = request.body;
  const driveItemId = body.drive_item_id.trim();
  const name = body.nome.trim();
  const category = body.categoria.trim();
  if (!driveItemId || !name || !category)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Arquivo e categoria são obrigatórios.'
    );
  await validateTeam(user, body.equipe_id);
  await validateLink(body.vinculo_tipo, body.vinculo_id);
  const result = await database.query(
    `insert into public.biblioteca_documentos
       (drive_item_id, nome, web_url, categoria, versao, revisar_em,
        proprietario_id, equipe_id, criado_por, vinculo_tipo, vinculo_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$7,$9,$10)
     on conflict (drive_item_id, criado_por) do update set
       nome = excluded.nome, web_url = excluded.web_url,
       categoria = excluded.categoria, versao = excluded.versao,
       revisar_em = excluded.revisar_em, equipe_id = excluded.equipe_id,
       vinculo_tipo = excluded.vinculo_tipo, vinculo_id = excluded.vinculo_id,
       atualizado_em = now()
     returning id, drive_item_id, nome, web_url, categoria, versao, revisar_em,
               proprietario_id, equipe_id, vinculo_tipo, vinculo_id, criado_em, atualizado_em`,
    [
      driveItemId,
      name,
      validateWebUrl(body.web_url),
      category,
      body.versao?.trim() || '1.0',
      body.revisar_em ?? null,
      user.id,
      body.equipe_id ?? null,
      body.vinculo_tipo ?? null,
      body.vinculo_id ?? null,
    ]
  );
  return reply.code(201).send(result.rows[0]);
}

async function requireLibraryManager(id: number, user: CurrentUser) {
  const result = await database.query<{
    criado_por: number;
    equipe_id: number | null;
  }>(
    'select criado_por, equipe_id from public.biblioteca_documentos where id = $1',
    [id]
  );
  const item = result.rows[0];
  if (!item)
    throw new ApiError(404, 'NOT_FOUND', 'Item da biblioteca não encontrado.');
  if (
    user.cargo !== 'Administrador' &&
    item.criado_por !== user.id &&
    item.equipe_id !== user.equipe_id
  )
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Você não pode alterar este item da biblioteca.'
    );
  return item;
}

export async function updateOneDriveLibraryItem(
  request: FastifyRequest<{ Params: { id: string }; Body: LibraryPatch }>,
  reply: FastifyReply
) {
  const user = await getCurrentUser(request.user?.id);
  const id = parseId(request.params.id);
  await requireLibraryManager(id, user);
  await validateTeam(user, request.body.equipe_id);
  await validateLink(request.body.vinculo_tipo, request.body.vinculo_id);
  const fields: Array<[keyof LibraryPatch, string]> = [
    ['categoria', 'categoria'],
    ['versao', 'versao'],
    ['revisar_em', 'revisar_em'],
    ['equipe_id', 'equipe_id'],
    ['vinculo_tipo', 'vinculo_tipo'],
    ['vinculo_id', 'vinculo_id'],
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];
  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    values.push(typeof value === 'string' ? value.trim() || null : value);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length)
    throw new ApiError(400, 'VALIDATION_ERROR', 'Nenhum campo para atualizar.');
  assignments.push('atualizado_em = now()');
  values.push(id);
  const result = await database.query(
    `update public.biblioteca_documentos set ${assignments.join(', ')}
     where id = $${values.length}
     returning id, drive_item_id, nome, web_url, categoria, versao, revisar_em,
               proprietario_id, equipe_id, vinculo_tipo, vinculo_id, atualizado_em`,
    values
  );
  return reply.send(result.rows[0]);
}

export async function deleteOneDriveLibraryItem(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = await getCurrentUser(request.user?.id);
  const id = parseId(request.params.id);
  await requireLibraryManager(id, user);
  await database.query(
    'delete from public.biblioteca_documentos where id = $1',
    [id]
  );
  return reply.code(204).send();
}
