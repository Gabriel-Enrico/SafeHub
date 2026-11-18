import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import { listOutlookCalendars } from '../services/outlookGraph.js';

type LinkType = 'cliente' | 'contato' | 'interacao' | 'projeto' | 'tarefa_projeto' | 'tarefa_cliente';
type LinkQuery = { calendarId?: string };
export type LinkBody = { vinculo_tipo: LinkType; vinculo_id: number };
type EventParams = { eventId: string };

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'VALIDATION_ERROR', 'ID de vínculo inválido.');
  return id;
}

async function currentUser(request: FastifyRequest) {
  if (!request.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const result = await database.query<{ id: number; equipe_id: number | null; cargo: string | null }>(
    'select id, equipe_id, cargo from public.usuarios where auth_user_id = $1 and ativo = true',
    [request.user.id]
  );
  if (!result.rows[0]) throw new ApiError(403, 'PROFILE_INACTIVE', 'Perfil SafeHub não encontrado ou desativado.');
  return { ...result.rows[0], authId: request.user.id };
}

async function verifyLinkAccess(type: LinkType, id: number, user: Awaited<ReturnType<typeof currentUser>>) {
  const admin = user.cargo === 'Administrador';
  let found = false;
  let allowed = admin;
  if (type === 'cliente') {
    const r = await database.query('select 1 from public.clientes where id=$1', [id]);
    found = !!r.rows[0]; allowed = true;
  } else if (type === 'contato') {
    const r = await database.query('select 1 from public.contatos_cliente where id=$1 and arquivado_em is null', [id]);
    found = !!r.rows[0]; allowed = true;
  } else if (type === 'interacao') {
    const r = await database.query('select 1 from public.interacoes where id=$1', [id]);
    found = !!r.rows[0]; allowed = true;
  } else if (type === 'projeto') {
    const r = await database.query<{ equipe_id: number | null }>('select equipe_id from public.projetos where id=$1', [id]);
    found = !!r.rows[0]; allowed ||= user.equipe_id != null && r.rows[0]?.equipe_id === user.equipe_id;
  } else if (type === 'tarefa_projeto') {
    const r = await database.query<{ equipe_id: number | null }>(
      'select p.equipe_id from public.tarefas t join public.projetos p on p.id=t.projeto_id where t.id=$1', [id]);
    found = !!r.rows[0]; allowed ||= user.equipe_id != null && r.rows[0]?.equipe_id === user.equipe_id;
  } else {
    const r = await database.query<{ equipe_id: number | null; responsavel_id: number | null; criado_por: number }>(
      'select equipe_id, responsavel_id, criado_por from public.cliente_tarefas where id=$1', [id]);
    found = !!r.rows[0]; allowed ||= (user.equipe_id != null && r.rows[0]?.equipe_id === user.equipe_id) || r.rows[0]?.responsavel_id === user.id || r.rows[0]?.criado_por === user.id;
  }
  if (!found) throw new ApiError(404, 'LINK_TARGET_NOT_FOUND', 'O registro vinculado não existe.');
  if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'Você não pode vincular este registro ao evento.');
}

function eventIdentity(request: FastifyRequest<{ Params: EventParams; Querystring: LinkQuery }>) {
  const calendarId = request.query.calendarId?.trim() || 'primary';
  const eventId = request.params.eventId.trim();
  if (!eventId || eventId.length > 512) throw new ApiError(400, 'VALIDATION_ERROR', 'Evento inválido.');
  return { calendarId, eventId };
}

async function requireCalendarAccess(calendarId: string, userAuthId: string) {
  const result = await listOutlookCalendars(userAuthId);
  const calendars = result.value as Array<{ id?: string }>;
  if (!calendars.some((calendar) => calendar.id === calendarId)) {
    throw new ApiError(403, 'CALENDAR_ACCESS_DENIED', 'Você não tem acesso a este calendário Outlook.');
  }
}

export async function listEventLinks(request: FastifyRequest<{ Params: EventParams; Querystring: LinkQuery }>) {
  const user = await currentUser(request);
  const { calendarId, eventId } = eventIdentity(request);
  await requireCalendarAccess(calendarId, user.authId);
  const result = await database.query(
    `select l.id, l.vinculo_tipo, l.vinculo_id, l.criado_em,
       case l.vinculo_tipo
         when 'cliente' then (select nome from public.clientes where id=l.vinculo_id)
         when 'contato' then (select nome from public.contatos_cliente where id=l.vinculo_id)
         when 'interacao' then (select coalesce(titulo, tipo) from public.interacoes where id=l.vinculo_id)
         when 'projeto' then (select nome from public.projetos where id=l.vinculo_id)
         when 'tarefa_projeto' then (select titulo from public.tarefas where id=l.vinculo_id)
         when 'tarefa_cliente' then (select titulo from public.cliente_tarefas where id=l.vinculo_id)
       end as nome
     from public.outlook_event_links l
     where calendar_id=$1 and event_id=$2
     order by l.id`, [calendarId, eventId]);
  return { data: result.rows };
}

export async function createEventLink(request: FastifyRequest<{ Params: EventParams; Querystring: LinkQuery; Body: LinkBody }>, reply: FastifyReply) {
  const user = await currentUser(request);
  const { calendarId, eventId } = eventIdentity(request);
  await requireCalendarAccess(calendarId, user.authId);
  const targetId = parseId(String(request.body.vinculo_id));
  const kinds: LinkType[] = ['cliente', 'contato', 'interacao', 'projeto', 'tarefa_projeto', 'tarefa_cliente'];
  if (!kinds.includes(request.body.vinculo_tipo)) throw new ApiError(400, 'VALIDATION_ERROR', 'Tipo de vínculo inválido.');
  await verifyLinkAccess(request.body.vinculo_tipo, targetId, user);
  const result = await database.query(
    `insert into public.outlook_event_links (usuario_auth_id, calendar_id, event_id, vinculo_tipo, vinculo_id, criado_por)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (calendar_id, event_id, vinculo_tipo, vinculo_id) do nothing
     returning id, vinculo_tipo, vinculo_id, criado_em`,
    [user.authId, calendarId, eventId, request.body.vinculo_tipo, targetId, user.id]);
  return reply.code(201).send(result.rows[0] ?? { message: 'Vínculo já existente.' });
}

export async function deleteEventLink(request: FastifyRequest<{ Params: EventParams & { linkId: string }; Querystring: LinkQuery }>) {
  const user = await currentUser(request);
  const { calendarId, eventId } = eventIdentity(request);
  await requireCalendarAccess(calendarId, user.authId);
  const linkId = parseId(request.params.linkId);
  const result = await database.query(
    `delete from public.outlook_event_links l where l.id=$1 and l.calendar_id=$2 and l.event_id=$3
       and (l.usuario_auth_id=$4 or $5::boolean) returning l.id`,
    [linkId, calendarId, eventId, user.authId, user.cargo === 'Administrador']);
  if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Vínculo não encontrado.');
  return { message: 'Vínculo removido.' };
}
