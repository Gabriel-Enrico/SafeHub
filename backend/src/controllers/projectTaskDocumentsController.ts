import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { database } from '../config/database.js';
import { getSupabaseAdmin } from '../config/supabaseAdmin.js';
import type { SupabaseUser } from '../middlewares/authentication.js';
import { ApiError } from '../utils/apiError.js';
import {
  hasValidPrivateDocumentSignature,
  MAX_PRIVATE_DOCUMENT_BYTES,
  PRIVATE_DOCUMENT_BUCKET,
  PRIVATE_DOCUMENT_MIME_TYPES,
} from '../utils/privateDocuments.js';

type TaskParams = { id: string };

async function getCurrentUser(request: FastifyRequest) {
  const authUserId = (request.user as SupabaseUser | null)?.id;
  if (!authUserId)
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{
    id: number;
    equipe_id: number | null;
    cargo: string | null;
  }>(
    'select id, equipe_id, cargo from public.usuarios where auth_user_id = $1 and ativo = true',
    [authUserId]
  );
  if (!result.rows[0])
    throw new ApiError(
      403,
      'PROFILE_INACTIVE',
      'Perfil SafeHub não encontrado ou desativado.'
    );
  return result.rows[0];
}

async function getTaskContext(taskId: number) {
  const result = await database.query<{
    id: number;
    cliente_id: number;
    projeto_id: number;
    equipe_id: number | null;
  }>(
    `select t.id, p.cliente_id, p.id as projeto_id, p.equipe_id
     from public.tarefas t
     join public.projetos p on p.id = t.projeto_id
     where t.id = $1`,
    [taskId]
  );
  if (!result.rows[0])
    throw new ApiError(404, 'NOT_FOUND', 'Tarefa não encontrada.');
  return result.rows[0];
}

function authorizeProjectTask(
  user: { equipe_id: number | null; cargo: string | null },
  task: { equipe_id: number | null }
) {
  if (user.cargo !== 'Administrador' && user.equipe_id !== task.equipe_id)
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Você não pode acessar os anexos desta tarefa.'
    );
}

export async function listProjectTaskDocuments(
  request: FastifyRequest<{ Params: TaskParams }>
) {
  const taskId = Number(request.params.id);
  if (!Number.isSafeInteger(taskId) || taskId < 1)
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID de tarefa inválido.');
  const [user, task] = await Promise.all([
    getCurrentUser(request),
    getTaskContext(taskId),
  ]);
  authorizeProjectTask(user, task);
  const result = await database.query(
    `select d.id, d.nome as nome_arquivo, d.tamanho as tamanho_bytes,
            u.nome as enviado_por_nome
     from public.documentos d
     join public.usuarios u on u.id = d.enviado_por
     where d.projeto_tarefa_id = $1
     order by d.id desc`,
    [taskId]
  );
  return { data: result.rows };
}

export async function uploadProjectTaskDocument(
  request: FastifyRequest<{ Params: TaskParams }>,
  reply: FastifyReply
) {
  const taskId = Number(request.params.id);
  if (!Number.isSafeInteger(taskId) || taskId < 1)
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID de tarefa inválido.');
  const [user, task] = await Promise.all([
    getCurrentUser(request),
    getTaskContext(taskId),
  ]);
  authorizeProjectTask(user, task);

  const file = await request.file({
    limits: { fileSize: MAX_PRIVATE_DOCUMENT_BYTES, files: 1 },
  });
  if (!file)
    throw new ApiError(
      400,
      'FILE_REQUIRED',
      'Selecione um arquivo para enviar.'
    );
  const originalName = file.filename.trim();
  const extension = originalName.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = PRIVATE_DOCUMENT_MIME_TYPES[extension];
  if (!mimeType || file.mimetype !== mimeType)
    throw new ApiError(
      400,
      'UNSUPPORTED_FILE_TYPE',
      'Formato aceito: PDF, DOCX, XLSX, JPG ou PNG.'
    );

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
  if (!bytes.length || !hasValidPrivateDocumentSignature(extension, bytes))
    throw new ApiError(
      400,
      'INVALID_FILE',
      'O conteúdo do arquivo não corresponde ao formato informado.'
    );

  const storagePath = `${task.cliente_id}/tarefas/${taskId}/${randomUUID()}.${extension}`;
  const storage = getSupabaseAdmin().storage.from(PRIVATE_DOCUMENT_BUCKET);
  const { error: uploadError } = await storage.upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) {
    request.log.error(
      { err: uploadError },
      'Falha ao armazenar anexo da tarefa'
    );
    throw new ApiError(
      502,
      'DOCUMENT_STORAGE_FAILED',
      'Não foi possível armazenar o anexo.'
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
           (id, nome, diretorio, tamanho, categoria, cliente_id, projeto_id,
            enviado_por, projeto_tarefa_id)
         values ($1, $2, $3, $4, 'Tarefa de projeto', $5, $6, $7, $8)
         returning id, nome as nome_arquivo, tamanho as tamanho_bytes`,
        [
          idResult.rows[0].next_id,
          originalName.slice(0, 255),
          storagePath,
          bytes.length,
          task.cliente_id,
          task.projeto_id,
          user.id,
          taskId,
        ]
      );
      await client.query('commit');
      return reply
        .code(201)
        .send({ ...result.rows[0], enviado_por_nome: 'Você' });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const { error: cleanupError } = await storage.remove([storagePath]);
    if (cleanupError)
      request.log.error({ err: cleanupError }, 'Falha ao remover anexo órfão');
    throw error;
  }
}
