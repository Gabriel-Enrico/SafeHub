import {
  ConfidentialClientApplication,
  CryptoProvider,
  type ICachePlugin,
} from '@azure/msal-node';
import 'dotenv/config';
import { ApiError } from '../utils/apiError.js';

const cryptoProvider = new CryptoProvider();

export function getMicrosoftOAuthConfig(cachePlugin?: ICachePlugin) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ApiError(
      503,
      'OUTLOOK_NOT_CONFIGURED',
      'A integração Outlook não está configurada no backend.'
    );
  }

  return {
    client: new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        // "common" permite as contas pessoais e corporativas habilitadas no Entra.
        authority: 'https://login.microsoftonline.com/common',
      },
      ...(cachePlugin ? { cache: { cachePlugin } } : {}),
    }),
    cryptoProvider,
    redirectUri,
  };
}
