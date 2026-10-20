import type { FastifyReply, FastifyRequest } from 'fastify';
import { getMicrosoftOAuthConfig } from '../config/microsoft.js';
import { createOneDriveCachePlugin, createOutlookCachePlugin } from '../services/outlookCachePlugin.js';
import { consumirTentativa } from '../services/outlookAuthState.js';
import { ApiError } from '../utils/apiError.js';

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export const callbackMicrosoft = async (
  request: FastifyRequest<{ Querystring: CallbackQuery }>,
  reply: FastifyReply
) => {
  const { code, state, error } = request.query;

  if (typeof state !== 'string' || state.trim().length === 0) {
    throw new ApiError(
      400,
      'OUTLOOK_INVALID_STATE',
      'Tentativa de conexão inválida ou expirada.'
    );
  }

  const tentativa = consumirTentativa(state);
  if (!tentativa) {
    throw new ApiError(
      400,
      'OUTLOOK_INVALID_STATE',
      'Tentativa de conexão inválida ou expirada.'
    );
  }

  if (typeof error === 'string' && error.length > 0) {
    throw new ApiError(
      400,
      tentativa.integration === 'onedrive' ? 'ONEDRIVE_AUTHORIZATION_DENIED' : 'OUTLOOK_AUTHORIZATION_DENIED',
      `A autorização do ${tentativa.integration === 'onedrive' ? 'OneDrive' : 'Outlook'} não foi concluída.`
    );
  }

  if (typeof code !== 'string' || code.length === 0) {
    throw new ApiError(
      400,
      tentativa.integration === 'onedrive' ? 'ONEDRIVE_INVALID_CALLBACK' : 'OUTLOOK_INVALID_CALLBACK',
      'O retorno da autorização está incompleto.'
    );
  }

  const oneDrive = tentativa.integration === 'onedrive';
  const cachePlugin = oneDrive
    ? createOneDriveCachePlugin(tentativa.userId)
    : createOutlookCachePlugin(tentativa.userId);
  const { client, redirectUri } = getMicrosoftOAuthConfig(cachePlugin);

  try {
    await client.acquireTokenByCode({
      code,
      scopes: oneDrive ? ['Files.Read'] : ['Calendars.ReadWrite'],
      redirectUri,
      codeVerifier: tentativa.codeVerifier,
    });
  } catch {
    throw new ApiError(
      502,
      oneDrive ? 'ONEDRIVE_TOKEN_EXCHANGE_FAILED' : 'OUTLOOK_TOKEN_EXCHANGE_FAILED',
      `Não foi possível concluir a autorização do ${oneDrive ? 'OneDrive' : 'Outlook'}. Inicie a conexão novamente.`
    );
  }

  const frontendUrl = new URL(
    process.env.SAFEHUB_FRONTEND_URL ?? 'http://localhost:5173'
  );
  if (oneDrive) {
    frontendUrl.pathname = '/app/onedrive';
    frontendUrl.searchParams.set('onedrive', 'connected');
  } else {
    frontendUrl.searchParams.set('outlook', 'connected');
  }
  return reply.redirect(frontendUrl.toString());
};
