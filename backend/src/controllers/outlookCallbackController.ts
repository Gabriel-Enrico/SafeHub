import type { FastifyReply, FastifyRequest } from 'fastify';
import { getMicrosoftOAuthConfig } from '../config/microsoft.js';
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
      'OUTLOOK_AUTHORIZATION_DENIED',
      'A autorização do Outlook não foi concluída.'
    );
  }

  if (typeof code !== 'string' || code.length === 0) {
    throw new ApiError(
      400,
      'OUTLOOK_INVALID_CALLBACK',
      'O retorno da autorização está incompleto.'
    );
  }

  const { client, redirectUri } = getMicrosoftOAuthConfig();

  try {
    await client.acquireTokenByCode({
      code,
      scopes: ['Calendars.ReadWrite'],
      redirectUri,
      codeVerifier: tentativa.codeVerifier,
    });
  } catch {
    throw new ApiError(
      502,
      'OUTLOOK_TOKEN_EXCHANGE_FAILED',
      'Não foi possível concluir a autorização do Outlook. Inicie a conexão novamente.'
    );
  }

  return reply.status(200).send({
    message:
      'Autorização concluída. A conexão ainda não foi salva para uso futuro.',
  });
};
