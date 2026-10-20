import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getMicrosoftOAuthConfig } from '../config/microsoft.js';
import type { SupabaseUser } from '../middlewares/authentication.js';
import { cancelarTentativa, guardarTentativa } from '../services/outlookAuthState.js';
import {
  deleteOneDriveConnection,
  getOneDriveConnection,
} from '../services/usuarioIntegracoes.js';
import { listOneDriveItems } from '../services/oneDriveGraph.js';
import { ApiError } from '../utils/apiError.js';

function authenticatedUserId(request: FastifyRequest): string {
  const user = request.user as SupabaseUser | null;
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  return user.id;
}

export async function startOneDriveConnection(request: FastifyRequest, reply: FastifyReply) {
  const userId = authenticatedUserId(request);
  const existing = await getOneDriveConnection(userId);
  if (existing?.status === 'conectado') {
    throw new ApiError(409, 'ONEDRIVE_ALREADY_CONNECTED', 'Desconecte a conta OneDrive atual antes de conectar outra.');
  }
  if (existing) await deleteOneDriveConnection(userId);

  const { client, cryptoProvider, redirectUri } = getMicrosoftOAuthConfig();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
  const state = randomUUID();
  if (!guardarTentativa(state, userId, verifier, 'onedrive')) {
    throw new ApiError(503, 'ONEDRIVE_BUSY', 'Muitas tentativas de conexão; tente novamente.');
  }

  try {
    const authorizationUrl = await client.getAuthCodeUrl({
      scopes: ['Files.Read'],
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

export async function getOneDriveStatus(request: FastifyRequest) {
  const connection = await getOneDriveConnection(authenticatedUserId(request));
  return {
    connected: connection?.status === 'conectado',
    status: connection?.status ?? 'desconectado',
    connectedAt: connection?.conectado_em ?? null,
  };
}

export async function disconnectOneDrive(request: FastifyRequest) {
  await deleteOneDriveConnection(authenticatedUserId(request));
  return { message: 'A conexão OneDrive foi removida.' };
}

export async function listOneDriveFiles(
  request: FastifyRequest<{ Querystring: { folderId?: string } }>
) {
  return listOneDriveItems(authenticatedUserId(request), request.query.folderId);
}
