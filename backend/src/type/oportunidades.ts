export const ESTAGIOS_OPORTUNIDADE = [
  'prospeccao',
  'proposta_enviada',
  'negociacao',
] as const;

export type EstagioOportunidade = (typeof ESTAGIOS_OPORTUNIDADE)[number];

export interface Oportunidade {
  id: number;
  titulo: string;
  cliente_id: number;
  cliente_nome: string;
  responsavel_id: number;
  responsavel_nome: string;
  estagio: EstagioOportunidade;
  valor_estimado: number | null;
  previsao_fechamento: string | null;
  proxima_acao: string | null;
}

export interface OportunidadeBody {
  titulo: string;
  cliente_id: number;
  valor_estimado?: number | null;
  previsao_fechamento?: string | null;
  proxima_acao?: string | null;
}

export interface OportunidadeParams {
  id: string;
}

export interface OportunidadeStageBody {
  estagio: EstagioOportunidade;
}

export interface OportunidadeNextActionBody {
  proxima_acao: string | null;
}

export interface OportunidadePatchBody {
  titulo?: string;
  cliente_id?: number;
  responsavel_id?: number | null;
  valor_estimado?: number | null;
  previsao_fechamento?: string | null;
  proxima_acao?: string | null;
}
