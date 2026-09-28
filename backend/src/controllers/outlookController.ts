import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getMicrosoftOAuthConfig } from '../config/microsoft.js';
import type { SupabaseUser } from '../middlewares/authentication.js';
import { ApiError, errorResponse } from '../utils/apiError.js';

interface PendingOutlookAuthorization {
  userId: string;
  codeVerifier: string;
  createdAt: number;
}
const pendingAuthorizations = new Map<string, PendingOutlookAuthorization>();
const authorizationLifetimeMs = 10 * 60 * 1000;
const maxPendingAuthorizations = 5_000;

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

  const now = Date.now();
  for (const [state, pending] of pendingAuthorizations) {
    if (now - pending.createdAt > authorizationLifetimeMs) {
      pendingAuthorizations.delete(state);
    }
  }

  if (pendingAuthorizations.size >= maxPendingAuthorizations) {
    throw new ApiError(
      503,
      'OUTLOOK_BUSY',
      'Muitas tentativas de conexão; tente novamente.'
    );
  }

  const { client, cryptoProvider, redirectUri } = getMicrosoftOAuthConfig();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
  const state = randomUUID();

  pendingAuthorizations.set(state, {
    userId: user.id,
    codeVerifier: verifier,
    createdAt: now,
  });

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
    pendingAuthorizations.delete(state);
    throw error;
  }
}
