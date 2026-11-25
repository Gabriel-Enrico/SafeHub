import { z } from 'zod';

const id = z.number().int().positive();
const ids = z.array(id).refine((items) => new Set(items).size === items.length, 'Não repita os itens.');
const text = (max: number) => z.string().trim().min(1, 'Este campo é obrigatório.').max(max, `Use no máximo ${max} caracteres.`);
const optionalText = (max: number) => z.string().max(max).nullable().optional();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida no formato AAAA-MM-DD.').refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'A data informada não existe.');
const dateTime = z.string().datetime({ offset: true, message: 'Informe data e hora válidas.' });
const nullableId = id.nullable().optional();
const nonEmptyPatch = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualizar.');

const clientFields = {
  nome: text(200), setor: optionalText(120), status_pipeline: text(50).optional(), responsavel_id: nullableId,
  pais: optionalText(120), site: z.string().max(500).nullable().optional(),
  origem_relacionamento: optionalText(120), endereco: z.string().max(500).nullable().optional(),
  observacoes: z.string().max(5000).nullable().optional(),
};
const contactFields = {
  nome: text(200), cargo: optionalText(160), email: z.string().email('Informe um e-mail válido.').max(320).nullable().optional(),
  telefone: z.string().max(60).nullable().optional(),
};
const taskFields = {
  titulo: text(200), descricao: z.string().max(5000).nullable().optional(),
  prioridade: z.enum(['baixa', 'media', 'alta', 'urgente']).optional(),
  prazo: dateOnly.nullable().optional(), responsaveis_ids: ids.optional(),
};
const projectFields = {
  nome: text(200), descricao: z.string().max(5000).nullable().optional(), equipe_id: id,
  cliente_id: id, data_inicio: dateOnly.nullable().optional(), membros_ids: ids.optional(), responsavel_id: id.optional(),
};
const eventDateTime = z.object({ dateTime: z.string().min(1).max(80), timeZone: z.string().min(1).max(100) }).strict();
const eventFields = {
  subject: text(255),
  body: z.object({ contentType: z.enum(['Text', 'HTML']), content: z.string().max(20000) }).strict().optional(),
  start: eventDateTime, end: eventDateTime,
  location: z.object({ displayName: z.string().max(255) }).strict().optional(),
  isAllDay: z.boolean().optional(),
  attendees: z.array(z.object({ emailAddress: z.object({ address: z.string().email().max(320), name: z.string().max(255).optional() }).strict(), type: z.enum(['required', 'optional', 'resource']) }).strict()).max(100).optional(),
};

