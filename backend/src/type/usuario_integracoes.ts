export interface UsuarioIntegracao {
  id: string;
  usuario_auth_id: string;
  integracao_id: number;
  status: string;
  conectado_em: string | null;
  token_cache_cifrado: Buffer;
  token_cache_nonce: Buffer;
  token_cache_tag: Buffer;
  chave_versao: number;
  criado_em: string;
  atualizado_em: string;
}
