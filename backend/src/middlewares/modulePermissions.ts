import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import { MODULES, type ModuleName } from '../controllers/usuarioPermissoesController.js';

function routeModule(url:string):ModuleName|null {
  const path=url.split('?')[0].replace(/^\/api\/v1/, '');
  if(path.startsWith('/clientes')) return 'clientes';
  if(path.startsWith('/oportunidades')) return 'oportunidades';
  if(path.startsWith('/projetos')) return 'projetos';
  if(path.startsWith('/tarefas')) return 'tarefas';
  if(path.startsWith('/editais')) return 'editais';
  if(path.startsWith('/integracoes/outlook')) return 'agenda';
  if(path.startsWith('/integracoes/onedrive')||path.startsWith('/documentos')) return 'documentos';
  if(path.startsWith('/equipes')) return 'equipes';
  if(path.startsWith('/usuarios')||path.startsWith('/auditoria')) return 'usuarios';
  return null;
}

export async function requireModulePermission(request:FastifyRequest,_reply:FastifyReply) {
  if(!request.user?.id||request.method==='OPTIONS') return;
  const path=request.url.split('?')[0].replace(/^\/api\/v1/, '');
  if(path === '/usuarios/me') return;
  const module=routeModule(request.url);
  if(!module||!MODULES.includes(module)) return;
  const action=request.method==='GET'||request.method==='HEAD'?'visualizar':'gerenciar';
  const required: Array<{ module: ModuleName; action: 'visualizar'|'gerenciar' }> = [{ module, action }];
  if(/^\/clientes\/\d+\/tarefas(?:\/|$)/.test(path)) required.push({ module: 'tarefas', action });
  if(/^\/projetos\/\d+\/tarefas(?:\/|$)/.test(path)) required.push({ module: 'tarefas', action });
  if(request.method==='POST'&&/^\/clientes\/\d+\/interacoes(?:\/|$)/.test(path)&&
    typeof request.body==='object'&&request.body!==null&&'tarefa' in request.body&&request.body.tarefa) {
    required.push({ module: 'tarefas', action: 'gerenciar' });
  }
  if(request.method==='POST'&&/^\/editais\/\d+\/checklist\/\d+\/tarefa$/.test(path)) required.push({ module: 'tarefas', action: 'gerenciar' });
  const uniqueRequired=[...new Map(required.map((item)=>[`${item.module}:${item.action}`,item])).values()];
  const result=await database.query<{cargo:string|null;modulo:ModuleName|null;acao:'visualizar'|'gerenciar'|null;permitido:boolean|null}>(
    `select u.cargo,p.modulo,p.acao,p.permitido
     from public.usuarios u
     left join public.usuario_modulo_permissoes p on p.usuario_id=u.id
     where u.auth_user_id=$1 and u.ativo=true`,[request.user.id]);
  const profile=result.rows[0];
  if(!profile) throw new ApiError(403,'PROFILE_INACTIVE','Perfil SafeHub não encontrado ou desativado.');
  if(profile.cargo==='Administrador') return;
  for(const requiredPermission of uniqueRequired) {
    if(!result.rows.some((permission)=>permission.modulo===requiredPermission.module&&permission.acao===requiredPermission.action&&permission.permitido))
      throw new ApiError(403,'MODULE_ACCESS_DENIED','Seu perfil não tem permissão para acessar este módulo.');
  }
}
