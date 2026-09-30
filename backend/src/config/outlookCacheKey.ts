import 'dotenv/config';
import { ApiError } from '../utils/apiError.js';

export const getCacheKey = () => {
  const cacheEncryptionKey = process.env.OUTLOOK_CACHE_ENCRYPTION_KEY;

  if (
    typeof cacheEncryptionKey !== 'string' ||
    !/^[\da-fA-F]{64}$/.test(cacheEncryptionKey)
  ) {
    throw new ApiError(
      503,
      'OUTLOOK_NOT_CONFIGURED',
      'A chave de criptografia do cache Outlook não está configurada corretamente.'
    );
  }

  const cacheKeyDecryption = Buffer.from(cacheEncryptionKey, 'hex');
  if (cacheKeyDecryption.length !== 32) {
    throw new ApiError(
      503,
      'OUTLOOK_NOT_CONFIGURED',
      'A chave de criptografia do cache Outlook não está configurada corretamente.'
    );
  }

  return cacheKeyDecryption;
};
