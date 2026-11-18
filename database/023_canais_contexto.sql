alter table public.canais
  add column if not exists equipe_id integer references public.equipes(id) on delete set null,
  add column if not exists projeto_id integer references public.projetos(id) on delete set null;

create index if not exists canais_equipe_idx on public.canais (equipe_id) where equipe_id is not null;
create index if not exists canais_projeto_idx on public.canais (projeto_id) where projeto_id is not null;

insert into public.canal_membros (canal_id, usuario_id)
select c.id, u.id
from public.canais c
join public.usuarios u on u.equipe_id = c.equipe_id and u.ativo = true
where c.equipe_id is not null
on conflict (canal_id, usuario_id) do nothing;
