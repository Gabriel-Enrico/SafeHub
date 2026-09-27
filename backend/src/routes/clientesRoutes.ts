import type { FastifyInstance } from 'fastify';
import {
  createCliente,
  deleteCliente,
  getClienteById,
  listClientes,
  updateCliente,
} from '../controllers/clientesController.js';
import type {
  ClienteBody,
  ClienteListQuery,
  ClienteParams,
  ClientePatch,
} from '../type/clientes.js';

const clienteProperties = {
  nome: { type: 'string', minLength: 1, maxLength: 200 },
  setor: { type: ['string', 'null'], maxLength: 120 },
  status_pipeline: { type: 'string', minLength: 1, maxLength: 50 },
  responsavel_id: { type: ['integer', 'null'], minimum: 1 },
};

export default async function clientesRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: ClienteListQuery }>(
    '/clientes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
            offset: { type: 'string' },
            nome: { type: 'string', maxLength: 200 },
            setor: { type: 'string', maxLength: 120 },
            status_pipeline: { type: 'string', maxLength: 50 },
            responsavel_id: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    listClientes
  );

  fastify.post<{ Body: ClienteBody }>(
    '/clientes',
    {
      schema: {
        body: {
          type: 'object',
          required: ['nome'],
          properties: clienteProperties,
          additionalProperties: false,
        },
      },
    },
    createCliente
  );

  fastify.get<{ Params: ClienteParams }>(
    '/clientes/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
      },
    },
    getClienteById
  );

  fastify.patch<{ Params: ClienteParams; Body: ClientePatch }>(
    '/clientes/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
        body: {
          type: 'object',
          minProperties: 1,
          properties: clienteProperties,
          additionalProperties: false,
        },
      },
    },
    updateCliente
  );

  fastify.delete<{ Params: ClienteParams }>(
    '/clientes/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
      },
    },
    deleteCliente
  );
}
