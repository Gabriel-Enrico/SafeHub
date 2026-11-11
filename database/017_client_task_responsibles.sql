create table if not exists public.cliente_tarefa_responsaveis (
  cliente_tarefa_id integer not null references public.cliente_tarefas(id) on delete cascade,
  usuario_id integer not null references public.usuarios(id) on delete cascade,
  atribuido_em timestamptz not null default now(),
  primary key (cliente_tarefa_id, usuario_id)
);

insert into public.cliente_tarefa_responsaveis (cliente_tarefa_id, usuario_id)
select id, responsavel_id
from public.cliente_tarefas
where responsavel_id is not null
on conflict do nothing;

create index if not exists cliente_tarefa_responsaveis_usuario_idx
  on public.cliente_tarefa_responsaveis (usuario_id, cliente_tarefa_id);

alter table public.cliente_tarefa_responsaveis enable row level security;
