alter table public.projetos add column if not exists descricao text;

update public.projetos set status = case
  when status is null or trim(status) = '' then 'em_planejamento'
  when lower(trim(status)) in ('em_planejamento', 'em planejamento', 'planejamento') then 'em_planejamento'
  when lower(trim(status)) in ('em_andamento', 'em andamento', 'andamento') then 'em_andamento'
  when lower(trim(status)) in ('concluido', 'concluído', 'concluida', 'concluída') then 'concluido'
  else status
end where status is null or trim(status) = '' or lower(trim(status)) in (
  'em_planejamento', 'em planejamento', 'planejamento', 'em_andamento', 'em andamento', 'andamento',
  'concluido', 'concluído', 'concluida', 'concluída'
);
update public.tarefas set coluna_kanban = case
  when coluna_kanban is null or trim(coluna_kanban) = '' then 'a_fazer'
  when lower(trim(coluna_kanban)) in ('a_fazer', 'a fazer', 'todo', 'to_do') then 'a_fazer'
  when lower(trim(coluna_kanban)) in ('em_andamento', 'em andamento', 'doing', 'in_progress') then 'em_andamento'
  when lower(trim(coluna_kanban)) in ('concluido', 'concluído', 'concluida', 'concluída', 'done') then 'concluida'
  else coluna_kanban
end where coluna_kanban is null or trim(coluna_kanban) = '' or lower(trim(coluna_kanban)) in (
  'a_fazer', 'a fazer', 'todo', 'to_do', 'em_andamento', 'em andamento', 'doing', 'in_progress',
  'concluido', 'concluído', 'concluida', 'concluída', 'done'
);
update public.tarefas set prioridade = 'media' where prioridade is null or trim(prioridade) = '';
update public.tarefas set prioridade = case
  when lower(trim(prioridade)) in ('baixa', 'low') then 'baixa'
  when lower(trim(prioridade)) in ('alta', 'high') then 'alta'
  when lower(trim(prioridade)) in ('urgente', 'urgent') then 'urgente'
  when lower(trim(prioridade)) in ('media', 'média', 'medium') then 'media'
  else prioridade
end where lower(trim(prioridade)) in ('baixa', 'low', 'alta', 'high', 'urgente', 'urgent', 'media', 'média', 'medium');

create index if not exists tarefas_projeto_kanban_idx on public.tarefas (projeto_id, coluna_kanban);
create index if not exists tarefa_responsavel_usuario_idx on public.tarefa_responsavel (usuario_id, tarefa_id);

alter table public.projetos enable row level security;
alter table public.tarefas enable row level security;
alter table public.tarefa_responsavel enable row level security;
