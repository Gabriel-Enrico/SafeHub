import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';

const EDITAL_STATUSES = [
  'mapeado',
  'em_preparacao',
  'submetido',
  'aprovado',
  'reprovado',
  'arquivado',
] as const;

export type EditalBody = {
  titulo: string;
  instituicao: string;
  link_oficial?: string | null;
  prazo?: string | null;
  status?: (typeof EDITAL_STATUSES)[number];
  responsavel_id?: number | null;
  projeto_id?: number | null;
  requisitos?: string | null;
  observacoes?: string | null;
};

export type EditalPatch = Partial<EditalBody>;
export type ChecklistBody = {
  titulo: string;
  descricao?: string | null;
  responsavel_id?: number | null;
  prazo?: string | null;
  documento_url?: string | null;
  drive_item_id?: string | null;
};
export type ChecklistPatch = Partial<ChecklistBody> & { concluido?: boolean };
export type RespostaBody = {
  titulo: string;
  categoria: string;
  texto: string;
  versao?: string;
  aprovado?: boolean;
};
export type RespostaPatch = Partial<RespostaBody>;

async function getUserId(request: FastifyRequest): Promise<number> {
  const authUserId = request.user?.id;
  if (!authUserId)
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{ id: number }>(
    'select id from public.usuarios where auth_user_id = $1 and ativo = true',
    [authUserId]
  );
  if (!result.rows[0])
    throw new ApiError(
      403,
      'PROFILE_INACTIVE',
      'Perfil SafeHub não encontrado ou desativado.'
    );
  return result.rows[0].id;
}

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID inválido.');
  return id;
}

function validateUrl(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      throw new Error();
    return url.toString();
  } catch {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Informe um link HTTP ou HTTPS válido.'
    );
  }
}

async function validateResponsible(id: number | null | undefined) {
  if (id == null) return;
  const user = await database.query(
    'select 1 from public.usuarios where id = $1 and ativo = true',
    [id]
  );
  if (!user.rowCount)
    throw new ApiError(
      400,
      'INVALID_RESPONSAVEL',
      'Selecione um responsável ativo.'
    );
}

async function requireEdital(id: number) {
  const result = await database.query<{ id: number }>(
    'select id from public.editais where id = $1',
    [id]
  );
  if (!result.rows[0])
    throw new ApiError(404, 'NOT_FOUND', 'Edital não encontrado.');
}

export async function listEditais(
  request: FastifyRequest<{ Querystring: { busca?: string; status?: string } }>
) {
  const busca = request.query.busca?.trim() || null;
  const status = request.query.status?.trim() || null;
  if (
    status &&
    !EDITAL_STATUSES.includes(status as (typeof EDITAL_STATUSES)[number])
  )
    throw new ApiError(400, 'VALIDATION_ERROR', 'Status de edital inválido.');
  const result = await database.query(
    `select e.id, e.titulo, e.instituicao, e.link_oficial, e.prazo, e.status,
            e.responsavel_id, u.nome as responsavel_nome, e.projeto_id,
            p.nome as projeto_nome, e.requisitos, e.observacoes,
            e.criado_em, e.atualizado_em,
            count(c.id)::int as total_itens,
            count(c.id) filter (where c.concluido)::int as itens_concluidos
     from public.editais e
     left join public.usuarios u on u.id = e.responsavel_id
     left join public.projetos p on p.id = e.projeto_id
     left join public.edital_checklist c on c.edital_id = e.id
     where ($1::text is null or e.titulo ilike '%' || $1 || '%' or e.instituicao ilike '%' || $1 || '%')
       and ($2::text is null or e.status = $2)
     group by e.id, u.nome, p.nome
     order by e.prazo nulls last, e.id desc`,
    [busca, status]
  );
  return { data: result.rows };
}

export async function createEdital(
  request: FastifyRequest<{ Body: EditalBody }>,
  reply: FastifyReply
) {
  const userId = await getUserId(request);
  const body = request.body;
  const titulo = body.titulo.trim();
  const instituicao = body.instituicao.trim();
  if (!titulo || !instituicao)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Título e instituição são obrigatórios.'
    );
  await validateResponsible(body.responsavel_id);
  if (body.projeto_id != null) {
    const project = await database.query(
      'select 1 from public.projetos where id = $1',
      [body.projeto_id]
    );
    if (!project.rowCount)
      throw new ApiError(400, 'INVALID_PROJECT', 'Projeto não encontrado.');
  }
  const result = await database.query(
    `insert into public.editais
       (titulo, instituicao, link_oficial, prazo, status, responsavel_id,
        projeto_id, requisitos, observacoes, criado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id, titulo, instituicao, link_oficial, prazo, status,
               responsavel_id, projeto_id, requisitos, observacoes, criado_em`,
    [
      titulo,
      instituicao,
      validateUrl(body.link_oficial),
      body.prazo ?? null,
      body.status ?? 'mapeado',
      body.responsavel_id ?? null,
      body.projeto_id ?? null,
      body.requisitos?.trim() || null,
      body.observacoes?.trim() || null,
      userId,
    ]
  );
  return reply.code(201).send(result.rows[0]);
}

