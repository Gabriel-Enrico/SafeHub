import type { ICachePlugin } from '@azure/msal-node';
import { decryptOutlookCache, encryptOutlookCache } from './outlookTokenCrypto.js';
import { loadOutlookCache, saveOutlookCache } from './usuarioIntegracoes.js';

export function createOutlookCachePlugin(userId: string): ICachePlugin {
  return {
    beforeCacheAccess: async (cacheContext) => {
      const storedCache = await loadOutlookCache(userId);
      if (!storedCache) return;

      const serializedCache = decryptOutlookCache(
        storedCache.token_cache_cifrado,
        storedCache.token_cache_nonce,
        storedCache.token_cache_tag,
        storedCache.chave_versao
      );
      cacheContext.tokenCache.deserialize(serializedCache);
    },
    afterCacheAccess: async (cacheContext) => {
      if (!cacheContext.cacheHasChanged) return;

      const encryptedCache = encryptOutlookCache(
        cacheContext.tokenCache.serialize()
      );
      await saveOutlookCache(userId, encryptedCache);
    },
  };
}
