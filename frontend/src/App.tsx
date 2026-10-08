import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import './App.css';
import { supabase } from './lib/supabase';
import LoginScreen from './screens/LoginScreen';
import WorkspaceScreen from './screens/WorkspaceScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';
import { apiBaseUrl } from './lib/supabase';

const configurationError = supabase
  ? undefined
  : 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env usado pelo build do frontend.';

async function validateSafeHubProfile(accessToken: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/v1/usuarios/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 403 || response.status === 404) {
    throw new Error('Este usuário está desativado ou não possui um perfil SafeHub ativo.');
  }
  if (response.status === 401) {
    throw new Error('A sessão está inválida ou foi bloqueada. Entre novamente.');
  }
  if (!response.ok) {
    throw new Error('Não foi possível verificar o acesso ao SafeHub. Tente novamente.');
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loginNotice, setLoginNotice] = useState('');
  const isInviteFlow = new URLSearchParams(window.location.search).get('flow') === 'invite';

  useEffect(() => {
    if (!supabase) {
      setIsInitializing(false);
      return;
    }

    let isMounted = true;
    let validationId = 0;
    const applySession = async (nextSession: Session | null) => {
      const currentValidation = ++validationId;
      if (!nextSession) {
        setSession(null);
        setIsInitializing(false);
        return;
      }

      setIsInitializing(true);
      try {
        await validateSafeHubProfile(nextSession.access_token);
        if (!isMounted || currentValidation !== validationId) return;
        setLoginNotice('');
        setSession(nextSession);
      } catch (error) {
        if (!isMounted || currentValidation !== validationId) return;
        setSession(null);
        setLoginNotice(error instanceof Error ? error.message : 'Acesso não autorizado.');
        if (error instanceof Error && error.message.startsWith('Este usuário está desativado')) {
          void supabase?.auth.signOut({ scope: 'local' });
        }
      } finally {
        if (isMounted && currentValidation === validationId) setIsInitializing(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      void applySession(sessionData.session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn(email: string, password: string) {
    if (!supabase) throw new Error(configurationError);
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('banned')) {
        throw new Error('Este usuário está desativado. Peça a um administrador para reativar o acesso.');
      }
      throw error;
    }
    try {
      await validateSafeHubProfile(authData.session.access_token);
    } catch (profileError) {
      await supabase.auth.signOut({ scope: 'local' });
      throw profileError;
    }
    setLoginNotice('');
    setSession(authData.session);
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }

  if (isInitializing) {
    return <main className="startup-screen"><span className="loading-dot" /><p>Preparando seu espaço SafeHub…</p></main>;
  }

  if (isInviteFlow) return <SetPasswordScreen hasSession={Boolean(session)} />;

  if (!session) {
    return <LoginScreen configurationError={configurationError} notice={loginNotice} onSignIn={handleSignIn} />;
  }

  return <WorkspaceScreen accessToken={session.access_token} email={session.user.email ?? ''} onSignOut={() => void handleSignOut()} />;
}

export default App;
