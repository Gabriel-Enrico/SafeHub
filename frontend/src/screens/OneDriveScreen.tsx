import { useCallback, useEffect, useState } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';

type DriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
};

type ConnectionStatus = { connected: boolean; status: string; connectedAt: string | null };

async function request<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const currentToken = await getCurrentAccessToken();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${currentToken}`, ...(options.headers ?? {}) },
  });
  const result: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'message' in result
      ? String(result.message)
      : `A API respondeu com HTTP ${response.status}.`;
    throw new Error(message);
  }
  return result as T;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OneDriveScreen({ token }: { token: string }) {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [folderStack, setFolderStack] = useState<Array<{ id?: string; name: string }>>([{ name: 'Meu OneDrive' }]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    const status = await request<ConnectionStatus>(token, '/api/v1/integracoes/onedrive/status');
    setConnection(status);
    return status;
  }, [token]);

  const loadFiles = useCallback(async (folderId?: string) => {
    setLoading(true);
    setError('');
    try {
      const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
      const result = await request<{ value: DriveItem[] }>(token, `/api/v1/integracoes/onedrive/files${query}`);
      setItems(result.value ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível listar os arquivos do OneDrive.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onedrive') === 'connected') {
      setNotice('OneDrive conectado. Seus arquivos estão prontos para consulta.');
      params.delete('onedrive');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
    void loadStatus().then((status) => {
      if (status.connected) void loadFiles();
      else setLoading(false);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Não foi possível verificar a conexão OneDrive.');
      setLoading(false);
    });
  }, [loadFiles, loadStatus]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ authorizationUrl: string }>(token, '/api/v1/integracoes/onedrive/connect', { method: 'POST' });
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a conexão OneDrive.');
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      await request(token, '/api/v1/integracoes/onedrive/connect', { method: 'DELETE' });
      setConnection({ connected: false, status: 'desconectado', connectedAt: null });
      setItems([]);
      setFolderStack([{ name: 'Meu OneDrive' }]);
      setNotice('A conexão OneDrive foi removida.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível desconectar o OneDrive.');
    } finally {
      setBusy(false);
    }
  }

  async function openFolder(folder: DriveItem) {
    const nextStack = [...folderStack, { id: folder.id, name: folder.name }];
    setFolderStack(nextStack);
    await loadFiles(folder.id);
  }

  async function openBreadcrumb(index: number) {
    const nextStack = folderStack.slice(0, index + 1);
    setFolderStack(nextStack);
    await loadFiles(nextStack[index]?.id);
  }

  return <section className="screen-content">
    <div className="screen-head"><div><p className="eyebrow">ARQUIVOS MICROSOFT</p><h1>OneDrive</h1><p>Consulte suas pastas e arquivos Microsoft vinculados à conta conectada.</p></div>
      {connection?.connected && <button className="btn btn-ghost" disabled={busy} onClick={() => void disconnect()} type="button">{busy ? 'Aguarde…' : 'Desconectar'}</button>}
    </div>
    <div className="card onedrive-info"><strong>Acesso de leitura</strong><span>O SafeHub lista e abre os arquivos. Esta etapa não altera nem cria planilhas.</span></div>
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    {!connection?.connected && !loading ? <div className="card onedrive-connect"><div className="integration-logo generic-logo">☁</div><h2>Conecte seu OneDrive</h2><p>Autorize a conta Microsoft que contém os arquivos que você quer consultar. O acesso é individual para esta conta SafeHub.</p><button className="btn btn-primary" disabled={busy} onClick={() => void connect()} type="button">{busy ? 'Conectando…' : 'Conectar com Microsoft'}</button></div> :
      <div className="card onedrive-files">
        <div className="onedrive-toolbar"><div className="onedrive-breadcrumbs">{folderStack.map((folder, index) => <span key={`${folder.id ?? 'root'}-${index}`}><button disabled={index === folderStack.length - 1 || loading} onClick={() => void openBreadcrumb(index)} type="button">{folder.name}</button>{index < folderStack.length - 1 && <b> / </b>}</span>)}</div><button className="btn btn-ghost" disabled={loading} onClick={() => void loadFiles(folderStack.at(-1)?.id)} type="button">Atualizar</button></div>
        {loading ? <div className="table-state">Carregando OneDrive…</div> : !connection?.connected ? null : items.length === 0 ? <div className="table-state">Esta pasta está vazia ou não possui arquivos acessíveis.</div> :
          <div className="onedrive-list">{items.map((item) => <div className="onedrive-item" key={item.id}><span className="onedrive-item-icon">{item.folder ? '📁' : '📄'}</span><div className="onedrive-item-name"><strong>{item.name}</strong><small>{item.folder ? `${item.folder.childCount ?? 0} itens` : `${formatBytes(item.size)} · ${item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).toLocaleDateString('pt-BR') : 'Arquivo'}`}</small></div>{item.folder ? <button className="table-action" onClick={() => void openFolder(item)} type="button">Abrir pasta</button> : item.webUrl ? <a className="table-action" href={item.webUrl} rel="noreferrer" target="_blank">Abrir arquivo</a> : <span>—</span>}</div>)}</div>}
      </div>}
  </section>;
}
