import type { FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';

export async function requireAdmin(request: FastifyRequest): Promise<void> {
  const authUserId = request.user?.id;
  if (!authUserId) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  }

  const result = await database.query<{ cargo: string | null; ativo: boolean }>(
    `select cargo, ativo from public.usuarios where auth_user_id = $1`,
    [authUserId]
  );
  const profile = result.rows[0];

  if (!profile || !profile.ativo) {
    throw new ApiError(403, 'FORBIDDEN', 'Perfil SafeHub ativo não encontrado.');
  }
  if (profile.cargo !== 'Administrador') {
    throw new ApiError(403, 'FORBIDDEN', 'Acesso permitido somente a administradores.');
  }
}
