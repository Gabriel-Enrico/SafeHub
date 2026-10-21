import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';

type Team = { id: number; nome: string };
type User = { id: number; nome: string; email: string; equipe_id: number | null; ativo: boolean };

async function request<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const token = await getCurrentAccessToken() || accessToken;
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(result?.message ?? `Erro HTTP ${response.status}.`);
  return result as T;
}

export default function TeamsScreen({ token }: { token: string }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teamName, setTeamName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [teamRows, userResult] = await Promise.all([
        request<Team[]>(token, '/api/v1/equipes'),
        request<{ data: User[] }>(token, '/api/v1/usuarios?limit=100&offset=0'),
      ]);
      setTeams(teamRows);
      setUsers(userResult.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar equipes e usuários.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadTeams(); }, [loadTeams]);

  async function createTeam(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await request<Team>(token, '/api/v1/equipes', {
        method: 'POST',
        body: JSON.stringify({ nome: teamName.trim() }),
      });
      setTeamName('');
      setNotice('Equipe criada com sucesso.');
      await loadTeams();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a equipe.');
    } finally {
      setSaving(false);
    }
  }

  async function addUserToTeam(team: Team) {
    const userId = Number(selectedUsers[team.id]);
    const user = users.find((candidate) => candidate.id === userId);
    if (!user || user.equipe_id !== null) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await request<User>(token, `/api/v1/usuarios/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ equipe_id: team.id }),
      });
      setUsers((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setSelectedUsers((current) => ({ ...current, [team.id]: '' }));
      setNotice(`${user.nome} foi adicionado à equipe ${team.nome}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o usuário à equipe.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="screen-content">
    <div className="screen-head"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Equipes</h1><p>Crie equipes para organizar projetos e vincular usuários.</p></div></div>
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    <form className="admin-team-card card" onSubmit={(event) => void createTeam(event)}>
      <div><span className="eyebrow">NOVA EQUIPE</span><h2>Criar equipe</h2><p>Informe um nome claro para identificar os membros e projetos.</p></div>
      <label>Nome<input autoComplete="organization" maxLength={100} onChange={(event) => setTeamName(event.target.value)} placeholder="Ex.: Comercial" required value={teamName} /></label>
      <button className="btn btn-primary" disabled={saving || !teamName.trim()} type="submit">{saving ? 'Salvando…' : 'Criar equipe'}</button>
    </form>
    <div className="card client-table-card">
      <div className="table-toolbar"><div><strong>Equipes cadastradas</strong><span>{teams.length} registros</span></div><button className="table-action" disabled={loading} onClick={() => void loadTeams()} type="button">Atualizar</button></div>
      {loading ? <div className="table-state">Carregando equipes e usuários…</div> : teams.length === 0 ? <div className="table-state">Nenhuma equipe cadastrada.</div> : <div className="table-scroll"><table className="workspace-table"><thead><tr><th>Equipe</th><th>Membros</th><th>Adicionar usuário</th></tr></thead><tbody>{teams.map((team) => {
        const members = users.filter((user) => user.equipe_id === team.id);
        const availableUsers = users.filter((user) => user.ativo && user.equipe_id === null);
        return <tr key={team.id}>
          <td><strong>{team.nome}</strong></td>
          <td>{members.length ? members.map((member) => <span className="team-member-chip" key={member.id}><strong>{member.nome}{!member.ativo ? ' · desativado' : ''}</strong><small>{member.email}</small></span>) : <span className="table-muted">Sem usuários vinculados</span>}</td>
          <td><div className="team-add-user"><select aria-label={`Selecionar usuário para ${team.nome}`} disabled={saving || availableUsers.length === 0} onChange={(event) => setSelectedUsers((current) => ({ ...current, [team.id]: event.target.value }))} value={selectedUsers[team.id] ?? ''}><option value="">{availableUsers.length ? 'Escolha um usuário' : 'Sem usuários disponíveis'}</option>{availableUsers.map((user) => <option key={user.id} value={user.id}>{user.nome} · {user.email}</option>)}</select><button className="table-action" disabled={saving || !selectedUsers[team.id]} onClick={() => void addUserToTeam(team)} type="button">Adicionar</button></div></td>
        </tr>;
      })}</tbody></table></div>}
    </div>
    {!loading && <div className="card client-table-card team-unassigned-card">
      <div className="table-toolbar"><div><strong>Usuários sem equipe</strong><span>{users.filter((user) => user.equipe_id === null).length} registros</span></div></div>
      {users.filter((user) => user.equipe_id === null).length === 0 ? <div className="table-state">Todos os usuários estão vinculados a uma equipe.</div> : <div className="team-unassigned-list">{users.filter((user) => user.equipe_id === null).map((user) => <div className="team-unassigned-user" key={user.id}><div><strong>{user.nome}</strong><small>{user.email}</small></div><span className={`status-pill ${user.ativo ? 'status-fechado' : 'status-perdido'}`}>{user.ativo ? 'Ativo' : 'Desativado'}</span></div>)}</div>}
      <p className="team-unassigned-hint">A lista de adição por equipe oferece usuários ativos sem equipe. Os e-mails ajudam a diferenciar pessoas com o mesmo nome.</p>
    </div>}
  </section>;
}
