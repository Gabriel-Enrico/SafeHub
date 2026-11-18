import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SupabaseUser } from '../middlewares/authentication.js';
import {
  deleteOutlookEvent as removeEvent,
  listOutlookEvents as fetchEvents,
  listOutlookCalendars as fetchCalendars,
  checkOutlookAvailability as fetchAvailability,
  createOutlookEvent as addEvent,
  updateOutlookEvent as changeEvent,
} from '../services/outlookGraph.js';
import { ApiError } from '../utils/apiError.js';
import {
  deleteOutlookConnection,
  getOutlookConnection,
} from '../services/usuarioIntegracoes.js';

function authenticatedUserId(request: FastifyRequest): string {
  const user = request.user as SupabaseUser | null;
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  }
  return user.id;
}

interface EventsQuery {
  startDateTime: string;
  endDateTime: string;
  calendarId?: string;
}

interface EventParams {
  eventId: string;
}

function eventTime(value: string | undefined) {
  if (!value) return Number.NaN;
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`);
}

function validateEventSchedule(body: EventBody) {
  const start = eventTime(body.start?.dateTime);
  const end = eventTime(body.end?.dateTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Informe o início e o término da reunião.');
  }
  if (start < Date.now()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Não é possível marcar uma reunião no passado.');
  }
  if (end <= start) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'O término precisa ser depois do início.');
  }
}

interface EventBody {
  subject?: string;
  body?: { contentType: 'Text' | 'HTML'; content: string };
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  isAllDay?: boolean;
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    type: 'required' | 'optional' | 'resource';
  }>;
}

interface AvailabilityBody { emails: string[]; startDateTime: string; endDateTime: string }

export async function getOutlookStatus(request: FastifyRequest) {
  const connection = await getOutlookConnection(authenticatedUserId(request));
  return {
    connected: connection?.status === 'conectado',
    status: connection?.status ?? 'desconectado',
    connectedAt: connection?.conectado_em ?? null,
  };
}

export async function disconnectOutlook(request: FastifyRequest) {
  await deleteOutlookConnection(authenticatedUserId(request));
  return { message: 'A conexão Outlook foi removida.' };
}

export async function listEvents(
  request: FastifyRequest<{ Querystring: EventsQuery }>
) {
  const { startDateTime, endDateTime } = request.query;
  const start = Date.parse(startDateTime);
  const end = Date.parse(endDateTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Informe um intervalo de datas válido, com início anterior ao fim.'
    );
  }

  return fetchEvents(authenticatedUserId(request), {
    startDateTime,
    endDateTime,
    calendarId: request.query.calendarId,
  });
}

export async function listCalendars(request: FastifyRequest) {
  return fetchCalendars(authenticatedUserId(request));
}

export async function checkAvailability(request: FastifyRequest<{ Body: AvailabilityBody }>) {
  const emails = [...new Set(request.body.emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const start = Date.parse(request.body.startDateTime); const end = Date.parse(request.body.endDateTime);
  if (!emails.length || emails.length > 20 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    throw new ApiError(400, 'VALIDATION_ERROR', 'Informe de 1 a 20 e-mails válidos.');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end-start > 7*24*60*60*1000)
    throw new ApiError(400, 'VALIDATION_ERROR', 'Informe um intervalo válido de até 7 dias.');
  return fetchAvailability(authenticatedUserId(request), emails, new Date(start).toISOString(), new Date(end).toISOString());
}

export async function createEvent(
  request: FastifyRequest<{ Body: EventBody }>,
  reply: FastifyReply
) {
  const userId = authenticatedUserId(request);
  validateEventSchedule(request.body);
  const event = await addEvent(userId, request.body, (request.query as { calendarId?: string }).calendarId);
  return reply.code(201).send(event);
}

export async function updateEvent(
  request: FastifyRequest<{ Params: EventParams; Body: EventBody }>
) {
  const userId = authenticatedUserId(request);
  validateEventSchedule(request.body);
  return changeEvent(
    userId,
    request.params.eventId,
    request.body,
    (request.query as { calendarId?: string }).calendarId
  );
}

export async function deleteEvent(
  request: FastifyRequest<{ Params: EventParams }>,
  reply: FastifyReply
) {
  await removeEvent(authenticatedUserId(request), request.params.eventId,
    (request.query as { calendarId?: string }).calendarId);
  return reply.code(204).send();
}
