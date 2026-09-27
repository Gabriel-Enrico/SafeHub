import type { FastifyRequest } from 'fastify';
import { ApiError } from './apiError.js';

export interface Pagination {
  limit: number;
  offset: number;
}

export function getPagination(
  request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>
): Pagination {
  const rawLimit = request.query.limit ?? '20';
  const rawOffset = request.query.offset ?? '0';
  const limit = Number(rawLimit);
  const offset = Number(rawOffset);

  if (
    !/^\d+$/.test(rawLimit) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Parâmetro limit inválido', {
      limit: 'Informe um inteiro entre 1 e 100.',
    });
  }

  if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Parâmetro offset inválido', {
      offset: 'Informe um inteiro maior ou igual a zero.',
    });
  }

  return { limit, offset };
}
