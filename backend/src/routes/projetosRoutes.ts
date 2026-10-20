import type { FastifyInstance } from 'fastify';
import {
  createProject,
  createProjectTask,
  listProjectTasks,
  listProjectTeamMembers,
  listProjectTeams,
  listProjects,
  updateProject,
  updateTask,
} from '../controllers/projetosController.js';
import { COLUNAS_TAREFA, PRIORIDADES_TAREFA, STATUS_PROJETO } from '../type/projetos.js';
import type { ProjetoBody, ProjetoParams, ProjetoPatch, ProjetoTarefasParams, TarefaBody, TarefaParams, TarefaPatch } from '../type/projetos.js';

const idSchema = { type: 'string', pattern: '^[1-9]\\d*$' };
const projectParams = { type: 'object', required: ['id'], properties: { id: idSchema } };
const taskProjectParams = { type: 'object', required: ['projetoId'], properties: { projetoId: idSchema } };

export default async function projetosRoutes(fastify: FastifyInstance) {
  fastify.get('/projetos/equipes', listProjectTeams);
  fastify.get<{ Params: { equipeId: string } }>('/projetos/equipes/:equipeId/usuarios', {
    schema: { params: { type: 'object', required: ['equipeId'], properties: { equipeId: idSchema } } },
  }, listProjectTeamMembers);
  fastify.get('/projetos', listProjects);
  fastify.post<{ Body: ProjetoBody }>('/projetos', {
    schema: { body: { type: 'object', required: ['nome', 'equipe_id', 'cliente_id'], additionalProperties: false, properties: {
      nome: { type: 'string', minLength: 1, maxLength: 200 }, descricao: { type: ['string', 'null'], maxLength: 5000 },
      equipe_id: { type: 'integer', minimum: 1 }, cliente_id: { type: 'integer', minimum: 1 },
      data_inicio: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    } } },
  }, createProject);
  fastify.patch<{ Params: ProjetoParams; Body: ProjetoPatch }>('/projetos/:id', {
    schema: { params: projectParams, body: { type: 'object', minProperties: 1, additionalProperties: false, properties: {
      nome: { type: 'string', minLength: 1, maxLength: 200 }, descricao: { type: ['string', 'null'], maxLength: 5000 },
      equipe_id: { type: 'integer', minimum: 1 }, cliente_id: { type: 'integer', minimum: 1 },
      data_inicio: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, status: { type: 'string', enum: [...STATUS_PROJETO] },
    } } },
  }, updateProject);
  fastify.get<{ Params: ProjetoTarefasParams }>('/projetos/:projetoId/tarefas', { schema: { params: taskProjectParams } }, listProjectTasks);
  fastify.post<{ Params: ProjetoTarefasParams; Body: TarefaBody }>('/projetos/:projetoId/tarefas', {
    schema: { params: taskProjectParams, body: { type: 'object', required: ['titulo'], additionalProperties: false, properties: {
      titulo: { type: 'string', minLength: 1, maxLength: 200 }, prioridade: { type: 'string', enum: [...PRIORIDADES_TAREFA] },
      prazo: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, responsaveis_ids: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 1 } },
    } } },
  }, createProjectTask);
  fastify.patch<{ Params: TarefaParams; Body: TarefaPatch }>('/tarefas/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: idSchema } }, body: { type: 'object', minProperties: 1, additionalProperties: false, properties: {
      titulo: { type: 'string', minLength: 1, maxLength: 200 }, prioridade: { type: 'string', enum: [...PRIORIDADES_TAREFA] },
      prazo: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, coluna_kanban: { type: 'string', enum: [...COLUNAS_TAREFA] },
      responsaveis_ids: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 1 } },
    } } },
  }, updateTask);
}
