import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { database } from '../config/database.js';
import { createTeamsOnlineMeeting } from '../services/outlookGraph.js';
import { ApiError } from '../utils/apiError.js';

type CanalParams = { id: string };
type MensagemParams = { id: string; mensagemId: string };
type MensagemBody = { texto: string };
type ChamadaBody = { titulo: string; inicio: string; fim: string };
type LinkChamadaBody = ChamadaBody & { url: string };
type CriarCanalBody = { nome: string; tipo: 'grupo' | 'equipe' | 'projeto'; membros_ids: number[]; equipe_id?: number; projeto_id?: number };
type Queryable = Pick<Pool | PoolClient, 'query'>;

async function getUser(request: FastifyRequest) {
  if (!request.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{
    id: number;
    nome: string;
    cargo: string | null;
    equipe_id: number | null;
  }>(
    'select id, nome, cargo, equipe_id from public.usuarios where auth_user_id = $1 and ativo = true',
    [request.user.id]
  );
  if (!result.rows[0]) throw new ApiError(403, 'PROFILE_INACTIVE', 'Perfil SafeHub não encontrado ou desativado.');
  return result.rows[0];
}

export async function createChannel(
  request: FastifyRequest<{ Body: CriarCanalBody }>,
  reply: FastifyReply
) {
  const user = await getUser(request);
  const nome = request.body.nome.trim();
  const tipo = request.body.tipo;
  if (!nome) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe o nome do canal.');
  if ((tipo === 'equipe') !== (Number.isSafeInteger(request.body.equipe_id) && request.body.equipe_id! > 0))
    throw new ApiError(400, 'VALIDATION_ERROR', 'Selecione uma equipe para este canal.');
  if ((tipo === 'projeto') !== (Number.isSafeInteger(request.body.projeto_id) && request.body.projeto_id! > 0))
    throw new ApiError(400, 'VALIDATION_ERROR', 'Selecione um projeto para este canal.');

  const client = await database.connect();
  try {
    await client.query('begin');
    let requestedIds = [...new Set([user.id, ...request.body.membros_ids])];

    if (tipo === 'equipe') {
      const team = await client.query('select 1 from public.equipes where id = $1', [request.body.equipe_id]);
      if (!team.rowCount) throw new ApiError(404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
      if (user.cargo !== 'Administrador' && user.equipe_id !== request.body.equipe_id)
        throw new ApiError(403, 'FORBIDDEN', 'Você só pode criar canal para sua equipe.');
      const teamMembers = await client.query<{ id: number }>('select id from public.usuarios where equipe_id = $1 and ativo = true', [request.body.equipe_id]);
      requestedIds = [...new Set([...requestedIds, ...teamMembers.rows.map((row) => row.id)])];
    }
    if (tipo === 'projeto') {
      const project = await client.query<{ equipe_id: number | null }>('select equipe_id from public.projetos where id = $1', [request.body.projeto_id]);
      if (!project.rows[0]) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.');
      if (user.cargo !== 'Administrador' && user.equipe_id !== project.rows[0].equipe_id)
        throw new ApiError(403, 'FORBIDDEN', 'Você não pode criar canal para este projeto.');
      const projectMembers = await client.query<{ id: number }>(
        `select pm.usuario_id as id from public.projeto_membros pm where pm.projeto_id = $1
         union select p.responsavel_id as id from public.projetos p where p.id = $1 and p.responsavel_id is not null`,
        [request.body.projeto_id]
      );
      requestedIds = [...new Set([...requestedIds, ...projectMembers.rows.map((row) => row.id)])];
    }
    if (requestedIds.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', 'Um canal pode ter até 100 participantes.');
    const activeMembers = await client.query<{ id: number }>(
      'select id from public.usuarios where ativo = true and id = any($1::integer[])', [requestedIds]
    );
    if (activeMembers.rowCount !== requestedIds.length)
      throw new ApiError(400, 'INVALID_CHANNEL_MEMBERS', 'Um ou mais participantes não existem ou estão desativados.');

    await client.query('lock table public.canais in exclusive mode');
    const id = await client.query<{ id: number }>('select coalesce(max(id), 0) + 1 as id from public.canais');
    const inserted = await client.query<{ id: number; nome: string; tipo: string; equipe_id: number | null; projeto_id: number | null }>(
      `insert into public.canais (id, nome, tipo, equipe_id, projeto_id)
       values ($1, $2, $3, $4, $5) returning id, nome, tipo, equipe_id, projeto_id`,
      [id.rows[0].id, nome, tipo, request.body.equipe_id ?? null, request.body.projeto_id ?? null]
    );
    for (const memberId of requestedIds) {
      await client.query('insert into public.canal_membros (canal_id, usuario_id) values ($1, $2)', [inserted.rows[0].id, memberId]);
    }
    await client.query('commit');
    return reply.code(201).send({ ...inserted.rows[0], membros_ids: requestedIds });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureCanalAccess(request: FastifyRequest, rawId: string) {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ApiError(400, 'VALIDATION_ERROR', 'ID de canal inválido.');
  const user = await getUser(request);
  const canal = await database.query<{ id: number; nome: string; tipo: string }>(
    'select id, nome, tipo from public.canais where id = $1', [id]
  );
  if (!canal.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Canal não encontrado.');
  if (user.cargo !== 'Administrador') {
    const membership = await database.query(
      'select 1 from public.canal_membros where canal_id = $1 and usuario_id = $2',
      [id, user.id]
    );
    if (!membership.rowCount)
      throw new ApiError(403, 'FORBIDDEN', 'Você não é membro deste canal.');
  }
  return { id, canal: canal.rows[0], user };
}

function parsePositiveId(raw: string, label: string) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} inválido.`);
  return id;
}

async function listMessagesForChannel(queryable: Queryable, canalId: number) {
  return queryable.query(
    `select m.id, m.canal_id, m.usuario_id, m.texto, m.enviado_em,
            u.nome as usuario_nome
     from public.mensagens m
     join public.usuarios u on u.id = m.usuario_id
     where m.canal_id = $1
     order by m.enviado_em desc nulls last, m.id desc
     limit 100`,
    [canalId]
  );
}

export async function listChannelMessages(request: FastifyRequest<{ Params: CanalParams }>) {
  const { id } = await ensureCanalAccess(request, request.params.id);
  const result = await listMessagesForChannel(database, id);
  return { data: result.rows.reverse() };
}

export async function listChannelMembers(request: FastifyRequest<{ Params: CanalParams }>) {
  const { id } = await ensureCanalAccess(request, request.params.id);
  const result = await database.query<{ id: number; nome: string; avatar: string | null; equipe_id: number | null }>(
    `select u.id, u.nome, u.avatar, u.equipe_id
     from public.canal_membros cm
     join public.usuarios u on u.id = cm.usuario_id
     where cm.canal_id = $1 and u.ativo = true
     order by u.nome`,
    [id]
  );
  return { data: result.rows };
}

export async function getChannelMessage(request: FastifyRequest<{ Params: MensagemParams }>) {
  const { id } = await ensureCanalAccess(request, request.params.id);
  const messageId = parsePositiveId(request.params.mensagemId, 'ID de mensagem');
  const result = await database.query(
    `select m.id, m.canal_id, m.usuario_id, m.texto, m.enviado_em,
            u.nome as usuario_nome
     from public.mensagens m
     join public.usuarios u on u.id = m.usuario_id
     where m.canal_id = $1 and m.id = $2`,
    [id, messageId]
  );
  if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Mensagem não encontrada.');
  return { message: result.rows[0] };
}

async function insertChannelMessage(canalId: number, usuarioId: number, texto: string) {
  const result = await database.query(
    `insert into public.mensagens (canal_id, usuario_id, texto, enviado_em)
     values ($1, $2, $3, now())
     returning id, canal_id, usuario_id, texto, enviado_em`,
    [canalId, usuarioId, texto]
  );
  return result.rows[0];
}

export async function createChannelMessage(
  request: FastifyRequest<{ Params: CanalParams; Body: MensagemBody }>,
  reply: FastifyReply
) {
  const { id, user } = await ensureCanalAccess(request, request.params.id);
  const texto = request.body.texto.trim();
  if (!texto) throw new ApiError(400, 'VALIDATION_ERROR', 'Digite uma mensagem antes de enviar.');
  const message = await insertChannelMessage(id, user.id, texto);
  return reply.code(201).send({ message: { ...message, usuario_nome: user.nome } });
}

export async function createChannelCall(
  request: FastifyRequest<{ Params: CanalParams; Body: ChamadaBody }>,
  reply: FastifyReply
) {
  const { id, user } = await ensureCanalAccess(request, request.params.id);
  const titulo = request.body.titulo.trim();
  const start = Date.parse(request.body.inicio);
  const end = Date.parse(request.body.fim);
  if (!titulo) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe o nome da chamada.');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < Date.now() || end <= start)
    throw new ApiError(400, 'INVALID_MEETING_TIME', 'Informe um horário futuro válido para a chamada.');

  const meeting = await createTeamsOnlineMeeting(request.user!.id, {
    subject: titulo,
    startDateTime: new Date(start).toISOString(),
    endDateTime: new Date(end).toISOString(),
  });
  const joinUrl = meeting.joinWebUrl;
  if (!joinUrl) throw new ApiError(502, 'TEAMS_MEETING_LINK_MISSING', 'A Microsoft não retornou o link da chamada. Reconecte o Outlook e aceite a permissão para criar reuniões do Teams.');
  return publishTeamsCall(request, reply, id, user.id, user.nome, titulo, start, end, joinUrl);
}

export async function publishManualTeamsCall(
  request: FastifyRequest<{ Params: CanalParams; Body: LinkChamadaBody }>,
  reply: FastifyReply
) {
  const { id, user } = await ensureCanalAccess(request, request.params.id);
  const titulo = request.body.titulo.trim();
  const start = Date.parse(request.body.inicio);
  const end = Date.parse(request.body.fim);
  if (!titulo) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe o nome da chamada.');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < Date.now() || end <= start)
    throw new ApiError(400, 'INVALID_MEETING_TIME', 'Informe um horário futuro válido para a chamada.');
  return publishTeamsCall(request, reply, id, user.id, user.nome, titulo, start, end, request.body.url);
}

async function publishTeamsCall(
  request: FastifyRequest,
  reply: FastifyReply,
  canalId: number,
  userId: number,
  userName: string,
  titulo: string,
  start: number,
  end: number,
  joinUrl: string
) {
  let parsedUrl: URL;
  try { parsedUrl = new URL(joinUrl); }
  catch { throw new ApiError(400, 'TEAMS_MEETING_LINK_INVALID', 'Cole um link válido de reunião do Teams.'); }
  if (parsedUrl.protocol !== 'https:' || !['teams.microsoft.com', 'teams.live.com'].includes(parsedUrl.hostname))
    throw new ApiError(400, 'TEAMS_MEETING_LINK_INVALID', 'Use um link HTTPS criado pelo Microsoft Teams.');
  const texto = `safehub-teams-call:v1:${JSON.stringify({
    titulo,
    inicio: new Date(start).toISOString(),
    fim: new Date(end).toISOString(),
    url: joinUrl,
  })}`;
  try {
    const message = await insertChannelMessage(canalId, userId, texto);
    return reply.code(201).send({
      message: { ...message, usuario_nome: userName },
      joinUrl,
      calendarEventCreated: false,
    });
  } catch (error) {
    request.log.error(error, 'Não foi possível publicar o link da chamada no canal.');
    throw new ApiError(502, 'TEAMS_CALL_MESSAGE_FAILED', 'O link da chamada não pôde ser publicado no canal. Tente novamente.');
  }
}
