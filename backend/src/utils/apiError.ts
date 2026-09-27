export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    error: code,
    message,
    ...(details ? { details } : {}),
  };
}
