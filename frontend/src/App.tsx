import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { apiBaseUrl, supabase } from './lib/supabase';
import ApiScreen from './screens/ApiScreen';
import LoginScreen from './screens/LoginScreen';

const configurationError = supabase
  ? undefined
  : 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo frontend/.env e reinicie o Vite.';

type EndpointResponse = { data: unknown; error: string };
type ApiResponses = { clientes: EndpointResponse; canais: EndpointResponse };

const emptyResponses: ApiResponses = {
  clientes: { data: null, error: '' },
  canais: { data: null, error: '' },
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [responses, setResponses] = useState<ApiResponses>(emptyResponses);
  const [isLoading, setIsLoading] = useState(false);

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsInitializing(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadApiResponse = useCallback(async (accessToken: string) => {
    setIsLoading(true);

    const fetchEndpoint = async (path: string): Promise<EndpointResponse> => {
      try {
        const response = await fetch(
          `${apiBaseUrl.replace(/\/$/, '')}${path}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const body: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            body && typeof body === 'object' && 'message' in body
              ? String(body.message)
              : `A API respondeu com HTTP ${response.status}.`;
          throw new Error(message);
        }

        return { data: body, error: '' };
      } catch (error) {
        return {
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Não foi possível conectar ao backend.',
        };
      }
    };

    const [clientes, canais] = await Promise.all([
      fetchEndpoint('/api/v1/clientes?limit=20&offset=0'),
      fetchEndpoint('/api/v1/canais?limit=20&offset=0'),
    ]);
    setResponses({ clientes, canais });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      void loadApiResponse(session.access_token);
    } else {
      setResponses(emptyResponses);
    }
  }, [session, loadApiResponse]);

  async function handleSignIn(email: string, password: string) {
    if (!supabase) {
      throw new Error(configurationError);
    }

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    setSession(authData.session);
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }

  if (isInitializing) {
    return (
      <main className="startup-screen">
        <span className="loading-dot" />
        <p>Preparando seu espaço SafeHub…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        configurationError={configurationError}
        onSignIn={handleSignIn}
      />
    );
  }

  return (
    <ApiScreen
      clientes={responses.clientes}
      canais={responses.canais}
      email={session.user.email ?? ''}
      isLoading={isLoading}
      onRefresh={() => void loadApiResponse(session.access_token)}
      onSignOut={() => void handleSignOut()}
    />
  );
}

export default App;
