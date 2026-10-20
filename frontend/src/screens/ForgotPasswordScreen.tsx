import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import brandLogo from '../assets/Ícone Espacial de Planeta Orbital.png';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function requestRecovery(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!supabase) {
      setError('A configuração do Supabase não foi carregada.');
      return;
    }

    setIsSending(true);
    const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/?flow=recovery`,
    });
    setIsSending(false);

    if (requestError) {
      setError('Não foi possível enviar a solicitação agora. Tente novamente mais tarde.');
      return;
    }
    setSent(true);
  }

  return <main className="auth-layout recovery-layout">
    <section className="auth-brand-panel">
      <div className="brand-lockup"><img alt="" aria-hidden="true" className="brand-mark" src={brandLogo} /><span>SafeHub</span></div>
      <div className="brand-copy"><span className="eyebrow eyebrow-light">RECUPERAÇÃO DE ACESSO</span><h1>Volte ao seu espaço.</h1><p>Vamos enviar instruções para o e-mail associado à sua conta.</p></div>
      <div className="brand-footer"><span className="status-indicator" />Recuperação protegida pelo Supabase</div>
      <div aria-hidden="true" className="brand-orbit brand-orbit-one" /><div aria-hidden="true" className="brand-orbit brand-orbit-two" />
    </section>
    <section className="auth-form-panel">
      <form className="login-form" onSubmit={(event) => void requestRecovery(event)}>
        <div className="form-heading"><span className="eyebrow">ESQUECEU A SENHA?</span><h2>Recuperar senha</h2><p>Informe o e-mail da sua conta SafeHub.</p></div>
        {!sent ? <>
          <label className="field-label" htmlFor="recovery-email">E-mail</label>
          <input autoComplete="email" className="text-field" id="recovery-email" maxLength={320} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" required type="email" value={email} />
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <button className="primary-button login-button" disabled={isSending} type="submit">{isSending ? 'Enviando…' : 'Enviar instruções'}{!isSending && <span aria-hidden="true">→</span>}</button>
        </> : <div className="notice notice-success" role="status">Se houver uma conta com esse e-mail, enviaremos as instruções para redefinir a senha.</div>}
        <Link className="forgot-password-link" to="/login">Voltar para o login</Link>
      </form>
    </section>
  </main>;
}
