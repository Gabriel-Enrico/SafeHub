export interface ContatoCliente {
  id: number;
  cliente_id: number;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  criado_em: string;
}

export interface ContatoClienteBody {
  nome: string;
  cargo?: string | null;
  email?: string | null;
  telefone?: string | null;
}

export type ContatoClientePatch = Partial<ContatoClienteBody>;

export interface ContatoClienteParams {
  id: string;
  contatoId: string;
}
