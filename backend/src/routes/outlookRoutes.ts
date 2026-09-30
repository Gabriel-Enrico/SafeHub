import type { FastifyInstance } from 'fastify';
import {
  createEvent,
  deleteEvent,
  disconnectOutlook,
  getOutlookStatus,
  listEvents,
  updateEvent,
} from '../controllers/outlookEventsController.js';
import { startOutlookConnection } from '../controllers/outlookController.js';

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
      },
    },
    createEvent
  );

  fastify.patch(
    '/integracoes/outlook/events/:eventId',
    {
      schema: {
        params: eventParamsSchema,
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
    { schema: { params: eventParamsSchema } },
    deleteEvent
  );
}
