import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';
import { getTodayDateString, maskNumeric } from '../utils/masks';

type DriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
};

type ConnectionStatus = {
  connected: boolean;
  status: string;
  connectedAt: string | null;
};
type FileFilter = 'all' | 'excel';
type LibraryLinkType =
  | ''
  | 'cliente'
  | 'projeto'
  | 'edital'
  | 'tarefa_projeto'
  | 'tarefa_cliente';
type LibraryItem = {
  id: number;
  drive_item_id: string;
  nome: string;
  web_url: string;
  categoria: string;
  versao: string;
  revisar_em: string | null;
  proprietario_nome: string | null;
  equipe_id: number | null;
  equipe_nome: string | null;
  vinculo_tipo: Exclude<LibraryLinkType, ''> | null;
  vinculo_id: number | null;
};
type LibraryDraft = {
  categoria: string;
  versao: string;
  revisar_em: string;
  equipe_id: string;
  vinculo_tipo: LibraryLinkType;
  vinculo_id: string;
};
type LibraryTargets = {
  clientes: Array<{ id: number; nome: string }>;
  projetos: Array<{ id: number; nome: string }>;
  editais: Array<{ id: number; titulo: string; instituicao: string }>;
};

const emptyLibraryDraft: LibraryDraft = {
  categoria: '',
  versao: '1.0',
  revisar_em: '',
  equipe_id: '',
  vinculo_tipo: '',
  vinculo_id: '',
};

