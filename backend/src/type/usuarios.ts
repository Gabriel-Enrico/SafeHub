export interface Usuario {
  id: number;
  nome: string;
  email: string;
  cargo: string | null;
  equipe_id: number | null;
  avatar: string | null;
  ativo: boolean;
}

export interface UsuarioInviteBody {
  nome: string;
  email: string;
  cargo: 'Administrador' | 'Operador';
  equipe_id?: number | null;
}

export interface UsuarioPatch {
  nome?: string;
  cargo?: 'Administrador' | 'Operador';
  equipe_id?: number | null;
  avatar?: string | null;
  ativo?: boolean;
}

export interface UsuarioListQuery {
  limit?: string;
  offset?: string;
  busca?: string;
}

export interface UsuarioParams {
  id: string;
}
