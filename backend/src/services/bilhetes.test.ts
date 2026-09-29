import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetar,
  _tamanho,
  cancelarTentativa,
  consumirTentativa,
  guardarTentativa,
  limparExpirados,
} from './outlookAuthState.js';

const DEZ_MINUTOS = 10 * 60 * 1000;

describe('bilhetes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetar(); // começa cada teste com o Map vazio
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna o bilhete e o consome (uso único)', () => {
    guardarTentativa('s1', 'user-abc', 'verifier-xyz');

    const primeiro = consumirTentativa('s1');
    expect(primeiro?.userId).toBe('user-abc');
    expect(primeiro?.codeVerifier).toBe('verifier-xyz');

    expect(consumirTentativa('s1')).toBeNull();
  });

  it('retorna null para state inexistente', () => {
    expect(consumirTentativa('nao-existe')).toBeNull();
  });

  it('ainda vale com 9min59s', () => {
    guardarTentativa('s2', 'user-abc', 'verifier-xyz');
    vi.advanceTimersByTime(DEZ_MINUTOS - 1000);
    expect(consumirTentativa('s2')).not.toBeNull();
  });

  it('expira depois de 10 minutos', () => {
    guardarTentativa('s3', 'user-abc', 'verifier-xyz');
    vi.advanceTimersByTime(DEZ_MINUTOS + 1);
    expect(consumirTentativa('s3')).toBeNull();
  });

  it('expira exatamente ao completar 10 minutos', () => {
    guardarTentativa('limite', 'user-abc', 'verifier-xyz');
    vi.advanceTimersByTime(DEZ_MINUTOS);
    expect(consumirTentativa('limite')).toBeNull();
  });

  it('permite cancelar uma tentativa e não consumi-la depois', () => {
    guardarTentativa('cancelada', 'user-abc', 'verifier-xyz');

    expect(cancelarTentativa('cancelada')).toBe(true);
    expect(consumirTentativa('cancelada')).toBeNull();
    expect(cancelarTentativa('cancelada')).toBe(false);
  });

  it('guardarTentativa limpa bilhetes expirados antes de inserir um novo', () => {
    guardarTentativa('velho', 'user-1', 'v1');
    vi.advanceTimersByTime(DEZ_MINUTOS + 1);
    guardarTentativa('novo', 'user-2', 'v2');

    expect(_tamanho()).toBe(1);

    limparExpirados();

    expect(_tamanho()).toBe(1);
    expect(consumirTentativa('velho')).toBeNull();
    expect(consumirTentativa('novo')).not.toBeNull();
  });

  it('o setInterval dispara a limpeza sozinho', async () => {
    // Reimporta o módulo com os timers falsos já ativos,
    // para o setInterval do módulo ser controlado pelo relógio falso
    vi.resetModules();
    const mod = await import('./outlookAuthState.js');

    mod.guardarTentativa('abandonado', 'user-1', 'v1');
    expect(mod._tamanho()).toBe(1);

    // 11 min: passa da expiração e de vários ciclos de 1 min do intervalo
    vi.advanceTimersByTime(DEZ_MINUTOS + 60 * 1000);

    expect(mod._tamanho()).toBe(0); // sumiu sem ninguém chamar consumirTentativa
  });
});
