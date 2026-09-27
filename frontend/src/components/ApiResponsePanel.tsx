type ApiResponsePanelProps = {
  title: string;
  endpoint: string;
  data: unknown;
  error: string;
  isLoading: boolean;
  onRefresh: () => void;
};

export default function ApiResponsePanel({
  title,
  endpoint,
  data,
  error,
  isLoading,
  onRefresh,
}: ApiResponsePanelProps) {
  return (
    <section
      aria-labelledby={`response-title-${title}`}
      className="response-card"
    >
      <div className="response-heading">
        <div>
          <span className="eyebrow">RESPOSTA AUTENTICADA</span>
          <h2 id={`response-title-${title}`}>{title}</h2>
          <p>{endpoint}</p>
        </div>
        <button
          className="secondary-button"
          disabled={isLoading}
          onClick={onRefresh}
          type="button"
        >
          <span aria-hidden="true">↻</span>
          {isLoading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {error ? (
        <div className="notice notice-error" role="alert">
          <strong>Não foi possível carregar a API.</strong>
          <span>{error}</span>
          <small>Verifique se o backend está rodando e tente atualizar.</small>
        </div>
      ) : (
        <div className="json-view" aria-live="polite">
          {isLoading && data === null ? (
            <div className="loading-state">
              <span className="loading-dot" /> Consultando o SafeHub…
            </div>
          ) : (
            <pre>{JSON.stringify(data, null, 2) ?? 'Aguardando resposta…'}</pre>
          )}
        </div>
      )}
    </section>
  );
}
