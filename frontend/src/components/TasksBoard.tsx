import { useEffect, useState } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';

type TaskStatus =
  | 'a_fazer'
  | 'em_andamento'
  | 'bloqueada'
  | 'em_revisao'
  | 'concluida';
type TaskOrigin = 'projeto' | 'interacao';
type Task = {
  id: number;
  origem: TaskOrigin;
  titulo: string;
  descricao: string | null;
  status: TaskStatus;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  prazo: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  projeto_id: number | null;
  projeto_nome: string | null;
  projeto_status: string | null;
  interacao_id: number | null;
  responsaveis_ids: number[];
  responsaveis_nomes: string[];
};
type Client = { id: number; nome: string };
type Project = { id: number; nome: string };
type Team = { id: number; nome: string };
type User = { id: number; nome: string };
type HistoryItem = {
  id: number;
  status_anterior: TaskStatus | null;
  status_novo: TaskStatus;
  criado_em: string;
  usuario_nome: string;
};
type Page<T> = {
  data: T[];
  pagination: { limit: number; offset: number; total: number };
};

const columns: Array<{ id: TaskStatus; label: string }> = [
  { id: 'a_fazer', label: 'A Fazer' },
  { id: 'em_andamento', label: 'Em Andamento' },
  { id: 'bloqueada', label: 'Bloqueada' },
  { id: 'em_revisao', label: 'Em Revisão' },
  { id: 'concluida', label: 'Concluída' },
];

