import { ApiError } from './apiError.js';

export function validateTaskDeadline(
  deadline: string | null | undefined,
  today: string
): void {
  if (deadline == null) return;

  const parsed = new Date(`${deadline}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== deadline
  ) {
    throw new ApiError(
      400,
      'INVALID_TASK_DEADLINE',
      'Informe uma data válida para o prazo da tarefa.'
    );
  }
  if (deadline < today) {
    throw new ApiError(
      400,
      'TASK_DEADLINE_IN_PAST',
      'O prazo da tarefa não pode ser anterior a hoje.'
    );
  }
}
