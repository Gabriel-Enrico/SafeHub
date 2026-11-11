import type { FastifyInstance } from 'fastify';
import type {
  ChecklistBody,
  ChecklistPatch,
  EditalBody,
  EditalPatch,
  RespostaBody,
  RespostaPatch,
} from '../controllers/editaisController.js';
import {
  createBibliotecaResposta,
  createEdital,
  createEditalChecklistItem,
  deleteBibliotecaResposta,
  deleteEdital,
  deleteEditalChecklistItem,
  listBibliotecaRespostas,
  listEditais,
  listEditalChecklist,
  updateBibliotecaResposta,
  updateEdital,
  updateEditalChecklistItem,
} from '../controllers/editaisController.js';

const id = { type: 'string', pattern: '^[1-9]\\d*$' };
const editalStatuses = [
  'mapeado',
  'em_preparacao',
  'submetido',
  'aprovado',
  'reprovado',
  'arquivado',
];

const editalProperties = {
  titulo: { type: 'string', minLength: 1, maxLength: 250 },
  instituicao: { type: 'string', minLength: 1, maxLength: 200 },
  link_oficial: { type: ['string', 'null'], maxLength: 2000 },
  prazo: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  status: { type: 'string', enum: editalStatuses },
  responsavel_id: { type: ['integer', 'null'], minimum: 1 },
  projeto_id: { type: ['integer', 'null'], minimum: 1 },
  requisitos: { type: ['string', 'null'], maxLength: 10000 },
  observacoes: { type: ['string', 'null'], maxLength: 5000 },
};

const checklistProperties = {
  titulo: { type: 'string', minLength: 1, maxLength: 250 },
  descricao: { type: ['string', 'null'], maxLength: 5000 },
  responsavel_id: { type: ['integer', 'null'], minimum: 1 },
  prazo: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  documento_url: { type: ['string', 'null'], maxLength: 2000 },
  drive_item_id: { type: ['string', 'null'], maxLength: 512 },
};

const editalParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id },
};
const checklistParams = {
  type: 'object',
  required: ['editalId'],
  additionalProperties: false,
  properties: { editalId: id, itemId: id },
};

export default async function editaisRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { busca?: string; status?: string } }>(
    '/editais',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            busca: { type: 'string', maxLength: 200 },
            status: { type: 'string', enum: editalStatuses },
          },
        },
      },
    },
    listEditais
  );

  fastify.post<{ Body: EditalBody }>(
    '/editais',
    {
      schema: {
        body: {
          type: 'object',
          required: ['titulo', 'instituicao'],
          additionalProperties: false,
          properties: editalProperties,
        },
      },
    },
    createEdital
  );

  fastify.patch<{ Params: { id: string }; Body: EditalPatch }>(
    '/editais/:id',
    {
      schema: {
        params: editalParams,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: editalProperties,
        },
      },
    },
    updateEdital
  );

  fastify.delete<{ Params: { id: string } }>(
    '/editais/:id',
    {
      schema: { params: editalParams },
    },
    deleteEdital
  );

  fastify.get<{ Params: { editalId: string } }>(
    '/editais/:editalId/checklist',
    {
      schema: { params: checklistParams },
    },
    listEditalChecklist
  );

  fastify.post<{ Params: { editalId: string }; Body: ChecklistBody }>(
    '/editais/:editalId/checklist',
    {
      schema: {
        params: checklistParams,
        body: {
          type: 'object',
          required: ['titulo'],
          additionalProperties: false,
          properties: checklistProperties,
        },
      },
    },
    createEditalChecklistItem
  );

  fastify.patch<{
    Params: { editalId: string; itemId: string };
    Body: ChecklistPatch;
  }>(
    '/editais/:editalId/checklist/:itemId',
    {
      schema: {
        params: { ...checklistParams, required: ['editalId', 'itemId'] },
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            ...checklistProperties,
            concluido: { type: 'boolean' },
          },
        },
      },
    },
    updateEditalChecklistItem
  );

  fastify.delete<{ Params: { editalId: string; itemId: string } }>(
    '/editais/:editalId/checklist/:itemId',
    {
      schema: {
        params: { ...checklistParams, required: ['editalId', 'itemId'] },
      },
    },
    deleteEditalChecklistItem
  );

  fastify.get<{
    Querystring: { busca?: string; categoria?: string; aprovadas?: string };
  }>(
    '/biblioteca-respostas',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            busca: { type: 'string', maxLength: 200 },
            categoria: { type: 'string', maxLength: 120 },
            aprovadas: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    listBibliotecaRespostas
  );

  fastify.post<{ Body: RespostaBody }>(
    '/biblioteca-respostas',
    {
      schema: {
        body: {
          type: 'object',
          required: ['titulo', 'categoria', 'texto'],
          additionalProperties: false,
          properties: {
            titulo: { type: 'string', minLength: 1, maxLength: 250 },
            categoria: { type: 'string', minLength: 1, maxLength: 120 },
            texto: { type: 'string', minLength: 1, maxLength: 20000 },
            versao: { type: 'string', maxLength: 60 },
            aprovado: { type: 'boolean' },
          },
        },
      },
    },
    createBibliotecaResposta
  );

  fastify.patch<{ Params: { id: string }; Body: RespostaPatch }>(
    '/biblioteca-respostas/:id',
    {
      schema: {
        params: editalParams,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            titulo: { type: 'string', minLength: 1, maxLength: 250 },
            categoria: { type: 'string', minLength: 1, maxLength: 120 },
            texto: { type: 'string', minLength: 1, maxLength: 20000 },
            versao: { type: 'string', maxLength: 60 },
            aprovado: { type: 'boolean' },
          },
        },
      },
    },
    updateBibliotecaResposta
  );

  fastify.delete<{ Params: { id: string } }>(
    '/biblioteca-respostas/:id',
    {
      schema: { params: editalParams },
    },
    deleteBibliotecaResposta
  );
}
