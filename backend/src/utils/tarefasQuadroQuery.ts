import {
  STATUS_TAREFA_QUADRO,
  TAREFA_ORIGENS,
  type TarefaQuadroQuery,
} from '../type/tarefasQuadro.js';
import { ApiError } from './apiError.js';

export function parsePositiveId(rawId: string, field: string): number {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} inválido.`);
  }
  return id;
}

export function buildTarefaQuadroFilters(query: TarefaQuadroQuery) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const addIdFilter = (
    expression: string,
    rawValue: string | undefined,
    field: string
  ) => {
    if (rawValue === undefined) return;
    values.push(parsePositiveId(rawValue, field));
    conditions.push(`${expression} = $${values.length}`);
  };

  addIdFilter('tq.cliente_id', query.cliente_id, 'cliente_id');
  addIdFilter('tq.projeto_id', query.projeto_id, 'projeto_id');
  addIdFilter('tq.equipe_id', query.equipe_id, 'equipe_id');

  if (query.responsavel_id !== undefined) {
    values.push(parsePositiveId(query.responsavel_id, 'responsavel_id'));
    conditions.push(`$${values.length} = any(tq.responsaveis_ids)`);
  }

  if (query.status !== undefined) {
    if (!STATUS_TAREFA_QUADRO.includes(query.status)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Status de tarefa inválido.');
    }
    values.push(query.status);
    conditions.push(`tq.status = $${values.length}`);
  }

  if (query.origem !== undefined) {
    if (!TAREFA_ORIGENS.includes(query.origem)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Origem de tarefa inválida.');
    }
    values.push(query.origem);
    conditions.push(`tq.origem = $${values.length}`);
  }

  return {
    clause: conditions.length ? `where ${conditions.join(' and ')}` : '',
    values,
  };
}
