import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ApiError } from '../utils/apiError.js';
import { getCacheKey } from '../config/outlookCacheKey.js';

export const OUTLOOK_CACHE_KEY_VERSION = 1;

export interface EncryptedOutlookCache {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  keyVersion: number;
}

export function encryptOutlookCache(serializedCache: string): EncryptedOutlookCache {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getCacheKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(serializedCache, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext,
    nonce,
    tag: cipher.getAuthTag(),
    keyVersion: OUTLOOK_CACHE_KEY_VERSION,
  };
}

export function decryptOutlookCache(
  ciphertext: Buffer,
  nonce: Buffer,
  tag: Buffer,
  keyVersion: number
): string {
  if (keyVersion !== OUTLOOK_CACHE_KEY_VERSION) {
    throw new ApiError(
      500,
      'OUTLOOK_CACHE_VERSION_UNSUPPORTED',
      'A conexão Outlook precisa ser atualizada.'
    );
  }

  const key = getCacheKey();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ApiError(
      500,
      'OUTLOOK_CACHE_UNREADABLE',
      'Não foi possível ler a conexão Outlook armazenada.'
    );
  }
}
