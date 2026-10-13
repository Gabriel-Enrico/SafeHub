import { useCallback, useEffect, useMemo, useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, Navigate, NavLink, useNavigate as useRouterNavigate, useParams } from 'react-router-dom';
import OutlookCalendarPanel from '../components/OutlookCalendarPanel';
import ClientRelationshipPanel, { DocumentsScreen } from '../components/ClientRelationshipPanel';
import AdminUsersScreen from './AdminUsersScreen';
import { apiBaseUrl } from '../lib/supabase';

type ScreenId = 'home' | 'crm' | 'oportunidades' | 'projetos' | 'documentos' | 'chat' | 'agenda' | 'estacao' | 'integracoes' | 'admin' | 'config';
type Cliente = { id: number; nome: string; setor: string | null; status_pipeline: string | null; responsavel_id: number | null };
type Canal = { id: number; nome: string; tipo: string };
type ClienteDraft = { nome: string; setor: string; status_pipeline: string };
type OportunidadeCard = { id: number; titulo: string; cliente_id: number; cliente_nome: string; responsavel_nome: string | null; estagio: string; valor_estimado: number | string | null; previsao_fechamento: string | null };
type MovimentoOportunidade = { id: number; estagio_anterior: string | null; estagio_novo: string; alterado_em: string; usuario_nome: string };
const opportunityStages = [
  { id: 'prospeccao', label: 'Prospecção' },
  { id: 'proposta_enviada', label: 'Proposta Enviada' },
  { id: 'negociacao', label: 'Negociação' },
];

const navigation: Array<{ id: ScreenId; label: string; icon: string }> = [
  { id: 'home', label: 'Início', icon: '⌂' },
  { id: 'crm', label: 'Clientes', icon: '♧' },
  { id: 'oportunidades', label: 'Oportunidades', icon: '▥' },
  { id: 'projetos', label: 'Projetos', icon: '▣' },
  { id: 'documentos', label: 'Documentos', icon: '▤' },
  { id: 'chat', label: 'Comunicação', icon: '▱' },
  { id: 'agenda', label: 'Agenda', icon: '▦' },
  { id: 'estacao', label: 'Estação', icon: '◉' },
  { id: 'integracoes', label: 'Integrações', icon: '⛓' },
  { id: 'admin', label: 'Usuários', icon: '♙' },
  { id: 'config', label: 'Configurações', icon: '⚙' },
];

async function apiRequest<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'message' in result
      ? String(result.message)
      : `A API respondeu com HTTP ${response.status}.`;
    throw new Error(message);
  }
  return result as T;
}

function friendlyStatus(status: string | null) {
  const value = (status ?? 'novo').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const labels: Record<string, string> = {
    novo: 'Prospecção', prospeccao: 'Prospecção', contato: 'Contato',
    proposta: 'Proposta', fechado: 'Fechado', perdido: 'Perdido',
  };
  return labels[value] ?? status ?? 'Prospecção';
}

function ScreenHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="screen-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function EmptyModule({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="module-empty card"><span className="module-empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}

