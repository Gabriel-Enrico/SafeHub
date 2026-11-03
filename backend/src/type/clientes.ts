export interface Cliente {
  id: number;
  nome: string;
  setor: string | null;
  status_pipeline: string | null;
  responsavel_id: number | null;
  pais: string | null;
  site: string | null;
  origem_relacionamento: string | null;
  endereco: string | null;
  observacoes: string | null;
  contatos_busca?: string;
  proxima_acao?: string | null;
  ultima_interacao_em?: string | null;
}

export interface ClienteBody {
  nome: string;
  setor?: string | null;
  status_pipeline?: string;
  responsavel_id?: number | null;
  pais?: string | null;
  site?: string | null;
  origem_relacionamento?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
}

export type ClientePatch = Partial<ClienteBody>;

export interface ClienteListQuery {
  limit?: string;
  offset?: string;
  nome?: string;
  setor?: string;
  status_pipeline?: string;
  responsavel_id?: string;
  pais?: string;
  origem_relacionamento?: string;
}

export interface ClienteParams {
  id: string;
}
