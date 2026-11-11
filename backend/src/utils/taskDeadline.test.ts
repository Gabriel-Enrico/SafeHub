import { describe, expect, it } from 'vitest';
import { ApiError } from './apiError.js';
import { validateTaskDeadline } from './taskDeadline.js';

describe('prazo da tarefa', () => {
  const today = '2026-11-11';

  it('permite prazo para hoje ou para o futuro', () => {
    expect(() => validateTaskDeadline(today, today)).not.toThrow();
    expect(() => validateTaskDeadline('2026-11-12', today)).not.toThrow();
  });

  it('rejeita prazo anterior a hoje', () => {
    expect(() => validateTaskDeadline('2026-11-10', today)).toThrow(ApiError);
  });

  it('rejeita datas inexistentes', () => {
    expect(() => validateTaskDeadline('2026-02-30', today)).toThrow(ApiError);
  });

  it('permite não informar prazo', () => {
    expect(() => validateTaskDeadline(null, today)).not.toThrow();
  });
});
