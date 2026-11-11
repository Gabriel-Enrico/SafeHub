export const TAREFA_ORIGENS = ['projeto', 'interacao'] as const;
export type TarefaOrigem = (typeof TAREFA_ORIGENS)[number];

export const TAREFA_VISOES = [
  'minhas',
  'equipe',
  'atrasadas',
  'aguardando_resposta',
] as const;
export type TarefaVisao = (typeof TAREFA_VISOES)[number];

export const STATUS_TAREFA_QUADRO = [
  'a_fazer',
  'em_andamento',
  'bloqueada',
  'em_revisao',
  'concluida',
] as const;
export type StatusTarefaQuadro = (typeof STATUS_TAREFA_QUADRO)[number];

export const PRIORIDADES_TAREFA_QUADRO = [
  'baixa',
  'media',
  'alta',
  'urgente',
] as const;
export type PrioridadeTarefaQuadro = (typeof PRIORIDADES_TAREFA_QUADRO)[number];

export interface TarefaQuadro {
  id: number;
  origem: TarefaOrigem;
  titulo: string;
  descricao: string | null;
  solicitante_nome: string | null;
  status: StatusTarefaQuadro;
  prioridade: PrioridadeTarefaQuadro;
  prazo: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  projeto_id: number | null;
  projeto_nome: string | null;
  projeto_status: string | null;
  interacao_id: number | null;
  aguardando_resposta: boolean;
  equipe_id: number | null;
  responsaveis_ids: number[];
  responsaveis_nomes: string[];
  concluido_em: string | null;
  concluido_por: number | null;
}

export interface TarefaQuadroQuery {
  limit?: string;
  offset?: string;
  cliente_id?: string;
  projeto_id?: string;
  equipe_id?: string;
  responsavel_id?: string;
  status?: StatusTarefaQuadro;
  origem?: TarefaOrigem;
  visao?: TarefaVisao;
}

export interface TarefaQuadroParams {
  origem: string;
  id: string;
}

export interface TarefaStatusBody {
  status: StatusTarefaQuadro;
}

export interface TarefaComentarioBody {
  comentario: string;
}
