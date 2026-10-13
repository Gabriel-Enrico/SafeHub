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
type InteracaoBody = { tipo: string; resumo: string };
type DocumentoParams = { documentoId: string };
type DocumentoQuery = { cliente_id?: string; busca?: string };

function parsePositiveId(value: string, field = 'id'): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} inválido.`);
  }
  return parsed;
}

async function requireCliente(clienteId: number): Promise<void> {
  const result = await database.query('select 1 from public.clientes where id = $1', [clienteId]);
  if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Cliente não encontrado.');
}

async function requireSafeHubUser(request: FastifyRequest): Promise<number> {
  if (!request.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{ id: number }>(
    'select id from public.usuarios where auth_user_id = $1 and ativo = true',
    [request.user.id]
  );
  if (!result.rows[0]) throw new ApiError(403, 'PROFILE_INACTIVE', 'Perfil SafeHub não encontrado ou desativado.');
  return result.rows[0].id;
}

export async function listClienteInteracoes(
  request: FastifyRequest<{ Params: ClienteParams; Querystring: InteracaoQuery }>
) {
  const clienteId = parsePositiveId(request.params.id);
  await requireCliente(clienteId);
  const tipo = request.query.tipo?.trim().toLowerCase();
  const validTypes = ['reuniao', 'ligacao', 'email', 'outro'];
  if (tipo && !validTypes.includes(tipo)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Tipo de interação inválido.');
  }
  const result = await database.query(
    `select i.id, i.cliente_id, i.tipo, i.descricao as resumo,
            i.data_interacao as criado_em, u.id as responsavel_id,
            u.nome as responsavel_nome
     from public.interacoes i
     join public.usuarios u on u.id = i.usuario_id
     where i.cliente_id = $1 and ($2::text is null or i.tipo = $2)
     order by i.data_interacao desc nulls last, i.id desc`,
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
  const resumo = request.body.resumo.trim();
  if (!['reuniao', 'ligacao', 'email', 'outro'].includes(tipo)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Tipo de interação inválido.');
  }
  if (!resumo) throw new ApiError(400, 'VALIDATION_ERROR', 'O resumo não pode ficar vazio.');
  const responsavelId = await requireSafeHubUser(request);
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query('lock table public.interacoes in exclusive mode');
    const idResult = await client.query<{ next_id: number }>(
      'select coalesce(max(id), 0) + 1 as next_id from public.interacoes'
    );
    const result = await client.query(
      `insert into public.interacoes
         (id, cliente_id, usuario_id, data_interacao, tipo, descricao)
       values ($1, $2, $3, now(), $4, $5)
       returning id, cliente_id, tipo, descricao as resumo,
                 data_interacao as criado_em, usuario_id as responsavel_id,
                 (select nome from public.usuarios where id = $3) as responsavel_nome`,
      [idResult.rows[0].next_id, clienteId, responsavelId, tipo, resumo]
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

function hasValidFileSignature(extension: string, bytes: Buffer): boolean {
  if (extension === 'pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'jpg' || extension === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
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
  request: FastifyRequest<{ Params: ClienteParams }>,
  reply: FastifyReply
) {
  const clienteId = parsePositiveId(request.params.id);
  await requireCliente(clienteId);
  const file = await request.file({ limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });
  if (!file) throw new ApiError(400, 'FILE_REQUIRED', 'Selecione um arquivo para enviar.');
  const originalName = file.filename.trim();
  const extension = originalName.split('.').pop()?.toLowerCase() ?? '';
  const expectedMime = MIME_BY_EXTENSION[extension];
  if (!expectedMime || file.mimetype !== expectedMime) {
    throw new ApiError(400, 'UNSUPPORTED_FILE_TYPE', 'Formato de arquivo não suportado. Formatos aceitos: PDF, DOCX, XLSX, JPG, PNG');
  }

  let bytes: Buffer;
  try {
    bytes = await file.toBuffer();
  } catch {
    throw new ApiError(413, 'FILE_TOO_LARGE', 'O arquivo deve ter no máximo 10 MB.');
  }
  if (!bytes.length || !hasValidFileSignature(extension, bytes)) {
    throw new ApiError(400, 'INVALID_FILE', 'O conteúdo do arquivo não corresponde ao formato informado.');
  }

  const responsavelId = await requireSafeHubUser(request);
  const storagePath = `${clienteId}/${randomUUID()}.${extension}`;
  const storage = getSupabaseAdmin().storage.from(DOCUMENT_BUCKET);
  const { error: uploadError } = await storage.upload(storagePath, bytes, {
    contentType: expectedMime,
    upsert: false,
  });
  if (uploadError) {
    request.log.error({ err: uploadError }, 'Falha ao armazenar documento do cliente');
    throw new ApiError(502, 'DOCUMENT_STORAGE_FAILED', 'Não foi possível armazenar o documento.');
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
           (id, nome, diretorio, tamanho, categoria, cliente_id, projeto_id, enviado_por)
         values ($1, $2, $3, $4, 'Contrato', $5, null, $6)
         returning id, cliente_id, nome as nome_arquivo,
                   tamanho as tamanho_bytes, categoria as content_type`,
        [idResult.rows[0].next_id, originalName.slice(0, 255), storagePath, bytes.length, clienteId, responsavelId]
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
    if (cleanupError) request.log.error({ err: cleanupError }, 'Falha ao remover arquivo órfão do Storage');
    throw error;
  }
}

export async function getDocumentoDownload(
  request: FastifyRequest<{ Params: DocumentoParams }>
) {
  const documentoId = parsePositiveId(request.params.documentoId, 'documentoId');
  const result = await database.query<{ caminho_storage: string }>(
    'select diretorio as caminho_storage from public.documentos where id = $1',
    [documentoId]
  );
  const documento = result.rows[0];
  if (!documento) throw new ApiError(404, 'NOT_FOUND', 'Documento não encontrado.');
  const { data, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENT_BUCKET)
    .createSignedUrl(documento.caminho_storage, 60);
  if (error || !data?.signedUrl) {
    request.log.error({ err: error }, 'Falha ao gerar link temporário para documento');
    throw new ApiError(502, 'DOCUMENT_DOWNLOAD_FAILED', 'Não foi possível abrir o documento.');
  }
  return { url: data.signedUrl };
}
