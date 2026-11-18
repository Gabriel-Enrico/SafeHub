import type { FastifyInstance } from 'fastify';
import {
  createEvent,
  deleteEvent,
  disconnectOutlook,
  getOutlookStatus,
  listEvents,
  listCalendars,
  checkAvailability,
  updateEvent,
} from '../controllers/outlookEventsController.js';
import { startOutlookConnection } from '../controllers/outlookController.js';
import { createEventLink, deleteEventLink, listEventLinks } from '../controllers/outlookEventLinksController.js';
import type { LinkBody } from '../controllers/outlookEventLinksController.js';

const dateTimeZone = {
  type: 'object',
  required: ['dateTime', 'timeZone'],
  properties: {
    dateTime: { type: 'string', minLength: 1, maxLength: 80 },
    timeZone: { type: 'string', minLength: 1, maxLength: 100 },
  },
  additionalProperties: false,
};

const eventProperties = {
  subject: { type: 'string', minLength: 1, maxLength: 255 },
  body: {
    type: 'object',
    required: ['contentType', 'content'],
    properties: {
      contentType: { type: 'string', enum: ['Text', 'HTML'] },
      content: { type: 'string', maxLength: 20000 },
    },
    additionalProperties: false,
  },
  start: dateTimeZone,
  end: dateTimeZone,
  location: {
    type: 'object',
    required: ['displayName'],
    properties: { displayName: { type: 'string', maxLength: 255 } },
    additionalProperties: false,
  },
  isAllDay: { type: 'boolean' },
  attendees: {
    type: 'array',
    maxItems: 100,
    items: {
      type: 'object',
      required: ['emailAddress', 'type'],
      properties: {
        emailAddress: {
          type: 'object',
          required: ['address'],
          properties: {
            address: { type: 'string', format: 'email', maxLength: 320 },
            name: { type: 'string', maxLength: 255 },
          },
          additionalProperties: false,
        },
        type: { type: 'string', enum: ['required', 'optional', 'resource'] },
      },
      additionalProperties: false,
    },
  },
};

const eventParamsSchema = {
  type: 'object',
  required: ['eventId'],
  properties: { eventId: { type: 'string', minLength: 1, maxLength: 512 } },
  additionalProperties: false,
};

export default async function outlookRoutes(fastify: FastifyInstance) {
  fastify.post('/integracoes/outlook/connect', startOutlookConnection);

  fastify.get('/integracoes/outlook/status', getOutlookStatus);
  fastify.delete('/integracoes/outlook/connect', disconnectOutlook);

  fastify.get('/integracoes/outlook/calendars', listCalendars);
  fastify.post('/integracoes/outlook/availability', {
    schema: { body: { type: 'object', required: ['emails','startDateTime','endDateTime'], additionalProperties: false,
      properties: { emails: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: { type: 'string', format: 'email', maxLength: 320 } }, startDateTime: { type: 'string', format: 'date-time' }, endDateTime: { type: 'string', format: 'date-time' } } } },
  }, checkAvailability);

  const eventLinkParams = {
    type: 'object', required: ['eventId'], additionalProperties: false,
    properties: { eventId: { type: 'string', minLength: 1, maxLength: 512 }, linkId: { type: 'string', pattern: '^[1-9]\\d*$' } },
  };
  const eventLinkQuery = {
    type: 'object', properties: { calendarId: { type: 'string', minLength: 1, maxLength: 512 } }, additionalProperties: false,
  };
  fastify.get<{ Params: { eventId: string }; Querystring: { calendarId?: string } }>(
    '/integracoes/outlook/events/:eventId/vinculos',
    { schema: { params: eventLinkParams, querystring: eventLinkQuery } }, listEventLinks
  );
  fastify.post<{ Params: { eventId: string }; Querystring: { calendarId?: string }; Body: LinkBody }>(
    '/integracoes/outlook/events/:eventId/vinculos',
    { schema: {
      params: eventLinkParams, querystring: eventLinkQuery,
      body: { type: 'object', required: ['vinculo_tipo', 'vinculo_id'], additionalProperties: false,
        properties: { vinculo_tipo: { type: 'string', enum: ['cliente', 'contato', 'interacao', 'projeto', 'tarefa_projeto', 'tarefa_cliente'] }, vinculo_id: { type: 'integer', minimum: 1 } } },
    } }, createEventLink
  );
  fastify.delete<{ Params: { eventId: string; linkId: string }; Querystring: { calendarId?: string } }>(
    '/integracoes/outlook/events/:eventId/vinculos/:linkId',
    { schema: { params: { ...eventLinkParams, required: ['eventId', 'linkId'] }, querystring: eventLinkQuery } }, deleteEventLink
  );

  fastify.get(
    '/integracoes/outlook/events',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['startDateTime', 'endDateTime'],
          properties: {
            startDateTime: { type: 'string', minLength: 1, maxLength: 80 },
            endDateTime: { type: 'string', minLength: 1, maxLength: 80 },
            calendarId: { type: 'string', minLength: 1, maxLength: 512 },
          },
          additionalProperties: false,
        },
      },
    },
    listEvents
  );

  fastify.post(
    '/integracoes/outlook/events',
    {
      schema: {
        body: {
          type: 'object',
          required: ['subject', 'start', 'end'],
          properties: eventProperties,
          additionalProperties: false,
        },
        querystring: {
          type: 'object',
          properties: { calendarId: { type: 'string', minLength: 1, maxLength: 512 } },
          additionalProperties: false,
        },
      },
    },
    createEvent
  );

  fastify.patch(
    '/integracoes/outlook/events/:eventId',
    {
      schema: {
        params: eventParamsSchema,
        querystring: {
          type: 'object',
          properties: { calendarId: { type: 'string', minLength: 1, maxLength: 512 } },
          additionalProperties: false,
        },
        body: {
          type: 'object',
          minProperties: 1,
          properties: eventProperties,
          additionalProperties: false,
        },
      },
    },
    updateEvent
  );

  fastify.delete(
    '/integracoes/outlook/events/:eventId',
    { schema: { params: eventParamsSchema, querystring: { type: 'object', properties: { calendarId: { type: 'string', minLength: 1, maxLength: 512 } }, additionalProperties: false } } },
    deleteEvent
  );
}
