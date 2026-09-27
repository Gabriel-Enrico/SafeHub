import ApiResponsePanel from '../components/ApiResponsePanel';

type ApiScreenProps = {
  email: string;
  clientes: { data: unknown; error: string };
  canais: { data: unknown; error: string };
  isLoading: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
};

export default function ApiScreen({
  email,
  clientes,
  canais,
  isLoading,
  onRefresh,
  onSignOut,
}: ApiScreenProps) {
  return (
    <main className="workspace-shell">
      <header className="topbar">
        <a className="brand-lockup brand-lockup-dark" href="/">
          <span aria-hidden="true" className="brand-mark">
            S
          </span>
          <span>SafeHub</span>
        </a>
        <div className="account-menu">
          <div className="account-avatar" aria-hidden="true">
            {email.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="account-details">
            <strong>{email || 'Usuário autenticado'}</strong>
            <span>Sessão segura</span>
          </div>
          <button className="signout-button" onClick={onSignOut} type="button">
            Sair
          </button>
        </div>
      </header>

      <section className="workspace-content">
        <div className="page-intro">
          <div>
            <span className="eyebrow">PAINEL DE DESENVOLVIMENTO</span>
            <h1>API SafeHub</h1>
            <p>
              Você entrou. As respostas abaixo vêm dos endpoints protegidos.
            </p>
          </div>
          <div className="connection-badge">
            <span className="status-indicator status-indicator-green" />
            Sessão autenticada
          </div>
        </div>

        <div className="response-grid">
          <ApiResponsePanel
            title="Clientes"
            endpoint="GET /api/v1/clientes?limit=20&offset=0"
            data={clientes.data}
            error={clientes.error}
            isLoading={isLoading}
            onRefresh={onRefresh}
          />
          <ApiResponsePanel
            title="Canais"
            endpoint="GET /api/v1/canais?limit=20&offset=0"
            data={canais.data}
            error={canais.error}
            isLoading={isLoading}
            onRefresh={onRefresh}
          />
        </div>
        <p className="security-caption">
          A requisição à API usa seu token de acesso do Supabase no cabeçalho
          Authorization. A chave secreta nunca é enviada pelo navegador.
        </p>
      </section>
    </main>
  );
}
