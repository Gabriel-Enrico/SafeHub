import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getMicrosoftOAuthConfig } from '../config/microsoft.js';
import type { SupabaseUser } from '../middlewares/authentication.js';
import {
  cancelarTentativa,
  guardarTentativa,
} from '../services/outlookAuthState.js';
import {
  deleteOutlookConnection,
  getOutlookConnection,
} from '../services/usuarioIntegracoes.js';
import { ApiError, errorResponse } from '../utils/apiError.js';

export async function startOutlookConnection(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user as SupabaseUser | null;
  if (!user) {
    return reply
      .code(401)
      .send(errorResponse('UNAUTHORIZED', 'Usuário não autenticado'));
  }

  const existingConnection = await getOutlookConnection(user.id);
  if (existingConnection?.status === 'conectado') {
    throw new ApiError(
      409,
      'OUTLOOK_ALREADY_CONNECTED',
      'Desconecte a conta Outlook atual antes de conectar outra.'
    );
  }
  if (existingConnection) {
    await deleteOutlookConnection(user.id);
  }

  const { client, cryptoProvider, redirectUri } = getMicrosoftOAuthConfig();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
  const state = randomUUID();
  const stored = guardarTentativa(state, user.id, verifier);
  if (!stored) {
    throw new ApiError(
      503,
      'OUTLOOK_BUSY',
      'Muitas tentativas de conexão; tente novamente.'
    );
  }

  try {
    const authorizationUrl = await client.getAuthCodeUrl({
      scopes: ['Calendars.ReadWrite'],
      redirectUri,
      state,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      prompt: 'select_account',
    });

    return reply.send({ authorizationUrl });
  } catch (error) {
    cancelarTentativa(state);
    throw error;
  }
}
