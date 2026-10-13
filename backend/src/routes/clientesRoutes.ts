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
import {
  createClienteInteracao,
  getDocumentoDownload,
  listClienteDocumentos,
  listClienteInteracoes,
  listDocumentos,
  uploadClienteDocumento,
} from '../controllers/clienteRelacionamentoController.js';

const clienteProperties = {
  nome: { type: 'string', minLength: 1, maxLength: 200 },
  setor: { type: ['string', 'null'], maxLength: 120 },
  status_pipeline: { type: 'string', minLength: 1, maxLength: 50 },
  responsavel_id: { type: ['integer', 'null'], minimum: 1 },
};

export default async function clientesRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: ClienteParams; Querystring: { tipo?: string } }>(
    '/clientes/:id/interacoes',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } } },
        querystring: { type: 'object', properties: { tipo: { type: 'string', maxLength: 20 } }, additionalProperties: false },
      },
    },
    listClienteInteracoes
  );

  fastify.post<{ Params: ClienteParams; Body: { tipo: string; resumo: string } }>(
    '/clientes/:id/interacoes',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } } },
        body: {
          type: 'object', required: ['tipo', 'resumo'], additionalProperties: false,
          properties: {
            tipo: { type: 'string', enum: ['reuniao', 'ligacao', 'email', 'outro'] },
            resumo: { type: 'string', minLength: 1, maxLength: 5000 },
          },
        },
      },
    },
    createClienteInteracao
  );

  fastify.get<{ Params: ClienteParams }>('/clientes/:id/documentos', listClienteDocumentos);
  fastify.post<{ Params: ClienteParams }>(
    '/clientes/:id/documentos',
    { bodyLimit: 10 * 1024 * 1024 + 1024 },
    uploadClienteDocumento
  );
  fastify.get<{ Querystring: { cliente_id?: string; busca?: string } }>(
    '/documentos',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { cliente_id: { type: 'string' }, busca: { type: 'string', maxLength: 200 } },
          additionalProperties: false,
        },
      },
    },
    listDocumentos
  );
  fastify.get<{ Params: { documentoId: string } }>(
    '/documentos/:documentoId/download',
    {
      schema: {
        params: {
          type: 'object', required: ['documentoId'],
          properties: { documentoId: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
      },
    },
    getDocumentoDownload
  );

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
