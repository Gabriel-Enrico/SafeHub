import { useState, type SubmitEvent } from 'react';

type LoginFormProps = {
  onSignIn: (email: string, password: string) => Promise<void>;
  configurationError?: string;
};

export default function LoginForm({
  onSignIn,
  configurationError,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await onSignIn(email.trim(), password);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'Não foi possível entrar. Tente novamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="form-heading">
        <span className="eyebrow">BEM-VINDO DE VOLTA</span>
        <h2>Entre na sua conta</h2>
        <p>Use seu usuário do Supabase para acessar a API SafeHub.</p>
      </div>

      <label className="field-label" htmlFor="email">
        E-mail
      </label>
      <input
        autoComplete="email"
        className="text-field"
        id="email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="voce@empresa.com"
        required
        type="email"
        value={email}
      />

      <label className="field-label" htmlFor="password">
        Senha
      </label>
      <input
        autoComplete="current-password"
        className="text-field"
        id="password"
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Digite sua senha"
        required
        type="password"
        value={password}
      />

      {(configurationError || error) && (
        <div className="notice notice-error" role="alert">
          {configurationError || error}
        </div>
      )}

      <button
        className="primary-button login-button"
        disabled={isSubmitting || Boolean(configurationError)}
        type="submit"
      >
        {isSubmitting ? 'Entrando…' : 'Entrar no SafeHub'}
        {!isSubmitting && <span aria-hidden="true">→</span>}
      </button>

      <p className="form-footnote">
        A sessão é autenticada pelo Supabase. Sua senha não é enviada à API
        SafeHub.
      </p>
    </form>
  );
}
