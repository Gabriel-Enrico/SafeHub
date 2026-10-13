import { useState, type SubmitEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function SetPasswordScreen({ hasSession, flow }: { hasSession: boolean; flow: 'invite' | 'recovery' }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function savePassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!supabase) return setMessage('A configuração do Supabase não foi carregada.');
    if (password.length < 8) return setMessage('Use uma senha com pelo menos 8 caracteres.');
    if (password !== confirmation) return setMessage('As senhas não coincidem.');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return setMessage(error.message);
    window.history.replaceState({}, '', '/');
    window.location.reload();
  }

  return <main className="invite-password-page"><form className="invite-password-card" onSubmit={(event) => void savePassword(event)}>
    <span className="eyebrow">{flow === 'invite' ? 'CONVITE SAFEHUB' : 'RECUPERAÇÃO DE ACESSO'}</span>
    <h1>{flow === 'invite' ? 'Defina sua senha' : 'Redefina sua senha'}</h1>
    <p>{hasSession
      ? flow === 'invite' ? 'Seu convite foi confirmado. Escolha uma senha para entrar no SafeHub.' : 'O link foi confirmado. Escolha uma nova senha para sua conta.'
      : flow === 'invite' ? 'Não encontramos uma sessão de convite. Abra novamente o link recebido por e-mail.' : 'O link de recuperação expirou ou não é válido. Solicite um novo link pela tela de login.'}</p>
    {hasSession && <>
      <label>Nova senha<input autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
      <label>Repita a senha<input autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
      <button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : flow === 'invite' ? 'Salvar senha e entrar' : 'Salvar nova senha'}</button>
    </>}
    {message && <div className="workspace-alert" role="alert">{message}</div>}
  </form></main>;
}
