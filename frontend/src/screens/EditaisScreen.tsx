import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';
import { getTodayDateString } from '../utils/masks';

type EditalStatus =
  | 'mapeado'
  | 'em_preparacao'
  | 'submetido'
  | 'aprovado'
  | 'reprovado'
  | 'arquivado';
type Edital = {
  id: number;
  titulo: string;
  instituicao: string;
  link_oficial: string | null;
  prazo: string | null;
  status: EditalStatus;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  projeto_id: number | null;
  projeto_nome: string | null;
  requisitos: string | null;
  observacoes: string | null;
  total_itens: number;
  itens_concluidos: number;
};
type ChecklistItem = {
  id: number;
  edital_id: number;
  titulo: string;
  descricao: string | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  prazo: string | null;
  documento_url: string | null;
  drive_item_id: string | null;
  concluido: boolean;
  concluido_por_nome: string | null;
  concluido_em: string | null;
};
type SafeUser = { id: number; nome: string };
type Project = { id: number; nome: string };
type ResponseTemplate = {
  id: number;
  titulo: string;
  categoria: string;
  texto: string;
  versao: string;
  aprovado: boolean;
  proprietario_nome: string | null;
  atualizado_em: string;
};

const statuses: Array<{ value: EditalStatus; label: string }> = [
  { value: 'mapeado', label: 'Mapeado' },
  { value: 'em_preparacao', label: 'Em preparação' },
  { value: 'submetido', label: 'Submetido' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'arquivado', label: 'Arquivado' },
];

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getCurrentAccessToken();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : `Falha HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

function dateLabel(value: string | null) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('pt-BR');
}

export default function EditaisScreen() {
  const [tab, setTab] = useState<'editais' | 'respostas'>('editais');
  const [editais, setEditais] = useState<Edital[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState({
    titulo: '',
    instituicao: '',
    link_oficial: '',
    prazo: '',
    responsavel_id: '',
    projeto_id: '',
    requisitos: '',
    observacoes: '',
  });
  const [itemDraft, setItemDraft] = useState({
    titulo: '',
    descricao: '',
    responsavel_id: '',
    prazo: '',
    documento_url: '',
    drive_item_id: '',
  });
  const [templateDraft, setTemplateDraft] = useState({
    titulo: '',
    categoria: '',
    texto: '',
    versao: '1.0',
  });
  const selected = editais.find((item) => item.id === selectedId) ?? null;

  const loadEditais = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = search.trim()
        ? `?busca=${encodeURIComponent(search.trim())}`
        : '';
      const result = await api<{ data: Edital[] }>(`/api/v1/editais${query}`);
      setEditais(result.data ?? []);
      setSelectedId((current) =>
        current && result.data.some((item) => item.id === current)
          ? current
          : (result.data[0]?.id ?? null)
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar os editais.'
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadChecklist = useCallback(async (editalId: number) => {
    try {
      const result = await api<{ data: ChecklistItem[] }>(
        `/api/v1/editais/${editalId}/checklist`
      );
      setChecklist(result.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar o checklist.'
      );
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const query = search.trim()
        ? `?busca=${encodeURIComponent(search.trim())}`
        : '';
      const result = await api<{ data: ResponseTemplate[] }>(
        `/api/v1/biblioteca-respostas${query}`
      );
      setTemplates(result.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar as respostas.'
      );
    }
  }, [search]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadEditais();
    }, 300);
    return () => clearTimeout(handle);
  }, [loadEditais]);
  useEffect(() => {
    Promise.all([
      api<{ data: SafeUser[] }>('/api/v1/clientes/responsaveis'),
      api<{ data: Project[] }>('/api/v1/projetos'),
    ])
      .then(([userResult, projectResult]) => {
        setUsers(userResult.data ?? []);
        setProjects(projectResult.data ?? []);
      })
      .catch(() => {
        setUsers([]);
        setProjects([]);
      });
  }, []);
  useEffect(() => {
    const handle = setTimeout(() => {
      void loadTemplates();
    }, 300);
    return () => clearTimeout(handle);
  }, [loadTemplates]);
  useEffect(() => {
    if (selectedId != null) void loadChecklist(selectedId);
    else setChecklist([]);
  }, [selectedId, loadChecklist]);

  async function createEdital(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.prazo && draft.prazo < getTodayDateString()) {
      setError('O prazo do edital não pode ser anterior a hoje.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const created = await api<Edital>('/api/v1/editais', {
        method: 'POST',
        body: JSON.stringify({
          titulo: draft.titulo.trim(),
          instituicao: draft.instituicao.trim(),
          link_oficial: draft.link_oficial.trim() || null,
          prazo: draft.prazo || null,
          responsavel_id: draft.responsavel_id
            ? Number(draft.responsavel_id)
            : null,
          projeto_id: draft.projeto_id ? Number(draft.projeto_id) : null,
          requisitos: draft.requisitos.trim() || null,
          observacoes: draft.observacoes.trim() || null,
        }),
      });
      setCreateOpen(false);
      setDraft({
        titulo: '',
        instituicao: '',
        link_oficial: '',
        prazo: '',
        responsavel_id: '',
        projeto_id: '',
        requisitos: '',
        observacoes: '',
      });
      setNotice('Edital cadastrado.');
      await loadEditais();
      setSelectedId(created.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o edital.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(edital: Edital, status: EditalStatus) {
    setError('');
    try {
      await api(`/api/v1/editais/${edital.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setEditais((current) =>
        current.map((item) =>
          item.id === edital.id ? { ...item, status } : item
        )
      );
      setNotice('Status atualizado.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar o status.'
      );
    }
  }

  async function createChecklistItem(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (itemDraft.prazo && itemDraft.prazo < getTodayDateString()) {
      setError('O prazo do item não pode ser anterior a hoje.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/api/v1/editais/${selected.id}/checklist`, {
        method: 'POST',
        body: JSON.stringify({
          titulo: itemDraft.titulo.trim(),
          descricao: itemDraft.descricao.trim() || null,
          responsavel_id: itemDraft.responsavel_id
            ? Number(itemDraft.responsavel_id)
            : null,
          prazo: itemDraft.prazo || null,
          documento_url: itemDraft.documento_url.trim() || null,
          drive_item_id: itemDraft.drive_item_id.trim() || null,
        }),
      });
      setItemDraft({
        titulo: '',
        descricao: '',
        responsavel_id: '',
        prazo: '',
        documento_url: '',
        drive_item_id: '',
      });
      await loadChecklist(selected.id);
      await loadEditais();
      setNotice('Item adicionado ao checklist.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível adicionar o item.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleChecklist(item: ChecklistItem) {
    if (!selected) return;
    try {
      await api(`/api/v1/editais/${selected.id}/checklist/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ concluido: !item.concluido }),
      });
      await loadChecklist(selected.id);
      await loadEditais();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar o checklist.'
      );
    }
  }

  async function createResponse(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/v1/biblioteca-respostas', {
        method: 'POST',
        body: JSON.stringify({
          ...templateDraft,
          titulo: templateDraft.titulo.trim(),
          categoria: templateDraft.categoria.trim(),
          texto: templateDraft.texto.trim(),
        }),
      });
      setTemplateDraft({ titulo: '', categoria: '', texto: '', versao: '1.0' });
      setNotice('Resposta cadastrada como rascunho.');
      await loadTemplates();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar a resposta.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleApproved(template: ResponseTemplate) {
    try {
      await api(`/api/v1/biblioteca-respostas/${template.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ aprovado: !template.aprovado }),
      });
      await loadTemplates();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar a aprovação.'
      );
    }
  }

  return (
    <section className="screen-content editais-screen">
      <div className="screen-head">
        <div>
          <p className="eyebrow">OPORTUNIDADES INSTITUCIONAIS</p>
          <h1>Editais</h1>
          <p>Acompanhe prazos, requisitos e materiais vinculados.</p>
        </div>
        {tab === 'editais' && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setError('');
              setCreateOpen(true);
            }}
            type="button"
          >
            ＋ Novo edital
          </button>
        )}
      </div>
      <div
        className="project-view-tabs"
        role="tablist"
        aria-label="Editais e respostas"
      >
        <button
          aria-selected={tab === 'editais'}
          className={tab === 'editais' ? 'active' : ''}
          onClick={() => setTab('editais')}
          role="tab"
          type="button"
        >
          Editais
        </button>
        <button
          aria-selected={tab === 'respostas'}
          className={tab === 'respostas' ? 'active' : ''}
          onClick={() => setTab('respostas')}
          role="tab"
          type="button"
        >
          Respostas institucionais
        </button>
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

      {tab === 'editais' ? (
        <div className="editais-layout">
          <aside className="editais-list card">
            <label className="editais-search">
              Buscar edital
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Título ou instituição"
                value={search}
              />
            </label>
            {loading ? (
              <div className="table-state">Carregando editais…</div>
            ) : editais.length === 0 ? (
              <div className="table-state">Nenhum edital cadastrado.</div>
            ) : (
              editais.map((edital) => (
                <button
                  className={`editais-list-item${selectedId === edital.id ? ' active' : ''}`}
                  key={edital.id}
                  onClick={() => setSelectedId(edital.id)}
                  type="button"
                >
                  <strong>{edital.titulo}</strong>
                  <span>{edital.instituicao}</span>
                  <small>
                    {dateLabel(edital.prazo)} · {edital.itens_concluidos}/
                    {edital.total_itens} itens
                  </small>
                </button>
              ))
            )}
          </aside>
          <div className="editais-detail">
            {!selected ? (
              <div className="module-empty card">
                <h3>Selecione ou cadastre um edital</h3>
                <p>Os requisitos, responsáveis e prazos aparecerão aqui.</p>
              </div>
            ) : (
              <>
                <section className="editais-detail-head card">
                  <div>
                    <span className="eyebrow">{selected.instituicao}</span>
                    <h2>{selected.titulo}</h2>
                    <p>
                      {selected.requisitos || 'Requisitos ainda não descritos.'}
                    </p>
                  </div>
                  <label>
                    Status
                    <select
                      onChange={(event) =>
                        void updateStatus(
                          selected,
                          event.target.value as EditalStatus
                        )
                      }
                      value={selected.status}
                    >
                      {statuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="editais-meta">
                    <span>Prazo: {dateLabel(selected.prazo)}</span>
                    <span>
                      {selected.responsavel_nome
                        ? `Responsável: ${selected.responsavel_nome}`
                        : 'Sem responsável'}
                    </span>
                    {selected.projeto_nome && (
                      <span>Projeto: {selected.projeto_nome}</span>
                    )}
                    {selected.link_oficial && (
                      <a
                        href={selected.link_oficial}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Abrir edital oficial ↗
                      </a>
                    )}
                  </div>
                </section>
                <section className="editais-checklist card">
                  <header>
                    <div>
                      <h2>Checklist</h2>
                      <span>
                        {selected.itens_concluidos} de {selected.total_itens}{' '}
                        concluídos
                      </span>
                    </div>
                  </header>
                  {checklist.length ? (
                    <ul>
                      {checklist.map((item) => (
                        <li
                          className={item.concluido ? 'completed' : ''}
                          key={item.id}
                        >
                          <label>
                            <input
                              checked={item.concluido}
                              onChange={() => void toggleChecklist(item)}
                              type="checkbox"
                            />
                            <span>
                              <strong>{item.titulo}</strong>
                              {item.descricao && (
                                <small>{item.descricao}</small>
                              )}
                              <small>
                                {item.responsavel_nome
                                  ? `Responsável: ${item.responsavel_nome} · `
                                  : ''}
                                {dateLabel(item.prazo)}
                              </small>
                            </span>
                          </label>
                          {item.documento_url && (
                            <a
                              href={item.documento_url}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              Abrir documento ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="editais-empty">
                      Nenhum requisito adicionado ao checklist.
                    </p>
                  )}
                  <form
                    className="editais-checklist-form"
                    onSubmit={(event) => void createChecklistItem(event)}
                  >
                    <h3>Adicionar requisito ou pendência</h3>
                    <div className="editais-form-grid">
                      <label>
                        Título
                        <input
                          maxLength={250}
                          onChange={(event) =>
                            setItemDraft({
                              ...itemDraft,
                              titulo: event.target.value,
                            })
                          }
                          required
                          value={itemDraft.titulo}
                        />
                      </label>
                      <label>
                        Responsável
                        <select
                          onChange={(event) =>
                            setItemDraft({
                              ...itemDraft,
                              responsavel_id: event.target.value,
                            })
                          }
                          value={itemDraft.responsavel_id}
                        >
                          <option value="">Sem responsável</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.nome}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Prazo
                        <input
                          min={getTodayDateString()}
                          onChange={(event) =>
                            setItemDraft({
                              ...itemDraft,
                              prazo: event.target.value,
                            })
                          }
                          type="date"
                          value={itemDraft.prazo}
                        />
                      </label>
                      <label className="editais-form-wide">
                        Descrição
                        <textarea
                          maxLength={5000}
                          onChange={(event) =>
                            setItemDraft({
                              ...itemDraft,
                              descricao: event.target.value,
                            })
                          }
                          rows={2}
                          value={itemDraft.descricao}
                        />
                      </label>
                      <label className="editais-form-wide">
                        Link de documento
                        <input
                          onChange={(event) =>
                            setItemDraft({
                              ...itemDraft,
                              documento_url: event.target.value,
                            })
                          }
                          placeholder="Link oficial ou do OneDrive"
                          type="url"
                          value={itemDraft.documento_url}
                        />
                      </label>
                      <label className="editais-form-wide">
                        ID do item OneDrive
                        <input
                          maxLength={512}
                          onChange={(event) =>
                            setItemDraft({
                              ...itemDraft,
                              drive_item_id: event.target.value,
                            })
                          }
                          value={itemDraft.drive_item_id}
                        />
                      </label>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={saving || !itemDraft.titulo.trim()}
                      type="submit"
                    >
                      {saving ? 'Salvando…' : 'Adicionar item'}
                    </button>
                  </form>
                </section>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="library-responses-layout">
          <form
            className="library-response-form card"
            onSubmit={(event) => void createResponse(event)}
          >
            <span className="eyebrow">NOVO MATERIAL</span>
            <h2>Resposta institucional</h2>
            <label>
              Título
              <input
                maxLength={250}
                onChange={(event) =>
                  setTemplateDraft({
                    ...templateDraft,
                    titulo: event.target.value,
                  })
                }
                required
                value={templateDraft.titulo}
              />
            </label>
            <label>
              Categoria
              <input
                maxLength={120}
                onChange={(event) =>
                  setTemplateDraft({
                    ...templateDraft,
                    categoria: event.target.value,
                  })
                }
                placeholder="Empresa, produto, equipe…"
                required
                value={templateDraft.categoria}
              />
            </label>
            <label>
              Versão
              <input
                maxLength={60}
                onChange={(event) =>
                  setTemplateDraft({
                    ...templateDraft,
                    versao: event.target.value,
                  })
                }
                value={templateDraft.versao}
              />
            </label>
            <label>
              Texto
              <textarea
                maxLength={20000}
                onChange={(event) =>
                  setTemplateDraft({
                    ...templateDraft,
                    texto: event.target.value,
                  })
                }
                required
                rows={8}
                value={templateDraft.texto}
              />
            </label>
            <button className="btn btn-primary" disabled={saving} type="submit">
              {saving ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          </form>
          <section className="library-response-list">
            <label className="editais-search">
              Buscar respostas
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Título ou conteúdo"
                value={search}
              />
            </label>
            {templates.length === 0 ? (
              <div className="table-state">Nenhuma resposta cadastrada.</div>
            ) : (
              templates.map((template) => (
                <article
                  className="library-response-item card"
                  key={template.id}
                >
                  <header>
                    <div>
                      <span className="eyebrow">
                        {template.categoria} · v{template.versao}
                      </span>
                      <h3>{template.titulo}</h3>
                    </div>
                    <button
                      className={`table-action${template.aprovado ? ' approved' : ' pending'}`}
                      onClick={() => void toggleApproved(template)}
                      type="button"
                    >
                      {template.aprovado ? 'Aprovada' : 'Aprovar'}
                    </button>
                  </header>
                  <p>{template.texto}</p>
                  <small>
                    {template.proprietario_nome
                      ? `Proprietário: ${template.proprietario_nome} · `
                      : ''}
                    Atualizada em{' '}
                    {new Date(template.atualizado_em).toLocaleDateString(
                      'pt-BR'
                    )}
                  </small>
                </article>
              ))
            )}
          </section>
        </div>
      )}

      {createOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setCreateOpen(false);
          }}
        >
          <form
            className="client-modal edital-create-form"
            onSubmit={(event) => void createEdital(event)}
          >
            <div className="client-modal-heading">
              <div>
                <span className="eyebrow">CAPTAÇÃO</span>
                <h2>Novo edital</h2>
              </div>
              <button
                aria-label="Fechar"
                className="modal-close"
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <label>
              Título
              <input
                autoFocus
                maxLength={250}
                onChange={(event) =>
                  setDraft({ ...draft, titulo: event.target.value })
                }
                required
                value={draft.titulo}
              />
            </label>
            <label>
              Instituição
              <input
                maxLength={200}
                onChange={(event) =>
                  setDraft({ ...draft, instituicao: event.target.value })
                }
                required
                value={draft.instituicao}
              />
            </label>
            <label>
              Link oficial
              <input
                onChange={(event) =>
                  setDraft({ ...draft, link_oficial: event.target.value })
                }
                type="url"
                value={draft.link_oficial}
              />
            </label>
            <label>
              Prazo
              <input
                min={getTodayDateString()}
                onChange={(event) =>
                  setDraft({ ...draft, prazo: event.target.value })
                }
                type="date"
                value={draft.prazo}
              />
            </label>
            <label>
              Responsável
              <select
                onChange={(event) =>
                  setDraft({ ...draft, responsavel_id: event.target.value })
                }
                value={draft.responsavel_id}
              >
                <option value="">Sem responsável</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Projeto relacionado
              <select
                onChange={(event) =>
                  setDraft({ ...draft, projeto_id: event.target.value })
                }
                value={draft.projeto_id}
              >
                <option value="">Sem projeto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="editais-form-wide client-modal-wide">
              Requisitos
              <textarea
                maxLength={10000}
                onChange={(event) =>
                  setDraft({ ...draft, requisitos: event.target.value })
                }
                rows={4}
                value={draft.requisitos}
              />
            </label>
            <label className="editais-form-wide client-modal-wide">
              Observações
              <textarea
                maxLength={5000}
                onChange={(event) =>
                  setDraft({ ...draft, observacoes: event.target.value })
                }
                rows={3}
                value={draft.observacoes}
              />
            </label>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={saving}
                type="submit"
              >
                {saving ? 'Salvando…' : 'Cadastrar edital'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
