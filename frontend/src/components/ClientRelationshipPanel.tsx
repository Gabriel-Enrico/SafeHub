import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { apiBaseUrl } from '../lib/supabase';

type Client = { id: number; nome: string };
type Interaction = {
  id: number;
  tipo: string;
  resumo: string;
  criado_em: string;
  responsavel_nome: string;
};
type DocumentRecord = {
  id: number;
  cliente_id: number;
  nome_arquivo: string;
  content_type?: string;
  tamanho_bytes: number;
  criado_em?: string;
  cliente_nome?: string;
  enviado_por_nome: string;
};

const labels: Record<string, string> = {
  reuniao: 'Reunião',
  ligacao: 'Ligação',
  email: 'E-mail',
  outro: 'Outro',
};

async function apiRequest<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined || isMultipart ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String(payload.message)
      : `A API respondeu com HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

function formattedDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function readableSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientRelationshipPanel({ client, token, onClose }: {
  client: Client;
  token: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'history' | 'documents'>('history');
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [tipo, setTipo] = useState('reuniao');
  const [resumo, setResumo] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadInteractions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = filter ? `?tipo=${encodeURIComponent(filter)}` : '';
      const result = await apiRequest<{ data: Interaction[] }>(token, `/api/v1/clientes/${client.id}/interacoes${query}`);
      setInteractions(result.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.');
    } finally {
      setLoading(false);
    }
  }, [client.id, filter, token]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ data: DocumentRecord[] }>(token, `/api/v1/clientes/${client.id}/documentos`);
      setDocuments(result.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os documentos.');
    } finally {
      setLoading(false);
    }
  }, [client.id, token]);

  useEffect(() => {
    if (tab === 'history') void loadInteractions();
    else void loadDocuments();
  }, [tab, loadDocuments, loadInteractions]);

  async function saveInteraction(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(token, `/api/v1/clientes/${client.id}/interacoes`, {
        method: 'POST',
        body: JSON.stringify({ tipo, resumo: resumo.trim() }),
      });
      setResumo('');
      setNotice('Interação registrada no histórico.');
      await loadInteractions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a interação.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocument(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) return;
    const formElement = event.currentTarget;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      await apiRequest(token, `/api/v1/clientes/${client.id}/documentos`, { method: 'POST', body: formData });
      setSelectedFile(null);
      formElement.reset();
      setNotice('Documento enviado para o cliente.');
      await loadDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o documento.');
    } finally {
      setSaving(false);
    }
  }

  async function openDocument(id: number) {
    setError('');
    try {
      const result = await apiRequest<{ url: string }>(token, `/api/v1/documentos/${id}/download`);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o documento.');
    }
  }

  return <div className="modal-backdrop relationship-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section aria-label={`Relacionamento com ${client.nome}`} aria-modal="true" className="relationship-modal card" role="dialog">
      <header className="relationship-heading"><div><span className="eyebrow">CADASTRO DO CLIENTE · #{client.id}</span><h2>{client.nome}</h2></div><button aria-label="Fechar" className="modal-close" onClick={onClose} type="button">×</button></header>
      <div className="relationship-tabs"><button className={tab === 'history' ? 'active' : ''} onClick={() => { setTab('history'); setError(''); setNotice(''); }} type="button">Histórico de Interações</button><button className={tab === 'documents' ? 'active' : ''} onClick={() => { setTab('documents'); setError(''); setNotice(''); }} type="button">Documentos</button></div>
      {error && <div className="workspace-alert" role="alert">{error}</div>}
      {notice && <div className="workspace-notice" role="status">{notice}</div>}

      {tab === 'history' ? <div className="relationship-body">
        <form className="relationship-form" onSubmit={(event) => void saveInteraction(event)}>
          <label>Tipo<select onChange={(event) => setTipo(event.target.value)} value={tipo}><option value="reuniao">Reunião</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="outro">Outro</option></select></label>
          <label>Resumo<textarea maxLength={5000} onChange={(event) => setResumo(event.target.value)} placeholder="Registre o contexto importante da conversa…" required rows={3} value={resumo} /></label>
          <button className="btn btn-primary" disabled={saving || !resumo.trim()} type="submit">{saving ? 'Salvando…' : 'Registrar interação'}</button>
        </form>
        <div className="relationship-list-heading"><h3>Histórico</h3><label>Filtrar por tipo<select aria-label="Filtrar histórico por tipo" onChange={(event) => setFilter(event.target.value)} value={filter}><option value="">Todos os tipos</option><option value="reuniao">Reunião</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="outro">Outro</option></select></label></div>
        {loading ? <div className="table-state">Carregando histórico…</div> : interactions.length === 0 ? <div className="table-state">Nenhuma interação encontrada.</div> : <ol className="interaction-timeline">{interactions.map((item) => <li key={item.id}><span className="timeline-dot" /><article><div className="timeline-meta"><span className="status-pill">{labels[item.tipo] ?? item.tipo}</span><time dateTime={item.criado_em}>{formattedDate(item.criado_em)}</time></div><p>{item.resumo}</p><small>Registrado por {item.responsavel_nome}</small></article></li>)}</ol>}
      </div> : <div className="relationship-body">
        <form className="relationship-upload" onSubmit={(event) => void uploadDocument(event)}><label>Adicionar documento<input accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} type="file" /></label><small>PDF, DOCX, XLSX, JPG ou PNG · até 10 MB</small><button className="btn btn-primary" disabled={saving || !selectedFile} type="submit">{saving ? 'Enviando…' : 'Enviar arquivo'}</button></form>
        {loading ? <div className="table-state">Carregando documentos…</div> : documents.length === 0 ? <div className="table-state">Nenhum documento enviado para este cliente.</div> : <div className="relationship-documents">{documents.map((document) => <article className="relationship-document" key={document.id}><span className="document-file-icon">▤</span><div><strong>{document.nome_arquivo}</strong><small>{readableSize(document.tamanho_bytes)} · enviado por {document.enviado_por_nome}{document.criado_em ? ` · ${formattedDate(document.criado_em)}` : ''}</small></div><button className="table-action" onClick={() => void openDocument(document.id)} type="button">Abrir</button></article>)}</div>}
      </div>}
    </section>
  </div>;
}

export function DocumentsScreen({ token }: { token: string }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = filter ? `?busca=${encodeURIComponent(filter)}` : '';
      const result = await apiRequest<{ data: DocumentRecord[] }>(token, `/api/v1/documentos${query}`);
      setDocuments(result.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a documentação.');
    } finally {
      setLoading(false);
    }
  }, [filter, token]);
  useEffect(() => { void load(); }, [load]);
  async function openDocument(id: number) {
    try {
      const result = await apiRequest<{ url: string }>(token, `/api/v1/documentos/${id}/download`);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o documento.');
    }
  }
  return <section className="screen-content"><div className="screen-head"><div><p className="eyebrow">BASE DE DADOS</p><h1>Documentos</h1><p>Contratos e arquivos enviados nos cadastros de clientes.</p></div></div>
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    <div className="card client-table-card"><div className="table-toolbar"><div><strong>Documentação dos clientes</strong><span>{documents.length} documentos</span></div><input aria-label="Filtrar documentos por cliente" onChange={(event) => setFilter(event.target.value)} placeholder="Filtrar por cliente" value={filter} /></div>
      {loading ? <div className="table-state">Carregando documentos…</div> : documents.length === 0 ? <div className="table-state">Nenhum documento foi enviado para os clientes.</div> : <div className="table-scroll"><table className="workspace-table"><thead><tr><th>Documento</th><th>Cliente</th><th>Enviado por</th><th>Data</th><th /></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><strong>{document.nome_arquivo}</strong><small>{readableSize(document.tamanho_bytes)}</small></td><td>{document.cliente_nome}</td><td>{document.enviado_por_nome}</td><td>{document.criado_em ? formattedDate(document.criado_em) : '—'}</td><td className="table-actions"><button className="table-action" onClick={() => void openDocument(document.id)} type="button">Abrir</button></td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}
