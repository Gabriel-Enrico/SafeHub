type Bilhete = {
  userId: string;
  codeVerifier: string;
  createdAt: number;
};

const bilhetes = new Map<string, Bilhete>();

const DEZ_MINUTOS = 10 * 60 * 1000;
const INTERVALO_LIMPEZA = 60 * 1000; // roda a cada 1 minuto
const LIMITE_BILHETES = 5_000;

export const guardarTentativa = (
  state: string,
  userId: string,
  codeVerifier: string
): boolean => {
  limparExpirados();

  // Permite substituir uma chave existente, mas impede crescimento sem limite.
  if (!bilhetes.has(state) && bilhetes.size >= LIMITE_BILHETES) {
    return false;
  }

  const objeto: Bilhete = {
    userId,
    codeVerifier,
    createdAt: Date.now(),
  };

  bilhetes.set(state, objeto);
  return true;
};

export const consumirTentativa = (state: string): Bilhete | null => {
  const bilhete = bilhetes.get(state);

  if (!bilhete) {
    return null;
  }

  bilhetes.delete(state);

  if (Date.now() - bilhete.createdAt >= DEZ_MINUTOS) {
    return null;
  }

  return bilhete;
};

// Descarta uma tentativa quando não foi possível iniciar a autorização na Microsoft.
export const cancelarTentativa = (state: string): boolean =>
  bilhetes.delete(state);

// Remove todos os bilhetes expirados que ninguém consumiu
export const limparExpirados = () => {
  const agora = Date.now();

  for (const [state, bilhete] of bilhetes) {
    if (agora - bilhete.createdAt >= DEZ_MINUTOS) {
      bilhetes.delete(state);
    }
  }
};

// Limpeza periódica unref() evita que o timer impeça o processo de encerrar
setInterval(limparExpirados, INTERVALO_LIMPEZA).unref();

// Helpers só para testes
export const _tamanho = () => bilhetes.size;
export const _resetar = () => bilhetes.clear();
