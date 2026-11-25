import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react';
import {
  Link,
  Navigate,
  NavLink,
  useParams,
  useNavigate as useRouterNavigate,
} from 'react-router-dom';
import ClientRelationshipPanel, {
  DocumentsScreen,
} from '../components/ClientRelationshipPanel';
import Icon, { type IconName } from '../components/Icon';
import { InlineLoading, KanbanSkeleton, TableSkeleton } from '../components/LoadingStates';
import OutlookCalendarPanel from '../components/OutlookCalendarPanel';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';
import { validateOutgoingRequest } from '../validation/apiSchemas';
import { getTodayDateString } from '../utils/masks';
import { applyTheme, getSavedTheme, type AppTheme } from '../utils/theme';
import AdminUsersScreen from './AdminUsersScreen';
import EditaisScreen from './EditaisScreen';
import OneDriveScreen from './OneDriveScreen';
import ProjectsScreen from './ProjectsScreen';
import TeamsScreen from './TeamsScreen';

type ScreenId =
  | 'home'
  | 'crm'
  | 'oportunidades'
  | 'editais'
  | 'projetos'
  | 'documentos'
  | 'agenda'
  | 'onedrive'
  | 'integracoes'
  | 'admin'
  | 'equipes'
  | 'config';
type Cliente = {
  id: number;
  nome: string;
  setor: string | null;
  pais: string | null;
  site: string | null;
  endereco: string | null;
  observacoes: string | null;
  origem_relacionamento: string | null;
  contatos_busca?: string;
  tarefas_pendentes?: number;
  proxima_acao?: string | null;
  ultima_interacao_em?: string | null;
  status_pipeline: string | null;
  responsavel_id: number | null;
  responsavel_nome?: string | null;
};
type ClienteResponsavel = { id: number; nome: string };
type ClienteIndicadores = {
  total_clientes: number;
  em_prospeccao: number;
  em_contato: number;
  reunioes_agendadas: number;
  parceiros: number;
  contatos_ativos: number;
  reunioes_realizadas_periodo: number;
  solicitacoes_pendentes: number;
  tarefas_atrasadas: number;
};
type ClienteDraft = {
  nome: string;
  setor: string;
  pais: string;
  site: string;
  endereco: string;
  observacoes: string;
  origem_relacionamento: string;
  status_pipeline: string;
  responsavel_id: string;
};
type OportunidadeCard = {
  id: number;
  titulo: string;
  cliente_id: number;
  cliente_nome: string;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  estagio: string;
  valor_estimado: number | string | null;
  previsao_fechamento: string | null;
  proxima_acao: string | null;
};
type MovimentoOportunidade = {
  id: number;
  estagio_anterior: string | null;
  estagio_novo: string;
  alterado_em: string;
  usuario_nome: string;
  tipo_evento?: string;
  campo?: string | null;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  valor_anterior_exibicao?: string | null;
  valor_novo_exibicao?: string | null;
};
const opportunityStages = [
  { id: 'prospeccao', label: 'Prospecção' },
  { id: 'proposta_enviada', label: 'Proposta Enviada' },
  { id: 'negociacao', label: 'Negociação' },
];

function formatOpportunityHistoryValue(
  field: string | null | undefined,
  value: string | null | undefined,
  users: ClienteResponsavel[],
  clients: Cliente[],
  displayValue?: string | null
) {
  if (!value) {
    if (field === 'responsavel_id') return 'Sem responsável';
    if (field === 'cliente_id') return 'Sem cliente';
    if (field === 'valor_estimado') return 'Sem valor definido';
    if (field === 'previsao_fechamento') return 'Sem previsão';
    return '—';
  }
  if (displayValue) return displayValue;
  if (field === 'responsavel_id') {
    return users.find((user) => user.id === Number(value))?.nome ?? 'Responsável não encontrado';
  }
  if (field === 'cliente_id') {
    return clients.find((client) => client.id === Number(value))?.nome ?? 'Cliente não encontrado';
  }
  if (field === 'valor_estimado') {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
      : value;
  }
  if (field !== 'previsao_fechamento') return value;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function opportunityHistoryFieldLabel(field: string | null | undefined) {
  const labels: Record<string, string> = {
    proxima_acao: 'Próxima ação',
    previsao_fechamento: 'Previsão de fechamento',
    titulo: 'Oportunidade',
    cliente_id: 'Cliente',
    responsavel_id: 'Responsável',
    valor_estimado: 'Valor estimado',
  };
  return field ? labels[field] ?? field : 'Campo';
}

const navigation: Array<{ id: ScreenId; label: string; icon: IconName }> = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'crm', label: 'Clientes', icon: 'users' },
  { id: 'oportunidades', label: 'Oportunidades', icon: 'chart' },
  { id: 'editais', label: 'Editais', icon: 'checklist' },
  { id: 'projetos', label: 'Projetos', icon: 'kanban' },
  { id: 'documentos', label: 'Documentos', icon: 'file' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'onedrive', label: 'OneDrive', icon: 'cloud' },
  { id: 'integracoes', label: 'Integrações', icon: 'integration' },
  { id: 'admin', label: 'Usuários', icon: 'user' },
  { id: 'equipes', label: 'Equipes', icon: 'users' },
  { id: 'config', label: 'Configurações', icon: 'settings' },
];

