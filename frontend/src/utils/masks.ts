/**
 * Utilitários de validação e formatação de máscaras para inputs do SafeHub.
 */

/**
 * Retorna a data atual no formato YYYY-MM-DD para uso em atributos `min` de inputs de data.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Aplica máscara de telefone brasileiro (fixo ou celular).
 * Exemplos: (11) 98765-4321 ou (11) 3456-7890
 */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Filtra apenas caracteres numéricos inteiros positivos.
 */
export function maskNumeric(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, '');
  return maxLength ? digits.slice(0, maxLength) : digits;
}

/**
 * Valida formato de e-mail.
 */
export function isValidEmail(email: string): boolean {
  if (!email.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Valida telefone brasileiro (10 ou 11 dígitos).
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

/**
 * Valida se uma data não é anterior à data de hoje.
 */
export function isDateNotPast(dateStr: string | null | undefined): boolean {
  if (!dateStr) return true;
  return dateStr >= getTodayDateString();
}
