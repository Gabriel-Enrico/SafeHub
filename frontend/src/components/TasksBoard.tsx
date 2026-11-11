import { useEffect, useState } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';
import TaskDetailsDialog, { type TaskDetails } from './TaskDetailsDialog';

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
  solicitante_nome: string | null;
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
type TaskView = '' | 'minhas' | 'equipe' | 'atrasadas' | 'aguardando_resposta';
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
    view: TaskView;
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
  if (filters.view) params.set('visao', filters.view);
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
  const [view, setView] = useState<TaskView>('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingTaskKey, setSavingTaskKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskDetails | null>(null);

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
      { clientId, projectId, teamId, userId, statusFilter, origin, view },
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
  }, [clientId, projectId, teamId, userId, statusFilter, origin, view]);

  async function loadMore() {
    setLoadingMore(true);
    setError('');
    try {
      const query = makeTaskQuery(
        { clientId, projectId, teamId, userId, statusFilter, origin, view },
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
      <div
        aria-label="Visões de tarefas"
        className="project-view-tabs tasks-board-views"
        role="group"
      >
        <button
          aria-pressed={!view}
          className={!view ? 'active' : ''}
          onClick={() => setView('')}
          type="button"
        >
          Todas
        </button>
        <button
          aria-pressed={view === 'minhas'}
          className={view === 'minhas' ? 'active' : ''}
          onClick={() => setView('minhas')}
          type="button"
        >
          Minhas tarefas
        </button>
        <button
          aria-pressed={view === 'equipe'}
          className={view === 'equipe' ? 'active' : ''}
          onClick={() => setView('equipe')}
          type="button"
        >
          Da equipe
        </button>
        <button
          aria-pressed={view === 'atrasadas'}
          className={view === 'atrasadas' ? 'active' : ''}
          onClick={() => setView('atrasadas')}
          type="button"
        >
          Atrasadas
        </button>
        <button
          aria-pressed={view === 'aguardando_resposta'}
          className={view === 'aguardando_resposta' ? 'active' : ''}
          onClick={() => setView('aguardando_resposta')}
          type="button"
        >
          Aguardando resposta
        </button>
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
                          <button
                            className="tasks-board-open-details"
                            onClick={() => setSelectedTask(task)}
                            type="button"
                          >
                            <span>{task.titulo}</span>
                            <small>Abrir detalhes</small>
                          </button>
                          <div className="tasks-board-context">
                            {task.projeto_nome && (
                              <span>Projeto: {task.projeto_nome}</span>
                            )}
                            {task.cliente_nome && (
                              <span>Cliente: {task.cliente_nome}</span>
                            )}
                          </div>
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
      {selectedTask && (
        <TaskDetailsDialog
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
        />
      )}
    </section>
  );
}
