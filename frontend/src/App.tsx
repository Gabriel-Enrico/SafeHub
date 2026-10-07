import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import './App.css';
import { supabase } from './lib/supabase';
import LoginScreen from './screens/LoginScreen';
import WorkspaceScreen from './screens/WorkspaceScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';

const configurationError = supabase
  ? undefined
  : 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env usado pelo build do frontend.';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const isInviteFlow = new URLSearchParams(window.location.search).get('flow') === 'invite';

  useEffect(() => {
    if (!supabase) {
      setIsInitializing(false);
      return;
    }

    let isMounted = true;
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (isMounted) {
        setSession(sessionData.session);
        setIsInitializing(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsInitializing(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn(email: string, password: string) {
    if (!supabase) throw new Error(configurationError);
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
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
    return <LoginScreen configurationError={configurationError} onSignIn={handleSignIn} />;
  }

  return <WorkspaceScreen accessToken={session.access_token} email={session.user.email ?? ''} onSignOut={() => void handleSignOut()} />;
}

export default App;
