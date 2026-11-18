import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import { recordAudit } from '../utils/audit.js';

type PlanningParams = { projetoId: string; tipo?: string; id?: string };
type PlanningBody = { tipo?: string; titulo?: string; descricao?: string | null; prazo?: string | null; status?: string; responsavel_id?: number | null; documento_url?: string | null };

async function access(request: FastifyRequest<{ Params: PlanningParams }>, projectId: number) {
  if (!request.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Usuário não autenticado.');
  const user = await database.query<{ id: number; equipe_id: number | null; cargo: string | null }>(
    'select id, equipe_id, cargo from public.usuarios where auth_user_id=$1 and ativo=true', [request.user.id]);
  if (!user.rows[0]) throw new ApiError(403, 'PROFILE_INACTIVE', 'Perfil SafeHub não encontrado ou desativado.');
  const project = await database.query<{ equipe_id: number | null }>('select equipe_id from public.projetos where id=$1', [projectId]);
  if (!project.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.');
  if (user.rows[0].cargo !== 'Administrador' && project.rows[0].equipe_id !== user.rows[0].equipe_id) throw new ApiError(403, 'FORBIDDEN', 'Você não pode acessar este projeto.');
  return user.rows[0];
}

function parse(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'VALIDATION_ERROR', 'ID inválido.');
  return id;
}

function tableFor(type: string) {
  if (type === 'marco') return { table: 'projeto_marcos', statuses: ['pendente', 'em_andamento', 'concluido', 'atrasado'] };
  if (type === 'entregavel') return { table: 'projeto_entregaveis', statuses: ['planejado', 'em_andamento', 'entregue'] };
  throw new ApiError(400, 'VALIDATION_ERROR', 'Tipo de planejamento inválido.');
}

export async function listProjectPlanning(request: FastifyRequest<{ Params: PlanningParams }>) {
  const projectId = parse(request.params.projetoId);
  await access(request, projectId);
  const [milestones, deliverables] = await Promise.all([
    database.query(`select m.*, u.nome as responsavel_nome from public.projeto_marcos m left join public.usuarios u on u.id=m.responsavel_id where m.projeto_id=$1 order by m.prazo nulls last,m.id`, [projectId]),
    database.query(`select d.*, u.nome as responsavel_nome from public.projeto_entregaveis d left join public.usuarios u on u.id=d.responsavel_id where d.projeto_id=$1 order by d.prazo nulls last,d.id`, [projectId]),
  ]);
  return { marcos: milestones.rows, entregaveis: deliverables.rows };
}

export async function createProjectPlanning(request: FastifyRequest<{ Params: PlanningParams; Body: PlanningBody }>, reply: FastifyReply) {
  const projectId = parse(request.params.projetoId);
  const user = await access(request, projectId);
  const target = tableFor(request.body.tipo ?? '');
  const title = request.body.titulo?.trim();
  if (!title) throw new ApiError(400, 'VALIDATION_ERROR', 'Informe um título.');
  const status = request.body.status ?? target.statuses[0];
  if (!target.statuses.includes(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Status inválido.');
  if (request.body.responsavel_id != null) {
    const valid = await database.query('select 1 from public.usuarios where id=$1 and equipe_id=(select equipe_id from public.projetos where id=$2) and ativo=true', [request.body.responsavel_id, projectId]);
    if (!valid.rowCount) throw new ApiError(400, 'INVALID_OWNER', 'O responsável deve ser um membro ativo da equipe do projeto.');
  }
  const table = target.table;
  const result = await database.query(`insert into public.${table} (projeto_id,titulo,descricao,prazo,status,responsavel_id,criado_por${table === 'projeto_entregaveis' ? ',documento_url' : ''}) values ($1,$2,$3,$4,$5,$6,$7${table === 'projeto_entregaveis' ? ',$8' : ''}) returning *`,
    table === 'projeto_entregaveis'
      ? [projectId,title,request.body.descricao?.trim() || null,request.body.prazo ?? null,status,request.body.responsavel_id ?? null,user.id,request.body.documento_url?.trim() || null]
      : [projectId,title,request.body.descricao?.trim() || null,request.body.prazo ?? null,status,request.body.responsavel_id ?? null,user.id]);
  await recordAudit(database, user.id, table, result.rows[0].id, 'criado', { projeto_id: projectId, titulo: title, prazo: request.body.prazo ?? null });
  return reply.code(201).send(result.rows[0]);
}

export async function updateProjectPlanning(request: FastifyRequest<{ Params: PlanningParams; Body: PlanningBody }>, reply: FastifyReply) {
  const projectId = parse(request.params.projetoId); const id = parse(request.params.id ?? '');
  const user = await access(request, projectId); const target = tableFor(request.params.tipo ?? '');
  const fields: Array<[keyof PlanningBody,string]> = [['titulo','titulo'],['descricao','descricao'],['prazo','prazo'],['status','status'],['responsavel_id','responsavel_id'],['documento_url','documento_url']];
  const values: unknown[]=[]; const sets:string[]=[];
  for (const [key,column] of fields) { let value=request.body[key]; if (value===undefined) continue; if (key==='status' && !target.statuses.includes(String(value))) throw new ApiError(400,'VALIDATION_ERROR','Status inválido.'); if (key==='titulo' && typeof value==='string' && !value.trim()) throw new ApiError(400,'VALIDATION_ERROR','Informe um título.'); if(key==='documento_url'&&typeof value==='string'&&value.trim()){try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))throw new Error();value=url.toString();}catch{throw new ApiError(400,'VALIDATION_ERROR','Informe um link HTTP ou HTTPS válido.');}} values.push(typeof value==='string'?value.trim()||null:value); sets.push(`${column}=$${values.length}`); }
  if (!sets.length) throw new ApiError(400,'VALIDATION_ERROR','Informe campos para atualizar.');
  if (request.body.responsavel_id != null) {
    const valid = await database.query('select 1 from public.usuarios where id=$1 and equipe_id=(select equipe_id from public.projetos where id=$2) and ativo=true', [request.body.responsavel_id, projectId]);
    if (!valid.rowCount) throw new ApiError(400, 'INVALID_OWNER', 'O responsável deve ser um membro ativo da equipe do projeto.');
  }
  values.push(id,projectId);
  const result=await database.query(`update public.${target.table} set ${sets.join(',')}, atualizado_em=now() where id=$${values.length-1} and projeto_id=$${values.length} returning *`,values);
  if (!result.rowCount) throw new ApiError(404,'NOT_FOUND','Registro não encontrado.');
  await recordAudit(database,user.id,target.table,id,'atualizado',Object.fromEntries(Object.entries(request.body).map(([field,value])=>[field,{novo:value}])));
  return reply.send(result.rows[0]);
}

export async function deleteProjectPlanning(request: FastifyRequest<{ Params: PlanningParams }>) {
  const projectId=parse(request.params.projetoId); const id=parse(request.params.id??'');
  const user=await access(request,projectId); const target=tableFor(request.params.tipo??'');
  const result=await database.query(`delete from public.${target.table} where id=$1 and projeto_id=$2 returning id`,[id,projectId]);
  if (!result.rowCount) throw new ApiError(404,'NOT_FOUND','Registro não encontrado.');
  await recordAudit(database,user.id,target.table,id,'excluido',{});
  return { message:'Registro removido.' };
}
