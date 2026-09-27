import type { FastifyReply, FastifyRequest } from 'fastify';
import { supabaseAuth } from '../config/supabase.js';
import { errorResponse } from '../utils/apiError.js';

export interface SupabaseUser {
  id: string;
  email?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SupabaseUser | null;
  }
}

export async function requireAuthentication(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) {
    reply
      .code(401)
      .send(errorResponse('UNAUTHORIZED', 'Token Bearer ausente ou inválido'));
    return;
  }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(
      authorization.slice(7).trim()
    );

    if (error) {
      const statusCode = (error as { status?: number }).status;
      if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
        reply
          .code(401)
          .send(
            errorResponse('UNAUTHORIZED', 'Token Bearer inválido ou expirado')
          );
        return;
      }

      request.log.error({ err: error }, 'Falha ao validar token no Supabase');
      reply
        .code(503)
        .send(
          errorResponse(
            'AUTH_UNAVAILABLE',
            'Não foi possível validar a autenticação'
          )
        );
      return;
    }

    request.user = {
      id: data.user.id,
      ...(data.user.email ? { email: data.user.email } : {}),
    };
  } catch (error) {
    request.log.error({ err: error }, 'Falha ao validar token no Supabase');
    reply
      .code(503)
      .send(
        errorResponse(
          'AUTH_UNAVAILABLE',
          'Não foi possível validar a autenticação'
        )
      );
    return;
  }
}