export async function updateEdital(
  request: FastifyRequest<{ Params: { id: string }; Body: EditalPatch }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  await requireEdital(id);
  const fields: Array<[keyof EditalPatch, string]> = [
    ['titulo', 'titulo'],
    ['instituicao', 'instituicao'],
    ['link_oficial', 'link_oficial'],
    ['prazo', 'prazo'],
    ['status', 'status'],
    ['responsavel_id', 'responsavel_id'],
    ['projeto_id', 'projeto_id'],
    ['requisitos', 'requisitos'],
    ['observacoes', 'observacoes'],
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];
  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    if (field === 'titulo' && typeof value === 'string' && !value.trim())
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'O título não pode ficar vazio.'
      );
    if (field === 'instituicao' && typeof value === 'string' && !value.trim())
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'A instituição não pode ficar vazia.'
      );
    if (field === 'responsavel_id')
      await validateResponsible(value as number | null);
    if (field === 'link_oficial')
      values.push(validateUrl(value as string | null));
    else values.push(typeof value === 'string' ? value.trim() || null : value);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length)
    throw new ApiError(400, 'VALIDATION_ERROR', 'Nenhum campo para atualizar.');
  values.push(id);
  const result = await database.query(
    `update public.editais set ${assignments.join(', ')}, atualizado_em = now()
     where id = $${values.length} returning *`,
    values
  );
  return reply.send(result.rows[0]);
}

export async function listEditalChecklist(
  request: FastifyRequest<{ Params: { editalId: string } }>
) {
  const editalId = parseId(request.params.editalId);
  await requireEdital(editalId);
  const result = await database.query(
    `select c.id, c.edital_id, c.titulo, c.descricao, c.responsavel_id,
            u.nome as responsavel_nome, c.prazo, c.documento_url,
            c.drive_item_id, c.concluido, c.concluido_por,
            completor.nome as concluido_por_nome, c.concluido_em, c.criado_em
     from public.edital_checklist c
     left join public.usuarios u on u.id = c.responsavel_id
     left join public.usuarios completor on completor.id = c.concluido_por
     where c.edital_id = $1 order by c.concluido, c.prazo nulls last, c.id`,
    [editalId]
  );
  return { data: result.rows };
}

export async function createEditalChecklistItem(
  request: FastifyRequest<{
    Params: { editalId: string };
    Body: ChecklistBody;
  }>,
  reply: FastifyReply
) {
  const editalId = parseId(request.params.editalId);
  const userId = await getUserId(request);
  await requireEdital(editalId);
  const titulo = request.body.titulo.trim();
  if (!titulo)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'O título do item é obrigatório.'
    );
  await validateResponsible(request.body.responsavel_id);
  const link = validateUrl(request.body.documento_url);
  const result = await database.query(
    `insert into public.edital_checklist
       (edital_id, titulo, descricao, responsavel_id, prazo, documento_url, drive_item_id, criado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id, edital_id, titulo, descricao, responsavel_id, prazo,
               documento_url, drive_item_id, concluido, criado_em`,
    [
      editalId,
      titulo,
      request.body.descricao?.trim() || null,
      request.body.responsavel_id ?? null,
      request.body.prazo ?? null,
      link,
      request.body.drive_item_id?.trim() || null,
      userId,
    ]
  );
  return reply.code(201).send(result.rows[0]);
}

export async function updateEditalChecklistItem(
  request: FastifyRequest<{
    Params: { editalId: string; itemId: string };
    Body: ChecklistPatch;
  }>,
  reply: FastifyReply
) {
  const editalId = parseId(request.params.editalId);
  const itemId = parseId(request.params.itemId);
  const userId = await getUserId(request);
  await requireEdital(editalId);
  const current = await database.query(
    'select id from public.edital_checklist where id = $1 and edital_id = $2',
    [itemId, editalId]
  );
  if (!current.rowCount)
    throw new ApiError(404, 'NOT_FOUND', 'Item do checklist não encontrado.');
  const fields: Array<[keyof ChecklistPatch, string]> = [
    ['titulo', 'titulo'],
    ['descricao', 'descricao'],
    ['responsavel_id', 'responsavel_id'],
    ['prazo', 'prazo'],
    ['documento_url', 'documento_url'],
    ['drive_item_id', 'drive_item_id'],
    ['concluido', 'concluido'],
  ];
  const values: unknown[] = [];
  const assignments: string[] = [];
  for (const [field, column] of fields) {
    const value = request.body[field];
    if (value === undefined) continue;
    if (field === 'responsavel_id')
      await validateResponsible(value as number | null);
    if (field === 'documento_url')
      values.push(validateUrl(value as string | null));
    else values.push(typeof value === 'string' ? value.trim() || null : value);
    assignments.push(`${column} = $${values.length}`);
  }
  if (request.body.concluido !== undefined) {
    values.push(request.body.concluido ? userId : null);
    assignments.push(`concluido_por = $${values.length}`);
    assignments.push(
      `concluido_em = case when $${values.length}::int is null then null else now() end`
    );
  }
  if (!assignments.length)
    throw new ApiError(400, 'VALIDATION_ERROR', 'Nenhum campo para atualizar.');
  values.push(itemId, editalId);
  const result = await database.query(
    `update public.edital_checklist set ${assignments.join(', ')}
     where id = $${values.length - 1} and edital_id = $${values.length}
     returning id, edital_id, titulo, descricao, responsavel_id, prazo,
               documento_url, drive_item_id, concluido, concluido_por, concluido_em`,
    values
  );
  return reply.send(result.rows[0]);
}

