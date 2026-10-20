export const STATUS_PROJETO = [
  'em_planejamento',
  'em_andamento',
  'concluido',
] as const;

export type StatusProjeto = (typeof STATUS_PROJETO)[number];

export const COLUNAS_TAREFA = ['a_fazer', 'em_andamento', 'concluida'] as const;
export type ColunaTarefa = (typeof COLUNAS_TAREFA)[number];

export const PRIORIDADES_TAREFA = ['baixa', 'media', 'alta', 'urgente'] as const;
export type PrioridadeTarefa = (typeof PRIORIDADES_TAREFA)[number];

export interface ProjetoBody {
  nome: string;
  descricao?: string | null;
  equipe_id: number;
  cliente_id: number;
  data_inicio?: string | null;
}

export interface ProjetoPatch {
  nome?: string;
  descricao?: string | null;
  equipe_id?: number;
  cliente_id?: number;
  data_inicio?: string | null;
  status?: StatusProjeto;
}

export interface ProjetoParams { id: string }

export interface TarefaBody {
  titulo: string;
  prioridade?: PrioridadeTarefa;
  prazo?: string | null;
  responsaveis_ids?: number[];
}

export interface TarefaPatch {
  titulo?: string;
  prioridade?: PrioridadeTarefa;
  prazo?: string | null;
  coluna_kanban?: ColunaTarefa;
  responsaveis_ids?: number[];
}

export interface TarefaParams { id: string }
export interface ProjetoTarefasParams { projetoId: string }
export interface EquipeParams { equipeId: string }
