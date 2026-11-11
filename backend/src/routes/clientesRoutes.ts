import type { FastifyInstance } from 'fastify';
import {
  createClienteInteracao,
  getDocumentoDownload,
  listClienteDocumentos,
  listClienteInteracoes,
  listClienteTarefas,
  listDocumentos,
  uploadClienteDocumento,
} from '../controllers/clienteRelacionamentoController.js';
import {
  createCliente,
  deleteCliente,
  getClienteById,
  getClientesIndicadores,
  listClientes,
  listResponsaveisClientes,
  updateCliente,
} from '../controllers/clientesController.js';
import {
  createContatoCliente,
  deleteContatoCliente,
  listContatosCliente,
  updateContatoCliente,
} from '../controllers/contatosClienteController.js';
import type {
  ClienteBody,
  ClienteListQuery,
  ClienteParams,
  ClientePatch,
} from '../type/clientes.js';
import type {
  ContatoClienteBody,
  ContatoClienteParams,
  ContatoClientePatch,
} from '../type/contatosCliente.js';

const clienteProperties = {
  nome: { type: 'string', minLength: 1, maxLength: 200 },
  setor: { type: ['string', 'null'], maxLength: 120 },
  status_pipeline: { type: 'string', minLength: 1, maxLength: 50 },
  responsavel_id: { type: ['integer', 'null'], minimum: 1 },
  pais: { type: ['string', 'null'], maxLength: 120 },
  site: { type: ['string', 'null'], maxLength: 500 },
  origem_relacionamento: { type: ['string', 'null'], maxLength: 120 },
  endereco: { type: ['string', 'null'], maxLength: 500 },
  observacoes: { type: ['string', 'null'], maxLength: 5000 },
};