async function apiRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  options = validateOutgoingRequest(path, options);
  const currentToken = await getCurrentAccessToken();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${currentToken}`,
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result && typeof result === 'object' && 'message' in result
        ? String(result.message)
        : `A API respondeu com HTTP ${response.status}.`;
    throw new Error(message);
  }
  return result as T;
}

function friendlyStatus(status: string | null) {
  const value = (status ?? 'novo')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const labels: Record<string, string> = {
    novo: 'Prospecção',
    prospeccao: 'Prospecção',
    contato: 'Em contato',
    em_contato: 'Em contato',
    proposta: 'Proposta',
    fechado: 'Parceiro',
    parceiro: 'Parceiro',
    perdido: 'Perdido',
    reuniao_agendada: 'Reunião agendada',
    reuniao_realizada: 'Reunião realizada',
  };
  return labels[value] ?? status ?? 'Prospecção';
}

function countryFlag(country: string | null) {
  const normalized = (country ?? '').trim().toLocaleLowerCase('pt-BR');
  const codes: Record<string, string> = {
    brasil: 'BR',
    brazil: 'BR',
    'estados unidos': 'US',
    'united states': 'US',
    'reino unido': 'GB',
    'united kingdom': 'GB',
    italia: 'IT',
    itália: 'IT',
    alemanha: 'DE',
    frança: 'FR',
    franca: 'FR',
    espanha: 'ES',
    japão: 'JP',
    japao: 'JP',
    canadá: 'CA',
    canada: 'CA',
    argentina: 'AR',
    portugal: 'PT',
  };
  const code = codes[normalized];
  return code
    ? String.fromCodePoint(
        ...[...code].map((letter) => 127397 + letter.charCodeAt(0))
      )
    : '';
}

function ScreenHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="screen-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyModule({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <div className="module-empty card">
      <span className="module-empty-icon"><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function CustomersScreen({
  token,
  initialSearch,
  onCountChange,
}: {
  token: string;
  initialSearch: string;
  onCountChange: (count: number) => void;
}) {
  const [clients, setClients] = useState<Cliente[]>([]);
  const [responsaveis, setResponsaveis] = useState<ClienteResponsavel[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<ClienteDraft>({
    nome: '',
    setor: '',
    pais: '',
    site: '',
    endereco: '',
    observacoes: '',
    origem_relacionamento: '',
    status_pipeline: 'novo',
    responsavel_id: '',
  });
  const [indicators, setIndicators] = useState<ClienteIndicadores | null>(null);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Cliente | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [relationshipClient, setRelationshipClient] = useState<Cliente | null>(
    null
  );
  const [sectorFilter, setSectorFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [lastInteractionFrom, setLastInteractionFrom] = useState('');
  const [lastInteractionTo, setLastInteractionTo] = useState('');
  const [pendingFilter, setPendingFilter] = useState('');

  useEffect(() => setSearch(initialSearch), [initialSearch]);

  useEffect(() => {
    if (!clientToDelete) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeletingClient) setClientToDelete(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clientToDelete, isDeletingClient]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{
        data: Cliente[];
        pagination: { total: number };
      }>(token, '/api/v1/clientes?limit=100&offset=0');
      setClients(result.data ?? []);
      onCountChange(result.pagination?.total ?? result.data?.length ?? 0);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar os clientes.'
      );
    } finally {
      setLoading(false);
    }
  }, [token, onCountChange]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    void apiRequest<{ data: ClienteResponsavel[] }>(
      token,
      '/api/v1/clientes/responsaveis'
    )
      .then((result) => setResponsaveis(result.data ?? []))
      .catch(() => setResponsaveis([]));
  }, [token]);

  useEffect(() => {
    void apiRequest<ClienteIndicadores>(token, '/api/v1/clientes/indicadores')
      .then(setIndicators)
      .catch(() => setIndicators(null));
  }, [token, clients.length]);

  const filtered = useMemo(
    () =>
      clients.filter((client) => {
        const responsible = responsaveis.find(
          (item) => item.id === client.responsavel_id
        );
        const matchesSearch =
          `${client.nome} ${client.contatos_busca ?? ''} ${client.setor ?? ''} ${client.pais ?? ''} ${client.site ?? ''} ${client.origem_relacionamento ?? ''} ${responsible?.nome ?? ''} ${friendlyStatus(client.status_pipeline)}`
            .toLocaleLowerCase('pt-BR')
            .includes(search.toLocaleLowerCase('pt-BR'));
        return (
          matchesSearch &&
          (!sectorFilter || client.setor === sectorFilter) &&
          (!countryFilter || client.pais === countryFilter) &&
          (!statusFilter ||
            friendlyStatus(client.status_pipeline) === statusFilter) &&
          (!responsibleFilter ||
            String(client.responsavel_id ?? '') === responsibleFilter) &&
          (!lastInteractionFrom ||
            (client.ultima_interacao_em?.slice(0, 10) ?? '') >=
              lastInteractionFrom) &&
          (!lastInteractionTo ||
            (client.ultima_interacao_em?.slice(0, 10) ?? '') <=
              lastInteractionTo) &&
          (!pendingFilter ||
            (pendingFilter === 'sim'
              ? (client.tarefas_pendentes ?? 0) > 0
              : (client.tarefas_pendentes ?? 0) === 0))
        );
      }),
    [
      clients,
      responsaveis,
      search,
      sectorFilter,
      countryFilter,
      statusFilter,
      responsibleFilter,
      lastInteractionFrom,
      lastInteractionTo,
      pendingFilter,
    ]
  );
  const sectors = useMemo(
    () =>
      [
        ...new Set(
          clients
            .map((client) => client.setor)
            .filter((value): value is string => Boolean(value))
        ),
      ].sort(),
    [clients]
  );
  const countries = useMemo(
    () =>
      [
        ...new Set(
          clients
            .map((client) => client.pais)
            .filter((value): value is string => Boolean(value))
        ),
      ].sort(),
    [clients]
  );

  function openCreate() {
    setEditing(null);
    setDraft({
      nome: '',
      setor: '',
      pais: '',
      site: '',
      endereco: '',
      observacoes: '',
      origem_relacionamento: '',
      status_pipeline: 'novo',
      responsavel_id: '',
    });
    setModalOpen(true);
    setError('');
    setNotice('');
  }

  function openEdit(client: Cliente) {
    setEditing(client);
    setDraft({
      nome: client.nome,
      setor: client.setor ?? '',
      pais: client.pais ?? '',
      site: client.site ?? '',
      endereco: client.endereco ?? '',
      observacoes: client.observacoes ?? '',
      origem_relacionamento: client.origem_relacionamento ?? '',
      status_pipeline: client.status_pipeline ?? 'novo',
      responsavel_id: client.responsavel_id
        ? String(client.responsavel_id)
        : '',
    });
    setModalOpen(true);
    setError('');
    setNotice('');
  }

  function openRelationship(client: Cliente) {
    setRelationshipClient({
      ...client,
      responsavel_nome:
        responsaveis.find((item) => item.id === client.responsavel_id)?.nome ??
        null,
    });
  }

  async function saveClient(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        nome: draft.nome.trim(),
        setor: draft.setor.trim() || null,
        pais: draft.pais.trim() || null,
        site: draft.site.trim() || null,
        endereco: draft.endereco.trim() || null,
        observacoes: draft.observacoes.trim() || null,
        origem_relacionamento: draft.origem_relacionamento.trim() || null,
        status_pipeline: draft.status_pipeline,
        responsavel_id: draft.responsavel_id
          ? Number(draft.responsavel_id)
          : null,
      };
      if (editing) {
        await apiRequest(token, `/api/v1/clientes/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setNotice('Cliente atualizado.');
      } else {
        await apiRequest(token, '/api/v1/clientes', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setNotice('Cliente cadastrado.');
      }
      setModalOpen(false);
      await loadClients();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o cliente.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient() {
    if (!clientToDelete) return;
    setIsDeletingClient(true);
    setDeleteError('');
    setError('');
    try {
      await apiRequest(token, `/api/v1/clientes/${clientToDelete.id}`, {
        method: 'DELETE',
      });
      setClientToDelete(null);
      setNotice('Cliente excluído.');
      await loadClients();
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível excluir o cliente.'
      );
    } finally {
      setIsDeletingClient(false);
    }
  }

  const stages = ['Prospecção', 'Em contato', 'Proposta', 'Parceiro'];

  if (relationshipClient)
    return (
      <ClientRelationshipPanel
        client={relationshipClient}
        onClose={() => setRelationshipClient(null)}
        onEdit={() => {
          const selected = relationshipClient;
          setRelationshipClient(null);
          openEdit(selected);
        }}
        token={token}
        users={responsaveis}
      />
    );

  return (
    <section className="screen-content">
      <ScreenHeading
        eyebrow="CRM · RELACIONAMENTO COMERCIAL"
        title="Clientes"
        description="Organizações, pessoas e histórico do relacionamento comercial."
        action={
          <button
            className="btn btn-primary"
            onClick={openCreate}
            type="button"
          >
            <Icon name="plus" size={15} /> Novo cliente
          </button>
        }
      />
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
      <div className="pipeline-summary crm-metrics">
        {[
          {
            label: 'Total de clientes',
            count: indicators?.total_clientes ?? clients.length,
            tone: 'all',
            icon: 'users',
          },
          {
            label: 'Em prospecção',
            count:
              indicators?.em_prospeccao ??
              clients.filter(
                (client) =>
                  friendlyStatus(client.status_pipeline) === 'Prospecção'
              ).length,
            tone: 'prospeccao',
            icon: 'target',
          },
          {
            label: 'Em contato',
            count:
              indicators?.em_contato ??
              clients.filter(
                (client) =>
                  friendlyStatus(client.status_pipeline) === 'Em contato'
              ).length,
            tone: 'contato',
            icon: 'arrow-up-right',
          },
          {
            label: 'Reuniões agendadas',
            count: indicators?.reunioes_agendadas ?? 0,
            tone: 'reunioes',
            icon: 'calendar',
          },
          {
            label: 'Parceiros',
            count:
              indicators?.parceiros ??
              clients.filter(
                (client) =>
                  friendlyStatus(client.status_pipeline) === 'Parceiro'
              ).length,
            tone: 'partner',
            icon: 'check',
          },
          {
            label: 'Contatos ativos',
            count: indicators?.contatos_ativos ?? 0,
            tone: 'contato',
            icon: 'user',
          },
          {
            label: 'Reuniões realizadas no mês',
            count: indicators?.reunioes_realizadas_periodo ?? 0,
            tone: 'prospeccao',
            icon: 'check',
          },
          {
            label: 'Solicitações pendentes',
            count: indicators?.solicitacoes_pendentes ?? 0,
            tone: 'reunioes',
            icon: 'alert',
          },
          {
            label: 'Tarefas atrasadas',
            count: indicators?.tarefas_atrasadas ?? 0,
            tone: 'partner',
            icon: 'clock',
          },
        ].map((metric) => (
          <article
            className={`pipeline-summary-card card crm-metric crm-metric-${metric.tone}`}
            key={metric.label}
          >
            <span className="crm-metric-icon" aria-hidden="true">
              <Icon name={metric.icon as IconName} size={19} />
            </span>
            <span>{metric.label}</span>
            <strong>{metric.count}</strong>
          </article>
        ))}
      </div>
      <div className="card client-table-card">
        <div className="crm-filterbar">
          <label className="crm-search">
            <Icon name="search" size={16} />
            <input
              aria-label="Buscar clientes"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, contato ou setor…"
              value={search}
            />
          </label>
          <select
            aria-label="Filtrar por setor"
            onChange={(event) => setSectorFilter(event.target.value)}
            value={sectorFilter}
          >
            <option value="">Setor</option>
            {sectors.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por país"
            onChange={(event) => setCountryFilter(event.target.value)}
            value={countryFilter}
          >
            <option value="">País</option>
            {countries.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por status"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="">Status</option>
            {stages.concat('Perdido').map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por responsável"
            onChange={(event) => setResponsibleFilter(event.target.value)}
            value={responsibleFilter}
          >
            <option value="">Responsável</option>
            {responsaveis.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome}
              </option>
            ))}
          </select>
          <label>
            Interação desde
            <input
              aria-label="Última interação desde"
              onChange={(event) => setLastInteractionFrom(event.target.value)}
              type="date"
              value={lastInteractionFrom}
            />
          </label>
          <label>
            Até
            <input
              aria-label="Última interação até"
              onChange={(event) => setLastInteractionTo(event.target.value)}
              type="date"
              value={lastInteractionTo}
            />
          </label>
          <select
            aria-label="Filtrar pendências"
            onChange={(event) => setPendingFilter(event.target.value)}
            value={pendingFilter}
          >
            <option value="">Pendências</option>
            <option value="sim">Com tarefas pendentes</option>
            <option value="nao">Sem tarefas pendentes</option>
          </select>
          {(search ||
            sectorFilter ||
            countryFilter ||
            statusFilter ||
            responsibleFilter ||
            lastInteractionFrom ||
            lastInteractionTo ||
            pendingFilter) && (
            <button
              className="crm-clear-filters"
              onClick={() => {
                setSearch('');
                setSectorFilter('');
                setCountryFilter('');
                setStatusFilter('');
                setResponsibleFilter('');
                setLastInteractionFrom('');
                setLastInteractionTo('');
                setPendingFilter('');
              }}
              type="button"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="table-toolbar">
          <div>
            <strong>Clientes e organizações</strong>
            <span>
              {filtered.length} de {clients.length} clientes
            </span>
          </div>
        </div>
        {loading ? (
          <TableSkeleton columns={9} label="Carregando clientes" rows={6} />
        ) : filtered.length === 0 ? (
          <div className="table-state">
            {clients.length
              ? 'Nenhum cliente corresponde à busca.'
              : 'Ainda não há clientes cadastrados.'}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="workspace-table crm-table">
              <thead>
                <tr>
                  <th>
                    <input aria-label="Selecionar todos" type="checkbox" />
                  </th>
                  <th>Cliente / Organização</th>
                  <th>Setor</th>
                  <th>País</th>
                  <th>Status</th>
                  <th>Responsável</th>
                  <th>Próxima ação</th>
                  <th>Última atualização</th>
                  <th className="table-actions-heading">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const owner = responsaveis.find(
                    (item) => item.id === client.responsavel_id
                  );
                  return (
                    <tr key={client.id}>
                      <td>
                        <input
                          aria-label={`Selecionar ${client.nome}`}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <button
                          className="crm-client-link"
                          onClick={() => openRelationship(client)}
                          type="button"
                        >
                          <span className="crm-org-avatar">
                            {client.nome
                              .trim()
                              .slice(0, 1)
                              .toLocaleUpperCase('pt-BR')}
                          </span>
                          <span>
                            <strong>{client.nome}</strong>
                            <small>
                              {client.site || client.setor || 'Organização'}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{client.setor || '—'}</td>
                      <td>
                        <span className="crm-country">
                          {countryFlag(client.pais)} {client.pais || '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-pill crm-status-${friendlyStatus(client.status_pipeline).toLowerCase().replaceAll(' ', '-')}`}
                        >
                          {friendlyStatus(client.status_pipeline)}
                        </span>
                      </td>
                      <td>
                        <span className="crm-table-owner">
                          {owner && (
                            <span className="crm-owner-avatar">
                              {owner.nome
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join('')
                                .toLocaleUpperCase('pt-BR')}
                            </span>
                          )}
                          {owner?.nome ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span className="crm-next-action">
                          {client.proxima_acao || 'Nenhuma ação definida'}
                        </span>
                        {client.ultima_interacao_em && (
                          <small className="crm-action-date">
                            {new Date(
                              client.ultima_interacao_em
                            ).toLocaleDateString('pt-BR')}
                          </small>
                        )}
                      </td>
                      <td>
                        {client.ultima_interacao_em
                          ? new Date(
                              client.ultima_interacao_em
                            ).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="table-actions">
                        <button
                          aria-label={`Abrir ${client.nome}`}
                          className="table-action"
                          onClick={() => openRelationship(client)}
                          type="button"
                        >
                          ⋮
                        </button>
                        <button
                          aria-label={`Excluir ${client.nome}`}
                          className="table-action danger"
                          disabled={isDeletingClient}
                          onClick={() => {
                            setClientToDelete(client);
                            setDeleteError('');
                            setNotice('');
                          }}
                          type="button"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setModalOpen(false);
          }}
        >
          <form
            className="client-modal"
            onSubmit={(event) => void saveClient(event)}
          >
            <div className="client-modal-heading">
              <div>
                <span className="eyebrow">CRM SAFEHUB</span>
                <h2>{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
              </div>
              <button
                aria-label="Fechar"
                className="modal-close"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            {error && (
              <div className="workspace-alert" role="alert">
                {error}
              </div>
            )}
            <label>
              Empresa
              <input
                autoFocus
                maxLength={200}
                onChange={(event) =>
                  setDraft({ ...draft, nome: event.target.value })
                }
                required
                value={draft.nome}
              />
            </label>
            <label>
              Setor
              <input
                maxLength={120}
                onChange={(event) =>
                  setDraft({ ...draft, setor: event.target.value })
                }
                value={draft.setor}
              />
            </label>
            <label>
              País
              <input
                maxLength={120}
                onChange={(event) =>
                  setDraft({ ...draft, pais: event.target.value })
                }
                value={draft.pais}
              />
            </label>
            <label>
              Site
              <input
                maxLength={500}
                onChange={(event) =>
                  setDraft({ ...draft, site: event.target.value })
                }
                placeholder="https://empresa.com"
                type="url"
                value={draft.site}
              />
            </label>
            <label>
              Endereço
              <input
                maxLength={500}
                onChange={(event) =>
                  setDraft({ ...draft, endereco: event.target.value })
                }
                value={draft.endereco}
              />
            </label>
            <label className="client-modal-wide">
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
            <label>
              Origem do relacionamento
              <input
                maxLength={120}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    origem_relacionamento: event.target.value,
                  })
                }
                placeholder="Indicação, evento, prospecção…"
                value={draft.origem_relacionamento}
              />
            </label>
            <label>
              Responsável interno
              <select
                onChange={(event) =>
                  setDraft({ ...draft, responsavel_id: event.target.value })
                }
                value={draft.responsavel_id}
              >
                <option value="">Sem responsável</option>
                {responsaveis.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etapa do pipeline
              <select
                onChange={(event) =>
                  setDraft({ ...draft, status_pipeline: event.target.value })
                }
                value={draft.status_pipeline}
              >
                <option value="novo">Prospecção</option>
                <option value="contato">Contato</option>
                <option value="proposta">Proposta</option>
                <option value="fechado">Fechado</option>
                <option value="perdido">Perdido</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={saving}
                type="submit"
              >
                {saving
                  ? 'Salvando…'
                  : editing
                    ? 'Salvar alterações'
                    : 'Cadastrar cliente'}
              </button>
            </div>
          </form>
        </div>
      )}
      {clientToDelete && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDeletingClient)
              setClientToDelete(null);
          }}
        >
          <section
            aria-labelledby="delete-client-title"
            aria-modal="true"
            className="client-modal delete-client-modal"
            role="alertdialog"
          >
            <div className="client-modal-heading">
              <div>
                <span className="eyebrow">CRM SAFEHUB</span>
                <h2 id="delete-client-title">Excluir cliente</h2>
              </div>
              <button
                aria-label="Fechar"
                className="modal-close"
                disabled={isDeletingClient}
                onClick={() => setClientToDelete(null)}
                type="button"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <p>
              Tem certeza que deseja excluir o cliente{' '}
              <strong>{clientToDelete.nome}</strong>? Esta ação não pode ser
              desfeita.
            </p>
            <p className="delete-client-impact">
              Contatos e tarefas vinculados são excluídos em cascata conforme as
              migrations atuais. A exclusão também pode ser bloqueada se houver
              outros vínculos protegidos no banco.
            </p>
            {deleteError && (
              <div className="workspace-alert" role="alert">
                {deleteError}
              </div>
            )}
            <div className="modal-actions">
              <button
                autoFocus
                className="btn btn-primary"
                disabled={isDeletingClient}
                onClick={() => setClientToDelete(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="danger-button delete-client-confirm"
                disabled={isDeletingClient}
                onClick={() => void deleteClient()}
                type="button"
              >
                {isDeletingClient ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function OverviewScreen({
  token,
  email,
  clientCount,
  onNavigate,
}: {
  token: string;
  email: string;
  clientCount: number;
  onNavigate: (id: ScreenId) => void;
}) {
  const [myTasks, setMyTasks] = useState<
    Array<{
      id: number;
      origem: 'projeto' | 'cliente';
      titulo: string;
      prazo: string | null;
      status: string;
      contexto_nome: string;
    }>
  >([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Array<{ id: string; subject?: string; start: { dateTime: string } }>>([]);
  const [notifications, setNotifications] = useState<
    Array<{
      id: number;
      titulo: string;
      mensagem: string;
      lida_em: string | null;
      criada_em: string;
    }>
  >([]);
  const [projectDataError, setProjectDataError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ data: typeof myTasks }>(
        token,
        '/api/v1/projetos/minhas-tarefas'
      ),
      apiRequest<{ data: typeof notifications }>(token, '/api/v1/notificacoes'),
    ])
      .then(([tasks, notices]) => {
        if (active) {
          setMyTasks(tasks.data ?? []);
          setNotifications(notices.data ?? []);
          setProjectDataError('');
        }
      })
      .catch((error) => {
        if (active)
          setProjectDataError(
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar tarefas e notificações.'
          );
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    let active = true;
    const startDateTime = new Date().toISOString();
    const endDateTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    void apiRequest<{ connected: boolean }>(token, '/api/v1/integracoes/outlook/status')
      .then(async (status) => {
        if (!status.connected) return null;
        const query = new URLSearchParams({ startDateTime, endDateTime });
        return apiRequest<{ value?: typeof upcomingMeetings }>(token, `/api/v1/integracoes/outlook/events?${query}`);
      })
      .then((result) => { if (active) setUpcomingMeetings(result?.value ?? []); })
      .catch(() => { if (active) setUpcomingMeetings([]); });
    return () => { active = false; };
  }, [token]);
  async function readNotification(id: number) {
    try {
      await apiRequest(token, `/api/v1/notificacoes/${id}/lida`, {
        method: 'PATCH',
      });
      setNotifications((items) =>
        items.map((item) =>
          item.id === id ? { ...item, lida_em: new Date().toISOString() } : item
        )
      );
    } catch (error) {
      setProjectDataError(
        error instanceof Error
          ? error.message
          : 'Não foi possível marcar a notificação como lida.'
      );
    }
  }
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const firstName = email.split('@')[0]?.split(/[._-]/)[0] || 'bem-vindo';
  return (
    <section className="screen-content">
      <ScreenHeading
        eyebrow="PAINEL DE MISSÃO"
        title={`${greeting}, ${firstName}`}
        description={`${today} — acompanhe seu espaço SafeHub.`}
        action={
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('agenda')}
            type="button"
          >
            Abrir minha agenda <Icon name="arrow-right" size={15} />
          </button>
        }
      />
      <div className="stat-row">
        <div className="card stat">
          <div className="num">{clientCount}</div>
          <div className="lbl">Clientes cadastrados</div>
          <button
            className="stat-link"
            onClick={() => onNavigate('crm')}
            type="button"
          >
            Abrir CRM <Icon name="arrow-right" size={15} />
          </button>
        </div>
        <div className="card stat">
          <div className="num">—</div>
          <div className="lbl">Projetos em andamento</div>
          <button
            className="stat-link"
            onClick={() => onNavigate('projetos')}
            type="button"
          >
            Abrir projetos <Icon name="arrow-right" size={15} />
          </button>
        </div>
        <div className="card stat">
          <div className="num">Outlook</div>
          <div className="lbl">Agenda pessoal</div>
          <button
            className="stat-link"
            onClick={() => onNavigate('agenda')}
            type="button"
          >
            Ver calendário <Icon name="arrow-right" size={15} />
          </button>
        </div>
      </div>
      <div className="home-grid">
        <div className="card home-feed">
          <div className="card-heading">
            <div>
              <span className="eyebrow">ACESSO RÁPIDO</span>
              <h2>Seu espaço de trabalho</h2>
            </div>
          </div>
          <button
            className="quick-link"
            onClick={() => onNavigate('crm')}
            type="button"
          >
            <span className="quick-icon"><Icon name="users" /></span>
            <span>
              <strong>Clientes</strong>
              <small>Cadastre clientes e consulte o histórico comercial.</small>
            </span>
            <b><Icon name="arrow-right" size={16} /></b>
          </button>
          <button
            className="quick-link"
            onClick={() => onNavigate('oportunidades')}
            type="button"
          >
            <span className="quick-icon"><Icon name="chart" /></span>
            <span>
              <strong>Oportunidades</strong>
              <small>Acompanhe negociações no funil comercial.</small>
            </span>
            <b><Icon name="arrow-right" size={16} /></b>
          </button>
          <button
            className="quick-link"
            onClick={() => onNavigate('projetos')}
            type="button"
          >
            <span className="quick-icon"><Icon name="kanban" /></span>
            <span>
              <strong>Projetos</strong>
              <small>Acesse projetos e tarefas da equipe.</small>
            </span>
            <b><Icon name="arrow-right" size={16} /></b>
          </button>
          <button
            className="quick-link"
            onClick={() => onNavigate('agenda')}
            type="button"
          >
            <span className="quick-icon"><Icon name="calendar" /></span>
            <span>
              <strong>Agenda Outlook</strong>
              <small>Gerencie os eventos da sua conta Microsoft.</small>
            </span>
            <b><Icon name="arrow-right" size={16} /></b>
          </button>
          <button
            className="quick-link"
            onClick={() => onNavigate('integracoes')}
            type="button"
          >
            <span className="quick-icon"><Icon name="integration" /></span>
            <span>
              <strong>Integrações</strong>
              <small>Consulte os serviços conectados ao SafeHub.</small>
            </span>
            <b><Icon name="arrow-right" size={16} /></b>
          </button>
        </div>
        <div className="card home-side-card">
          <span className="eyebrow">SAFEHUB</span>
          <h2>Seu trabalho, em um só lugar.</h2>
          <p>
            Use a navegação para acessar as áreas de clientes, agenda e
            ferramentas disponíveis para sua conta.
          </p>
          <div className="home-user-chip">
            <span>{email.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{email}</strong>
              <small>Conta autenticada</small>
            </div>
          </div>
        </div>
      </div>
      <div className="home-grid project-home-grid">
        <section className="card project-home-panel">
          <div className="card-heading">
            <div>
              <span className="eyebrow">ACOMPANHAMENTO</span>
              <h2>Minhas tarefas</h2>
            </div>
            <button
              className="stat-link"
              onClick={() => onNavigate('projetos')}
              type="button"
            >
              Abrir projetos <Icon name="arrow-right" size={15} />
            </button>
          </div>
          {projectDataError && (
            <div className="workspace-alert" role="alert">
              {projectDataError}
            </div>
          )}
          {myTasks.length ? (
            <ul className="home-task-list">
              {myTasks.slice(0, 6).map((task) => (
                <li key={`${task.origem}-${task.id}`}>
                  <span>
                    <strong>{task.titulo}</strong>
                    <small>
                      {task.contexto_nome} · {task.status.replace('_', ' ')}
                    </small>
                  </span>
                  <time>
                    {task.prazo
                      ? new Date(
                          `${task.prazo.slice(0, 10)}T00:00:00`
                        ).toLocaleDateString('pt-BR')
                      : 'Sem prazo'}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="projects-list-empty">
              Você não tem tarefas ativas atribuídas.
            </p>
          )}
        </section>
        <section className="card project-home-panel">
          <div className="card-heading">
            <div>
              <span className="eyebrow">CENTRAL DE AVISOS</span>
              <h2>Notificações</h2>
            </div>
            <span className="status-pill">
              {notifications.filter((item) => !item.lida_em).length} não lidas
            </span>
          </div>
          {notifications.length ? (
            <ul className="home-task-list">
              {notifications.slice(0, 6).map((item) => (
                <li
                  className={item.lida_em ? 'notification-read' : ''}
                  key={item.id}
                >
                  <span>
                    <strong>{item.titulo}</strong>
                    <small>{item.mensagem}</small>
                  </span>
                  {!item.lida_em && (
                    <button
                      className="table-action"
                      onClick={() => void readNotification(item.id)}
                      type="button"
                    >
                      Lida
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="projects-list-empty">
              Nenhuma notificação por enquanto.
            </p>
          )}
        </section>
      </div>
      <section className="card project-home-panel home-meetings-panel">
        <div className="card-heading"><div><span className="eyebrow">PRÓXIMOS 7 DIAS</span><h2>Reuniões próximas</h2></div><button className="stat-link" onClick={() => onNavigate('agenda')} type="button">Abrir agenda <Icon name="arrow-right" size={15} /></button></div>
        {upcomingMeetings.length ? <ul className="home-task-list">{upcomingMeetings.slice(0,6).map((meeting)=><li key={meeting.id}><span><strong>{meeting.subject || 'Sem assunto'}</strong><small>Outlook</small></span><time>{new Date(meeting.start.dateTime).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</time></li>)}</ul> : <p className="projects-list-empty">Nenhuma reunião próxima ou agenda ainda não conectada.</p>}
      </section>
    </section>
  );
}

function OpportunitiesScreen({ token }: { token: string }) {
  const [opportunities, setOpportunities] = useState<OportunidadeCard[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [users, setUsers] = useState<ClienteResponsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [historyFor, setHistoryFor] = useState<OportunidadeCard | null>(null);
  const [history, setHistory] = useState<MovimentoOportunidade[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingActionFor, setEditingActionFor] = useState<OportunidadeCard | null>(null);
  const [actionDraft, setActionDraft] = useState('');
  const [editingOpportunity, setEditingOpportunity] = useState<OportunidadeCard | null>(null);
  const [opportunityDraft, setOpportunityDraft] = useState({ titulo: '', cliente_id: '', responsavel_id: '', valor_estimado: '', previsao_fechamento: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [opportunityResult, clientResult, userResult] = await Promise.all([
        apiRequest<{ data: OportunidadeCard[] }>(
          token,
          '/api/v1/oportunidades'
        ),
        apiRequest<{ data: Cliente[] }>(
          token,
          '/api/v1/clientes?limit=100&offset=0'
        ),
        apiRequest<{ data: ClienteResponsavel[] }>(token, '/api/v1/clientes/responsaveis'),
      ]);
      setOpportunities(opportunityResult.data ?? []);
      setClients(clientResult.data ?? []);
      setUsers(userResult.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar as oportunidades.'
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createOpportunity(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (closeDate && closeDate < getTodayDateString()) {
      setError('A previsão de fechamento não pode ser anterior a hoje.');
      return;
    }
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
          proxima_acao: nextAction.trim() || null,
        }),
      });
      setCreateOpen(false);
      setTitle('');
      setClientId('');
      setAmount('');
      setCloseDate('');
      setNextAction('');
      setNotice('Oportunidade criada na coluna Prospecção.');
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível criar a oportunidade.'
      );
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
      setNotice(
        `Oportunidade movida para ${opportunityStages.find((stage) => stage.id === estagio)?.label ?? estagio}.`
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar o estágio.'
      );
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
      const result = await apiRequest<{ data: MovimentoOportunidade[] }>(
        token,
        `/api/v1/oportunidades/${opportunity.id}/historico`
      );
      setHistory(result.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar o histórico.'
      );
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const formatAmount = (value: OportunidadeCard['valor_estimado']) =>
    value == null
      ? null
      : new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(Number(value));

  return (
    <section className="screen-content">
      <ScreenHeading
        eyebrow="FUNIL COMERCIAL"
        title="Oportunidades & parcerias"
        description="Acompanhe cada negociação por estágio. Arraste os cards entre as colunas para atualizar o funil."
        action={
          <button
            className="btn btn-primary"
            onClick={() => {
              setError('');
              setCreateOpen(true);
            }}
            type="button"
          >
            <Icon name="plus" size={15} /> Nova oportunidade
          </button>
        }
      />
      {error && !historyFor && (
        <div className="workspace-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <KanbanSkeleton columns={opportunityStages.length} label="Carregando oportunidades" />
      ) : (
        <div className="opportunity-board">
          {opportunityStages.map((stage) => {
            const cards = opportunities.filter(
              (opportunity) => opportunity.estagio === stage.id
            );
            return (
              <section
                aria-label={stage.label}
                className={`opportunity-column${draggingId ? ' accepts-drop' : ''}`}
                key={stage.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = Number(event.dataTransfer.getData('text/plain'));
                  if (id) void moveOpportunity(id, stage.id);
                }}
              >
                <header>
                  <h2>{stage.label}</h2>
                  <span>{cards.length}</span>
                </header>
                <div className="opportunity-card-list">
                  {cards.length === 0 ? (
                    <div className="opportunity-empty">
                      Solte uma oportunidade aqui
                    </div>
                  ) : (
                    cards.map((opportunity) => (
                      <article
                        className="opportunity-card card"
                        draggable={!saving}
                        key={opportunity.id}
                        onDragEnd={() => setDraggingId(null)}
                        onDragStart={(event) => {
                          setDraggingId(opportunity.id);
                          event.dataTransfer.setData(
                            'text/plain',
                            String(opportunity.id)
                          );
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                      >
                        <div className="opportunity-card-top">
                          <span>OP-{opportunity.id}</span>
                          <div className="opportunity-card-actions">
                            <button aria-label={`Editar ${opportunity.titulo}`} onClick={() => {
                              setEditingOpportunity(opportunity);
                              setOpportunityDraft({ titulo: opportunity.titulo, cliente_id: String(opportunity.cliente_id), responsavel_id: opportunity.responsavel_id == null ? '' : String(opportunity.responsavel_id), valor_estimado: opportunity.valor_estimado == null ? '' : String(opportunity.valor_estimado), previsao_fechamento: opportunity.previsao_fechamento?.slice(0, 10) ?? '' });
                            }} type="button">Editar</button>
                            <button aria-label={`Ver histórico de ${opportunity.titulo}`} onClick={() => void openHistory(opportunity)} type="button">Histórico <Icon name="arrow-up-right" size={14} /></button>
                          </div>
                        </div>
                        <h3>{opportunity.titulo}</h3>
                        <p className="opportunity-client">
                          {opportunity.cliente_nome}
                        </p>
                        <div className="opportunity-next-action">
                          <span>{opportunity.proxima_acao || 'Sem próxima ação'}</span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setEditingActionFor(opportunity);
                              setActionDraft(opportunity.proxima_acao ?? '');
                            }}
                            type="button"
                          >
                            {opportunity.proxima_acao ? 'Editar ação' : 'Definir ação'}
                          </button>
                        </div>
                        {formatAmount(opportunity.valor_estimado) && (
                          <strong className="opportunity-amount">
                            {formatAmount(opportunity.valor_estimado)}
                          </strong>
                        )}
                        {opportunity.previsao_fechamento && (
                          <small className="opportunity-date">
                            Previsão:{' '}
                            {new Date(
                              `${opportunity.previsao_fechamento.slice(0, 10)}T00:00:00`
                            ).toLocaleDateString('pt-BR')}
                          </small>
                        )}
                        <footer>
                          <span>
                            {opportunity.responsavel_nome ??
                              'Responsável não definido'}
                          </span>
                          <span>⠿ Arrastar</span>
                        </footer>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
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
            className="client-modal opportunity-form"
            onSubmit={(event) => void createOpportunity(event)}
          >
            <div className="client-modal-heading">
              <div>
                <span className="eyebrow">FUNIL COMERCIAL</span>
                <h2>Nova oportunidade</h2>
              </div>
              <button
                aria-label="Fechar"
                className="modal-close"
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            {error && (
              <div className="workspace-alert" role="alert">
                {error}
              </div>
            )}
            <label>
              Nome da oportunidade
              <input
                autoFocus
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </label>
            <label>
              Cliente
              <select
                onChange={(event) => setClientId(event.target.value)}
                required
                value={clientId}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor estimado
              <input
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                step="0.01"
                type="number"
                value={amount}
              />
            </label>
            <label>
              Previsão de fechamento
              <input
                min={getTodayDateString()}
                onChange={(event) => setCloseDate(event.target.value)}
                type="date"
                value={closeDate}
              />
            </label>
            <label className="client-modal-wide">
              Próxima ação
              <textarea
                maxLength={2000}
                onChange={(event) => setNextAction(event.target.value)}
                placeholder="Ex.: Enviar proposta técnica até sexta-feira."
                rows={3}
                value={nextAction}
              />
            </label>
            <p className="module-footnote">
              A nova oportunidade começa em Prospecção.
            </p>
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
                disabled={saving || clients.length === 0}
                type="submit"
              >
                {saving ? 'Salvando…' : 'Criar oportunidade'}
              </button>
            </div>
          </form>
        </div>
      )}

      {historyFor && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryFor(null);
          }}
        >
          <section
            aria-label={`Histórico de ${historyFor.titulo}`}
            aria-modal="true"
            className="client-modal opportunity-history-modal"
            role="dialog"
          >
            <div className="client-modal-heading">
              <div>
                <span className="eyebrow">HISTÓRICO DA OPORTUNIDADE</span>
                <h2>{historyFor.titulo}</h2>
                <p>{historyFor.cliente_nome}</p>
              </div>
              <button
                aria-label="Fechar"
                className="modal-close"
                onClick={() => setHistoryFor(null)}
                type="button"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            {error && (
              <div className="workspace-alert" role="alert">
                {error}
              </div>
            )}
            {historyLoading ? (
              <InlineLoading label="Carregando histórico…" />
            ) : history.length === 0 ? (
              <div className="table-state">Ainda não há movimentações.</div>
            ) : (
              <ol className="opportunity-history-list">
                {history.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.tipo_evento === 'campo_alterado'
                        ? `${opportunityHistoryFieldLabel(item.campo)}: ${formatOpportunityHistoryValue(item.campo, item.valor_anterior, users, clients, item.valor_anterior_exibicao)} → ${formatOpportunityHistoryValue(item.campo, item.valor_novo, users, clients, item.valor_novo_exibicao)}`
                        : item.estagio_anterior
                          ? `${opportunityStages.find((stage) => stage.id === item.estagio_anterior)?.label ?? item.estagio_anterior} → ${opportunityStages.find((stage) => stage.id === item.estagio_novo)?.label ?? item.estagio_novo}`
                          : `Criada em ${opportunityStages.find((stage) => stage.id === item.estagio_novo)?.label ?? item.estagio_novo}`}
                    </strong>
                    <span>
                      {new Date(item.alterado_em).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}{' '}
                      · {item.usuario_nome}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
      {editingActionFor && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setEditingActionFor(null);
          }}
        >
          <form
            className="client-modal opportunity-form"
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              setError('');
              void apiRequest(token, `/api/v1/oportunidades/${editingActionFor.id}/proxima-acao`, {
                method: 'PATCH',
                body: JSON.stringify({ proxima_acao: actionDraft.trim() || null }),
              }).then(() => {
                setOpportunities((items) => items.map((item) => item.id === editingActionFor.id ? { ...item, proxima_acao: actionDraft.trim() || null } : item));
                setNotice('Próxima ação atualizada.');
                setEditingActionFor(null);
              }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a próxima ação.')).finally(() => setSaving(false));
            }}
          >
            <div className="client-modal-heading">
              <div><span className="eyebrow">OPORTUNIDADE</span><h2>Próxima ação</h2><p>{editingActionFor.titulo}</p></div>
              <button aria-label="Fechar" className="modal-close" onClick={() => setEditingActionFor(null)} type="button"><Icon name="close" size={17} /></button>
            </div>
            <label className="client-modal-wide">Ação<textarea autoFocus maxLength={2000} onChange={(event) => setActionDraft(event.target.value)} rows={4} value={actionDraft} /></label>
            <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setEditingActionFor(null)} type="button">Cancelar</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : 'Salvar ação'}</button></div>
          </form>
        </div>
      )}
      {editingOpportunity && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditingOpportunity(null); }}>
          <form className="client-modal opportunity-form" onSubmit={(event) => {
            event.preventDefault();
            if (opportunityDraft.previsao_fechamento && opportunityDraft.previsao_fechamento < getTodayDateString()) { setError('A previsão de fechamento não pode ser anterior a hoje.'); return; }
            setSaving(true); setError('');
            void apiRequest<OportunidadeCard>(token, `/api/v1/oportunidades/${editingOpportunity.id}`, { method: 'PATCH', body: JSON.stringify({ titulo: opportunityDraft.titulo.trim(), cliente_id: Number(opportunityDraft.cliente_id), responsavel_id: opportunityDraft.responsavel_id ? Number(opportunityDraft.responsavel_id) : null, valor_estimado: opportunityDraft.valor_estimado ? Number(opportunityDraft.valor_estimado) : null, previsao_fechamento: opportunityDraft.previsao_fechamento || null }) })
              .then((updated) => { setOpportunities((items) => items.map((item) => item.id === updated.id ? updated : item)); setNotice('Oportunidade atualizada.'); setEditingOpportunity(null); })
              .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a oportunidade.'))
              .finally(() => setSaving(false));
          }}>
            <div className="client-modal-heading"><div><span className="eyebrow">FUNIL COMERCIAL</span><h2>Editar oportunidade</h2></div><button aria-label="Fechar" className="modal-close" onClick={() => setEditingOpportunity(null)} type="button"><Icon name="close" size={17} /></button></div>
            {error && <div className="workspace-alert" role="alert">{error}</div>}
            <label>Nome<input maxLength={200} onChange={(event) => setOpportunityDraft((draft) => ({ ...draft, titulo: event.target.value }))} required value={opportunityDraft.titulo} /></label>
            <label>Cliente<select onChange={(event) => setOpportunityDraft((draft) => ({ ...draft, cliente_id: event.target.value }))} required value={opportunityDraft.cliente_id}>{clients.map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label>
            <label>Responsável<select onChange={(event) => setOpportunityDraft((draft) => ({ ...draft, responsavel_id: event.target.value }))} value={opportunityDraft.responsavel_id}><option value="">Sem responsável</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>
            <label>Valor estimado<input min="0" step="0.01" onChange={(event) => setOpportunityDraft((draft) => ({ ...draft, valor_estimado: event.target.value }))} type="number" value={opportunityDraft.valor_estimado} /></label>
            <label>Previsão de fechamento<input min={getTodayDateString()} onChange={(event) => setOpportunityDraft((draft) => ({ ...draft, previsao_fechamento: event.target.value }))} type="date" value={opportunityDraft.previsao_fechamento} /></label>
            <div className="modal-actions"><button className="btn btn-ghost" disabled={saving} onClick={() => setEditingOpportunity(null)} type="button">Cancelar</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : 'Salvar alterações'}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}

function IntegrationsScreen({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate: (id: ScreenId) => void;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [oneDriveConnected, setOneDriveConnected] = useState<boolean | null>(
    null
  );
  useEffect(() => {
    void apiRequest<{ connected: boolean }>(
      token,
      '/api/v1/integracoes/outlook/status'
    )
      .then((status) => setConnected(status.connected))
      .catch(() => setConnected(false));
    void apiRequest<{ connected: boolean }>(
      token,
      '/api/v1/integracoes/onedrive/status'
    )
      .then((status) => setOneDriveConnected(status.connected))
      .catch(() => setOneDriveConnected(false));
  }, [token]);
  return (
    <section className="screen-content">
      <ScreenHeading
        eyebrow="UPLINK"
        title="Integrações"
        description="Serviços conectados à sua conta SafeHub."
      />
      <div className="integration-grid">
        <article className="integration-card card">
          <div className="integration-logo outlook-logo">O</div>
          <div className="integration-card-copy">
            <span className="eyebrow">CALENDÁRIO</span>
            <h2>Microsoft Outlook</h2>
            <p>
              Conecte sua conta Microsoft para consultar e administrar sua
              própria agenda.
            </p>
            <span
              className={`integration-status${connected ? ' is-connected' : ''}`}
            >
              <i />
              {connected === null
                ? 'Verificando…'
                : connected
                  ? 'Conectado'
                  : 'Não conectado'}
            </span>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('agenda')}
            type="button"
          >
            {connected ? 'Abrir agenda' : 'Configurar'}
          </button>
        </article>
        <article className="integration-card card">
          <div className="integration-logo generic-logo"><Icon name="cloud" size={26} /></div>
          <div className="integration-card-copy">
            <span className="eyebrow">ARQUIVOS</span>
            <h2>Microsoft OneDrive</h2>
            <p>
              Consulte e abra arquivos da conta Microsoft conectada. A edição de
              planilhas fica para uma etapa posterior.
            </p>
            <span
              className={`integration-status${oneDriveConnected ? ' is-connected' : ''}`}
            >
              <i />
              {oneDriveConnected === null
                ? 'Verificando…'
                : oneDriveConnected
                  ? 'Conectado'
                  : 'Não conectado'}
            </span>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('onedrive')}
            type="button"
          >
            {oneDriveConnected ? 'Abrir arquivos' : 'Configurar'}
          </button>
        </article>
      </div>
    </section>
  );
}

function SettingsScreen({
  email,
  onSignOut,
  theme,
  onThemeChange,
}: {
  email: string;
  onSignOut: () => void;
  theme: AppTheme;
  onThemeChange: () => void;
}) {
  return (
    <section className="screen-content">
      <ScreenHeading
        eyebrow="PAINEL DE CONTROLE"
        title="Configurações"
        description="Conta e preferências do aplicativo."
      />
      <div className="settings-card card">
        <div className="settings-profile">
          <div className="settings-avatar">
            {email.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{email}</strong>
            <span>Conta autenticada pelo Supabase</span>
          </div>
        </div>
        <div className="settings-row">
          <span>Idioma</span>
          <strong>Português (Brasil)</strong>
        </div>
        <div className="settings-row">
          <span>Aparência</span>
          <button className="btn btn-ghost" onClick={onThemeChange} type="button">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            Modo {theme === 'dark' ? 'escuro' : 'claro'}
          </button>
        </div>
        <div className="settings-row">
          <span>Agenda pessoal</span>
          <strong>Microsoft Outlook</strong>
        </div>
        <button
          className="btn btn-ghost settings-signout"
          onClick={onSignOut}
          type="button"
        >
          Sair da conta
        </button>
      </div>
    </section>
  );
}

export default function WorkspaceScreen({
  accessToken,
  email,
  onSignOut,
}: {
  accessToken: string;
  email: string;
  onSignOut: () => void;
}) {
  const { section } = useParams<{ section: string }>();
  const routerNavigate = useRouterNavigate();
  const screen = (section === 'kanban' ? 'oportunidades' : section) as ScreenId;
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<AppTheme>(() => getSavedTheme());
  const [clientCount, setClientCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profile, setProfile] = useState<{
    nome: string;
    cargo: string | null;
  } | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  }

  const countClients = useCallback(
    (count: number) => setClientCount(count),
    []
  );
  useEffect(() => {
    void apiRequest<{ nome: string; cargo: string | null }>(
      accessToken,
      '/api/v1/usuarios/me'
    )
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoaded(true));
    void apiRequest<{ pagination: { total: number } }>(
      accessToken,
      '/api/v1/clientes?limit=1&offset=0'
    )
      .then((result) => setClientCount(result.pagination?.total ?? 0))
      .catch(() => undefined);
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
  if ((screen === 'admin' || screen === 'equipes') && !profileLoaded) {
    return (
      <main className="startup-screen">
        <span className="loading-dot" />
        <p>Verificando acesso administrativo…</p>
      </main>
    );
  }
  if (
    (screen === 'admin' || screen === 'equipes') &&
    profile?.cargo !== 'Administrador'
  ) {
    return <Navigate to="/app/home" replace />;
  }

  return (
    <div className="safehub-app">
      <aside className={`app-sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
        <Link
          className="app-brand"
          to="/app/home"
          onClick={() => setMobileNavOpen(false)}
        >
          <svg
            aria-hidden="true"
            className="brand-mark app-brand-symbol"
            viewBox="0 0 32 32"
            fill="none"
          >
            <circle
              cx="16"
              cy="16"
              r="11.5"
              stroke="#EAF1F4"
              strokeWidth="1.5"
              strokeDasharray="2.6 2.6"
            />
            <line
              x1="16"
              y1="2"
              x2="16"
              y2="5"
              stroke="#EAF1F4"
              strokeWidth="1.4"
            />
            <line
              x1="16"
              y1="27"
              x2="16"
              y2="30"
              stroke="#EAF1F4"
              strokeWidth="1.4"
            />
            <line
              x1="2"
              y1="16"
              x2="5"
              y2="16"
              stroke="#EAF1F4"
              strokeWidth="1.4"
            />
            <line
              x1="27"
              y1="16"
              x2="30"
              y2="16"
              stroke="#EAF1F4"
              strokeWidth="1.4"
            />
            <ellipse
              cx="16"
              cy="16"
              rx="13.5"
              ry="4.2"
              stroke="#2FC7DE"
              strokeWidth="1.8"
              transform="rotate(-24 16 16)"
            />
            <circle cx="16" cy="16" r="5" fill="#EAF1F4" />
          </svg>
          <span>
            <strong>SafeHub</strong>
            <small>SAFE ON ORBIT · 2026</small>
          </span>
        </Link>
        <nav aria-label="Navegação principal" className="primary-nav">
          {navigation
            .filter(
              (item) =>
                !['admin', 'equipes'].includes(item.id) ||
                profile?.cargo === 'Administrador'
            )
            .map((item) => (
              <div key={item.id}>
                {item.id === 'admin' && (
                  <span className="nav-eyebrow nav-eyebrow-spacer">
                    Sistema
                  </span>
                )}
                <NavLink
                  aria-label={item.label}
                  className={({ isActive }) =>
                    `nav-btn${isActive ? ' active' : ''}`
                  }
                  onClick={() => setMobileNavOpen(false)}
                  to={`/app/${item.id}`}
                  title={item.label}
                >
                  <span aria-hidden="true" className="nav-icon">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              </div>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-avatar">
            {email.slice(0, 1).toUpperCase()}
          </div>
          <div className="sidebar-user">
            <strong>{email.split('@')[0]}</strong>
            <span>Conta SafeHub</span>
          </div>
          <button
            aria-label="Sair"
            className="sidebar-logout"
            onClick={onSignOut}
            title="Sair"
            type="button"
          >
            <Icon name="arrow-up-right" size={17} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <button
            aria-label="Abrir menu"
            className="mobile-menu-button"
            onClick={() => setMobileNavOpen((open) => !open)}
            type="button"
          >
            <Icon name="menu" size={19} />
          </button>
          <form className="global-search" onSubmit={submitSearch}>
            <Icon name="search" size={16} />
            <input
              aria-label="Buscar"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar clientes, projetos, documentos…"
              value={search}
            />
            <button aria-label="Pesquisar" type="submit">
              <Icon name="arrow-right" size={16} />
            </button>
          </form>
          <div className="topbar-right">
            <span className="topbar-email">{email}</span>
            <button
              aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
              aria-pressed={theme === 'dark'}
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
              type="button"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            <button
              aria-label="Abrir configurações"
              className="topbar-avatar"
              onClick={() => navigate('config')}
              type="button"
            >
              {email.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main className="app-content">
          {screen === 'home' && (
            <OverviewScreen
              token={accessToken}
              email={email}
              clientCount={clientCount}
              onNavigate={navigate}
            />
          )}
          {screen === 'crm' && (
            <CustomersScreen
              token={accessToken}
              initialSearch={search}
              onCountChange={countClients}
            />
          )}
          {screen === 'oportunidades' && (
            <OpportunitiesScreen token={accessToken} />
          )}
          {screen === 'editais' && <EditaisScreen />}
          {screen === 'projetos' && <ProjectsScreen />}
          {screen === 'documentos' && <DocumentsScreen token={accessToken} />}
          {screen === 'agenda' && (
            <section className="screen-content">
              <OutlookCalendarPanel accessToken={accessToken} />
            </section>
          )}
          {screen === 'onedrive' && <OneDriveScreen token={accessToken} />}
          {screen === 'integracoes' && (
            <IntegrationsScreen token={accessToken} onNavigate={navigate} />
          )}
          {screen === 'admin' && profile?.cargo === 'Administrador' && (
            <AdminUsersScreen token={accessToken} />
          )}
          {screen === 'equipes' && profile?.cargo === 'Administrador' && (
            <TeamsScreen token={accessToken} />
          )}
          {screen === 'config' && (
            <SettingsScreen email={email} onSignOut={onSignOut} onThemeChange={toggleTheme} theme={theme} />
          )}
        </main>
      </div>
    </div>
  );
}
