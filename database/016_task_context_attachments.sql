alter table public.tarefas
  add column if not exists descricao text,
  add column if not exists criado_por integer references public.usuarios(id) on delete set null;

update public.tarefas t
set criado_por = h.usuario_id
from (
  select distinct on (tarefa_id) tarefa_id, usuario_id
  from public.tarefa_historico
  where origem = 'projeto' and status_anterior is null
  order by tarefa_id, criado_em, id
) h
where t.id = h.tarefa_id and t.criado_por is null;

alter table public.documentos
  add column if not exists projeto_tarefa_id integer references public.tarefas(id) on delete cascade,
  add column if not exists cliente_tarefa_id integer references public.cliente_tarefas(id) on delete cascade;

create index if not exists documentos_projeto_tarefa_idx
  on public.documentos (projeto_tarefa_id, id desc)
  where projeto_tarefa_id is not null;

create index if not exists documentos_cliente_tarefa_idx
  on public.documentos (cliente_tarefa_id, id desc)
  where cliente_tarefa_id is not null;
