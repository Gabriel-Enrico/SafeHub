import { database } from '../config/database.js';
import type { UsuarioIntegracao } from '../type/usuario_integracoes.js';
import type { EncryptedOutlookCache } from './outlookTokenCrypto.js';

export const OUTLOOK_INTEGRATION_ID = 1;

type OutlookConnectionStatus = Pick<
  UsuarioIntegracao,
  'status' | 'conectado_em'
>;

export async function getOutlookConnection(
  userId: string
): Promise<OutlookConnectionStatus | null> {
  const result = await database.query<OutlookConnectionStatus>(
    `select status, conectado_em
     from public.usuario_integracoes
     where usuario_auth_id = $1 and integracao_id = $2
     limit 1`,
    [userId, OUTLOOK_INTEGRATION_ID]
  );

  return result.rows[0] ?? null;
}

export async function loadOutlookCache(userId: string) {
  const result = await database.query<
    Pick<
      UsuarioIntegracao,
      | 'token_cache_cifrado'
      | 'token_cache_nonce'
      | 'token_cache_tag'
      | 'chave_versao'
    >
  >(
    `select token_cache_cifrado, token_cache_nonce, token_cache_tag, chave_versao
     from public.usuario_integracoes
     where usuario_auth_id = $1 and integracao_id = $2 and status = $3
     limit 1`,
    [userId, OUTLOOK_INTEGRATION_ID, 'conectado']
  );

  return result.rows[0] ?? null;
}

export async function saveOutlookCache(
  userId: string,
  encryptedCache: EncryptedOutlookCache
): Promise<void> {
  await database.query(
    `insert into public.usuario_integracoes (
       usuario_auth_id,
       integracao_id,
       status,
       conectado_em,
       token_cache_cifrado,
       token_cache_nonce,
       token_cache_tag,
       chave_versao,
       criado_em,
       atualizado_em
     ) values ($1, $2, $3, now(), $4, $5, $6, $7, now(), now())
     on conflict (usuario_auth_id, integracao_id)
     do update set
       status = excluded.status,
       conectado_em = coalesce(public.usuario_integracoes.conectado_em, excluded.conectado_em),
       token_cache_cifrado = excluded.token_cache_cifrado,
       token_cache_nonce = excluded.token_cache_nonce,
       token_cache_tag = excluded.token_cache_tag,
       chave_versao = excluded.chave_versao,
       atualizado_em = now()`,
    [
      userId,
      OUTLOOK_INTEGRATION_ID,
      'conectado',
      encryptedCache.ciphertext,
      encryptedCache.nonce,
      encryptedCache.tag,
      encryptedCache.keyVersion,
    ]
  );
}

export async function setOutlookConnectionStatus(
  userId: string,
  status: string
): Promise<void> {
  await database.query(
    `update public.usuario_integracoes
     set status = $3, atualizado_em = now()
     where usuario_auth_id = $1 and integracao_id = $2`,
    [userId, OUTLOOK_INTEGRATION_ID, status]
  );
}

export async function deleteOutlookConnection(userId: string): Promise<void> {
  await database.query(
    `delete from public.usuario_integracoes
     where usuario_auth_id = $1 and integracao_id = $2`,
    [userId, OUTLOOK_INTEGRATION_ID]
  );
}
