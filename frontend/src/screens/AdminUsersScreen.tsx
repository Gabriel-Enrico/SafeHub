import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';

type User = { id: number; nome: string; email: string; cargo: 'Administrador' | 'Operador' | string | null; equipe_id: number | null; avatar: string | null; ativo: boolean };
type Team = { id: number; nome: string };
type Draft = { nome: string; email: string; cargo: 'Administrador' | 'Operador'; equipe_id: number | null };
type AuditEvent = { id: number; entidade: string; entidade_id: string; acao: string; alteracoes: Record<string, unknown>; criado_em: string; usuario_nome: string | null };
type UserModulePermission = { modulo: string; visualizar: boolean; gerenciar: boolean };
const accessModules = [
  ['clientes','Clientes'],['tarefas','Tarefas'],['projetos','Projetos'],['oportunidades','Oportunidades'],
  ['agenda','Agenda'],['documentos','Documentos / OneDrive'],['editais','Editais'],['equipes','Equipes'],['usuarios','Usuários'],
] as const;

async function request<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const currentToken = await getCurrentAccessToken();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${currentToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(result?.message ?? `Erro HTTP ${response.status}.`);
  return result as T;
}

export default function AdminUsersScreen({ token }: { token: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [draft, setDraft] = useState<Draft>({ nome: '', email: '', cargo: 'Operador', equipe_id: null });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [permissionUser, setPermissionUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<UserModulePermission[]>([]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request<{ data: User[] }>(token, '/api/v1/usuarios?limit=100&offset=0');
      setUsers(result.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar usuários.');
    } finally { setLoading(false); }
  }, [token]);
  const loadTeams = useCallback(async () => {
    setTeamsLoading(true);
    try {
      const result = await request<Team[]>(token, '/api/v1/equipes');
      setTeams(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as equipes.');
    } finally { setTeamsLoading(false); }
  }, [token]);
  useEffect(() => { void loadUsers(); }, [loadUsers]);
  useEffect(() => { void loadTeams(); }, [loadTeams]);
  useEffect(() => {
    void request<{ data: AuditEvent[] }>(token, '/api/v1/auditoria?limit=30').then((result) => setAudit(result.data ?? [])).catch(() => setAudit([]));
  }, [token]);

  async function invite(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await request<User>(token, '/api/v1/usuarios', { method: 'POST', body: JSON.stringify({ ...draft, nome: draft.nome.trim(), email: draft.email.trim() }) });
      setDraft({ nome: '', email: '', cargo: 'Operador', equipe_id: null });
      setNotice('Convite enviado. A pessoa deverá abrir o e-mail e definir a senha.');
      await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível convidar.'); }
    finally { setSaving(false); }
  }

  async function assignTeam(user: User, equipeId: number | null) {
    if (user.equipe_id === equipeId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const updated = await request<User>(token, `/api/v1/usuarios/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ equipe_id: equipeId }),
      });
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`Equipe de ${user.nome} atualizada.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a equipe do usuário.');
    } finally { setSaving(false); }
  }

  async function changeRole(user: User) {
    const cargo = user.cargo === 'Administrador' ? 'Operador' : 'Administrador';
    if (!window.confirm(`Alterar ${user.nome} para ${cargo}?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await request<User>(token, `/api/v1/usuarios/${user.id}`, { method: 'PATCH', body: JSON.stringify({ cargo }) });
      setNotice('Cargo atualizado.'); await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o cargo.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(user: User) {
    const action = user.ativo ? 'desativar' : 'reativar';
    if (!window.confirm(`Deseja ${action} o acesso de ${user.nome}?`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await request<User>(token, `/api/v1/usuarios/${user.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !user.ativo }) });
      setNotice(user.ativo ? 'Usuário desativado.' : 'Usuário reativado.'); await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Não foi possível ${action} o usuário.`); }
    finally { setSaving(false); }
  }

  async function editPermissions(user: User) {
    setSaving(true); setError('');
    try {
      const result = await request<{ data: UserModulePermission[] }>(token, `/api/v1/usuarios/${user.id}/permissoes`);
      setPermissions(result.data); setPermissionUser(user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as permissões.'); }
    finally { setSaving(false); }
  }

  async function savePermissions(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (!permissionUser) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await request(token, `/api/v1/usuarios/${permissionUser.id}/permissoes`, { method: 'PUT', body: JSON.stringify({ permissoes: permissions }) });
      setNotice(`Acessos de ${permissionUser.nome} atualizados.`); setPermissionUser(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as permissões.'); }
    finally { setSaving(false); }
  }

  const filtered = users.filter((user) => `${user.nome} ${user.email} ${user.cargo ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <section className="screen-content">
    <div className="screen-head"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Usuários</h1><p>Convide e gerencie os acessos ao SafeHub.</p></div></div>
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    <form className="admin-invite-card card" onSubmit={(event) => void invite(event)}>
      <div><span className="eyebrow">NOVO ACESSO</span><h2>Convidar usuário</h2><p>O SafeHub envia um e-mail para a pessoa criar a senha.</p></div>
      <label>Nome<input autoComplete="name" maxLength={200} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} required value={draft.nome} /></label>
      <label>E-mail<input autoComplete="email" maxLength={320} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required type="email" value={draft.email} /></label>
      <label>Acesso<select onChange={(event) => setDraft({ ...draft, cargo: event.target.value as Draft['cargo'] })} value={draft.cargo}><option value="Operador">Operador</option><option value="Administrador">Administrador</option></select></label>
      <label>Equipe<select disabled={teamsLoading} onChange={(event) => setDraft({ ...draft, equipe_id: event.target.value ? Number(event.target.value) : null })} value={draft.equipe_id ?? ''}><option value="">Sem equipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.nome}</option>)}</select></label>
      <button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Enviando…' : 'Enviar convite'}</button>
    </form>
    <div className="card client-table-card">
      <div className="table-toolbar"><div><strong>Contas SafeHub</strong><span>{filtered.length} registros</span></div><input aria-label="Buscar usuários" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" value={search} /></div>
      {loading ? <div className="table-state">Carregando usuários…</div> : filtered.length === 0 ? <div className="table-state">Nenhum usuário encontrado.</div> : <div className="table-scroll"><table className="workspace-table"><thead><tr><th>Usuário</th><th>Acesso</th><th>Equipe</th><th>Situação</th><th className="table-actions-heading">Ações</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><strong>{user.nome}</strong><small>{user.email}</small></td><td>{user.cargo ?? 'Sem cargo'}</td><td><select aria-label={`Equipe de ${user.nome}`} disabled={saving || teamsLoading} onChange={(event) => void assignTeam(user, event.target.value ? Number(event.target.value) : null)} value={user.equipe_id ?? ''}><option value="">Sem equipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.nome}</option>)}</select></td><td><span className={`status-pill ${user.ativo ? 'status-fechado' : 'status-perdido'}`}>{user.ativo ? 'Ativo' : 'Desativado'}</span></td><td className="table-actions"><button className="table-action" disabled={saving || !user.ativo || user.cargo === 'Administrador'} onClick={() => void editPermissions(user)} type="button">Permissões</button><button className="table-action" disabled={saving || !user.ativo} onClick={() => void changeRole(user)} type="button">Tornar {user.cargo === 'Administrador' ? 'operador' : 'admin'}</button><button className={`table-action${user.ativo ? ' danger' : ''}`} disabled={saving} onClick={() => void toggleActive(user)} type="button">{user.ativo ? 'Desativar' : 'Reativar'}</button></td></tr>)}</tbody></table></div>}
    </div>
    <section className="card admin-audit-card">
      <div className="table-toolbar"><div><strong>Alterações recentes</strong><span>Trilha de auditoria</span></div></div>
      {audit.length ? <div className="table-scroll"><table className="workspace-table"><thead><tr><th>Quando</th><th>Autor</th><th>Registro</th><th>Ação</th><th>Campos alterados</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id}><td>{new Date(entry.criado_em).toLocaleString('pt-BR')}</td><td>{entry.usuario_nome ?? 'Conta removida'}</td><td>{entry.entidade} · {entry.entidade_id}</td><td>{entry.acao}</td><td><code>{Object.keys(entry.alteracoes ?? {}).join(', ') || '—'}</code></td></tr>)}</tbody></table></div> : <p className="table-state">Nenhuma alteração registrada ainda.</p>}
    </section>
    {permissionUser && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPermissionUser(null); }}>
      <form className="client-modal admin-permissions-modal" onSubmit={(event) => void savePermissions(event)}>
        <div className="client-modal-heading"><div><span className="eyebrow">ACESSO POR MÓDULO</span><h2>{permissionUser.nome}</h2><p>Administradores mantêm acesso global. Gerenciar inclui visualizar.</p></div><button aria-label="Fechar" className="modal-close" onClick={() => setPermissionUser(null)} type="button">×</button></div>
        <div className="admin-permission-table"><div className="admin-permission-head"><span>Módulo</span><span>Visualizar</span><span>Gerenciar</span></div>{accessModules.map(([key,label]) => {
          const permission=permissions.find((item)=>item.modulo===key);
          return <div className="admin-permission-row" key={key}><strong>{label}</strong><label><input checked={permission?.visualizar ?? false} onChange={(event)=>setPermissions((items)=>items.map((item)=>item.modulo===key?{...item,visualizar:event.target.checked,gerenciar:event.target.checked?item.gerenciar:false}:item))} type="checkbox"/> Visualizar</label><label><input checked={permission?.gerenciar ?? false} onChange={(event)=>setPermissions((items)=>items.map((item)=>item.modulo===key?{...item,gerenciar:event.target.checked,visualizar:event.target.checked||item.visualizar}:item))} type="checkbox"/> Gerenciar</label></div>;
        })}</div>
        <div className="modal-actions"><button className="btn btn-ghost" disabled={saving} onClick={()=>setPermissionUser(null)} type="button">Cancelar</button><button className="btn btn-primary" disabled={saving} type="submit">{saving?'Salvando…':'Salvar permissões'}</button></div>
      </form>
    </div>}
  </section>;
}