export default async function clientesRoutes(fastify: FastifyInstance) {
  fastify.get('/clientes/responsaveis', listResponsaveisClientes);
  fastify.get('/clientes/indicadores', getClientesIndicadores);
  const contatoParams = {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^[1-9]\\d*$' },
      contatoId: { type: 'string', pattern: '^[1-9]\\d*$' },
    },
  };
  const contatoBodySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      nome: { type: 'string', minLength: 1, maxLength: 200 },
      cargo: { type: ['string', 'null'], maxLength: 160 },
      email: { type: ['string', 'null'], format: 'email', maxLength: 320 },
      telefone: { type: ['string', 'null'], maxLength: 60 },
    },
  };
  fastify.get<{ Params: ClienteParams }>(
    '/clientes/:id/contatos',
    { schema: { params: contatoParams } },
    listContatosCliente
  );
  fastify.post<{ Params: ClienteParams; Body: ContatoClienteBody }>(
    '/clientes/:id/contatos',
    {
      schema: {
        params: contatoParams,
        body: { ...contatoBodySchema, required: ['nome'] },
      },
    },
    createContatoCliente
  );
  fastify.patch<{ Params: ContatoClienteParams; Body: ContatoClientePatch }>(
    '/clientes/:id/contatos/:contatoId',
    {
      schema: {
        params: { ...contatoParams, required: ['id', 'contatoId'] },
        body: { ...contatoBodySchema, minProperties: 1 },
      },
    },
    updateContatoCliente
  );
  fastify.delete<{ Params: ContatoClienteParams }>(
    '/clientes/:id/contatos/:contatoId',
    {
      schema: { params: { ...contatoParams, required: ['id', 'contatoId'] } },
    },
    deleteContatoCliente
  );

  fastify.get<{ Params: ClienteParams; Querystring: { tipo?: string } }>(
    '/clientes/:id/interacoes',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
        querystring: {
          type: 'object',
          properties: { tipo: { type: 'string', maxLength: 20 } },
          additionalProperties: false,
        },
      },
    },
    listClienteInteracoes
  );

  fastify.post<{
    Params: ClienteParams;
    Body: {
      tipo: string;
      resumo: string;
      titulo: string;
      data_inicio: string;
      data_fim?: string | null;
      contato_id?: number | null;
      participantes_safe_ids?: number[];
      participantes_cliente_ids?: number[];
      status_relacionado: string;
      proxima_acao?: string | null;
      tarefa?: {
        titulo: string;
        descricao?: string | null;
        responsavel_id?: number | null;
        responsaveis_ids?: number[];
        equipe_id?: number | null;
        prazo?: string | null;
        prioridade?: string;
        status?: string;
      } | null;
    };
  }>(
    '/clientes/:id/interacoes',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
        body: {
          type: 'object',
          required: [
            'tipo',
            'titulo',
            'data_inicio',
            'status_relacionado',
            'resumo',
          ],
          additionalProperties: false,
          properties: {
            tipo: {
              type: 'string',
              enum: [
                'reuniao',
                'ligacao',
                'email',
                'mensagem',
                'solicitacao',
                'outro',
              ],
            },
            titulo: { type: 'string', minLength: 1, maxLength: 250 },
            data_inicio: { type: 'string', format: 'date-time' },
            data_fim: { type: ['string', 'null'], format: 'date-time' },
            status_relacionado: {
              type: 'string',
              enum: [
                'reuniao_realizada',
                'ligacao_realizada',
                'email_enviado',
                'mensagem_enviada',
                'solicitacao_aberta',
                'aguardando_resposta',
                'concluida',
              ],
            },
            proxima_acao: { type: ['string', 'null'], maxLength: 5000 },
            participantes_safe_ids: {
              type: 'array',
              uniqueItems: true,
              items: { type: 'integer', minimum: 1 },
              maxItems: 50,
            },
            participantes_cliente_ids: {
              type: 'array',
              uniqueItems: true,
              items: { type: 'integer', minimum: 1 },
              maxItems: 50,
            },
            resumo: { type: 'string', minLength: 1, maxLength: 5000 },
            contato_id: { type: ['integer', 'null'], minimum: 1 },
            tarefa: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'object',
                  required: ['titulo'],
                  additionalProperties: false,
                  properties: {
                    titulo: { type: 'string', minLength: 1, maxLength: 250 },
                    descricao: { type: ['string', 'null'], maxLength: 5000 },
                    responsavel_id: { type: ['integer', 'null'], minimum: 1 },
                    responsaveis_ids: {
                      type: 'array',
                      uniqueItems: true,
                      maxItems: 50,
                      items: { type: 'integer', minimum: 1 },
                    },
                    equipe_id: { type: ['integer', 'null'], minimum: 1 },
                    prazo: {
                      type: ['string', 'null'],
                      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                    },
                    prioridade: {
                      type: 'string',
                      enum: ['baixa', 'media', 'alta', 'urgente'],
                    },
                    status: {
                      type: 'string',
                      enum: [
                        'a_fazer',
                        'em_andamento',
                        'bloqueada',
                        'em_revisao',
                        'concluida',
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    createClienteInteracao
  );

  fastify.get<{ Params: ClienteParams }>(
    '/clientes/:id/tarefas',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
      },
    },
    listClienteTarefas
  );
  fastify.get<{
    Params: ClienteParams;
    Querystring: { interacao_id?: string };
  }>(
    '/clientes/:id/documentos',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
        },
        querystring: {
          type: 'object',
          properties: {
            interacao_id: { type: 'string', pattern: '^[1-9]\\d*$' },
          },
          additionalProperties: false,
        },
      },
    },
    listClienteDocumentos
  );
  fastify.post<{
    Params: ClienteParams;
    Querystring: { interacao_id?: string };
  }>(
    '/clientes/:id/documentos',
    {
      bodyLimit: 10 * 1024 * 1024 + 1024,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            interacao_id: { type: 'string', pattern: '^[1-9]\\d*$' },
          },
          additionalProperties: false,
        },
      },
    },
    uploadClienteDocumento
  );
  fastify.get<{ Querystring: { cliente_id?: string; busca?: string } }>(
    '/documentos',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            cliente_id: { type: 'string' },
            busca: { type: 'string', maxLength: 200 },
          },
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
          type: 'object',
          required: ['documentoId'],
          properties: {
            documentoId: { type: 'string', pattern: '^[1-9]\\d*$' },
          },
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
            pais: { type: 'string', maxLength: 120 },
            origem_relacionamento: { type: 'string', maxLength: 120 },
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