const statusLabels = Object.fromEntries(
  columns.map((column) => [column.id, column.label])
) as Record<TaskStatus, string>;

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
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `Falha HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

function makeTaskQuery(
  filters: {
    clientId: string;
    projectId: string;
    teamId: string;
    userId: string;
    statusFilter: string;
    origin: string;
  },
  offset: number
) {
  const params = new URLSearchParams({ limit: '100', offset: String(offset) });
  if (filters.clientId) params.set('cliente_id', filters.clientId);
  if (filters.projectId) params.set('projeto_id', filters.projectId);
  if (filters.teamId) params.set('equipe_id', filters.teamId);
  if (filters.userId) params.set('responsavel_id', filters.userId);
  if (filters.statusFilter) params.set('status', filters.statusFilter);
  if (filters.origin) params.set('origem', filters.origin);
  return params;
}

function localDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('pt-BR');
}

function isOverdue(task: Task) {
  if (!task.prazo || task.status === 'concluida') return false;
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return task.prazo.slice(0, 10) < todayValue;
}

export default function TasksBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [userId, setUserId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [origin, setOrigin] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingTaskKey, setSavingTaskKey] = useState<string | null>(null);
  const [historyTaskKey, setHistoryTaskKey] = useState<string | null>(null);
  const [historyByTask, setHistoryByTask] = useState<
    Record<string, HistoryItem[]>
  >({});
  const [historyLoadingKey, setHistoryLoadingKey] = useState<string | null>(
    null
  );
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ data: Client[] }>('/api/v1/clientes?limit=100&offset=0'),
      api<{ data: Project[] }>('/api/v1/projetos'),
      api<{ data: Team[] }>('/api/v1/projetos/equipes'),
      api<{ data: User[] }>('/api/v1/clientes/responsaveis'),
    ])
      .then(([clientResult, projectResult, teamResult, userResult]) => {
        if (!active) return;
        setClients(clientResult.data ?? []);
        setProjects(projectResult.data ?? []);
        setTeams(teamResult.data ?? []);
        setUsers(userResult.data ?? []);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar os filtros.'
          );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const query = makeTaskQuery(
      { clientId, projectId, teamId, userId, statusFilter, origin },
      0
    );
    api<Page<Task>>(`/api/v1/tarefas/quadro?${query.toString()}`)
      .then((result) => {
        if (!active) return;
        setTasks(result.data ?? []);
        setTotal(result.pagination?.total ?? result.data?.length ?? 0);
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar as tarefas.'
        );
        setTasks([]);
        setTotal(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clientId, projectId, teamId, userId, statusFilter, origin]);

  async function loadMore() {
    setLoadingMore(true);
    setError('');
    try {
      const query = makeTaskQuery(
        { clientId, projectId, teamId, userId, statusFilter, origin },
        tasks.length
      );
      const result = await api<Page<Task>>(
        `/api/v1/tarefas/quadro?${query.toString()}`
      );
      setTasks((current) => [...current, ...(result.data ?? [])]);
      setTotal(result.pagination?.total ?? total);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar mais tarefas.'
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function changeStatus(task: Task, nextStatus: TaskStatus) {
    if (task.status === nextStatus) return;
    if (
      nextStatus === 'concluida' &&
      !window.confirm(`Confirmar a conclusão de “${task.titulo}”?`)
    )
      return;
    const taskKey = `${task.origem}:${task.id}`;
    setSavingTaskKey(taskKey);
    setError('');
    try {
      await api(`/api/v1/tarefas/${task.origem}/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setTasks((current) =>
        current.map((item) =>
          item.origem === task.origem && item.id === task.id
            ? { ...item, status: nextStatus }
            : item
        )
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar o status da tarefa.'
      );
    } finally {
      setSavingTaskKey(null);
    }
  }

  async function toggleHistory(task: Task) {
    const taskKey = `${task.origem}:${task.id}`;
    if (historyTaskKey === taskKey) {
      setHistoryTaskKey(null);
      return;
    }
    setHistoryTaskKey(taskKey);
    if (historyByTask[taskKey]) return;
    setHistoryLoadingKey(taskKey);
    try {
      const result = await api<{ data: HistoryItem[] }>(
        `/api/v1/tarefas/${task.origem}/${task.id}/historico`
      );
      setHistoryByTask((current) => ({
        ...current,
        [taskKey]: result.data ?? [],
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar o histórico da tarefa.'
      );
      setHistoryTaskKey(null);
    } finally {
      setHistoryLoadingKey(null);
    }
  }

  const visibleColumns = statusFilter
    ? columns.filter((column) => column.id === statusFilter)
    : columns;

  return (
    <section
      className="tasks-board-panel card"
      aria-label="Quadro geral de tarefas"
    >
      <div className="tasks-board-heading">
        <div>
          <h2>Quadro geral de tarefas</h2>
          <p>Tarefas de projetos e interações com clientes</p>
        </div>
        <span>
          {tasks.length} de {total} tarefas
        </span>
      </div>
      <div className="tasks-board-filters">
        <label>
          Cliente
          <select
            onChange={(event) => setClientId(event.target.value)}
            value={clientId}
          >
            <option value="">Todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Projeto
          <select
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            <option value="">Todos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Equipe
          <select
            onChange={(event) => setTeamId(event.target.value)}
            value={teamId}
          >
            <option value="">Todas</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsável
          <select
            onChange={(event) => setUserId(event.target.value)}
            value={userId}
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
          Status
          <select
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="">Todos</option>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Origem
          <select
            onChange={(event) => setOrigin(event.target.value)}
            value={origin}
          >
            <option value="">Todas</option>
            <option value="projeto">Projeto</option>
            <option value="interacao">Interação com cliente</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="workspace-alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="table-state">Carregando tarefas…</div>
      ) : (
        <div className="tasks-board-columns">
          {visibleColumns.map((column) => {
            const columnTasks = tasks.filter(
              (task) => task.status === column.id
            );
            return (
              <section
                className="project-column"
                key={column.id}
                aria-label={column.label}
              >
                <header className="project-column-head">
                  <h3>{column.label}</h3>
                  <span>{columnTasks.length}</span>
                </header>
                <div className="project-task-list">
                  {columnTasks.length === 0 ? (
                    <div className="project-drop-empty">Nenhuma tarefa</div>
                  ) : (
                    columnTasks.map((task) => {
                      const overdue = isOverdue(task);
                      const taskKey = `${task.origem}:${task.id}`;
                      return (
                        <article
                          className={`project-task-card card tasks-board-card${overdue ? ' is-overdue' : ''}`}
                          key={taskKey}
                        >
                          <div className="project-task-top">
                            <span
                              className={`task-priority priority-${task.prioridade}`}
                            >
                              {task.prioridade}
                            </span>
                            <span className="tasks-board-origin">
                              {task.origem === 'projeto'
                                ? 'Projeto'
                                : 'Interação'}
                            </span>
                          </div>
                          <h4>{task.titulo}</h4>
                          <div className="tasks-board-context">
                            {task.projeto_nome && (
                              <span>Projeto: {task.projeto_nome}</span>
                            )}
                            {task.cliente_nome && (
                              <span>Cliente: {task.cliente_nome}</span>
                            )}
                            {task.interacao_id && (
                              <span>Interação #{task.interacao_id}</span>
                            )}
                          </div>
                          {task.descricao && (
                            <p className="tasks-board-description">
                              {task.descricao}
                            </p>
                          )}
                          <footer>
                            <span title={task.responsaveis_nomes.join(', ')}>
                              {task.responsaveis_nomes.join(', ') ||
                                'Sem responsável'}
                            </span>
                            {task.prazo && (
                              <time className={overdue ? 'overdue-date' : ''}>
                                {localDate(task.prazo)}
                                {overdue ? ' · Atrasada' : ''}
                              </time>
                            )}
                          </footer>
                          <label className="tasks-board-status">
                            Status
                            <select
                              aria-label={`Alterar status de ${task.titulo}`}
                              disabled={
                                savingTaskKey === taskKey ||
                                task.projeto_status === 'concluido'
                              }
                              onChange={(event) =>
                                void changeStatus(
                                  task,
                                  event.target.value as TaskStatus
                                )
                              }
                              value={task.status}
                            >
                              {columns.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {statusLabels[option.id]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="tasks-board-history-toggle"
                            onClick={() => void toggleHistory(task)}
                            type="button"
                          >
                            {historyTaskKey === taskKey
                              ? 'Ocultar histórico'
                              : 'Ver histórico'}
                          </button>
                          {historyTaskKey === taskKey && (
                            <ol
                              className="tasks-board-history"
                              aria-label={`Histórico de ${task.titulo}`}
                            >
                              {historyLoadingKey === taskKey ? (
                                <li>Carregando…</li>
                              ) : (historyByTask[taskKey] ?? []).length ===
                                0 ? (
                                <li>Nenhuma alteração registrada.</li>
                              ) : (
                                historyByTask[taskKey].map((item) => (
                                  <li key={item.id}>
                                    <strong>
                                      {item.status_anterior
                                        ? `${statusLabels[item.status_anterior]} → `
                                        : 'Criada em '}
                                      {statusLabels[item.status_novo]}
                                    </strong>
                                    <span>
                                      {item.usuario_nome} ·{' '}
                                      {new Date(item.criado_em).toLocaleString(
                                        'pt-BR',
                                        {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        }
                                      )}
                                    </span>
                                  </li>
                                ))
                              )}
                            </ol>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {!loading && tasks.length < total && (
        <button
          className="btn btn-ghost tasks-board-more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          type="button"
        >
          {loadingMore ? 'Carregando…' : 'Carregar mais tarefas'}
        </button>
      )}
    </section>
  );
}
