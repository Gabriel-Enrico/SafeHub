import type { FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import type { Usuario } from '../type/usuarios.js';
import { ApiError } from '../utils/apiError.js';

export async function getMyPerfil(request: FastifyRequest): Promise<Usuario> {
  const authUserId = request.user?.id;

  if (!authUserId) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  }

  const result = await database.query<Usuario>(
    `select id, auth_user_id, nome, email, cargo, equipe_id, avatar
     from public.usuarios
     where auth_user_id = $1`,
    [authUserId]
  );

  const usuario = result.rows[0];
  if (!usuario) {
    throw new ApiError(
      404,
      'PROFILE_NOT_FOUND',
      'Perfil do usuário não encontrado.'
    );
  }

  return usuario;
}
