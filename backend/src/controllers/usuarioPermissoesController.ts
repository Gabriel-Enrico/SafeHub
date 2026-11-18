import type { FastifyReply, FastifyRequest } from 'fastify';
import { database } from '../config/database.js';
import { ApiError } from '../utils/apiError.js';
import { recordAudit } from '../utils/audit.js';

export const MODULES = ['clientes','tarefas','projetos','oportunidades','agenda','documentos','editais','equipes','usuarios'] as const;
export type ModuleName = (typeof MODULES)[number];
export type ModulePermission = { modulo: ModuleName; visualizar: boolean; gerenciar: boolean };

async function adminUserId(request: FastifyRequest) {
  if (!request.user?.id) throw new ApiError(401,'UNAUTHORIZED','Usuário não autenticado.');
  const result=await database.query<{id:number;cargo:string|null}>('select id,cargo from public.usuarios where auth_user_id=$1 and ativo=true',[request.user.id]);
  if(result.rows[0]?.cargo!=='Administrador') throw new ApiError(403,'FORBIDDEN','Apenas administradores podem gerenciar permissões.');
  return result.rows[0].id;
}
function parseId(value:string) { const id=Number(value); if(!Number.isSafeInteger(id)||id<1) throw new ApiError(400,'VALIDATION_ERROR','ID de usuário inválido.'); return id; }

export async function getUsuarioPermissions(request:FastifyRequest<{Params:{id:string}}>) {
  await adminUserId(request); const userId=parseId(request.params.id);
  const result=await database.query<{modulo:ModuleName;acao:string;permitido:boolean}>('select modulo,acao,permitido from public.usuario_modulo_permissoes where usuario_id=$1',[userId]);
  const configured=(result.rowCount ?? 0)>0;
  return { configurado: configured, data: MODULES.map((modulo)=>({
    modulo, visualizar: configured ? result.rows.some((r)=>r.modulo===modulo&&r.acao==='visualizar'&&r.permitido) : false,
    gerenciar: configured ? result.rows.some((r)=>r.modulo===modulo&&r.acao==='gerenciar'&&r.permitido) : false,
  })) };
}

export async function setUsuarioPermissions(request:FastifyRequest<{Params:{id:string};Body:{permissoes:ModulePermission[]}}>,reply:FastifyReply) {
  const actor=await adminUserId(request); const userId=parseId(request.params.id);
  const target=await database.query<{cargo:string|null}>('select cargo from public.usuarios where id=$1 and ativo=true',[userId]);
  if(!target.rows[0]) throw new ApiError(404,'NOT_FOUND','Usuário ativo não encontrado.');
  if(target.rows[0].cargo==='Administrador') throw new ApiError(409,'ADMIN_PERMISSIONS_LOCKED','As permissões de administrador são globais.');
  const input=request.body.permissoes;
  if(input.length!==MODULES.length||new Set(input.map((item)=>item.modulo)).size!==MODULES.length||input.some((item)=>!MODULES.includes(item.modulo))) throw new ApiError(400,'VALIDATION_ERROR','Envie exatamente uma configuração para cada módulo.');
  const client=await database.connect();
  try {
    await client.query('begin');
    await client.query('delete from public.usuario_modulo_permissoes where usuario_id=$1',[userId]);
    for(const item of input) for(const [acao,permitido] of [['visualizar',item.visualizar],['gerenciar',item.gerenciar]] as const) {
      if(acao==='gerenciar'&&permitido&&!item.visualizar) throw new ApiError(400,'VALIDATION_ERROR','Gerenciar um módulo exige permissão para visualizar.');
      await client.query('insert into public.usuario_modulo_permissoes(usuario_id,modulo,acao,permitido,alterado_por) values($1,$2,$3,$4,$5)',[userId,item.modulo,acao,permitido,actor]);
    }
    await recordAudit(client, actor, 'usuario_permissoes', userId, 'atualizadas', Object.fromEntries(input.map((item)=>[item.modulo,{visualizar:item.visualizar,gerenciar:item.gerenciar}])));
    await client.query('commit');
  } catch(error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
  return reply.send({ message:'Permissões atualizadas.' });
}