function CustomersScreen({ token, initialSearch, onCountChange }: { token: string; initialSearch: string; onCountChange: (count: number) => void }) {
  const [clients, setClients] = useState<Cliente[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<ClienteDraft>({ nome: '', setor: '', status_pipeline: 'novo' });
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [relationshipClient, setRelationshipClient] = useState<Cliente | null>(null);

  useEffect(() => setSearch(initialSearch), [initialSearch]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ data: Cliente[]; pagination: { total: number } }>(token, '/api/v1/clientes?limit=100&offset=0');
      setClients(result.data ?? []);
      onCountChange(result.pagination?.total ?? result.data?.length ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os clientes.');
    } finally {
      setLoading(false);
    }
  }, [token, onCountChange]);

  useEffect(() => { void loadClients(); }, [loadClients]);

  const filtered = useMemo(() => clients.filter((client) =>
    `${client.nome} ${client.setor ?? ''} ${friendlyStatus(client.status_pipeline)}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  ), [clients, search]);

  function openCreate() {
    setEditing(null);
    setDraft({ nome: '', setor: '', status_pipeline: 'novo' });
    setModalOpen(true);
    setError('');
    setNotice('');
  }

  function openEdit(client: Cliente) {
    setEditing(client);
    setDraft({ nome: client.nome, setor: client.setor ?? '', status_pipeline: client.status_pipeline ?? 'novo' });
    setModalOpen(true);
    setError('');
    setNotice('');
  }

  async function saveClient(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { nome: draft.nome.trim(), setor: draft.setor.trim() || null, status_pipeline: draft.status_pipeline };
      if (editing) {
        await apiRequest(token, `/api/v1/clientes/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setNotice('Cliente atualizado.');
      } else {
        await apiRequest(token, '/api/v1/clientes', { method: 'POST', body: JSON.stringify(body) });
        setNotice('Cliente cadastrado.');
      }
      setModalOpen(false);
      await loadClients();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient(client: Cliente) {
    if (!window.confirm(`Excluir o cliente “${client.nome}”?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(token, `/api/v1/clientes/${client.id}`, { method: 'DELETE' });
      setNotice('Cliente excluído.');
      await loadClients();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o cliente.');
    } finally {
      setSaving(false);
    }
  }

  const stages = ['Prospecção', 'Contato', 'Proposta', 'Fechado'];

  return <section className="screen-content">
    <ScreenHeading eyebrow="ÓRBITA COMERCIAL" title="Clientes" description="Cadastre clientes e acompanhe o histórico do relacionamento comercial." action={<button className="btn btn-primary" onClick={openCreate} type="button">＋ Novo cliente</button>} />
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    <div className="pipeline-summary">
      {stages.map((stage) => <div className="pipeline-summary-card card" key={stage}><span>{stage}</span><strong>{clients.filter((client) => friendlyStatus(client.status_pipeline) === stage).length}</strong></div>)}
    </div>
    <div className="card client-table-card">
      <div className="table-toolbar"><div><strong>Todos os clientes</strong><span>{filtered.length} registros</span></div><input aria-label="Filtrar clientes" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou setor" value={search} /></div>
      {loading ? <div className="table-state">Carregando clientes…</div> : filtered.length === 0 ? <div className="table-state">{clients.length ? 'Nenhum cliente corresponde à busca.' : 'Ainda não há clientes cadastrados.'}</div> :
        <div className="table-scroll"><table className="workspace-table"><thead><tr><th>Cliente</th><th>Setor</th><th>Status</th><th className="table-actions-heading">Ações</th></tr></thead>
          <tbody>{filtered.map((client) => <tr key={client.id}><td><strong>{client.nome}</strong><small>Cliente #{client.id}</small></td><td>{client.setor || '—'}</td><td><span className={`status-pill status-${friendlyStatus(client.status_pipeline).toLowerCase()}`}>{friendlyStatus(client.status_pipeline)}</span></td><td className="table-actions"><button className="table-action" onClick={() => setRelationshipClient(client)} type="button">Histórico</button><button className="table-action" disabled={saving} onClick={() => openEdit(client)} type="button">Editar</button><button className="table-action danger" disabled={saving} onClick={() => void deleteClient(client)} type="button">Excluir</button></td></tr>)}</tbody>
        </table></div>}
    </div>
    {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}><form className="client-modal" onSubmit={(event) => void saveClient(event)}>
      <div className="client-modal-heading"><div><span className="eyebrow">CRM SAFEHUB</span><h2>{editing ? 'Editar cliente' : 'Novo cliente'}</h2></div><button aria-label="Fechar" className="modal-close" onClick={() => setModalOpen(false)} type="button">×</button></div>
      {error && <div className="workspace-alert" role="alert">{error}</div>}
      <label>Nome do cliente<input autoFocus maxLength={200} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} required value={draft.nome} /></label>
      <label>Setor<input maxLength={120} onChange={(event) => setDraft({ ...draft, setor: event.target.value })} value={draft.setor} /></label>
      <label>Etapa do pipeline<select onChange={(event) => setDraft({ ...draft, status_pipeline: event.target.value })} value={draft.status_pipeline}><option value="novo">Prospecção</option><option value="contato">Contato</option><option value="proposta">Proposta</option><option value="fechado">Fechado</option><option value="perdido">Perdido</option></select></label>
      <div className="modal-actions"><button className="btn btn-ghost" disabled={saving} onClick={() => setModalOpen(false)} type="button">Cancelar</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar cliente'}</button></div>
    </form></div>}
    {relationshipClient && <ClientRelationshipPanel client={relationshipClient} onClose={() => setRelationshipClient(null)} token={token} />}
  </section>;
}

function OverviewScreen({ email, clientCount, channelCount, onNavigate }: { email: string; clientCount: number; channelCount: number; onNavigate: (id: ScreenId) => void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = email.split('@')[0]?.split(/[._-]/)[0] || 'bem-vindo';
  return <section className="screen-content">
    <ScreenHeading eyebrow="PAINEL DE MISSÃO" title={`${greeting}, ${firstName} 👋`} description={`${today} — acompanhe seu espaço SafeHub.`} action={<button className="btn btn-primary" onClick={() => onNavigate('agenda')} type="button">Abrir minha agenda →</button>} />
    <div className="stat-row">
      <div className="card stat"><div className="num">{clientCount}</div><div className="lbl">Clientes cadastrados</div><button className="stat-link" onClick={() => onNavigate('crm')} type="button">Abrir CRM →</button></div>
      <div className="card stat"><div className="num">{channelCount}</div><div className="lbl">Canais disponíveis</div><button className="stat-link" onClick={() => onNavigate('chat')} type="button">Ver comunicação →</button></div>
      <div className="card stat"><div className="num">—</div><div className="lbl">Projetos em andamento</div><button className="stat-link" onClick={() => onNavigate('projetos')} type="button">Abrir projetos →</button></div>
      <div className="card stat"><div className="num">Outlook</div><div className="lbl">Agenda pessoal</div><button className="stat-link" onClick={() => onNavigate('agenda')} type="button">Ver calendário →</button></div>
    </div>
    <div className="home-grid">
      <div className="card home-feed"><div className="card-heading"><div><span className="eyebrow">ACESSO RÁPIDO</span><h2>Seu espaço de trabalho</h2></div></div>
        <button className="quick-link" onClick={() => onNavigate('crm')} type="button"><span className="quick-icon">♧</span><span><strong>Clientes</strong><small>Cadastre clientes e consulte o histórico comercial.</small></span><b>→</b></button>
        <button className="quick-link" onClick={() => onNavigate('oportunidades')} type="button"><span className="quick-icon">▥</span><span><strong>Oportunidades</strong><small>Acompanhe negociações no funil comercial.</small></span><b>→</b></button>
        <button className="quick-link" onClick={() => onNavigate('projetos')} type="button"><span className="quick-icon">▣</span><span><strong>Projetos</strong><small>Acesse projetos e tarefas da equipe.</small></span><b>→</b></button>
        <button className="quick-link" onClick={() => onNavigate('agenda')} type="button"><span className="quick-icon">▦</span><span><strong>Agenda Outlook</strong><small>Gerencie os eventos da sua conta Microsoft.</small></span><b>→</b></button>
        <button className="quick-link" onClick={() => onNavigate('integracoes')} type="button"><span className="quick-icon">⛓</span><span><strong>Integrações</strong><small>Consulte os serviços conectados ao SafeHub.</small></span><b>→</b></button>
      </div>
      <div className="card home-side-card"><span className="eyebrow">SAFEHUB</span><h2>Seu trabalho, em um só lugar.</h2><p>Use a navegação para acessar as áreas de clientes, agenda e ferramentas disponíveis para sua conta.</p><div className="home-user-chip"><span>{email.slice(0, 1).toUpperCase()}</span><div><strong>{email}</strong><small>Conta autenticada</small></div></div></div>
    </div>
  </section>;
}

function ProjectsScreen() {
  return <section className="screen-content">
    <ScreenHeading eyebrow="GESTÃO DE PROJETOS" title="Projetos" description="Organize projetos, equipes e tarefas em um espaço próprio." />
    <EmptyModule icon="▣" title="Módulo de projetos em preparação" text="Esta área é separada do funil de oportunidades. A criação de projetos, o Kanban de tarefas, responsáveis e prazos ainda precisam ser implementados conforme o épico SH-3 do Jira." />
  </section>;
}

function OpportunitiesScreen({ token }: { token: string }) {
  const [opportunities, setOpportunities] = useState<OportunidadeCard[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [historyFor, setHistoryFor] = useState<OportunidadeCard | null>(null);
  const [history, setHistory] = useState<MovimentoOportunidade[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [opportunityResult, clientResult] = await Promise.all([
        apiRequest<{ data: OportunidadeCard[] }>(token, '/api/v1/oportunidades'),
        apiRequest<{ data: Cliente[] }>(token, '/api/v1/clientes?limit=100&offset=0'),
      ]);
      setOpportunities(opportunityResult.data ?? []);
      setClients(clientResult.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as oportunidades.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function createOpportunity(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(token, '/api/v1/oportunidades', {
        method: 'POST',
        body: JSON.stringify({
          titulo: title.trim(),
          cliente_id: Number(clientId),
          valor_estimado: amount ? Number(amount) : null,
          previsao_fechamento: closeDate || null,
        }),
      });
      setCreateOpen(false);
      setTitle('');
      setClientId('');
      setAmount('');
      setCloseDate('');
      setNotice('Oportunidade criada na coluna Prospecção.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a oportunidade.');
    } finally {
      setSaving(false);
    }
  }

  async function moveOpportunity(id: number, estagio: string) {
    const opportunity = opportunities.find((item) => item.id === id);
    if (!opportunity || opportunity.estagio === estagio) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiRequest(token, `/api/v1/oportunidades/${id}/estagio`, {
        method: 'PATCH',
        body: JSON.stringify({ estagio }),
      });
      setNotice(`Oportunidade movida para ${opportunityStages.find((stage) => stage.id === estagio)?.label ?? estagio}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o estágio.');
    } finally {
      setDraggingId(null);
      setSaving(false);
    }
  }

  async function openHistory(opportunity: OportunidadeCard) {
    setHistoryFor(opportunity);
    setHistoryLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ data: MovimentoOportunidade[] }>(token, `/api/v1/oportunidades/${opportunity.id}/historico`);
      setHistory(result.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const formatAmount = (value: OportunidadeCard['valor_estimado']) => value == null
    ? null
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));

  return <section className="screen-content">
    <ScreenHeading eyebrow="FUNIL COMERCIAL" title="Oportunidades & parcerias" description="Acompanhe cada negociação por estágio. Arraste os cards entre as colunas para atualizar o funil." action={<button className="btn btn-primary" onClick={() => { setError(''); setCreateOpen(true); }} type="button">＋ Nova oportunidade</button>} />
    {error && !historyFor && <div className="workspace-alert" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    {loading ? <div className="table-state card">Carregando oportunidades…</div> : <div className="opportunity-board">{opportunityStages.map((stage) => {
      const cards = opportunities.filter((opportunity) => opportunity.estagio === stage.id);
      return <section aria-label={stage.label} className={`opportunity-column${draggingId ? ' accepts-drop' : ''}`} key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData('text/plain')); if (id) void moveOpportunity(id, stage.id); }}>
        <header><h2>{stage.label}</h2><span>{cards.length}</span></header>
        <div className="opportunity-card-list">{cards.length === 0 ? <div className="opportunity-empty">Solte uma oportunidade aqui</div> : cards.map((opportunity) => <article className="opportunity-card card" draggable={!saving} key={opportunity.id} onDragEnd={() => setDraggingId(null)} onDragStart={(event) => { setDraggingId(opportunity.id); event.dataTransfer.setData('text/plain', String(opportunity.id)); event.dataTransfer.effectAllowed = 'move'; }}>
          <div className="opportunity-card-top"><span>OP-{opportunity.id}</span><button aria-label={`Ver histórico de ${opportunity.titulo}`} onClick={() => void openHistory(opportunity)} type="button">Histórico ↗</button></div>
          <h3>{opportunity.titulo}</h3><p className="opportunity-client">{opportunity.cliente_nome}</p>
          {formatAmount(opportunity.valor_estimado) && <strong className="opportunity-amount">{formatAmount(opportunity.valor_estimado)}</strong>}
          {opportunity.previsao_fechamento && <small className="opportunity-date">Previsão: {new Date(`${opportunity.previsao_fechamento.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')}</small>}
          <footer><span>{opportunity.responsavel_nome ?? 'Responsável não definido'}</span><span>⠿ Arrastar</span></footer>
        </article>)}</div>
      </section>;
    })}</div>}

    {createOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateOpen(false); }}><form className="client-modal opportunity-form" onSubmit={(event) => void createOpportunity(event)}>
      <div className="client-modal-heading"><div><span className="eyebrow">FUNIL COMERCIAL</span><h2>Nova oportunidade</h2></div><button aria-label="Fechar" className="modal-close" onClick={() => setCreateOpen(false)} type="button">×</button></div>
      {error && <div className="workspace-alert" role="alert">{error}</div>}
      <label>Nome da oportunidade<input autoFocus maxLength={200} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
      <label>Cliente<select onChange={(event) => setClientId(event.target.value)} required value={clientId}><option value="">Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label>
      <label>Valor estimado<input min="0" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} /></label>
      <label>Previsão de fechamento<input onChange={(event) => setCloseDate(event.target.value)} type="date" value={closeDate} /></label>
      <p className="module-footnote">A nova oportunidade começa em Prospecção.</p>
      <div className="modal-actions"><button className="btn btn-ghost" disabled={saving} onClick={() => setCreateOpen(false)} type="button">Cancelar</button><button className="btn btn-primary" disabled={saving || clients.length === 0} type="submit">{saving ? 'Salvando…' : 'Criar oportunidade'}</button></div>
    </form></div>}

    {historyFor && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryFor(null); }}><section aria-label={`Histórico de ${historyFor.titulo}`} aria-modal="true" className="client-modal opportunity-history-modal" role="dialog"><div className="client-modal-heading"><div><span className="eyebrow">HISTÓRICO DA OPORTUNIDADE</span><h2>{historyFor.titulo}</h2><p>{historyFor.cliente_nome}</p></div><button aria-label="Fechar" className="modal-close" onClick={() => setHistoryFor(null)} type="button">×</button></div>{error && <div className="workspace-alert" role="alert">{error}</div>}{historyLoading ? <div className="table-state">Carregando histórico…</div> : history.length === 0 ? <div className="table-state">Ainda não há movimentações.</div> : <ol className="opportunity-history-list">{history.map((item) => <li key={item.id}><strong>{item.estagio_anterior ? `${opportunityStages.find((stage) => stage.id === item.estagio_anterior)?.label ?? item.estagio_anterior} → ` : 'Criada em '} {opportunityStages.find((stage) => stage.id === item.estagio_novo)?.label ?? item.estagio_novo}</strong><span>{new Date(item.alterado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {item.usuario_nome}</span></li>)}</ol>}</section></div>}
  </section>;
}

function CommunicationScreen({ channels, loading, error }: { channels: Canal[]; loading: boolean; error: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = channels.find((channel) => channel.id === selected) ?? channels[0];
  useEffect(() => { if (active && selected === null) setSelected(active.id); }, [active, selected]);
  return <section className="screen-content"><ScreenHeading eyebrow="FREQUÊNCIA ABERTA" title="Comunicação" description="Canais disponíveis para as equipes SafeHub." /><div className="communication-layout card"><aside className="channel-list"><span className="channel-group-label">CANAIS</span>{loading ? <p>Carregando canais…</p> : channels.length === 0 ? <p>Nenhum canal cadastrado.</p> : channels.map((channel) => <button className={`channel-item${active?.id === channel.id ? ' active' : ''}`} key={channel.id} onClick={() => setSelected(channel.id)} type="button"><i /># {channel.nome}<span>{channel.tipo}</span></button>)}</aside><div className="channel-content">{error ? <div className="workspace-alert">{error}</div> : active ? <><div className="channel-head"><strong># {active.nome}</strong><span>{active.tipo}</span></div><EmptyModule icon="▱" title="Conversas ainda não conectadas" text="Os canais cadastrados aparecem aqui. O backend ainda não possui serviço de mensagens ou histórico de conversas." /></> : <EmptyModule icon="▱" title="Sem canais" text="Quando houver canais cadastrados, você poderá selecioná-los aqui." />}</div></div></section>;
}

function StationScreen() {
  return <section className="screen-content"><ScreenHeading eyebrow="MAPA ORBITAL" title="Estação" description="Espaços compartilhados para o trabalho da equipe." /><div className="station-layout"><div className="station-map card"><div className="station-orbit station-orbit-one" /><div className="station-orbit station-orbit-two" /><div className="station-center"><span>SAFEHUB</span><strong>Estação</strong></div>{[['Sala Comercial', 'comercial'], ['Sala Engenharia', 'engenharia'], ['Sala de Reuniões', 'reunioes'], ['Observatório', 'observatorio']].map(([name, key]) => <div className={`station-room room-${key}`} key={key}><span>◉</span><strong>{name}</strong><small>Espaço de equipe</small></div>)}</div><div className="station-aside card"><span className="eyebrow">ESPAÇO COLABORATIVO</span><h2>Trabalhe em órbita.</h2><p>O mapa visual está pronto para representar as salas da equipe. Presença, conversas em tempo real e compartilhamento de arquivos ainda precisam de serviços no backend.</p><button className="btn btn-ghost" disabled type="button">Entrar em uma sala</button></div></div></section>;
}

function IntegrationsScreen({ token, onNavigate }: { token: string; onNavigate: (id: ScreenId) => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => { void apiRequest<{ connected: boolean }>(token, '/api/v1/integracoes/outlook/status').then((status) => setConnected(status.connected)).catch(() => setConnected(false)); }, [token]);
  return <section className="screen-content"><ScreenHeading eyebrow="UPLINK" title="Integrações" description="Serviços conectados à sua conta SafeHub." /><div className="integration-grid"><article className="integration-card card"><div className="integration-logo outlook-logo">O</div><div className="integration-card-copy"><span className="eyebrow">CALENDÁRIO</span><h2>Microsoft Outlook</h2><p>Conecte sua conta Microsoft para consultar e administrar sua própria agenda.</p><span className={`integration-status${connected ? ' is-connected' : ''}`}><i />{connected === null ? 'Verificando…' : connected ? 'Conectado' : 'Não conectado'}</span></div><button className="btn btn-primary" onClick={() => onNavigate('agenda')} type="button">{connected ? 'Abrir agenda' : 'Configurar'}</button></article><article className="integration-card card integration-placeholder"><div className="integration-logo generic-logo">＋</div><div className="integration-card-copy"><span className="eyebrow">EM PREPARAÇÃO</span><h2>Novas integrações</h2><p>O espaço está preparado para futuras ferramentas conectadas ao SafeHub.</p></div></article></div></section>;
}

function SettingsScreen({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return <section className="screen-content"><ScreenHeading eyebrow="PAINEL DE CONTROLE" title="Configurações" description="Conta e preferências do aplicativo." /><div className="settings-card card"><div className="settings-profile"><div className="settings-avatar">{email.slice(0, 1).toUpperCase()}</div><div><strong>{email}</strong><span>Conta autenticada pelo Supabase</span></div></div><div className="settings-row"><span>Idioma</span><strong>Português (Brasil)</strong></div><div className="settings-row"><span>Agenda pessoal</span><strong>Microsoft Outlook</strong></div><button className="btn btn-ghost settings-signout" onClick={onSignOut} type="button">Sair da conta</button></div></section>;
}

export default function WorkspaceScreen({ accessToken, email, onSignOut }: { accessToken: string; email: string; onSignOut: () => void }) {
  const { section } = useParams<{ section: string }>();
  const routerNavigate = useRouterNavigate();
  const screen = (section === 'kanban' ? 'oportunidades' : section) as ScreenId;
  const [search, setSearch] = useState('');
  const [clientCount, setClientCount] = useState(0);
  const [channelCount, setChannelCount] = useState(0);
  const [channels, setChannels] = useState<Canal[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profile, setProfile] = useState<{ nome: string; cargo: string | null } | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const countClients = useCallback((count: number) => setClientCount(count), []);
  useEffect(() => {
    void apiRequest<{ nome: string; cargo: string | null }>(accessToken, '/api/v1/usuarios/me').then(setProfile).catch(() => setProfile(null)).finally(() => setProfileLoaded(true));
    void apiRequest<{ pagination: { total: number } }>(accessToken, '/api/v1/clientes?limit=1&offset=0').then((result) => setClientCount(result.pagination?.total ?? 0)).catch(() => undefined);
    void apiRequest<{ data: Canal[]; pagination: { total: number } }>(accessToken, '/api/v1/canais?limit=100&offset=0').then((result) => {
      setChannels(result.data ?? []);
      setChannelCount(result.pagination?.total ?? result.data?.length ?? 0);
      setChannelsError('');
    }).catch((cause) => setChannelsError(cause instanceof Error ? cause.message : 'Não foi possível carregar os canais.')).finally(() => setChannelsLoading(false));
  }, [accessToken]);

  function navigate(id: ScreenId) {
    routerNavigate(`/app/${id}`);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submitSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate('crm');
  }

  if (section === 'kanban') return <Navigate to="/app/oportunidades" replace />;
  const validScreen = navigation.some((item) => item.id === screen);
  if (!validScreen) return <Navigate to="/app/home" replace />;
  if (screen === 'admin' && !profileLoaded) {
    return <main className="startup-screen"><span className="loading-dot" /><p>Verificando acesso administrativo…</p></main>;
  }
  if (screen === 'admin' && profile?.cargo !== 'Administrador') {
    return <Navigate to="/app/home" replace />;
  }

  return <div className="safehub-app">
    <aside className={`app-sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
      <Link className="app-brand" to="/app/home" onClick={() => setMobileNavOpen(false)}><span className="app-brand-mark"><span>◉</span></span><span><strong>SafeHub</strong><small>SAFE ON ORBIT · 2026</small></span></Link>
      <nav aria-label="Navegação principal" className="primary-nav">{navigation.filter((item) => item.id !== 'admin' || profile?.cargo === 'Administrador').map((item) => <div key={item.id}>{item.id === 'admin' && <span className="nav-eyebrow nav-eyebrow-spacer">Sistema</span>}<NavLink aria-label={item.label} className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`} onClick={() => setMobileNavOpen(false)} to={`/app/${item.id}`} title={item.label}><span aria-hidden="true" className="nav-icon">{item.icon}</span><span>{item.label}</span></NavLink></div>)}</nav>
      <div className="sidebar-foot"><div className="sidebar-avatar">{email.slice(0, 1).toUpperCase()}</div><div className="sidebar-user"><strong>{email.split('@')[0]}</strong><span>Conta SafeHub</span></div><button aria-label="Sair" className="sidebar-logout" onClick={onSignOut} title="Sair" type="button">↗</button></div>
    </aside>
    <div className="app-main">
      <header className="app-topbar"><button aria-label="Abrir menu" className="mobile-menu-button" onClick={() => setMobileNavOpen((open) => !open)} type="button">☰</button><form className="global-search" onSubmit={submitSearch}><span aria-hidden="true">⌕</span><input aria-label="Buscar" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar clientes, projetos, documentos…" value={search} /><button aria-label="Pesquisar" type="submit">↵</button></form><div className="topbar-right"><span className="topbar-email">{email}</span><button aria-label="Abrir configurações" className="topbar-avatar" onClick={() => navigate('config')} type="button">{email.slice(0, 1).toUpperCase()}</button></div></header>
      <main className="app-content">
        {screen === 'home' && <OverviewScreen email={email} clientCount={clientCount} channelCount={channelCount} onNavigate={navigate} />}
        {screen === 'crm' && <CustomersScreen token={accessToken} initialSearch={search} onCountChange={countClients} />}
        {screen === 'oportunidades' && <OpportunitiesScreen token={accessToken} />}
        {screen === 'projetos' && <ProjectsScreen />}
        {screen === 'documentos' && <DocumentsScreen token={accessToken} />}
        {screen === 'chat' && <CommunicationScreen channels={channels} loading={channelsLoading} error={channelsError} />}
        {screen === 'agenda' && <section className="screen-content"><OutlookCalendarPanel accessToken={accessToken} /></section>}
        {screen === 'estacao' && <StationScreen />}
        {screen === 'integracoes' && <IntegrationsScreen token={accessToken} onNavigate={navigate} />}
        {screen === 'admin' && profile?.cargo === 'Administrador' && <AdminUsersScreen token={accessToken} />}
        {screen === 'config' && <SettingsScreen email={email} onSignOut={onSignOut} />}
      </main>
    </div>
  </div>;
}
