import {
  STATUS_TAREFA_QUADRO,
  TAREFA_ORIGENS,
  TAREFA_VISOES,
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

export function buildTarefaQuadroFilters(
  query: TarefaQuadroQuery,
  currentUser: { id: number; equipeId: number | null; isAdmin: boolean } = {
    id: 0,
    equipeId: null,
    isAdmin: false,
  },
  parameterOffset = 0
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const addIdFilter = (
    expression: string,
    rawValue: string | undefined,
    field: string
  ) => {
    if (rawValue === undefined) return;
    values.push(parsePositiveId(rawValue, field));
    conditions.push(`${expression} = $${parameterOffset + values.length}`);
  };

  addIdFilter('tq.cliente_id', query.cliente_id, 'cliente_id');
  addIdFilter('tq.projeto_id', query.projeto_id, 'projeto_id');
  addIdFilter('tq.equipe_id', query.equipe_id, 'equipe_id');

  if (query.responsavel_id !== undefined) {
    values.push(parsePositiveId(query.responsavel_id, 'responsavel_id'));
    conditions.push(
      `$${parameterOffset + values.length} = any(tq.responsaveis_ids)`
    );
  }

  if (query.status !== undefined) {
    if (!STATUS_TAREFA_QUADRO.includes(query.status)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Status de tarefa inválido.');
    }
    values.push(query.status);
    conditions.push(`tq.status = $${parameterOffset + values.length}`);
  }

  if (query.origem !== undefined) {
    if (!TAREFA_ORIGENS.includes(query.origem)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Origem de tarefa inválida.');
    }
    values.push(query.origem);
    conditions.push(`tq.origem = $${parameterOffset + values.length}`);
  }

  if (query.visao !== undefined) {
    if (!TAREFA_VISOES.includes(query.visao)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Visão de tarefa inválida.');
    }
    if (query.visao === 'minhas') {
      values.push(currentUser.id);
      conditions.push(
        `$${parameterOffset + values.length} = any(tq.responsaveis_ids)`
      );
    } else if (query.visao === 'equipe') {
      if (currentUser.isAdmin) {
        conditions.push('tq.equipe_id is not null');
      } else if (currentUser.equipeId == null) {
        conditions.push('false');
      } else {
        values.push(currentUser.equipeId);
        conditions.push(`tq.equipe_id = $${parameterOffset + values.length}`);
      }
    } else if (query.visao === 'atrasadas') {
      conditions.push("tq.prazo < current_date and tq.status <> 'concluida'");
    } else {
      conditions.push('tq.aguardando_resposta');
    }
  }

  return {
    clause: conditions.length ? `where ${conditions.join(' and ')}` : '',
    values,
  };
}