// Clientes, contatos e interações.
const schemas: Array<{ method: string; path: RegExp; schema: z.ZodType }> = [
  { method: 'POST', path: /^\/clientes$/, schema: z.object({ ...clientFields, nome: text(200) }).strict() },
  { method: 'PATCH', path: /^\/clientes\/\d+$/, schema: nonEmptyPatch(clientFields) },
  { method: 'POST', path: /^\/clientes\/\d+\/contatos$/, schema: z.object({ ...contactFields, nome: text(200) }).strict() },
  { method: 'PATCH', path: /^\/clientes\/\d+\/contatos\/\d+$/, schema: nonEmptyPatch(contactFields) },
  { method: 'POST', path: /^\/clientes\/\d+\/interacoes$/, schema: z.object({
    tipo: z.enum(['reuniao', 'ligacao', 'email', 'mensagem', 'solicitacao', 'outro']), titulo: text(250), data_inicio: dateTime,
    data_fim: dateTime.nullable().optional(), status_relacionado: z.enum(['reuniao_realizada', 'ligacao_realizada', 'email_enviado', 'mensagem_enviada', 'solicitacao_aberta', 'aguardando_resposta', 'concluida']),
    proxima_acao: z.string().max(5000).nullable().optional(), decisoes: z.string().max(5000).nullable().optional(),
    participantes_safe_ids: ids.max(50).optional(), participantes_cliente_ids: ids.max(50).optional(), resumo: text(5000), contato_id: nullableId,
    tarefa: z.object({ titulo: text(250), descricao: z.string().max(5000).nullable().optional(), responsavel_id: nullableId, responsaveis_ids: ids.max(50).optional(), equipe_id: nullableId, prazo: dateOnly.nullable().optional(), prioridade: z.enum(['baixa', 'media', 'alta', 'urgente']).optional(), status: z.enum(['a_fazer', 'em_andamento', 'bloqueada', 'em_revisao', 'concluida']).optional() }).strict().nullable().optional(),
  }).strict() },
  // Oportunidades, projetos, planejamento e tarefas.
  { method: 'POST', path: /^\/oportunidades$/, schema: z.object({ titulo: text(200), cliente_id: id, valor_estimado: z.number().nonnegative().nullable().optional(), previsao_fechamento: dateOnly.nullable().optional(), proxima_acao: z.string().max(2000).nullable().optional() }).strict() },
  { method: 'PATCH', path: /^\/oportunidades\/\d+\/proxima-acao$/, schema: z.object({ proxima_acao: z.string().max(2000).nullable() }).strict() },
  { method: 'PATCH', path: /^\/oportunidades\/\d+\/estagio$/, schema: z.object({ estagio: z.enum(['prospeccao', 'proposta_enviada', 'negociacao']) }).strict() },
  { method: 'PATCH', path: /^\/oportunidades\/\d+$/, schema: nonEmptyPatch({ titulo: text(200), cliente_id: id, responsavel_id: nullableId, valor_estimado: z.number().nonnegative().nullable().optional(), previsao_fechamento: dateOnly.nullable().optional(), proxima_acao: z.string().max(2000).nullable().optional() }) },
  { method: 'POST', path: /^\/projetos$/, schema: z.object({ ...projectFields, nome: text(200), equipe_id: id, cliente_id: id }).strict() },
  { method: 'PATCH', path: /^\/projetos\/\d+$/, schema: nonEmptyPatch({ ...projectFields, status: z.enum(['em_planejamento', 'em_andamento', 'concluido']).optional() }) },
  { method: 'POST', path: /^\/projetos\/\d+\/planejamento$/, schema: z.object({ tipo: z.enum(['marco', 'entregavel']), titulo: text(200), descricao: z.string().max(4000).nullable().optional(), prazo: dateOnly.nullable().optional(), status: z.enum(['pendente', 'em_andamento', 'concluido', 'atrasado', 'planejado', 'entregue']).optional(), responsavel_id: nullableId, documento_url: z.string().max(2000).nullable().optional() }).strict() },
  { method: 'PATCH', path: /^\/projetos\/\d+\/planejamento\/(marco|entregavel)\/\d+$/, schema: nonEmptyPatch({ titulo: text(200).optional(), descricao: z.string().max(4000).nullable().optional(), prazo: dateOnly.nullable().optional(), status: z.enum(['pendente', 'em_andamento', 'concluido', 'atrasado', 'planejado', 'entregue']).optional(), responsavel_id: nullableId, documento_url: z.string().max(2000).nullable().optional() }) },
  { method: 'POST', path: /^\/projetos\/\d+\/tarefas$/, schema: z.object(taskFields).strict() },
  { method: 'PATCH', path: /^\/tarefas\/\d+$/, schema: nonEmptyPatch({ ...taskFields, coluna_kanban: z.enum(['a_fazer', 'em_andamento', 'bloqueada', 'em_revisao', 'concluida']).optional() }) },
  { method: 'PATCH', path: /^\/tarefas\/(projeto|cliente)\/\d+\/status$/, schema: z.object({ status: z.enum(['a_fazer', 'em_andamento', 'bloqueada', 'em_revisao', 'concluida']) }).strict() },
  { method: 'POST', path: /^\/tarefas\/(projeto|cliente)\/\d+\/comentarios$/, schema: z.object({ comentario: text(5000) }).strict() },
  // Editais e biblioteca de respostas.
  { method: 'POST', path: /^\/editais$/, schema: z.object({ titulo: text(250), instituicao: text(200), link_oficial: z.string().max(2000).nullable().optional(), prazo: dateOnly.nullable().optional(), status: z.enum(['mapeado', 'em_preparacao', 'submetido', 'aprovado', 'reprovado', 'arquivado']).optional(), responsavel_id: nullableId, projeto_id: nullableId, requisitos: z.string().max(10000).nullable().optional(), observacoes: z.string().max(5000).nullable().optional() }).strict() },
  { method: 'PATCH', path: /^\/editais\/\d+$/, schema: nonEmptyPatch({ titulo: text(250), instituicao: text(200), link_oficial: z.string().max(2000).nullable().optional(), prazo: dateOnly.nullable().optional(), status: z.enum(['mapeado', 'em_preparacao', 'submetido', 'aprovado', 'reprovado', 'arquivado']).optional(), responsavel_id: nullableId, projeto_id: nullableId, requisitos: z.string().max(10000).nullable().optional(), observacoes: z.string().max(5000).nullable().optional() }) },
  { method: 'POST', path: /^\/editais\/\d+\/checklist$/, schema: z.object({ titulo: text(250), descricao: z.string().max(5000).nullable().optional(), responsavel_id: nullableId, prazo: dateOnly.nullable().optional(), documento_url: z.string().max(2000).nullable().optional(), drive_item_id: z.string().max(512).nullable().optional() }).strict() },
  { method: 'PATCH', path: /^\/editais\/\d+\/checklist\/\d+$/, schema: nonEmptyPatch({ titulo: text(250), descricao: z.string().max(5000).nullable().optional(), responsavel_id: nullableId, prazo: dateOnly.nullable().optional(), documento_url: z.string().max(2000).nullable().optional(), drive_item_id: z.string().max(512).nullable().optional(), concluido: z.boolean().optional() }) },
  { method: 'POST', path: /^\/biblioteca-respostas$/, schema: z.object({ titulo: text(250), categoria: text(120), texto: text(20000), versao: z.string().max(60).optional(), aprovado: z.boolean().optional() }).strict() },
  { method: 'PATCH', path: /^\/biblioteca-respostas\/\d+$/, schema: nonEmptyPatch({ titulo: text(250), categoria: text(120), texto: text(20000), versao: z.string().max(60).optional(), aprovado: z.boolean().optional() }) },
  // Usuários, equipes e permissões.
  { method: 'POST', path: /^\/usuarios$/, schema: z.object({ nome: text(200), email: z.string().email('Informe um e-mail válido.').max(320), cargo: z.enum(['Administrador', 'Operador']), equipe_id: nullableId }).strict() },
  { method: 'PATCH', path: /^\/usuarios\/\d+$/, schema: nonEmptyPatch({ nome: text(200), cargo: z.enum(['Administrador', 'Operador']).optional(), equipe_id: nullableId, avatar: z.string().max(1000).nullable().optional(), ativo: z.boolean().optional() }) },
  { method: 'POST', path: /^\/equipes$/, schema: z.object({ nome: text(100) }).strict() },
  { method: 'PUT', path: /^\/usuarios\/\d+\/permissoes$/, schema: z.object({ permissoes: z.array(z.object({ modulo: z.enum(['clientes', 'tarefas', 'projetos', 'oportunidades', 'agenda', 'documentos', 'editais', 'equipes', 'usuarios']), visualizar: z.boolean(), gerenciar: z.boolean() }).strict()).length(9) }).strict() },
  // Agenda Outlook e biblioteca do OneDrive.
  { method: 'POST', path: /^\/integracoes\/outlook\/availability$/, schema: z.object({ emails: z.array(z.string().email()).min(1).max(20).refine((items) => new Set(items).size === items.length, 'Não repita os e-mails.'), startDateTime: dateTime, endDateTime: dateTime }).strict() },
  { method: 'POST', path: /^\/integracoes\/outlook\/events$/, schema: z.object(eventFields).strict() },
  { method: 'PATCH', path: /^\/integracoes\/outlook\/events\/[^/]+$/, schema: nonEmptyPatch(eventFields) },
  { method: 'POST', path: /^\/integracoes\/outlook\/events\/[^/]+\/vinculos$/, schema: z.object({ vinculo_tipo: z.enum(['cliente', 'contato', 'interacao', 'projeto', 'tarefa_projeto', 'tarefa_cliente']), vinculo_id: id }).strict() },
  { method: 'POST', path: /^\/integracoes\/onedrive\/library$/, schema: z.object({ drive_item_id: text(512), nome: text(255), web_url: z.string().url().max(2000), categoria: text(120), versao: z.string().max(60).optional(), revisar_em: dateOnly.nullable().optional(), equipe_id: nullableId, vinculo_tipo: z.enum(['cliente', 'projeto', 'edital', 'tarefa_projeto', 'tarefa_cliente']).nullable().optional(), vinculo_id: nullableId }).strict() },
  { method: 'PATCH', path: /^\/integracoes\/onedrive\/library\/\d+$/, schema: nonEmptyPatch({ categoria: text(120), versao: z.string().max(60).optional(), revisar_em: dateOnly.nullable().optional(), equipe_id: nullableId, vinculo_tipo: z.enum(['cliente', 'projeto', 'edital', 'tarefa_projeto', 'tarefa_cliente']).nullable().optional(), vinculo_id: nullableId }) },
];

