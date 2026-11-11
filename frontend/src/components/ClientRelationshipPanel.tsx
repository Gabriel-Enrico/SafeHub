import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SubmitEvent,
} from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';
import { isValidEmail, isValidPhone, maskPhone } from '../utils/masks';
import TaskDetailsDialog, { type TaskDetails } from './TaskDetailsDialog';

type Client = {
  id: number;
  nome: string;
  setor?: string | null;
  pais?: string | null;
  site?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  origem_relacionamento?: string | null;
  proxima_acao?: string | null;
  ultima_interacao_em?: string | null;
  status_pipeline?: string | null;
  responsavel_id?: number | null;
  responsavel_nome?: string | null;
};
type Interaction = {
  id: number;
  tipo: string;
  titulo?: string;
  data_inicio?: string | null;
  data_fim?: string | null;
  status_relacionado?: string | null;
  proxima_acao?: string | null;
  resumo: string;
  criado_em: string;
  responsavel_nome: string;
  contato_id: number | null;
  contato_nome: string | null;
  responsavel_id?: number;
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
type ContactRecord = {
  id: number;
  cliente_id: number;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  criado_em: string;
};
type ContactDraft = {
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
};
type SafeUser = { id: number; nome: string };
type TeamRecord = { id: number; nome: string };
type ClientTask = {
  id: number;
  cliente_id: number;
  interacao_id: number | null;
  titulo: string;
  descricao: string | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  solicitante_nome: string | null;
  prazo: string | null;
  prioridade: string;
  status: string;
  criado_em: string | null;
  origem: 'interacao' | 'projeto';
  projeto_nome: string | null;
  equipe_id: number | null;
  equipe_nome: string | null;
};
type Opportunity = {
  id: number;
  titulo: string;
  estagio: string;
  valor_estimado: number | string | null;
  previsao_fechamento: string | null;
  responsavel_nome: string | null;
};

const labels: Record<string, string> = {
  reuniao: 'Reunião',
  ligacao: 'Ligação',
  email: 'E-mail',
  mensagem: 'Mensagem',
  solicitacao: 'Solicitação',
  outro: 'Outro',
};

async function apiRequest<T>(
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
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : `A API respondeu com HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

function formattedDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function localDateInput(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function readableSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientRelationshipPanel({
  client,
  token,
  onClose,
  onEdit,
  users,
}: {
  client: Client;
  token: string;
  onClose: () => void;
  onEdit: () => void;
  users: SafeUser[];
}) {
  const [tab, setTab] = useState<
    | 'overview'
    | 'history'
    | 'meetings'
    | 'opportunities'
    | 'documents'
    | 'tasks'
  >('overview');
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskDetails | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<SafeUser[]>(users);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [selectedSafeIds, setSelectedSafeIds] = useState<number[]>([]);
  const [contactDraft, setContactDraft] = useState<ContactDraft>({
    nome: '',
    cargo: '',
    email: '',
    telefone: '',
  });
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(
    null
  );
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedInteractionId, setExpandedInteractionId] = useState<
    number | null
  >(null);
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tipo, setTipo] = useState('reuniao');
  const [interactionTitle, setInteractionTitle] = useState('');
  const [interactionDate, setInteractionDate] = useState(() =>
    localDateInput()
  );
  const [interactionStart, setInteractionStart] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:00`;
  });
  const [interactionEnd, setInteractionEnd] = useState(() => {
    return `${String(new Date().getHours()).padStart(2, '0')}:30`;
  });
  const [interactionStatus, setInteractionStatus] =
    useState('reuniao_realizada');
  const [nextAction, setNextAction] = useState('');
  const [assignTask, setAssignTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskTeamId, setTaskTeamId] = useState('');
  const [taskResponsibleIds, setTaskResponsibleIds] = useState<string[]>([]);
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskPriority, setTaskPriority] = useState('media');
  const [taskStatus, setTaskStatus] = useState('a_fazer');
  const [resumo, setResumo] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [taskValidationError, setTaskValidationError] = useState('');
  const [notice, setNotice] = useState('');
  const [creatingInteraction, setCreatingInteraction] = useState(false);

  const loadInteractions = useCallback(
    async (typeOverride?: string) => {
      setLoading(true);
      setError('');
      try {
        const type = typeOverride ?? filter;
        const query = type ? `?tipo=${encodeURIComponent(type)}` : '';
        const result = await apiRequest<{ data: Interaction[] }>(
          token,
          `/api/v1/clientes/${client.id}/interacoes${query}`
        );
        setInteractions(result.data ?? []);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar o histórico.'
        );
      } finally {
        setLoading(false);
      }
    },
    [client.id, filter, token]
  );

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ data: DocumentRecord[] }>(
        token,
        `/api/v1/clientes/${client.id}/documentos`
      );
      setDocuments(result.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar os documentos.'
      );
    } finally {
      setLoading(false);
    }
  }, [client.id, token]);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ data: ContactRecord[] }>(
        token,
        `/api/v1/clientes/${client.id}/contatos`
      );
      setContacts(result.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar os contatos.'
      );
    } finally {
      setContactsLoading(false);
    }
  }, [client.id, token]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ data: ClientTask[] }>(
        token,
        `/api/v1/clientes/${client.id}/tarefas`
      );
      setTasks(result.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar as tarefas.'
      );
    } finally {
      setLoading(false);
    }
  }, [client.id, token]);

  const loadOpportunities = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{
        data: Array<Opportunity & { cliente_id: number }>;
      }>(token, '/api/v1/oportunidades');
      setOpportunities(
        (result.data ?? []).filter((item) => item.cliente_id === client.id)
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar as oportunidades.'
      );
    } finally {
      setLoading(false);
    }
  }, [client.id, token]);

  useEffect(() => {
    if (tab === 'overview') {
      void loadContacts();
      void loadInteractions('');
      void loadDocuments();
      void loadTasks();
      void loadOpportunities();
    } else if (tab === 'history') {
      void loadContacts();
      void loadInteractions('');
    } else if (tab === 'meetings') {
      void loadInteractions('reuniao');
    } else if (tab === 'opportunities') void loadOpportunities();
    else if (tab === 'documents') void loadDocuments();
    else void loadTasks();
  }, [
    tab,
    loadContacts,
    loadDocuments,
    loadInteractions,
    loadTasks,
    loadOpportunities,
  ]);

  const filteredInteractions = useMemo(
    () =>
      interactions.filter((item) => {
        const occurred = item.data_inicio ?? item.criado_em;
        const day = occurred.slice(0, 10);
        return (
          (!responsibleFilter ||
            String(item.responsavel_id ?? '') === responsibleFilter) &&
          (!dateFrom || day >= dateFrom) &&
          (!dateTo || day <= dateTo)
        );
      }),
    [interactions, responsibleFilter, dateFrom, dateTo]
  );

  useEffect(() => {
    setSelectedContactIds([]);
    setSelectedSafeIds([]);
    setContacts([]);
    setEditingContact(null);
    setContactFormOpen(false);
    setContactDraft({ nome: '', cargo: '', email: '', telefone: '' });
  }, [client.id]);

  useEffect(() => {
    let active = true;
    apiRequest<{ data: TeamRecord[] }>(token, '/api/v1/projetos/equipes')
      .then((result) => {
        if (active) setTeams(result.data ?? []);
      })
      .catch(() => {
        if (active) setTeams([]);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (teams.length === 1) setTaskTeamId(String(teams[0].id));
  }, [teams]);

  useEffect(() => {
    let active = true;
    setTaskAssignees([]);
    const path = taskTeamId
      ? `/api/v1/projetos/equipes/${taskTeamId}/usuarios`
      : '/api/v1/clientes/responsaveis';
    apiRequest<{ data: SafeUser[] }>(token, path)
      .then((result) => {
        if (active) setTaskAssignees(result.data ?? []);
      })
      .catch((cause) => {
        if (active) {
          setTaskAssignees([]);
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar responsáveis.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, [taskTeamId, token]);

  async function saveContact(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contactDraft.email.trim() && !isValidEmail(contactDraft.email)) {
      setError('Informe um e-mail válido (exemplo: usuario@dominio.com).');
      return;
    }
    if (contactDraft.telefone.trim() && !isValidPhone(contactDraft.telefone)) {
      setError('Informe um telefone válido com DDD (10 ou 11 dígitos).');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body = {
        nome: contactDraft.nome.trim(),
        cargo: contactDraft.cargo.trim() || null,
        email: contactDraft.email.trim() || null,
        telefone: contactDraft.telefone.trim() || null,
      };
      if (editingContact) {
        await apiRequest(
          token,
          `/api/v1/clientes/${client.id}/contatos/${editingContact.id}`,
          { method: 'PATCH', body: JSON.stringify(body) }
        );
        setNotice('Contato atualizado.');
      } else {
        await apiRequest(token, `/api/v1/clientes/${client.id}/contatos`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setNotice('Contato cadastrado.');
      }
      setContactDraft({ nome: '', cargo: '', email: '', telefone: '' });
      setEditingContact(null);
      setContactFormOpen(false);
      await loadContacts();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o contato.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveContact(contact: ContactRecord) {
    if (!window.confirm(`Remover ${contact.nome} da lista de contatos ativos?`))
      return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(
        token,
        `/api/v1/clientes/${client.id}/contatos/${contact.id}`,
        { method: 'DELETE' }
      );
      if (editingContact?.id === contact.id) {
        setEditingContact(null);
        setContactDraft({ nome: '', cargo: '', email: '', telefone: '' });
      }
      setSelectedContactIds((items) => items.filter((id) => id !== contact.id));
      setNotice('Contato arquivado.');
      await loadContacts();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível arquivar o contato.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveInteraction(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskValidationError('');
    if (assignTask && !taskTitle.trim()) {
      setTaskValidationError(
        'Informe um título para a tarefa antes de salvar a interação.'
      );
      return;
    }
    if (assignTask && taskDeadline && taskDeadline < localDateInput()) {
      setTaskValidationError(
        'O prazo informado já passou. Escolha hoje ou uma data futura.'
      );
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const start = new Date(`${interactionDate}T${interactionStart}`);
      const end = new Date(`${interactionDate}T${interactionEnd}`);
      if (end <= start)
        throw new Error('O horário de término deve ser posterior ao início.');
      const created = await apiRequest<{ id: number }>(
        token,
        `/api/v1/clientes/${client.id}/interacoes`,
        {
          method: 'POST',
          body: JSON.stringify({
            tipo,
            titulo: interactionTitle.trim(),
            data_inicio: start.toISOString(),
            data_fim: end.toISOString(),
            resumo: resumo.trim(),
            contato_id: selectedContactIds[0] ?? null,
            participantes_cliente_ids: selectedContactIds,
            participantes_safe_ids: selectedSafeIds,
            status_relacionado: interactionStatus,
            proxima_acao: nextAction.trim() || null,
            tarefa: assignTask
              ? {
                  titulo: taskTitle.trim(),
                  descricao: taskDescription.trim() || null,
                  responsaveis_ids: taskResponsibleIds.map(Number),
                  responsavel_id: taskResponsibleIds[0]
                    ? Number(taskResponsibleIds[0])
                    : null,
                  equipe_id: taskTeamId ? Number(taskTeamId) : null,
                  prazo: taskDeadline || null,
                  prioridade: taskPriority,
                  status: taskStatus,
                }
              : null,
          }),
        }
      );
      let failedUploads = 0;
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          await apiRequest(
            token,
            `/api/v1/clientes/${client.id}/documentos?interacao_id=${created.id}`,
            { method: 'POST', body: formData }
          );
        } catch {
          failedUploads += 1;
        }
      }
      setResumo('');
      setInteractionTitle('');
      setNextAction('');
      setTaskTitle('');
      setTaskDescription('');
      setSelectedFiles([]);
      setAssignTask(false);
      setNotice(
        failedUploads
          ? `Interação registrada. Não foi possível anexar ${failedUploads} arquivo(s).`
          : 'Interação registrada no histórico.'
      );
      setCreatingInteraction(false);
      await loadInteractions();
      if (assignTask) await loadTasks();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Não foi possível registrar a interação.';
      if (assignTask) setTaskValidationError(message);
      else setError(message);
    } finally {
      setSaving(false);
    }
  }

  function startNewInteraction() {
    const now = new Date();
    setTipo('reuniao');
    setInteractionTitle('');
    setInteractionDate(localDateInput(now));
    setInteractionStart(`${String(now.getHours()).padStart(2, '0')}:00`);
    setInteractionEnd(`${String(now.getHours()).padStart(2, '0')}:30`);
    setInteractionStatus('reuniao_realizada');
    setNextAction('');
    setAssignTask(false);
    setTaskTitle('');
    setTaskDescription('');
    setTaskTeamId('');
    setTaskResponsibleIds([]);
    setTaskDeadline('');
    setTaskPriority('media');
    setTaskStatus('a_fazer');
    setResumo('');
    setSelectedFiles([]);
    setSelectedContactIds([]);
    setSelectedSafeIds([]);
    setCreatingInteraction(true);
    setError('');
    setNotice('');
    void loadContacts();
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
      await apiRequest(token, `/api/v1/clientes/${client.id}/documentos`, {
        method: 'POST',
        body: formData,
      });
      setSelectedFile(null);
      formElement.reset();
      setNotice('Documento enviado para o cliente.');
      await loadDocuments();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível enviar o documento.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function openDocument(id: number) {
    setError('');
    try {
      const result = await apiRequest<{ url: string }>(
        token,
        `/api/v1/documentos/${id}/download`
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível abrir o documento.'
      );
    }
  }

  const statusCodes: Record<string, string> = {
    novo: 'Prospecção',
    prospeccao: 'Prospecção',
    contato: 'Em contato',
    proposta: 'Proposta',
    fechado: 'Parceiro',
    perdido: 'Perdido',
  };
  const statusText =
    statusCodes[
      (client.status_pipeline ?? 'novo').toLocaleLowerCase('pt-BR')
    ] ??
    client.status_pipeline ??
    'Prospecção';
  const initials = client.nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('pt-BR');

  return (
    <section
      aria-label={`Relacionamento com ${client.nome}`}
      className={`screen-content client-detail-screen${creatingInteraction ? ' interaction-is-open' : ''}`}
    >
      <div className="client-breadcrumb">
        <button onClick={onClose} type="button">
          ‹ &nbsp;Clientes
        </button>
        <span>/</span>
        <strong>{client.nome}</strong>
      </div>
      <header className="client-profile-header">
        <div className="client-profile-identity">
          <span className="client-profile-logo">{initials}</span>
          <div>
            <div className="client-title-line">
              <h1>{client.nome}</h1>
              <span className="client-company-tag">
                {client.setor || 'Organização'}
              </span>
            </div>
            <p>
              {client.setor || 'Setor não informado'}
              {client.pais ? <> · 🌐 {client.pais}</> : ''}
            </p>
          </div>
        </div>
        <div className="client-profile-actions">
          <button className="btn btn-primary" onClick={onEdit} type="button">
            Editar cliente
          </button>
          <button
            aria-label="Mais opções"
            className="client-more-button"
            type="button"
          >
            ···
          </button>
        </div>
      </header>
      <p className="client-description-line">
        {client.site && (
          <a href={client.site} rel="noreferrer" target="_blank">
            {client.site}
          </a>
        )}
        {client.origem_relacionamento
          ? `${client.site ? ' · ' : ''}Origem: ${client.origem_relacionamento}`
          : ''}
        {client.observacoes
          ? `${client.site || client.origem_relacionamento ? ' · ' : ''}${client.observacoes}`
          : ''}
      </p>
      <nav aria-label="Abas do cliente" className="client-detail-tabs">
        <button
          className={tab === 'overview' ? 'active' : ''}
          onClick={() => {
            setTab('overview');
            setError('');
            setNotice('');
            setCreatingInteraction(false);
          }}
          type="button"
        >
          Visão geral
        </button>
        <button
          className={tab === 'history' ? 'active' : ''}
          onClick={() => {
            setTab('history');
            setError('');
            setNotice('');
            setCreatingInteraction(false);
          }}
          type="button"
        >
          Histórico de interações
        </button>
        <button
          className={tab === 'meetings' ? 'active' : ''}
          onClick={() => {
            setTab('meetings');
            setError('');
            setNotice('');
            setCreatingInteraction(false);
          }}
          type="button"
        >
          Reuniões
        </button>
        <button
          className={tab === 'opportunities' ? 'active' : ''}
          onClick={() => {
            setTab('opportunities');
            setError('');
            setNotice('');
            setCreatingInteraction(false);
          }}
          type="button"
        >
          Oportunidades
        </button>
        <button
          className={tab === 'documents' ? 'active' : ''}
          onClick={() => {
            setTab('documents');
            setError('');
            setNotice('');
            setCreatingInteraction(false);
          }}
          type="button"
        >
          Documentos
        </button>
        <button
          className={tab === 'tasks' ? 'active' : ''}
          onClick={() => {
            setTab('tasks');
            setError('');
            setNotice('');
            setCreatingInteraction(false);
          }}
          type="button"
        >
          Tarefas
        </button>
      </nav>
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

      {tab === 'overview' ? (
        <div className="client-overview-grid">
          <article className="client-overview-card client-company-info">
            <h3>Informações principais</h3>
            <dl>
              <div>
                <dt>Site</dt>
                <dd>
                  {client.site ? (
                    <a href={client.site} rel="noreferrer" target="_blank">
                      {client.site}
                    </a>
                  ) : (
                    'Não informado'
                  )}
                </dd>
              </div>
              <div>
                <dt>Setor</dt>
                <dd>{client.setor || 'Não informado'}</dd>
              </div>
              <div>
                <dt>País</dt>
                <dd>{client.pais || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Endereço</dt>
                <dd>{client.endereco || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Observações</dt>
                <dd>{client.observacoes || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Origem do relacionamento</dt>
                <dd>{client.origem_relacionamento || 'Não informada'}</dd>
              </div>
            </dl>
          </article>
          <article className="client-overview-card client-status-card">
            <h3>Status e responsável</h3>
            <div>
              <small>Status atual</small>
              <span className="status-pill">{statusText}</span>
            </div>
            <div>
              <small>Responsável interno</small>
              <strong>{client.responsavel_nome || 'Não atribuído'}</strong>
            </div>
            <button
              className="client-next-action"
              onClick={() => {
                setTab('history');
                startNewInteraction();
              }}
              type="button"
            >
              <span>Próxima ação</span>
              <strong>
                {client.proxima_acao || 'Registrar próxima ação →'}
              </strong>
            </button>
          </article>
          <article className="client-overview-card client-contacts-card">
            <div className="client-overview-card-heading">
              <h3>Contatos principais</h3>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingContact(null);
                  setContactDraft({
                    nome: '',
                    cargo: '',
                    email: '',
                    telefone: '',
                  });
                  setContactFormOpen(true);
                }}
                type="button"
              >
                ＋ Adicionar
              </button>
            </div>
            {contactsLoading ? (
              <div className="table-state">Carregando contatos…</div>
            ) : contacts.length === 0 ? (
              <div className="client-empty-contacts">
                <span>♙</span>
                <p>Nenhuma pessoa de contato cadastrada.</p>
                <button
                  className="text-button"
                  onClick={() => setContactFormOpen(true)}
                  type="button"
                >
                  Adicionar primeiro contato
                </button>
              </div>
            ) : (
              <div className="contact-list">
                {contacts.map((contact) => (
                  <article className="contact-list-item" key={contact.id}>
                    <div className="contact-avatar">
                      {contact.nome
                        .trim()
                        .slice(0, 1)
                        .toLocaleUpperCase('pt-BR')}
                    </div>
                    <div className="contact-copy">
                      <strong>{contact.nome}</strong>
                      <small>{contact.cargo || 'Cargo não informado'}</small>
                      <span>
                        {contact.email || 'Sem e-mail'}
                        {contact.telefone ? ` · ${contact.telefone}` : ''}
                      </span>
                    </div>
                    <div className="contact-card-actions">
                      <button
                        aria-label={`Editar ${contact.nome}`}
                        disabled={saving}
                        onClick={() => {
                          setEditingContact(contact);
                          setContactDraft({
                            nome: contact.nome,
                            cargo: contact.cargo ?? '',
                            email: contact.email ?? '',
                            telefone: contact.telefone ?? '',
                          });
                          setContactFormOpen(true);
                        }}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        aria-label={`Arquivar ${contact.nome}`}
                        disabled={saving}
                        onClick={() => void archiveContact(contact)}
                        type="button"
                      >
                        Arquivar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {contactFormOpen && (
              <form
                className="contact-form client-contact-editor"
                onSubmit={(event) => void saveContact(event)}
              >
                <h3>
                  {editingContact
                    ? 'Editar pessoa de contato'
                    : 'Adicionar pessoa de contato'}
                </h3>
                <div className="contact-form-grid">
                  <label>
                    Nome
                    <input
                      id="client-contact-name"
                      autoComplete="name"
                      autoFocus
                      maxLength={200}
                      onChange={(event) =>
                        setContactDraft({
                          ...contactDraft,
                          nome: event.target.value,
                        })
                      }
                      required
                      value={contactDraft.nome}
                    />
                  </label>
                  <label>
                    Cargo
                    <input
                      maxLength={160}
                      onChange={(event) =>
                        setContactDraft({
                          ...contactDraft,
                          cargo: event.target.value,
                        })
                      }
                      value={contactDraft.cargo}
                    />
                  </label>
                  <label>
                    E-mail
                    <input
                      autoComplete="email"
                      maxLength={320}
                      onChange={(event) =>
                        setContactDraft({
                          ...contactDraft,
                          email: event.target.value,
                        })
                      }
                      type="email"
                      value={contactDraft.email}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      autoComplete="tel"
                      maxLength={15}
                      onChange={(event) =>
                        setContactDraft({
                          ...contactDraft,
                          telefone: maskPhone(event.target.value),
                        })
                      }
                      placeholder="(11) 98765-4321"
                      type="tel"
                      value={contactDraft.telefone}
                    />
                  </label>
                </div>
                <div className="contact-form-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setEditingContact(null);
                      setContactDraft({
                        nome: '',
                        cargo: '',
                        email: '',
                        telefone: '',
                      });
                      setContactFormOpen(false);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={saving || !contactDraft.nome.trim()}
                    type="submit"
                  >
                    {saving
                      ? 'Salvando…'
                      : editingContact
                        ? 'Salvar contato'
                        : 'Adicionar contato'}
                  </button>
                </div>
              </form>
            )}
          </article>
          <div className="client-profile-stats">
            {[
              {
                label: 'Interações',
                value: interactions.length,
                tab: 'history' as const,
              },
              {
                label: 'Reuniões',
                value: interactions.filter((item) => item.tipo === 'reuniao')
                  .length,
                tab: 'meetings' as const,
              },
              {
                label: 'Oportunidades',
                value: opportunities.length,
                tab: 'opportunities' as const,
              },
              {
                label: 'Documentos',
                value: documents.length,
                tab: 'documents' as const,
              },
              { label: 'Tarefas', value: tasks.length, tab: 'tasks' as const },
            ].map((metric) => (
              <button
                className="client-profile-stat"
                key={metric.label}
                onClick={() => setTab(metric.tab)}
                type="button"
              >
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : tab === 'history' || tab === 'meetings' ? (
        <div className="client-history-view">
          {creatingInteraction ? (
            <section className="client-interaction-editor">
              <div className="interaction-create-breadcrumb">
                <button
                  onClick={() => setCreatingInteraction(false)}
                  type="button"
                >
                  Clientes
                </button>
                <span>›</span>
                <button
                  onClick={() => setCreatingInteraction(false)}
                  type="button"
                >
                  {client.nome}
                </button>
                <span>›</span>
                <strong>Nova interação</strong>
              </div>
              <div className="client-interaction-editor-heading">
                <div>
                  <span className="eyebrow">CRM · RELACIONAMENTO</span>
                  <h2>Registrar interação</h2>
                  <p>Adicione uma nova atividade com este cliente.</p>
                </div>
                <button
                  className="btn btn-ghost interaction-cancel-top"
                  onClick={() => setCreatingInteraction(false)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
              <form onSubmit={(event) => void saveInteraction(event)}>
                <div className="interaction-type-picker">
                  {[
                    ['reuniao', '▦', 'Reunião'],
                    ['ligacao', '⌕', 'Ligação'],
                    ['email', '✉', 'E-mail'],
                    ['mensagem', '▢', 'Mensagem'],
                    ['solicitacao', '♧', 'Solicitação'],
                    ['outro', '···', 'Outro'],
                  ].map(([value, icon, label]) => (
                    <button
                      className={tipo === value ? 'active' : ''}
                      key={value}
                      onClick={() => {
                        setTipo(value);
                        setInteractionStatus(
                          (
                            {
                              reuniao: 'reuniao_realizada',
                              ligacao: 'ligacao_realizada',
                              email: 'email_enviado',
                              mensagem: 'mensagem_enviada',
                              solicitacao: 'solicitacao_aberta',
                              outro: 'concluida',
                            } as Record<string, string>
                          )[value]
                        );
                      }}
                      type="button"
                    >
                      <span>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="interaction-form-columns">
                  <div className="interaction-main-fields">
                    <div className="interaction-date-row">
                      <label>
                        Data
                        <input
                          onChange={(event) =>
                            setInteractionDate(event.target.value)
                          }
                          required
                          type="date"
                          value={interactionDate}
                        />
                      </label>
                      <label>
                        Início
                        <input
                          onChange={(event) =>
                            setInteractionStart(event.target.value)
                          }
                          required
                          type="time"
                          value={interactionStart}
                        />
                      </label>
                      <span className="interaction-time-separator">até</span>
                      <label>
                        Término
                        <input
                          onChange={(event) =>
                            setInteractionEnd(event.target.value)
                          }
                          required
                          type="time"
                          value={interactionEnd}
                        />
                      </label>
                      <label className="team-calendar-check">
                        <input
                          disabled
                          title="A agenda compartilhada da equipe ainda não está conectada."
                          type="checkbox"
                        />
                        Adicionar à agenda da equipe
                      </label>
                    </div>
                    <label className="interaction-summary-field">
                      Título
                      <input
                        className="interaction-title-input"
                        maxLength={250}
                        onChange={(event) =>
                          setInteractionTitle(event.target.value)
                        }
                        placeholder="Ex.: Reunião de acompanhamento"
                        required
                        value={interactionTitle}
                      />
                    </label>
                    <fieldset className="participant-picker">
                      <legend>Participantes (SafeHub)</legend>
                      <div>
                        {users.map((user) => (
                          <label
                            className={
                              selectedSafeIds.includes(user.id)
                                ? 'selected'
                                : ''
                            }
                            key={user.id}
                          >
                            <input
                              checked={selectedSafeIds.includes(user.id)}
                              onChange={(event) =>
                                setSelectedSafeIds((items) =>
                                  event.target.checked
                                    ? [...items, user.id]
                                    : items.filter((id) => id !== user.id)
                                )
                              }
                              type="checkbox"
                            />
                            <span className="participant-avatar">
                              {user.nome.slice(0, 2).toLocaleUpperCase('pt-BR')}
                            </span>
                            {user.nome}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="participant-picker">
                      <legend>Participantes (cliente)</legend>
                      <div>
                        {contacts.map((contact) => (
                          <label
                            className={
                              selectedContactIds.includes(contact.id)
                                ? 'selected'
                                : ''
                            }
                            key={contact.id}
                          >
                            <input
                              checked={selectedContactIds.includes(contact.id)}
                              onChange={(event) =>
                                setSelectedContactIds((items) =>
                                  event.target.checked
                                    ? [...items, contact.id]
                                    : items.filter((id) => id !== contact.id)
                                )
                              }
                              type="checkbox"
                            />
                            <span className="participant-avatar client-participant-avatar">
                              {contact.nome
                                .slice(0, 1)
                                .toLocaleUpperCase('pt-BR')}
                            </span>
                            {contact.nome}
                          </label>
                        ))}
                        {contacts.length === 0 && (
                          <span className="participant-empty">
                            Cadastre pessoas na visão geral para adicioná-las
                            aqui.
                          </span>
                        )}
                      </div>
                    </fieldset>
                    <label className="interaction-summary-field">
                      Resumo da interação
                      <textarea
                        maxLength={5000}
                        onChange={(event) => setResumo(event.target.value)}
                        placeholder="Registre os temas tratados, decisões e próximos passos…"
                        required
                        rows={7}
                        value={resumo}
                      />
                    </label>
                  </div>
                  <aside className="interaction-side-fields">
                    <label>
                      Status relacionado
                      <select
                        onChange={(event) =>
                          setInteractionStatus(event.target.value)
                        }
                        value={interactionStatus}
                      >
                        <option value="reuniao_realizada">
                          Reunião realizada
                        </option>
                        <option value="ligacao_realizada">
                          Ligação realizada
                        </option>
                        <option value="email_enviado">E-mail enviado</option>
                        <option value="mensagem_enviada">
                          Mensagem enviada
                        </option>
                        <option value="solicitacao_aberta">
                          Solicitação aberta
                        </option>
                        <option value="aguardando_resposta">
                          Aguardando resposta
                        </option>
                        <option value="concluida">Concluída</option>
                      </select>
                    </label>
                    <label>
                      Próxima ação
                      <textarea
                        maxLength={5000}
                        onChange={(event) => setNextAction(event.target.value)}
                        placeholder="Ex.: Enviar proposta técnica até 05/11."
                        rows={3}
                        value={nextAction}
                      />
                    </label>
                    <label className="interaction-task-toggle">
                      <span>
                        <strong>Atribuir tarefa</strong>
                        <small>
                          Criar uma pendência vinculada a esta interação
                        </small>
                      </span>
                      <input
                        checked={assignTask}
                        onChange={(event) =>
                          setAssignTask(event.target.checked)
                        }
                        type="checkbox"
                      />
                    </label>
                    {assignTask && (
                      <div className="interaction-task-fields">
                        {taskValidationError && (
                          <p className="interaction-task-error" role="alert">
                            {taskValidationError}
                          </p>
                        )}
                        <label>
                          Título da tarefa
                          <input
                            maxLength={250}
                            onChange={(event) => {
                              setTaskTitle(event.target.value);
                              setTaskValidationError('');
                            }}
                            value={taskTitle}
                          />
                        </label>
                        <label>
                          Contexto
                          <textarea
                            maxLength={5000}
                            onChange={(event) =>
                              setTaskDescription(event.target.value)
                            }
                            rows={3}
                            value={taskDescription}
                          />
                        </label>
                        <label>
                          Equipe
                          <select
                            onChange={(event) => {
                              setTaskTeamId(event.target.value);
                              setTaskResponsibleIds([]);
                              setTaskValidationError('');
                            }}
                            value={taskTeamId}
                          >
                            <option value="">Equipe do responsável</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <fieldset className="interaction-task-assignees">
                          <legend>Responsáveis</legend>
                          {taskAssignees.length ? (
                            taskAssignees.map((user) => (
                              <label key={user.id}>
                                <input
                                  checked={taskResponsibleIds.includes(
                                    String(user.id)
                                  )}
                                  onChange={(event) => {
                                    setTaskResponsibleIds((current) =>
                                      event.target.checked
                                        ? [...current, String(user.id)]
                                        : current.filter(
                                            (id) => id !== String(user.id)
                                          )
                                    );
                                    setTaskValidationError('');
                                  }}
                                  type="checkbox"
                                />
                                {user.nome}
                              </label>
                            ))
                          ) : (
                            <span>Nenhum membro ativo nesta equipe.</span>
                          )}
                        </fieldset>
                        <label>
                          Prazo
                          <input
                            min={localDateInput()}
                            onChange={(event) => {
                              setTaskDeadline(event.target.value);
                              setTaskValidationError('');
                            }}
                            type="date"
                            value={taskDeadline}
                          />
                        </label>
                        <label>
                          Prioridade
                          <select
                            onChange={(event) =>
                              setTaskPriority(event.target.value)
                            }
                            value={taskPriority}
                          >
                            <option value="baixa">Baixa</option>
                            <option value="media">Média</option>
                            <option value="alta">Alta</option>
                            <option value="urgente">Urgente</option>
                          </select>
                        </label>
                        <label>
                          Status inicial
                          <select
                            onChange={(event) =>
                              setTaskStatus(event.target.value)
                            }
                            value={taskStatus}
                          >
                            <option value="a_fazer">A fazer</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="bloqueada">Bloqueada</option>
                            <option value="em_revisao">Em revisão</option>
                          </select>
                        </label>
                      </div>
                    )}
                    <label className="interaction-attachment">
                      <strong>Anexar documentos</strong>
                      <span className="interaction-dropzone">
                        ♧<small>Arraste arquivos ou clique para anexar</small>
                        <input
                          accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                          multiple
                          onChange={(event) =>
                            setSelectedFiles(
                              Array.from(event.target.files ?? [])
                            )
                          }
                          type="file"
                        />
                      </span>
                    </label>
                    {selectedFiles.length > 0 && (
                      <ul className="interaction-file-list">
                        {selectedFiles.map((file) => (
                          <li key={`${file.name}-${file.size}`}>{file.name}</li>
                        ))}
                      </ul>
                    )}
                    <p className="interaction-save-hint">
                      A duração é calculada pelos horários. Data, hora e
                      responsável também entram no histórico.
                    </p>
                    <div className="interaction-editor-actions">
                      <button
                        className="btn btn-ghost"
                        disabled={saving}
                        onClick={() => setCreatingInteraction(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={
                          saving || !interactionTitle.trim() || !resumo.trim()
                        }
                        type="submit"
                      >
                        {saving ? 'Salvando…' : 'Salvar interação'}
                      </button>
                    </div>
                  </aside>
                </div>
              </form>
            </section>
          ) : (
            <>
              <div className="client-history-toolbar">
                <div>
                  <h2>
                    {tab === 'meetings'
                      ? 'Reuniões'
                      : 'Histórico de interações'}
                  </h2>
                  <p>
                    {tab === 'meetings'
                      ? 'Reuniões registradas e agendadas com esta organização.'
                      : 'Atividades registradas para esta organização, da mais recente à mais antiga.'}
                  </p>
                </div>
                <div className="client-history-controls">
                  <label>
                    Tipo
                    <select
                      aria-label="Filtrar histórico por tipo"
                      disabled={tab === 'meetings'}
                      onChange={(event) => setFilter(event.target.value)}
                      value={tab === 'meetings' ? 'reuniao' : filter}
                    >
                      <option value="">Todos os tipos</option>
                      <option value="reuniao">Reunião</option>
                      <option value="ligacao">Ligação</option>
                      <option value="email">E-mail</option>
                      <option value="mensagem">Mensagem</option>
                      <option value="solicitacao">Solicitação</option>
                      <option value="outro">Outro</option>
                    </select>
                  </label>
                  <label>
                    Responsável
                    <select
                      onChange={(event) =>
                        setResponsibleFilter(event.target.value)
                      }
                      value={responsibleFilter}
                    >
                      <option value="">Todos</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    De
                    <input
                      aria-label="Data inicial"
                      onChange={(event) => setDateFrom(event.target.value)}
                      type="date"
                      value={dateFrom}
                    />
                  </label>
                  <label>
                    Até
                    <input
                      aria-label="Data final"
                      onChange={(event) => setDateTo(event.target.value)}
                      type="date"
                      value={dateTo}
                    />
                  </label>
                  <button
                    className="btn btn-primary"
                    onClick={startNewInteraction}
                    type="button"
                  >
                    ＋ Registrar interação
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="table-state">Carregando histórico…</div>
              ) : filteredInteractions.length === 0 ? (
                <div className="table-state">
                  Nenhuma interação encontrada para esses filtros.
                </div>
              ) : (
                <ol className="interaction-timeline">
                  {filteredInteractions.map((item) => {
                    const occurredAt = item.data_inicio ?? item.criado_em;
                    const expanded = expandedInteractionId === item.id;
                    return (
                      <li key={item.id}>
                        <span
                          className={`timeline-type-icon timeline-type-${item.tipo}`}
                        >
                          {item.tipo === 'reuniao'
                            ? '▦'
                            : item.tipo === 'ligacao'
                              ? '⌕'
                              : item.tipo === 'email'
                                ? '✉'
                                : item.tipo === 'mensagem'
                                  ? '▢'
                                  : '↗'}
                        </span>
                        <article>
                          <div className="timeline-meta">
                            <div>
                              <span
                                className={`interaction-type-pill interaction-pill-${item.tipo}`}
                              >
                                {labels[item.tipo] ?? item.tipo}
                              </span>
                              <strong>
                                {item.titulo ||
                                  `${labels[item.tipo] ?? item.tipo}${item.contato_nome ? ` com ${item.contato_nome}` : ''}`}
                              </strong>
                            </div>
                            <time dateTime={occurredAt}>
                              {formattedDate(occurredAt)}
                            </time>
                          </div>
                          <p>{item.resumo}</p>
                          <div className="timeline-footer">
                            <small>
                              Por: {item.responsavel_nome}
                              {item.data_fim && item.data_inicio
                                ? ` · ${Math.max(1, Math.round((new Date(item.data_fim).getTime() - new Date(item.data_inicio).getTime()) / 60000))} min`
                                : ''}
                            </small>
                            <button
                              className="timeline-details-button"
                              aria-expanded={expanded}
                              onClick={() =>
                                setExpandedInteractionId(
                                  expanded ? null : item.id
                                )
                              }
                              type="button"
                            >
                              {expanded
                                ? 'Ocultar detalhes ↑'
                                : 'Ver detalhes →'}
                            </button>
                          </div>
                          {expanded && (
                            <div className="timeline-details">
                              {item.contato_nome && (
                                <span>Contato: {item.contato_nome}</span>
                              )}
                              {item.status_relacionado && (
                                <span>
                                  Status:{' '}
                                  {item.status_relacionado.replaceAll('_', ' ')}
                                </span>
                              )}
                              {item.proxima_acao && (
                                <span>Próxima ação: {item.proxima_acao}</span>
                              )}
                              {item.data_inicio && item.data_fim && (
                                <span>
                                  Horário:{' '}
                                  {new Date(
                                    item.data_inicio
                                  ).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  –
                                  {new Date(item.data_fim).toLocaleTimeString(
                                    'pt-BR',
                                    { hour: '2-digit', minute: '2-digit' }
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </article>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      ) : tab === 'opportunities' ? (
        <div className="client-task-list">
          <div className="client-history-toolbar">
            <div>
              <h2>Oportunidades</h2>
              <p>Negociações comerciais vinculadas a {client.nome}.</p>
            </div>
          </div>
          {loading ? (
            <div className="table-state">Carregando oportunidades…</div>
          ) : opportunities.length === 0 ? (
            <div className="table-state">
              Nenhuma oportunidade vinculada a este cliente.
            </div>
          ) : (
            <div className="relationship-documents">
              {opportunities.map((opportunity) => (
                <article className="relationship-document" key={opportunity.id}>
                  <span className="status-pill">
                    {opportunity.estagio.replaceAll('_', ' ')}
                  </span>
                  <div>
                    <strong>{opportunity.titulo}</strong>
                    <small>
                      {opportunity.responsavel_nome
                        ? `Responsável: ${opportunity.responsavel_nome} · `
                        : ''}
                      {opportunity.valor_estimado != null
                        ? `Valor estimado: ${Number(opportunity.valor_estimado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · `
                        : ''}
                      {opportunity.previsao_fechamento
                        ? `Previsão: ${new Date(`${opportunity.previsao_fechamento.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')}`
                        : 'Sem previsão de fechamento'}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'documents' ? (
        <div className="relationship-body">
          <form
            className="relationship-upload"
            onSubmit={(event) => void uploadDocument(event)}
          >
            <label>
              Adicionar documento
              <input
                accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
                type="file"
              />
            </label>
            <small>PDF, DOCX, XLSX, JPG ou PNG · até 10 MB</small>
            <button
              className="btn btn-primary"
              disabled={saving || !selectedFile}
              type="submit"
            >
              {saving ? 'Enviando…' : 'Enviar arquivo'}
            </button>
          </form>
          {loading ? (
            <div className="table-state">Carregando documentos…</div>
          ) : documents.length === 0 ? (
            <div className="table-state">
              Nenhum documento enviado para este cliente.
            </div>
          ) : (
            <div className="relationship-documents">
              {documents.map((document) => (
                <article className="relationship-document" key={document.id}>
                  <span className="document-file-icon">▤</span>
                  <div>
                    <strong>{document.nome_arquivo}</strong>
                    <small>
                      {readableSize(document.tamanho_bytes)} · enviado por{' '}
                      {document.enviado_por_nome}
                      {document.criado_em
                        ? ` · ${formattedDate(document.criado_em)}`
                        : ''}
                    </small>
                  </div>
                  <button
                    className="table-action"
                    onClick={() => void openDocument(document.id)}
                    type="button"
                  >
                    Abrir
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="client-task-list">
          <div className="client-history-toolbar">
            <div>
              <h2>Tarefas do cliente</h2>
              <p>
                Tarefas de projetos vinculados e ações criadas a partir das
                interações.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="table-state">Carregando tarefas…</div>
          ) : tasks.length === 0 ? (
            <div className="table-state">
              Nenhuma tarefa vinculada a este cliente.
            </div>
          ) : (
            <div className="relationship-documents">
              {tasks.map((task) => (
                <button
                  aria-label={`Abrir detalhes da tarefa ${task.titulo}`}
                  className="relationship-document client-task-card client-task-details-trigger"
                  key={`${task.origem}:${task.id}`}
                  onClick={() =>
                    setSelectedTask({
                      ...task,
                      cliente_nome: client.nome,
                      responsaveis_nomes: task.responsavel_nome
                        ? task.responsavel_nome
                            .split(',')
                            .map((name) => name.trim())
                        : [],
                    })
                  }
                  type="button"
                >
                  <span className={`status-pill status-${task.status}`}>
                    {task.status.replaceAll('_', ' ')}
                  </span>
                  <div>
                    <strong>{task.titulo}</strong>
                    <small>
                      {task.origem === 'projeto'
                        ? `Projeto: ${task.projeto_nome} · `
                        : 'Criada a partir de interação · '}
                      {task.responsavel_nome
                        ? `Responsável: ${task.responsavel_nome}`
                        : 'Sem responsável'}{' '}
                      ·{' '}
                      {task.prazo
                        ? `Prazo: ${new Date(`${task.prazo.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')}`
                        : 'Sem prazo'}{' '}
                      · Prioridade: {task.prioridade}
                    </small>
                    {task.descricao && <small>{task.descricao}</small>}
                    <span className="client-task-details-hint">
                      Ver detalhes da tarefa →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {selectedTask && (
        <TaskDetailsDialog
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
        />
      )}
    </section>
  );
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
      const result = await apiRequest<{ data: DocumentRecord[] }>(
        token,
        `/api/v1/documentos${query}`
      );
      setDocuments(result.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar a documentação.'
      );
    } finally {
      setLoading(false);
    }
  }, [filter, token]);
  useEffect(() => {
    void load();
  }, [load]);
  async function openDocument(id: number) {
    try {
      const result = await apiRequest<{ url: string }>(
        token,
        `/api/v1/documentos/${id}/download`
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível abrir o documento.'
      );
    }
  }
  return (
    <section className="screen-content">
      <div className="screen-head">
        <div>
          <p className="eyebrow">BASE DE DADOS</p>
          <h1>Documentos</h1>
          <p>Contratos e arquivos enviados nos cadastros de clientes.</p>
        </div>
      </div>
      {error && (
        <div className="workspace-alert" role="alert">
          {error}
        </div>
      )}
      <div className="card client-table-card">
        <div className="table-toolbar">
          <div>
            <strong>Documentação dos clientes</strong>
            <span>{documents.length} documentos</span>
          </div>
          <input
            aria-label="Filtrar documentos por cliente"
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtrar por cliente"
            value={filter}
          />
        </div>
        {loading ? (
          <div className="table-state">Carregando documentos…</div>
        ) : documents.length === 0 ? (
          <div className="table-state">
            Nenhum documento foi enviado para os clientes.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Cliente</th>
                  <th>Enviado por</th>
                  <th>Data</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <strong>{document.nome_arquivo}</strong>
                      <small>{readableSize(document.tamanho_bytes)}</small>
                    </td>
                    <td>{document.cliente_nome}</td>
                    <td>{document.enviado_por_nome}</td>
                    <td>
                      {document.criado_em
                        ? formattedDate(document.criado_em)
                        : '—'}
                    </td>
                    <td className="table-actions">
                      <button
                        className="table-action"
                        onClick={() => void openDocument(document.id)}
                        type="button"
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
