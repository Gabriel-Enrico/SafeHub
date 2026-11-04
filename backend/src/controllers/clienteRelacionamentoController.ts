import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { database } from '../config/database.js';
import { getSupabaseAdmin } from '../config/supabaseAdmin.js';
import { ApiError } from '../utils/apiError.js';

const DOCUMENT_BUCKET = 'cliente-documentos';
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

type ClienteParams = { id: string };
type InteracaoQuery = { tipo?: string };
type InteracaoBody = {
  tipo: string;
  titulo: string;
  data_inicio: string;
  data_fim?: string | null;
  resumo: string;
  contato_id?: number | null;
  participantes_safe_ids?: number[];
  participantes_cliente_ids?: number[];
  status_relacionado: string;
  proxima_acao?: string | null;
  tarefa?: {
    titulo: string;
    responsavel_id?: number | null;
    prazo?: string | null;
    prioridade?: string;
  } | null;
};
type DocumentoParams = { documentoId: string };
type ClienteDocumentoQuery = { interacao_id?: string };
type DocumentoQuery = { cliente_id?: string; busca?: string };

function parsePositiveId(value: string, field = 'id'): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} inválido.`);
  }
  return parsed;
}

async function requireCliente(clienteId: number): Promise<void> {
  const result = await database.query(
    'select 1 from public.clientes where id = $1',
    [clienteId]
  );
  if (!result.rowCount)
    throw new ApiError(404, 'NOT_FOUND', 'Cliente não encontrado.');
}

async function requireSafeHubUser(request: FastifyRequest): Promise<number> {
  if (!request.user?.id)
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{ id: number }>(
    'select id from public.usuarios where auth_user_id = $1 and ativo = true',
    [request.user.id]
  );
  if (!result.rows[0])
    throw new ApiError(
      403,
      'PROFILE_INACTIVE',
      'Perfil SafeHub não encontrado ou desativado.'
    );
  return result.rows[0].id;
}

export async function listClienteInteracoes(
  request: FastifyRequest<{
    Params: ClienteParams;
    Querystring: InteracaoQuery;
  }>
) {
  const clienteId = parsePositiveId(request.params.id);
  await requireCliente(clienteId);
  const tipo = request.query.tipo?.trim().toLowerCase();
  const validTypes = [
    'reuniao',
    'ligacao',
    'email',
    'mensagem',
    'solicitacao',
    'outro',
  ];
  if (tipo && !validTypes.includes(tipo)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Tipo de interação inválido.');
  }
  const result = await database.query(
    `select i.id, i.cliente_id, i.contato_id, c.nome as contato_nome, i.tipo,
            coalesce(i.titulo, initcap(i.tipo)) as titulo, i.data_inicio, i.data_fim,
            i.status_relacionado, i.proxima_acao, i.descricao as resumo,
            i.data_interacao as criado_em, u.id as responsavel_id,
            u.nome as responsavel_nome
     from public.interacoes i
     join public.usuarios u on u.id = i.usuario_id
     left join public.contatos_cliente c on c.id = i.contato_id
     where i.cliente_id = $1 and ($2::text is null or i.tipo = $2)
     order by coalesce(i.data_inicio, i.data_interacao) desc nulls last, i.id desc`,
    [clienteId, tipo || null]
  );
  return { data: result.rows };
}

export async function createClienteInteracao(
  request: FastifyRequest<{ Params: ClienteParams; Body: InteracaoBody }>,
  reply: FastifyReply
) {
  const clienteId = parsePositiveId(request.params.id);
  await requireCliente(clienteId);
  const tipo = request.body.tipo.trim().toLowerCase();
  const titulo = request.body.titulo.trim();
  const resumo = request.body.resumo.trim();
  if (
    ![
      'reuniao',
      'ligacao',
      'email',
      'mensagem',
      'solicitacao',
      'outro',
    ].includes(tipo)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Tipo de interação inválido.');
  }
  if (!titulo)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'O título da interação é obrigatório.'
    );
  if (!resumo)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'O resumo não pode ficar vazio.'
    );
  const dataInicio = new Date(request.body.data_inicio);
  const dataFim = request.body.data_fim
    ? new Date(request.body.data_fim)
    : null;
  if (
    !Number.isFinite(dataInicio.getTime()) ||
    (dataFim && (!Number.isFinite(dataFim.getTime()) || dataFim <= dataInicio))
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Informe horários válidos; o término deve ser posterior ao início.'
    );
  }
  const responsavelId = await requireSafeHubUser(request);
  const internalParticipants = [
    ...new Set([...(request.body.participantes_safe_ids ?? []), responsavelId]),
  ];
  const clientParticipants = [
    ...new Set([
      ...(request.body.participantes_cliente_ids ?? []),
      ...(request.body.contato_id ? [request.body.contato_id] : []),
    ]),
  ];
  if (clientParticipants.length) {
    const contacts = await database.query(
      'select id from public.contatos_cliente where id = any($1::int[]) and cliente_id = $2 and arquivado_em is null',
      [clientParticipants, clienteId]
    );
    if (contacts.rowCount !== clientParticipants.length)
      throw new ApiError(
        400,
        'INVALID_CONTACT',
        'Selecione somente contatos ativos desta empresa.'
      );
  }
  if (internalParticipants.length) {
    const users = await database.query(
      'select id from public.usuarios where id = any($1::int[]) and ativo = true',
      [internalParticipants]
    );
    if (users.rowCount !== internalParticipants.length)
      throw new ApiError(
        400,
        'INVALID_PARTICIPANT',
        'Um ou mais participantes SafeHub não estão ativos.'
      );
  }
  if (request.body.tarefa?.responsavel_id != null) {
    const assignee = await database.query(
      'select 1 from public.usuarios where id = $1 and ativo = true',
      [request.body.tarefa.responsavel_id]
    );
    if (!assignee.rowCount)
      throw new ApiError(
        400,
        'INVALID_ASSIGNEE',
        'Selecione um responsável ativo para a tarefa.'
      );
  }
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query('lock table public.interacoes in exclusive mode');
    const idResult = await client.query<{ next_id: number }>(
      'select coalesce(max(id), 0) + 1 as next_id from public.interacoes'
    );
    const result = await client.query(
      `insert into public.interacoes
         (id, cliente_id, usuario_id, data_interacao, tipo, descricao, contato_id,
          titulo, data_inicio, data_fim, status_relacionado, proxima_acao)
       values ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11)
       returning id, cliente_id, contato_id, tipo, titulo, data_inicio, data_fim,
                 status_relacionado, proxima_acao, descricao as resumo,
                 data_interacao as criado_em, usuario_id as responsavel_id,
                 (select nome from public.usuarios where id = $3) as responsavel_nome`,
      [
        idResult.rows[0].next_id,
        clienteId,
        responsavelId,
        tipo,
        resumo,
        clientParticipants[0] ?? null,
        titulo,
        dataInicio.toISOString(),
        dataFim?.toISOString() ?? null,
        request.body.status_relacionado,
        request.body.proxima_acao?.trim() || null,
      ]
    );
    const interactionId = result.rows[0].id as number;
    for (const userId of internalParticipants) {
      await client.query(
        'insert into public.interacao_participantes (interacao_id, usuario_id) values ($1, $2)',
        [interactionId, userId]
      );
    }
    for (const contactId of clientParticipants) {
      await client.query(
        'insert into public.interacao_participantes (interacao_id, contato_id) values ($1, $2)',
        [interactionId, contactId]
      );
    }
    if (request.body.tarefa) {
      const createdTask = await client.query<{ id: number }>(
        `insert into public.cliente_tarefas
           (cliente_id, interacao_id, titulo, descricao, responsavel_id, prazo, prioridade, criado_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [
          clienteId,
          interactionId,
          request.body.tarefa.titulo.trim(),
          request.body.proxima_acao?.trim() || null,
          request.body.tarefa.responsavel_id ?? null,
          request.body.tarefa.prazo ?? null,
          request.body.tarefa.prioridade ?? 'media',
          responsavelId,
        ]
      );
      await client.query(
        `insert into public.tarefa_historico (origem, tarefa_id, usuario_id, status_anterior, status_novo)
         values ('interacao', $1, $2, null, 'a_fazer')`,
        [createdTask.rows[0].id, responsavelId]
      );
    }
    await client.query('commit');
    return reply.code(201).send(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listClienteTarefas(
  request: FastifyRequest<{ Params: ClienteParams }>
) {
  const clienteId = parsePositiveId(request.params.id);
  await requireCliente(clienteId);
  const result = await database.query(
    `select tarefas.id, tarefas.cliente_id, tarefas.interacao_id, tarefas.titulo,
            tarefas.descricao, tarefas.responsavel_id, tarefas.responsavel_nome,
            tarefas.prazo, tarefas.prioridade, tarefas.status, tarefas.criado_em,
            tarefas.concluido_em, tarefas.origem, tarefas.projeto_nome
     from (
       select ct.id, ct.cliente_id, ct.interacao_id, ct.titulo, ct.descricao,
              ct.responsavel_id, u.nome as responsavel_nome, ct.prazo,
              ct.prioridade, ct.status, ct.criado_em, ct.concluido_em,
              'interacao'::text as origem, null::varchar as projeto_nome
       from public.cliente_tarefas ct
       left join public.usuarios u on u.id = ct.responsavel_id
       where ct.cliente_id = $1

       union all

       select t.id, p.cliente_id, null::integer as interacao_id, t.titulo,
              null::text as descricao, max(u.id) as responsavel_id,
              string_agg(distinct u.nome, ', ') as responsavel_nome, t.prazo,
              t.prioridade, t.coluna_kanban as status, null::timestamptz as criado_em,
              null::timestamptz as concluido_em, 'projeto'::text as origem,
              p.nome as projeto_nome
       from public.tarefas t
       join public.projetos p on p.id = t.projeto_id
       left join public.tarefa_responsavel tr on tr.tarefa_id = t.id
       left join public.usuarios u on u.id = tr.usuario_id
       where p.cliente_id = $1
       group by t.id, p.cliente_id, p.nome, t.titulo, t.prazo, t.prioridade, t.coluna_kanban
     ) as tarefas
     order by tarefas.prazo asc nulls last, tarefas.criado_em desc nulls last, tarefas.id desc`,
    [clienteId]
  );
  return { data: result.rows };
}

function hasValidFileSignature(extension: string, bytes: Buffer): boolean {
  if (extension === 'pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'jpg' || extension === 'jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'png')
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function listClienteDocumentos(
  request: FastifyRequest<{ Params: ClienteParams }>
) {
  const clienteId = parsePositiveId(request.params.id);
  await requireCliente(clienteId);
  const result = await database.query(
    `select d.id, d.cliente_id, d.nome as nome_arquivo,
            d.tamanho as tamanho_bytes, d.categoria as content_type,
            u.nome as enviado_por_nome
     from public.documentos d
     join public.usuarios u on u.id = d.enviado_por
     where d.cliente_id = $1
     order by d.id desc`,
    [clienteId]
  );
  return { data: result.rows };
}

export async function listDocumentos(
  request: FastifyRequest<{ Querystring: DocumentoQuery }>
) {
  const clienteId = request.query.cliente_id
    ? parsePositiveId(request.query.cliente_id, 'cliente_id')
    : null;
  const busca = request.query.busca?.trim() || null;
  const result = await database.query(
    `select d.id, d.cliente_id, d.nome as nome_arquivo,
            d.tamanho as tamanho_bytes, d.categoria as content_type,
            c.nome as cliente_nome, u.nome as enviado_por_nome
     from public.documentos d
     join public.clientes c on c.id = d.cliente_id
     join public.usuarios u on u.id = d.enviado_por
     where ($1::int is null or d.cliente_id = $1)
       and ($2::text is null or c.nome ilike '%' || $2 || '%')
     order by d.id desc
     limit 200`,
    [clienteId, busca]
  );
  return { data: result.rows };
}

export async function uploadClienteDocumento(
  request: FastifyRequest<{
    Params: ClienteParams;
    Querystring: ClienteDocumentoQuery;
  }>,
  reply: FastifyReply
) {
  const clienteId = parsePositiveId(request.params.id);
  await requireCliente(clienteId);
  const interacaoId = request.query.interacao_id
    ? parsePositiveId(request.query.interacao_id, 'interacao_id')
    : null;
  if (interacaoId) {
    const interaction = await database.query(
      'select 1 from public.interacoes where id = $1 and cliente_id = $2',
      [interacaoId, clienteId]
    );
    if (!interaction.rowCount)
      throw new ApiError(
        400,
        'INVALID_INTERACTION',
        'A interação não pertence a este cliente.'
      );
  }
  const file = await request.file({
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  });
  if (!file)
    throw new ApiError(
      400,
      'FILE_REQUIRED',
      'Selecione um arquivo para enviar.'
    );
  const originalName = file.filename.trim();
  const extension = originalName.split('.').pop()?.toLowerCase() ?? '';
  const expectedMime = MIME_BY_EXTENSION[extension];
  if (!expectedMime || file.mimetype !== expectedMime) {
    throw new ApiError(
      400,
      'UNSUPPORTED_FILE_TYPE',
      'Formato de arquivo não suportado. Formatos aceitos: PDF, DOCX, XLSX, JPG, PNG'
    );
  }

  let bytes: Buffer;
  try {
    bytes = await file.toBuffer();
  } catch {
    throw new ApiError(
      413,
      'FILE_TOO_LARGE',
      'O arquivo deve ter no máximo 10 MB.'
    );
  }
  if (!bytes.length || !hasValidFileSignature(extension, bytes)) {
    throw new ApiError(
      400,
      'INVALID_FILE',
      'O conteúdo do arquivo não corresponde ao formato informado.'
    );
  }

  const responsavelId = await requireSafeHubUser(request);
  const storagePath = `${clienteId}/${randomUUID()}.${extension}`;
  const storage = getSupabaseAdmin().storage.from(DOCUMENT_BUCKET);
  const { error: uploadError } = await storage.upload(storagePath, bytes, {
    contentType: expectedMime,
    upsert: false,
  });
  if (uploadError) {
    request.log.error(
      { err: uploadError },
      'Falha ao armazenar documento do cliente'
    );
    throw new ApiError(
      502,
      'DOCUMENT_STORAGE_FAILED',
      'Não foi possível armazenar o documento.'
    );
  }

  try {
    const client = await database.connect();
    try {
      await client.query('begin');
      await client.query('lock table public.documentos in exclusive mode');
      const idResult = await client.query<{ next_id: number }>(
        'select coalesce(max(id), 0) + 1 as next_id from public.documentos'
      );
      const result = await client.query(
        `insert into public.documentos
           (id, nome, diretorio, tamanho, categoria, cliente_id, projeto_id, enviado_por, interacao_id)
         values ($1, $2, $3, $4, case when $7::int is null then 'Contrato' else 'Interação' end, $5, null, $6, $7)
         returning id, cliente_id, nome as nome_arquivo,
                   tamanho as tamanho_bytes, categoria as content_type`,
        [
          idResult.rows[0].next_id,
          originalName.slice(0, 255),
          storagePath,
          bytes.length,
          clienteId,
          responsavelId,
          interacaoId,
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
  } catch (error) {
    const { error: cleanupError } = await storage.remove([storagePath]);
    if (cleanupError)
      request.log.error(
        { err: cleanupError },
        'Falha ao remover arquivo órfão do Storage'
      );
    throw error;
  }
}

export async function getDocumentoDownload(
  request: FastifyRequest<{ Params: DocumentoParams }>
) {
  const documentoId = parsePositiveId(
    request.params.documentoId,
    'documentoId'
  );
  const result = await database.query<{ caminho_storage: string }>(
    'select diretorio as caminho_storage from public.documentos where id = $1',
    [documentoId]
  );
  const documento = result.rows[0];
  if (!documento)
    throw new ApiError(404, 'NOT_FOUND', 'Documento não encontrado.');
  const { data, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENT_BUCKET)
    .createSignedUrl(documento.caminho_storage, 60);
  if (error || !data?.signedUrl) {
    request.log.error(
      { err: error },
      'Falha ao gerar link temporário para documento'
    );
    throw new ApiError(
      502,
      'DOCUMENT_DOWNLOAD_FAILED',
      'Não foi possível abrir o documento.'
    );
  }
  return { url: data.signedUrl };
}
