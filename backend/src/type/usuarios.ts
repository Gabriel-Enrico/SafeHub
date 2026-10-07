export interface Usuario {
  id: number;
  auth_user_id: string;
  nome: string;
  email: string;
  cargo: string | null;
  equipe_id: number | null;
  avatar: string | null;
}
