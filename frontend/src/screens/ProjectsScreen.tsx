import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';

type Team = { id: number; nome: string };
type Client = { id: number; nome: string };
type Member = { id: number; nome: string };
type Project = {
  id: number; nome: string; descricao: string | null; equipe_id: number | null; equipe_nome: string | null;
  cliente_id: number; cliente_nome: string | null; status: 'em_planejamento' | 'em_andamento' | 'concluido';
  data_inicio: string | null; total_tarefas: number; tarefas_concluidas: number;
};
type Task = {
  id: number; projeto_id: number; titulo: string; prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  prazo: string | null; coluna_kanban: 'a_fazer' | 'em_andamento' | 'concluida';
  responsaveis_ids: number[]; responsaveis_nomes: string[];
};
type ProjectDraft = { nome: string; descricao: string; equipe_id: string; cliente_id: string; data_inicio: string };
type TaskDraft = { titulo: string; prioridade: Task['prioridade']; prazo: string; responsavel_id: string };

const columns: Array<{ id: Task['coluna_kanban']; label: string }> = [
  { id: 'a_fazer', label: 'A Fazer' },
  { id: 'em_andamento', label: 'Em Andamento' },
  { id: 'concluida', label: 'Concluída' },
];
const projectStatuses: Array<{ id: Project['status']; label: string }> = [
  { id: 'em_planejamento', label: 'Em Planejamento' },
  { id: 'em_andamento', label: 'Em Andamento' },
  { id: 'concluido', label: 'Concluído' },
];

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getCurrentAccessToken();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : `Falha HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

const emptyProject: ProjectDraft = { nome: '', descricao: '', equipe_id: '', cliente_id: '', data_inicio: '' };
const emptyTask: TaskDraft = { titulo: '', prioridade: 'media', prazo: '', responsavel_id: '' };

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

function isOverdue(task: Task) {
  if (!task.prazo || task.coluna_kanban === 'concluida') return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return task.prazo.slice(0, 10) < today;
}

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [projectModal, setProjectModal] = useState<'create' | 'edit' | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProject);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTask);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const activeProjects = useMemo(() => projects.filter((project) => project.status !== 'concluido'), [projects]);
  const completedProjects = useMemo(() => projects.filter((project) => project.status === 'concluido'), [projects]);

  const loadProjects = useCallback(async (keepSelection = true) => {
    setLoading(true);
    setError('');
    try {
      const [projectResult, teamResult, clientResult] = await Promise.all([
        api<{ data: Project[] }>('/api/v1/projetos'),
        api<{ data: Team[] }>('/api/v1/projetos/equipes'),
        api<{ data: Client[] }>('/api/v1/clientes?limit=100&offset=0'),
      ]);
      setProjects(projectResult.data ?? []);
      setTeams(teamResult.data ?? []);
      setClients(clientResult.data ?? []);
      const nextSelection = keepSelection && (projectResult.data ?? []).some((project) => project.id === selectedId)
        ? selectedId : (projectResult.data ?? []).find((project) => project.status !== 'concluido')?.id ?? projectResult.data?.[0]?.id ?? null;
      setSelectedId(nextSelection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os projetos.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void loadProjects(false); }, []);

  const loadTasks = useCallback(async (project: Project) => {
    setTasksLoading(true);
    setError('');
    try {
      const [taskResult, memberResult] = await Promise.all([
        api<{ data: Task[] }>(`/api/v1/projetos/${project.id}/tarefas`),
        project.equipe_id
          ? api<{ data: Member[] }>(`/api/v1/projetos/equipes/${project.equipe_id}/usuarios`)
          : Promise.resolve({ data: [] as Member[] }),
      ]);
      setTasks(taskResult.data ?? []);
      setMembers(memberResult.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as tarefas do projeto.');
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) { setTasks([]); setMembers([]); return; }
    void loadTasks(selected);
  }, [selectedId, selected?.id, selected?.equipe_id, loadTasks]);

  function openProjectCreate() {
    setProjectDraft({ ...emptyProject, equipe_id: teams.length === 1 ? String(teams[0].id) : '' });
    setProjectModal('create'); setError(''); setNotice('');
  }
  function openProjectEdit(project: Project) {
    setProjectDraft({ nome: project.nome, descricao: project.descricao ?? '', equipe_id: project.equipe_id == null ? '' : String(project.equipe_id), cliente_id: String(project.cliente_id), data_inicio: project.data_inicio?.slice(0, 10) ?? '' });
    setProjectModal('edit'); setError(''); setNotice('');
  }

  async function saveProject(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const body = { nome: projectDraft.nome.trim(), descricao: projectDraft.descricao.trim() || null, equipe_id: Number(projectDraft.equipe_id), cliente_id: Number(projectDraft.cliente_id), data_inicio: projectDraft.data_inicio || null };
      if (projectModal === 'edit' && selected) {
        await api(`/api/v1/projetos/${selected.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setNotice('Projeto atualizado.');
      } else {
        const created = await api<Project>('/api/v1/projetos', { method: 'POST', body: JSON.stringify(body) });
        setSelectedId(created.id); setNotice('Projeto criado com status Em Planejamento.');
      }
      setProjectModal(null); await loadProjects(projectModal === 'edit');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o projeto.'); }
    finally { setSaving(false); }
  }

  async function updateStatus(status: Project['status']) {
    if (!selected || selected.status === status) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api(`/api/v1/projetos/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(status === 'concluido' ? 'Projeto concluído e movido para a lista de projetos concluídos.' : 'Status do projeto atualizado.');
      await loadProjects();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o status do projeto.'); }
    finally { setSaving(false); }
  }

  async function saveTask(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api(`/api/v1/projetos/${selected.id}/tarefas`, {
        method: 'POST', body: JSON.stringify({ titulo: taskDraft.titulo.trim(), prioridade: taskDraft.prioridade, prazo: taskDraft.prazo || null, responsaveis_ids: taskDraft.responsavel_id ? [Number(taskDraft.responsavel_id)] : [] }),
      });
      setTaskModal(false); setTaskDraft(emptyTask); setNotice('Tarefa adicionada à coluna A Fazer.'); await loadTasks(selected); await loadProjects();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a tarefa.'); }
    finally { setSaving(false); }
  }

  async function moveTask(task: Task, coluna_kanban: Task['coluna_kanban']) {
    if (!selected || task.coluna_kanban === coluna_kanban) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api(`/api/v1/tarefas/${task.id}`, { method: 'PATCH', body: JSON.stringify({ coluna_kanban }) });
      setNotice(`Tarefa movida para ${columns.find((column) => column.id === coluna_kanban)?.label}.`);
      await loadTasks(selected); await loadProjects();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mover a tarefa.'); }
    finally { setDraggingId(null); setSaving(false); }
  }

  return <section className="screen-content projects-screen">
    <div className="screen-head"><div><p className="eyebrow">GESTÃO DE PROJETOS</p><h1>Projetos</h1><p>Organize projetos e acompanhe as tarefas da equipe no Kanban.</p></div><button className="btn btn-primary" disabled={!teams.length} onClick={openProjectCreate} type="button">＋ Novo projeto</button></div>
    {error && !projectModal && !taskModal && <div className="workspace-alert" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    {loading ? <div className="table-state card">Carregando projetos…</div> : <div className="projects-layout">
      <aside className="projects-list card"><div className="projects-list-head"><div><span className="eyebrow">ESPAÇO DE TRABALHO</span><h2>Projetos ativos <span>{activeProjects.length}</span></h2></div></div>
        {!activeProjects.length ? <p className="projects-list-empty">Ainda não há projetos ativos.</p> : activeProjects.map((project) => <button className={`project-list-item${project.id === selected?.id ? ' active' : ''}`} key={project.id} onClick={() => { setSelectedId(project.id); setNotice(''); setError(''); }} type="button"><span className="project-list-icon">▣</span><span className="project-list-copy"><strong>{project.nome}</strong><small>{project.equipe_nome ?? (project.equipe_id ? `Equipe ${project.equipe_id}` : 'Sem equipe')}{project.cliente_nome ? ` · ${project.cliente_nome}` : ''}</small><span className="project-progress-track"><i style={{ width: `${project.total_tarefas ? Math.round(project.tarefas_concluidas / project.total_tarefas * 100) : 0}%` }} /></span></span><span className="project-list-count">{project.tarefas_concluidas}/{project.total_tarefas}</span></button>)}
        <div className="projects-completed-toggle"><button onClick={() => setShowCompleted((show) => !show)} type="button">{showCompleted ? '⌄' : '›'} Projetos concluídos <span>{completedProjects.length}</span></button>{showCompleted && (completedProjects.length ? completedProjects.map((project) => <button className={`project-list-item completed${project.id === selected?.id ? ' active' : ''}`} key={project.id} onClick={() => setSelectedId(project.id)} type="button"><span className="project-list-icon">✓</span><span className="project-list-copy"><strong>{project.nome}</strong><small>{project.equipe_nome ?? (project.equipe_id ? `Equipe ${project.equipe_id}` : 'Sem equipe')}</small></span></button>) : <p className="projects-list-empty">Nenhum projeto concluído.</p>)}</div>
      </aside>
      <div className="project-workspace">{!selected ? <div className="module-empty card"><span className="module-empty-icon">▣</span><h3>{teams.length ? 'Selecione ou crie um projeto' : 'Sua conta ainda não está vinculada a uma equipe'}</h3><p>{teams.length ? 'Os projetos da sua equipe e suas tarefas aparecerão nesta área.' : 'Peça ao administrador para associar seu usuário a uma equipe antes de criar projetos.'}</p></div> : <>
        <header className="project-detail-head card"><div className="project-detail-title"><span className="eyebrow">{selected.equipe_nome ?? (selected.equipe_id ? `EQUIPE ${selected.equipe_id}` : 'SEM EQUIPE')}</span><h2>{selected.nome}</h2><p>{selected.descricao || 'Sem descrição'}</p><div className="project-meta">{selected.cliente_nome && <span>Cliente: {selected.cliente_nome}</span>}{selected.data_inicio && <span>Início: {dateLabel(selected.data_inicio)}</span>}<span>{selected.total_tarefas} tarefa{selected.total_tarefas === 1 ? '' : 's'}</span></div></div><div className="project-detail-actions"><label className="project-status-select"><span>Status do projeto</span><select disabled={saving} onChange={(event) => void updateStatus(event.target.value as Project['status'])} value={selected.status}>{projectStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label><button className="btn btn-ghost" disabled={saving} onClick={() => openProjectEdit(selected)} type="button">Editar projeto</button><button className="btn btn-primary" disabled={saving || selected.status === 'concluido' || selected.equipe_id == null} onClick={() => { setTaskDraft(emptyTask); setTaskModal(true); setError(''); }} type="button">＋ Nova tarefa</button></div></header>
        {selected.status === 'concluido' && <div className="workspace-notice">Este projeto está concluído. Altere o status para continuar adicionando ou movimentando tarefas.</div>}
        <div className="project-board">{columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.coluna_kanban === column.id);
          return <section aria-label={column.label} className={`project-column${draggingId ? ' accepts-drop' : ''}`} key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = Number(event.dataTransfer.getData('text/plain')); const task = tasks.find((item) => item.id === taskId); if (task) void moveTask(task, column.id); }}><header className="project-column-head"><h3>{column.label}</h3><span>{columnTasks.length}</span></header><div className="project-task-list">{tasksLoading ? <div className="project-drop-empty">Carregando tarefas…</div> : !columnTasks.length ? <div className="project-drop-empty">Arraste tarefas para cá</div> : columnTasks.map((task) => <article className={`project-task-card card${isOverdue(task) ? ' is-overdue' : ''}`} draggable={!saving && selected.status !== 'concluido'} key={task.id} onDragEnd={() => setDraggingId(null)} onDragStart={(event) => { setDraggingId(task.id); event.dataTransfer.setData('text/plain', String(task.id)); event.dataTransfer.effectAllowed = 'move'; }}><div className="project-task-top"><span className={`task-priority priority-${task.prioridade}`}>{task.prioridade}</span>{isOverdue(task) && <span className="task-overdue-label">Atrasada</span>}</div><h4>{task.titulo}</h4><footer>{task.responsaveis_nomes?.length ? <span className="task-assignees" title={task.responsaveis_nomes.join(', ')}>♙ {task.responsaveis_nomes.join(', ')}</span> : <span className="task-unassigned">Sem responsável</span>}{task.prazo && <time className={isOverdue(task) ? 'overdue-date' : ''}>◷ {dateLabel(task.prazo)}</time>}</footer><div className="project-task-move"><label className="sr-only" htmlFor={`move-task-${task.id}`}>Mover tarefa {task.titulo}</label><select disabled={saving || selected.status === 'concluido'} id={`move-task-${task.id}`} onChange={(event) => void moveTask(task, event.target.value as Task['coluna_kanban'])} value={task.coluna_kanban}>{columns.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><span>⠿ Arraste para mover</span></div></article>)}</div></section>;
        })}</div>
      </>}</div>
    </div>}

    {projectModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setProjectModal(null); }}><form className="client-modal project-form" onSubmit={(event) => void saveProject(event)}><div className="client-modal-heading"><div><span className="eyebrow">GESTÃO DE PROJETOS</span><h2>{projectModal === 'edit' ? 'Editar projeto' : 'Novo projeto'}</h2></div><button aria-label="Fechar" className="modal-close" onClick={() => setProjectModal(null)} type="button">×</button></div>{error && <div className="workspace-alert" role="alert">{error}</div>}<label>Nome do projeto<input autoFocus maxLength={200} onChange={(event) => setProjectDraft({ ...projectDraft, nome: event.target.value })} required value={projectDraft.nome} /></label><label>Descrição<textarea maxLength={5000} onChange={(event) => setProjectDraft({ ...projectDraft, descricao: event.target.value })} rows={3} value={projectDraft.descricao} /></label><label>Equipe<select onChange={(event) => setProjectDraft({ ...projectDraft, equipe_id: event.target.value })} required value={projectDraft.equipe_id}><option value="">Selecione a equipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.nome}</option>)}</select></label><label>Cliente vinculado<select onChange={(event) => setProjectDraft({ ...projectDraft, cliente_id: event.target.value })} required value={projectDraft.cliente_id}><option value="">Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label><label>Data de início<input onChange={(event) => setProjectDraft({ ...projectDraft, data_inicio: event.target.value })} type="date" value={projectDraft.data_inicio} /></label>{projectModal === 'create' && <p className="module-footnote">O projeto será criado com status Em Planejamento e um Kanban vazio.</p>}<div className="modal-actions"><button className="btn btn-ghost" disabled={saving} onClick={() => setProjectModal(null)} type="button">Cancelar</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : projectModal === 'edit' ? 'Salvar alterações' : 'Criar projeto'}</button></div></form></div>}

    {taskModal && selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setTaskModal(false); }}><form className="client-modal project-form" onSubmit={(event) => void saveTask(event)}><div className="client-modal-heading"><div><span className="eyebrow">{selected.nome}</span><h2>Nova tarefa</h2></div><button aria-label="Fechar" className="modal-close" onClick={() => setTaskModal(false)} type="button">×</button></div>{error && <div className="workspace-alert" role="alert">{error}</div>}<label>Título<input autoFocus maxLength={200} onChange={(event) => setTaskDraft({ ...taskDraft, titulo: event.target.value })} required value={taskDraft.titulo} /></label><label>Responsável<select onChange={(event) => setTaskDraft({ ...taskDraft, responsavel_id: event.target.value })} value={taskDraft.responsavel_id}><option value="">Sem responsável</option>{members.map((member) => <option key={member.id} value={member.id}>{member.nome}</option>)}</select></label><label>Prioridade<select onChange={(event) => setTaskDraft({ ...taskDraft, prioridade: event.target.value as Task['prioridade'] })} value={taskDraft.prioridade}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><label>Prazo<input onChange={(event) => setTaskDraft({ ...taskDraft, prazo: event.target.value })} type="date" value={taskDraft.prazo} /></label><p className="module-footnote">A tarefa começará em A Fazer. O status pode ser alterado depois pelo quadro ou pelo seletor do card.</p><div className="modal-actions"><button className="btn btn-ghost" disabled={saving} onClick={() => setTaskModal(false)} type="button">Cancelar</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : 'Salvar tarefa'}</button></div></form></div>}
  </section>;
}
