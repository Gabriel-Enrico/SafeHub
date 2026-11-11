alter table public.cliente_tarefas
  add column if not exists equipe_id integer references public.equipes(id) on delete set null;

create index if not exists cliente_tarefas_equipe_status_prazo_idx
  on public.cliente_tarefas (equipe_id, status, prazo);