export async function deleteEditalChecklistItem(
  request: FastifyRequest<{ Params: { editalId: string; itemId: string } }>,
  reply: FastifyReply
) {
  const editalId = parseId(request.params.editalId);
  const itemId = parseId(request.params.itemId);
  const result = await database.query(
    'delete from public.edital_checklist where id = $1 and edital_id = $2 returning id',
    [itemId, editalId]
  );
  if (!result.rowCount)
    throw new ApiError(404, 'NOT_FOUND', 'Item do checklist não encontrado.');
  return reply.code(204).send();
}

export async function listBibliotecaRespostas(
  request: FastifyRequest<{
    Querystring: { busca?: string; categoria?: string; aprovadas?: string };
  }>
) {
  const busca = request.query.busca?.trim() || null;
  const categoria = request.query.categoria?.trim() || null;
  const approvedOnly = request.query.aprovadas === 'true';
  const result = await database.query(
    `select r.id, r.titulo, r.categoria, r.texto, r.versao, r.aprovado,
            r.proprietario_id, owner.nome as proprietario_nome,
            r.criado_por, creator.nome as criado_por_nome,
            r.atualizado_em
     from public.biblioteca_respostas r
     left join public.usuarios owner on owner.id = r.proprietario_id
     left join public.usuarios creator on creator.id = r.criado_por
     where ($1::text is null or r.titulo ilike '%' || $1 || '%' or r.texto ilike '%' || $1 || '%')
       and ($2::text is null or r.categoria = $2)
       and (not $3::boolean or r.aprovado)
     order by r.categoria, r.titulo`,
    [busca, categoria, approvedOnly]
  );
  return { data: result.rows };
}

export async function createBibliotecaResposta(
  request: FastifyRequest<{ Body: RespostaBody }>,
  reply: FastifyReply
) {
  const userId = await getUserId(request);
  const titulo = request.body.titulo.trim();
  const categoria = request.body.categoria.trim();
  const texto = request.body.texto.trim();
  if (!titulo || !categoria || !texto)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Título, categoria e conteúdo são obrigatórios.'
    );
  const result = await database.query(
    `insert into public.biblioteca_respostas
       (titulo, categoria, texto, versao, aprovado, proprietario_id, criado_por, atualizado_por)
     values ($1,$2,$3,$4,$5,$6,$6,$6)
     returning id, titulo, categoria, texto, versao, aprovado, proprietario_id, atualizado_em`,
    [
      titulo,
      categoria,
      texto,
      request.body.versao?.trim() || '1.0',
      request.body.aprovado ?? false,
      userId,
    ]
  );
  return reply.code(201).send(result.rows[0]);
}

export async function updateBibliotecaResposta(
  request: FastifyRequest<{ Params: { id: string }; Body: RespostaPatch }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const userId = await getUserId(request);
  const fields: Array<[keyof RespostaPatch, string]> = [
    ['titulo', 'titulo'],
    ['categoria', 'categoria'],
    ['texto', 'texto'],
    ['versao', 'versao'],
    ['aprovado', 'aprovado'],
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
  values.push(userId);
  assignments.push(`atualizado_por = $${values.length}`);
  assignments.push('atualizado_em = now()');
  values.push(id);
  const result = await database.query(
    `update public.biblioteca_respostas set ${assignments.join(', ')}
     where id = $${values.length} returning id, titulo, categoria, texto, versao, aprovado, atualizado_em`,
    values
  );
  if (!result.rows[0])
    throw new ApiError(404, 'NOT_FOUND', 'Resposta não encontrada.');
  return reply.send(result.rows[0]);
}

export async function deleteEdital(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  await requireEdital(id);
  const checklist = await database.query(
    'select 1 from public.edital_checklist where edital_id = $1 limit 1',
    [id]
  );
  if (checklist.rowCount) {
    throw new ApiError(
      409,
      'EDITAL_HAS_CHECKLIST',
      'Não é possível excluir um edital que possui itens no checklist.'
    );
  }
  await database.query('delete from public.editais where id = $1', [id]);
  return reply.code(204).send();
}

export async function deleteBibliotecaResposta(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const id = parseId(request.params.id);
  const result = await database.query(
    'delete from public.biblioteca_respostas where id = $1 returning id',
    [id]
  );
  if (!result.rowCount)
    throw new ApiError(404, 'NOT_FOUND', 'Resposta não encontrada.');
  return reply.code(204).send();
}
