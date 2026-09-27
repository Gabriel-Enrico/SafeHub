export interface Cliente {
  id: number;
  nome: string;
  setor: string | null;
  status_pipeline: string | null;
  responsavel_id: number | null;
}

export interface ClienteBody {
  nome: string;
  setor?: string | null;
  status_pipeline?: string;
  responsavel_id?: number | null;
}

export type ClientePatch = Partial<ClienteBody>;

export interface ClienteListQuery {
  limit?: string;
  offset?: string;
  nome?: string;
  setor?: string;
  status_pipeline?: string;
  responsavel_id?: string;
}

export interface ClienteParams {
  id: string;
}
