import { describe, expect, it } from 'vitest';
import { ApiError } from './apiError.js';
import {
  buildTarefaQuadroFilters,
  parsePositiveId,
} from './tarefasQuadroQuery.js';

describe('filtros do quadro de tarefas', () => {
  it('gera filtros parametrizados para os campos selecionados', () => {
    const result = buildTarefaQuadroFilters({
      cliente_id: '12',
      projeto_id: '8',
      equipe_id: '3',
      responsavel_id: '5',
      status: 'em_andamento',
      origem: 'interacao',
    });

    expect(result.clause).toBe(
      'where tq.cliente_id = $1 and tq.projeto_id = $2 and tq.equipe_id = $3 and $4 = any(tq.responsaveis_ids) and tq.status = $5 and tq.origem = $6'
    );
    expect(result.values).toEqual([12, 8, 3, 5, 'em_andamento', 'interacao']);
  });

  it('retorna uma clausula vazia sem filtros', () => {
    expect(buildTarefaQuadroFilters({})).toEqual({ clause: '', values: [] });
  });

  it('rejeita identificadores fora do intervalo permitido', () => {
    expect(() => parsePositiveId('0', 'cliente_id')).toThrow(ApiError);
    expect(() => parsePositiveId('1.5', 'projeto_id')).toThrow(ApiError);
    expect(() => parsePositiveId('1 or 1=1', 'equipe_id')).toThrow(ApiError);
  });

  it('rejeita status ou origem não permitidos', () => {
    expect(() =>
      buildTarefaQuadroFilters({ status: 'feito' as never })
    ).toThrow(ApiError);
    expect(() =>
      buildTarefaQuadroFilters({ origem: 'externa' as never })
    ).toThrow(ApiError);
  });
});