async function request<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const currentToken = await getCurrentAccessToken();
  const isMultipart =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${currentToken}`,
      ...(options.body === undefined || isMultipart
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
  });
  const result: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result && typeof result === 'object' && 'message' in result
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

function isExcelFile(item: DriveItem) {
  return /\.(xlsx|xlsm|xlsb|xls|xltx|xltm|xlt)$/i.test(item.name);
}

export default function OneDriveScreen({ token }: { token: string }) {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [folderStack, setFolderStack] = useState<
    Array<{ id?: string; name: string }>
  >([{ name: 'Meu OneDrive' }]);
  const [searchText, setSearchText] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [fileFilter, setFileFilter] = useState<FileFilter>('all');
  const [view, setView] = useState<'files' | 'library'>('files');
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySearchInput, setLibrarySearchInput] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('');
  const [libraryCategoryInput, setLibraryCategoryInput] = useState('');
  const [libraryTeams, setLibraryTeams] = useState<
    Array<{ id: number; nome: string }>
  >([]);
  const [libraryTargets, setLibraryTargets] = useState<LibraryTargets>({
    clientes: [],
    projetos: [],
    editais: [],
  });
  const [fileForLibrary, setFileForLibrary] = useState<DriveItem | null>(null);
  const [libraryDraft, setLibraryDraft] =
    useState<LibraryDraft>(emptyLibraryDraft);
  const [editingLibraryId, setEditingLibraryId] = useState<number | null>(null);
  const [libraryEditDraft, setLibraryEditDraft] =
    useState<LibraryDraft>(emptyLibraryDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    const status = await request<ConnectionStatus>(
      token,
      '/api/v1/integracoes/onedrive/status'
    );
    setConnection(status);
    return status;
  }, [token]);

  const loadFiles = useCallback(
    async (folderId?: string, searchTerm = '') => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (searchTerm.trim()) params.set('busca', searchTerm.trim());
        else if (folderId) params.set('folderId', folderId);
        const query = params.size ? `?${params.toString()}` : '';
        const result = await request<{ value: DriveItem[] }>(
          token,
          `/api/v1/integracoes/onedrive/files${query}`
        );
        setItems(result.value ?? []);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível listar os arquivos do OneDrive.'
        );
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const loadLibrary = useCallback(
    async (query = '', category = '') => {
      setLibraryLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('busca', query.trim());
        if (category.trim()) params.set('categoria', category.trim());
        const searchQuery = params.size ? `?${params.toString()}` : '';
        const result = await request<{ data: LibraryItem[] }>(
          token,
          `/api/v1/integracoes/onedrive/library${searchQuery}`
        );
        setLibraryItems(result.data ?? []);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar a biblioteca.'
        );
      } finally {
        setLibraryLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onedrive') === 'connected') {
      setNotice(
        'OneDrive conectado. Seus arquivos estão prontos para consulta.'
      );
      params.delete('onedrive');
      const query = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`
      );
    }
    void loadStatus()
      .then((status) => {
        if (status.connected) void loadFiles();
        else setLoading(false);
        void loadLibrary();
        void request<{ data: Array<{ id: number; nome: string }> }>(
          token,
          '/api/v1/projetos/equipes'
        )
          .then((result) => setLibraryTeams(result.data ?? []))
          .catch(() => setLibraryTeams([]));
      })
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível verificar a conexão OneDrive.'
        );
        setLoading(false);
      });
  }, [loadFiles, loadLibrary, loadStatus, token]);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<{ data: LibraryTargets['clientes'] }>(
        token,
        '/api/v1/clientes?limit=100&offset=0'
      ),
      request<{ data: LibraryTargets['projetos'] }>(token, '/api/v1/projetos'),
      request<{ data: LibraryTargets['editais'] }>(token, '/api/v1/editais'),
    ])
      .then(([clients, projects, editais]) => {
        if (active)
          setLibraryTargets({
            clientes: clients.data ?? [],
            projetos: projects.data ?? [],
            editais: editais.data ?? [],
          });
      })
      .catch(() => {
        if (active)
          setLibraryTargets({ clientes: [], projetos: [], editais: [] });
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ authorizationUrl: string }>(
        token,
        '/api/v1/integracoes/onedrive/connect',
        { method: 'POST' }
      );
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível iniciar a conexão OneDrive.'
      );
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      await request(token, '/api/v1/integracoes/onedrive/connect', {
        method: 'DELETE',
      });
      setConnection({
        connected: false,
        status: 'desconectado',
        connectedAt: null,
      });
      setItems([]);
      setFolderStack([{ name: 'Meu OneDrive' }]);
      setNotice('A conexão OneDrive foi removida.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível desconectar o OneDrive.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function openFolder(folder: DriveItem) {
    setActiveSearch('');
    setSearchText('');
    const nextStack = [...folderStack, { id: folder.id, name: folder.name }];
    setFolderStack(nextStack);
    await loadFiles(folder.id, '');
  }

  async function openBreadcrumb(index: number) {
    setActiveSearch('');
    setSearchText('');
    const nextStack = folderStack.slice(0, index + 1);
    setFolderStack(nextStack);
    await loadFiles(nextStack[index]?.id, '');
  }

  async function searchFiles(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchText.trim();
    setActiveSearch(query);
    if (query) setFolderStack([{ name: 'Resultados da busca' }]);
    await loadFiles(query ? undefined : folderStack.at(-1)?.id, query);
  }

  async function saveToLibrary(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fileForLibrary) return;
    if (libraryDraft.revisar_em && libraryDraft.revisar_em < getTodayDateString()) {
      setError('A data de revisão não pode ser anterior a hoje.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request<LibraryItem>(
        token,
        '/api/v1/integracoes/onedrive/library',
        {
          method: 'POST',
          body: JSON.stringify({
            drive_item_id: fileForLibrary.id,
            nome: fileForLibrary.name,
            web_url: fileForLibrary.webUrl,
            categoria: libraryDraft.categoria.trim(),
            versao: libraryDraft.versao.trim() || '1.0',
            revisar_em: libraryDraft.revisar_em || null,
            equipe_id: libraryDraft.equipe_id
              ? Number(libraryDraft.equipe_id)
              : null,
            vinculo_tipo: libraryDraft.vinculo_tipo || null,
            vinculo_id: libraryDraft.vinculo_id
              ? Number(libraryDraft.vinculo_id)
              : null,
          }),
        }
      );
      setFileForLibrary(null);
      setLibraryDraft(emptyLibraryDraft);
      setNotice('Documento adicionado à biblioteca.');
      await loadLibrary(librarySearch, libraryCategory);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o documento na biblioteca.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateLibraryItem(item: LibraryItem) {
    if (libraryEditDraft.revisar_em && libraryEditDraft.revisar_em < getTodayDateString()) {
      setError('A data de revisão não pode ser anterior a hoje.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const draft = libraryEditDraft;
      await request(token, `/api/v1/integracoes/onedrive/library/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          categoria: draft.categoria.trim(),
          versao: draft.versao.trim() || '1.0',
          revisar_em: draft.revisar_em || null,
          equipe_id: draft.equipe_id ? Number(draft.equipe_id) : null,
          vinculo_tipo: draft.vinculo_tipo || null,
          vinculo_id: draft.vinculo_id ? Number(draft.vinculo_id) : null,
        }),
      });
      setEditingLibraryId(null);
      await loadLibrary(librarySearch, libraryCategory);
      setNotice('Metadados atualizados.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar o documento.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeLibraryItem(item: LibraryItem) {
    setBusy(true);
    setError('');
    try {
      await request(token, `/api/v1/integracoes/onedrive/library/${item.id}`, {
        method: 'DELETE',
      });
      await loadLibrary(librarySearch, libraryCategory);
      setNotice(
        'Documento removido da biblioteca. O arquivo original não foi excluído.'
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível remover o documento.'
      );
    } finally {
      setBusy(false);
    }
  }

  function linkOptions(linkType: LibraryLinkType) {
    if (linkType === 'cliente')
      return libraryTargets.clientes.map((item) => ({
        id: item.id,
        name: item.nome,
      }));
    if (linkType === 'projeto')
      return libraryTargets.projetos.map((item) => ({
        id: item.id,
        name: item.nome,
      }));
    if (linkType === 'edital')
      return libraryTargets.editais.map((item) => ({
        id: item.id,
        name: `${item.titulo} · ${item.instituicao}`,
      }));
    return [];
  }

  function openLibraryEdit(item: LibraryItem) {
    setEditingLibraryId(item.id);
    setLibraryEditDraft({
      categoria: item.categoria,
      versao: item.versao,
      revisar_em: item.revisar_em?.slice(0, 10) ?? '',
      equipe_id: item.equipe_id ? String(item.equipe_id) : '',
      vinculo_tipo: item.vinculo_tipo ?? '',
      vinculo_id: item.vinculo_id ? String(item.vinculo_id) : '',
    });
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copiado.');
    } catch {
      setError('Não foi possível copiar o link neste navegador.');
    }
  }

  const visibleItems = items.filter(
    (item) => item.folder || fileFilter === 'all' || isExcelFile(item)
  );
  const visibleFileCount = visibleItems.filter((item) => !item.folder).length;

  return (
    <section className="screen-content">
      <div className="screen-head">
        <div>
          <p className="eyebrow">ARQUIVOS MICROSOFT</p>
          <h1>OneDrive</h1>
          <p>
            Consulte arquivos da conta Microsoft conectada e catalogue materiais
            institucionais.
          </p>
        </div>
        {connection?.connected && (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void disconnect()}
            type="button"
          >
            {busy ? 'Aguarde…' : 'Desconectar'}
          </button>
        )}
      </div>
      <div className="card onedrive-info">
        <strong>OneDrive e biblioteca SafeHub</strong>
        <span>
          Os arquivos permanecem no OneDrive original. A biblioteca armazena
          metadados e links, sem duplicar o arquivo.
        </span>
      </div>
      {error && (
        <div className="workspace-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
        </div>
      )}
      {!connection?.connected && !loading ? (
        <div className="card onedrive-connect">
          <div className="integration-logo generic-logo">☁</div>
          <h2>Conecte seu OneDrive</h2>
          <p>
            Autorize a conta Microsoft que contém os arquivos que você quer
            consultar.
          </p>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void connect()}
            type="button"
          >
            {busy ? 'Conectando…' : 'Conectar com Microsoft'}
          </button>
        </div>
      ) : (
        <>
          <div
            className="project-view-tabs onedrive-view-tabs"
            aria-label="Arquivos e biblioteca"
            role="tablist"
          >
            <button
              aria-selected={view === 'files'}
              className={view === 'files' ? 'active' : ''}
              onClick={() => setView('files')}
              role="tab"
              type="button"
            >
              Arquivos
            </button>
            <button
              aria-selected={view === 'library'}
              className={view === 'library' ? 'active' : ''}
              onClick={() => {
                setView('library');
                void loadLibrary(librarySearch, libraryCategory);
              }}
              role="tab"
              type="button"
            >
              Biblioteca institucional
            </button>
          </div>

          {view === 'files' ? (
            <div className="card onedrive-files">
              <div className="onedrive-toolbar">
                <div className="onedrive-breadcrumbs">
                  {folderStack.map((folder, index) => (
                    <span key={`${folder.id ?? 'root'}-${index}`}>
                      <button
                        disabled={index === folderStack.length - 1 || loading}
                        onClick={() => void openBreadcrumb(index)}
                        type="button"
                      >
                        {folder.name}
                      </button>
                      {index < folderStack.length - 1 && <b> / </b>}
                    </span>
                  ))}
                </div>
                <form
                  className="onedrive-search"
                  onSubmit={(event) => void searchFiles(event)}
                >
                  <input
                    aria-label="Buscar arquivos no OneDrive"
                    maxLength={200}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Buscar arquivos e pastas"
                    value={searchText}
                  />
                  <button
                    className="btn btn-ghost"
                    disabled={loading || !searchText.trim()}
                    type="submit"
                  >
                    Buscar
                  </button>
                  {activeSearch && (
                    <button
                      className="table-action"
                      disabled={loading}
                      onClick={() => {
                        setSearchText('');
                        setActiveSearch('');
                        void loadFiles(folderStack.at(-1)?.id, '');
                      }}
                      type="button"
                    >
                      Limpar
                    </button>
                  )}
                </form>
                <button
                  className="btn btn-ghost"
                  disabled={loading}
                  onClick={() =>
                    void loadFiles(folderStack.at(-1)?.id, activeSearch)
                  }
                  type="button"
                >
                  Atualizar
                </button>
              </div>
              <div className="onedrive-filter-bar">
                <div>
                  <strong>
                    {loading
                      ? 'Carregando arquivos…'
                      : `${visibleFileCount} arquivo${visibleFileCount === 1 ? '' : 's'}`}
                  </strong>
                  <span>
                    {activeSearch
                      ? `Resultados para “${activeSearch}”`
                      : 'Pesquise em toda a conta ou navegue pelas pastas.'}
                  </span>
                </div>
                <div
                  className="onedrive-filter-options"
                  aria-label="Filtrar arquivos"
                >
                  <button
                    aria-pressed={fileFilter === 'all'}
                    className={fileFilter === 'all' ? 'active' : ''}
                    onClick={() => setFileFilter('all')}
                    type="button"
                  >
                    Todos
                  </button>
                  <button
                    aria-pressed={fileFilter === 'excel'}
                    className={fileFilter === 'excel' ? 'active' : ''}
                    onClick={() => setFileFilter('excel')}
                    type="button"
                  >
                    Planilhas Excel
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="table-state">Carregando OneDrive…</div>
              ) : visibleItems.length === 0 ? (
                <div className="table-state">
                  {activeSearch
                    ? 'Nenhum resultado encontrado.'
                    : fileFilter === 'excel'
                      ? 'Nenhuma planilha Excel nesta pasta. As pastas continuam visíveis para navegação.'
                      : 'Esta pasta está vazia ou não possui arquivos acessíveis.'}
                </div>
              ) : (
                <div className="onedrive-list">
                  {visibleItems.map((item) => (
                    <div className="onedrive-item" key={item.id}>
                      <span className="onedrive-item-icon">
                        {item.folder ? '📁' : isExcelFile(item) ? '▦' : '📄'}
                      </span>
                      <div className="onedrive-item-name">
                        <strong>{item.name}</strong>
                        <small>
                          {item.folder
                            ? `${item.folder.childCount ?? 0} itens`
                            : `${formatBytes(item.size)} · ${item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).toLocaleDateString('pt-BR') : 'Arquivo'}`}
                        </small>
                      </div>
                      {item.folder ? (
                        <button
                          className="table-action"
                          disabled={loading}
                          onClick={() => void openFolder(item)}
                          type="button"
                        >
                          Abrir pasta
                        </button>
                      ) : (
                        <div className="onedrive-item-actions">
                          {item.webUrl && (
                            <>
                              <a
                                className="table-action"
                                href={item.webUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                Abrir ↗
                              </a>
                              <button
                                className="table-action"
                                onClick={() => void copyLink(item.webUrl!)}
                                type="button"
                              >
                                Copiar link
                              </button>
                              <button
                                className="table-action"
                                onClick={() => {
                                  setFileForLibrary(item);
                                  setLibraryDraft(emptyLibraryDraft);
                                  setError('');
                                }}
                                type="button"
                              >
                                Adicionar à biblioteca
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <section className="card onedrive-library">
              <form
                className="onedrive-library-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setLibrarySearch(librarySearchInput);
                  setLibraryCategory(libraryCategoryInput);
                  void loadLibrary(librarySearchInput, libraryCategoryInput);
                }}
              >
                <label>
                  Buscar na biblioteca
                  <input
                    maxLength={200}
                    onChange={(event) =>
                      setLibrarySearchInput(event.target.value)
                    }
                    placeholder="Nome do documento"
                    value={librarySearchInput}
                  />
                </label>
                <label>
                  Categoria
                  <input
                    maxLength={120}
                    onChange={(event) =>
                      setLibraryCategoryInput(event.target.value)
                    }
                    placeholder="Filtrar por categoria"
                    value={libraryCategoryInput}
                  />
                </label>
                <button className="btn btn-ghost" type="submit">
                  Buscar
                </button>
              </form>
              {libraryLoading ? (
                <div className="table-state">Carregando biblioteca…</div>
              ) : libraryItems.length === 0 ? (
                <div className="table-state">Nenhum material catalogado.</div>
              ) : (
                <div className="onedrive-library-list">
                  {libraryItems.map((item) => (
                    <article className="onedrive-library-item" key={item.id}>
                      <header>
                        <div>
                          <span className="eyebrow">
                            {item.categoria} · v{item.versao}
                          </span>
                          <h2>{item.nome}</h2>
                        </div>
                        <div className="onedrive-item-actions">
                          <a
                            className="table-action"
                            href={item.web_url}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Abrir ↗
                          </a>
                          <button
                            className="table-action"
                            onClick={() => void copyLink(item.web_url)}
                            type="button"
                          >
                            Copiar link
                          </button>
                          <button
                            className="table-action"
                            onClick={() => openLibraryEdit(item)}
                            type="button"
                          >
                            Editar metadados
                          </button>
                          <button
                            className="table-action danger"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remover “${item.nome}” da biblioteca? O arquivo original não será apagado.`
                                )
                              )
                                void removeLibraryItem(item);
                            }}
                            type="button"
                          >
                            Remover
                          </button>
                        </div>
                      </header>
                      <p>
                        {item.proprietario_nome
                          ? `Proprietário: ${item.proprietario_nome}`
                          : 'Proprietário não definido'}
                        {item.equipe_nome
                          ? ` · Equipe: ${item.equipe_nome}`
                          : ''}
                        {item.revisar_em
                          ? ` · Revisar até ${new Date(`${item.revisar_em.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')}`
                          : ''}
                        {item.vinculo_tipo && item.vinculo_id
                          ? ` · Vinculado a ${item.vinculo_tipo.replaceAll('_', ' ')} #${item.vinculo_id}`
                          : ''}
                      </p>
                      {editingLibraryId === item.id && (
                        <form
                          className="onedrive-library-edit"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void updateLibraryItem(item);
                          }}
                        >
                          <label>
                            Categoria
                            <input
                              onChange={(event) =>
                                setLibraryEditDraft({
                                  ...libraryEditDraft,
                                  categoria: event.target.value,
                                })
                              }
                              required
                              value={libraryEditDraft.categoria}
                            />
                          </label>
                          <label>
                            Versão
                            <input
                              onChange={(event) =>
                                setLibraryEditDraft({
                                  ...libraryEditDraft,
                                  versao: event.target.value,
                                })
                              }
                              value={libraryEditDraft.versao}
                            />
                          </label>
                          <label>
                            Data de revisão
                            <input
                              min={getTodayDateString()}
                              onChange={(event) =>
                                setLibraryEditDraft({
                                  ...libraryEditDraft,
                                  revisar_em: event.target.value,
                                })
                              }
                              type="date"
                              value={libraryEditDraft.revisar_em}
                            />
                          </label>
                          <label>
                            Compartilhar com equipe
                            <select
                              onChange={(event) =>
                                setLibraryEditDraft({
                                  ...libraryEditDraft,
                                  equipe_id: event.target.value,
                                })
                              }
                              value={libraryEditDraft.equipe_id}
                            >
                              <option value="">Somente comigo</option>
                              {libraryTeams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.nome}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Vincular a
                            <select
                              onChange={(event) =>
                                setLibraryEditDraft({
                                  ...libraryEditDraft,
                                  vinculo_tipo: event.target
                                    .value as LibraryLinkType,
                                  vinculo_id: '',
                                })
                              }
                              value={libraryEditDraft.vinculo_tipo}
                            >
                              <option value="">Sem vínculo</option>
                              <option value="cliente">Cliente</option>
                              <option value="projeto">Projeto</option>
                              <option value="edital">Edital</option>
                              <option value="tarefa_projeto">
                                Tarefa de projeto
                              </option>
                              <option value="tarefa_cliente">
                                Tarefa de cliente
                              </option>
                            </select>
                          </label>
                          {libraryEditDraft.vinculo_tipo &&
                            (libraryEditDraft.vinculo_tipo ===
                              'tarefa_projeto' ||
                            libraryEditDraft.vinculo_tipo ===
                              'tarefa_cliente' ? (
                              <label>
                                ID da tarefa
                                <input
                                  inputMode="numeric"
                                  min="1"
                                  onChange={(event) =>
                                    setLibraryEditDraft({
                                      ...libraryEditDraft,
                                      vinculo_id: maskNumeric(event.target.value),
                                    })
                                  }
                                  placeholder="Apenas números"
                                  required
                                  type="text"
                                  value={libraryEditDraft.vinculo_id}
                                />
                              </label>
                            ) : (
                              <label>
                                Registro
                                <select
                                  onChange={(event) =>
                                    setLibraryEditDraft({
                                      ...libraryEditDraft,
                                      vinculo_id: event.target.value,
                                    })
                                  }
                                  required
                                  value={libraryEditDraft.vinculo_id}
                                >
                                  <option value="">Selecione</option>
                                  {linkOptions(
                                    libraryEditDraft.vinculo_tipo
                                  ).map((target) => (
                                    <option key={target.id} value={target.id}>
                                      {target.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          <div className="modal-actions">
                            <button
                              className="btn btn-ghost"
                              onClick={() => setEditingLibraryId(null)}
                              type="button"
                            >
                              Cancelar
                            </button>
                            <button
                              className="btn btn-primary"
                              disabled={busy}
                              type="submit"
                            >
                              Salvar metadados
                            </button>
                          </div>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {fileForLibrary && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setFileForLibrary(null);
          }}
        >
          <form
            className="client-modal onedrive-library-form"
            onSubmit={(event) => void saveToLibrary(event)}
          >
            <div className="client-modal-heading">
              <div>
                <span className="eyebrow">BIBLIOTECA INSTITUCIONAL</span>
                <h2>{fileForLibrary.name}</h2>
              </div>
              <button
                aria-label="Fechar"
                className="modal-close"
                onClick={() => setFileForLibrary(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <label>
              Categoria
              <input
                autoFocus
                maxLength={120}
                onChange={(event) =>
                  setLibraryDraft({
                    ...libraryDraft,
                    categoria: event.target.value,
                  })
                }
                placeholder="Apresentação, contrato-modelo…"
                required
                value={libraryDraft.categoria}
              />
            </label>
            <label>
              Versão
              <input
                maxLength={60}
                onChange={(event) =>
                  setLibraryDraft({
                    ...libraryDraft,
                    versao: event.target.value,
                  })
                }
                value={libraryDraft.versao}
              />
            </label>
            <label>
              Data de revisão
              <input
                min={getTodayDateString()}
                onChange={(event) =>
                  setLibraryDraft({
                    ...libraryDraft,
                    revisar_em: event.target.value,
                  })
                }
                type="date"
                value={libraryDraft.revisar_em}
              />
            </label>
            <label>
              Compartilhar com equipe
              <select
                onChange={(event) =>
                  setLibraryDraft({
                    ...libraryDraft,
                    equipe_id: event.target.value,
                  })
                }
                value={libraryDraft.equipe_id}
              >
                <option value="">Somente comigo</option>
                {libraryTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vincular a
              <select
                onChange={(event) =>
                  setLibraryDraft({
                    ...libraryDraft,
                    vinculo_tipo: event.target.value as LibraryLinkType,
                    vinculo_id: '',
                  })
                }
                value={libraryDraft.vinculo_tipo}
              >
                <option value="">Sem vínculo</option>
                <option value="cliente">Cliente</option>
                <option value="projeto">Projeto</option>
                <option value="edital">Edital</option>
                <option value="tarefa_projeto">Tarefa de projeto</option>
                <option value="tarefa_cliente">Tarefa de cliente</option>
              </select>
            </label>
            {libraryDraft.vinculo_tipo &&
              (libraryDraft.vinculo_tipo === 'tarefa_projeto' ||
              libraryDraft.vinculo_tipo === 'tarefa_cliente' ? (
                <label>
                  ID da tarefa
                  <input
                    inputMode="numeric"
                    min="1"
                    onChange={(event) =>
                      setLibraryDraft({
                        ...libraryDraft,
                        vinculo_id: maskNumeric(event.target.value),
                      })
                    }
                    placeholder="Apenas números"
                    required
                    type="text"
                    value={libraryDraft.vinculo_id}
                  />
                </label>
              ) : (
                <label>
                  Registro
                  <select
                    onChange={(event) =>
                      setLibraryDraft({
                        ...libraryDraft,
                        vinculo_id: event.target.value,
                      })
                    }
                    required
                    value={libraryDraft.vinculo_id}
                  >
                    <option value="">Selecione</option>
                    {linkOptions(libraryDraft.vinculo_tipo).map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setFileForLibrary(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !libraryDraft.categoria.trim()}
                type="submit"
              >
                {busy ? 'Salvando…' : 'Adicionar à biblioteca'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
