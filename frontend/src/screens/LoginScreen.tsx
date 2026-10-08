import LoginForm from '../components/LoginForm';

type LoginScreenProps = {
  onSignIn: (email: string, password: string) => Promise<void>;
  configurationError?: string;
  notice?: string;
};

export default function LoginScreen({
  onSignIn,
  configurationError,
  notice,
}: LoginScreenProps) {
  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <div className="brand-lockup">
          <span aria-hidden="true" className="brand-mark">
            S
          </span>
          <span>SafeHub</span>
        </div>

        <div className="brand-copy">
          <span className="eyebrow eyebrow-light">
            ESPAÇO DE TRABALHO SEGURO
          </span>
          <h1>Seu trabalho, em um só lugar.</h1>
          <p>
            Entre para consultar os dados do SafeHub com a segurança da sua
            conta Supabase.
          </p>
        </div>

        <div className="brand-footer">
          <span className="status-indicator" />
          Acesso protegido por autenticação
        </div>
        <div aria-hidden="true" className="brand-orbit brand-orbit-one" />
        <div aria-hidden="true" className="brand-orbit brand-orbit-two" />
      </section>

      <section className="auth-form-panel">
        <LoginForm
          configurationError={configurationError}
          notice={notice}
          onSignIn={onSignIn}
        />
      </section>
    </main>
  );
}