export function validateOutgoingRequest(path: string, options: RequestInit): RequestInit {
  if (typeof options.body !== 'string') return options;
  let body: unknown;
  try { body = JSON.parse(options.body); } catch { return options; }
  const method = (options.method ?? 'GET').toUpperCase();
  const cleanPath = path.split('?')[0].replace(/^\/api\/v1/, '');
  const entry = schemas.find((item) => item.method === method && item.path.test(cleanPath));
  if (!entry) return options;
  const parsed = entry.schema.safeParse(body);
  if (!parsed.success) {
    const labels: Record<string, string> = {
      nome: 'Nome', titulo: 'Título', email: 'E-mail', telefone: 'Telefone', cargo: 'Cargo',
      setor: 'Setor', pais: 'País', site: 'Site', endereco: 'Endereço', observacoes: 'Observações',
      status_pipeline: 'Status', responsavel_id: 'Responsável', cliente_id: 'Cliente', equipe_id: 'Equipe',
      projeto_id: 'Projeto', prazo: 'Prazo', valor_estimado: 'Valor estimado', previsao_fechamento: 'Previsão de fechamento',
      data_inicio: 'Data e hora inicial', data_fim: 'Data e hora final', resumo: 'Resumo',
      tipo: 'Tipo', instituicao: 'Instituição', link_oficial: 'Link oficial', categoria: 'Categoria',
      texto: 'Texto', versao: 'Versão', comentario: 'Comentário', subject: 'Assunto', start: 'Início', end: 'Término',
      web_url: 'Link do arquivo', drive_item_id: 'Arquivo do OneDrive', participantes_safe_ids: 'Participantes SafeHub',
      participantes_cliente_ids: 'Participantes do cliente', responsaveis_ids: 'Responsáveis', membros_ids: 'Membros',
    };
    const details = parsed.error.issues.map((issue) => {
      const key = String(issue.path.at(-1) ?? 'dados');
      let message = issue.message;
      if (issue.code === 'too_small') message = 'Informe um valor válido.';
      else if (issue.code === 'too_big') message = 'O valor excede o limite permitido.';
      else if (issue.code === 'invalid_format') message = key === 'email' || key === 'address' ? 'Informe um e-mail válido.' : 'O formato informado é inválido.';
      else if (issue.code === 'invalid_type') message = 'Confira o tipo de valor informado.';
      else if (issue.code === 'invalid_value') message = 'Selecione uma opção válida.';
      return `${labels[key] ?? key}: ${message}`;
    });
    throw new Error(`Confira os campos: ${details.join(' · ')}`);
  }
  return { ...options, body: JSON.stringify(parsed.data) };
}
