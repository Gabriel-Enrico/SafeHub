create index if not exists canal_membros_usuario_canal_idx
  on public.canal_membros (usuario_id, canal_id);

create index if not exists mensagens_canal_enviado_idx
  on public.mensagens (canal_id, enviado_em desc, id desc);

alter table public.mensagens
  alter column enviado_em set default now();

create or replace function public.usuario_pode_acessar_canal(p_canal_id integer)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.canais c on c.id = p_canal_id
    where u.auth_user_id = auth.uid()
      and u.ativo = true
      and (
        u.cargo = 'Administrador'
        or exists (
          select 1 from public.canal_membros cm
          where cm.canal_id = c.id and cm.usuario_id = u.id
        )
      )
  );
$$;

revoke all on function public.usuario_pode_acessar_canal(integer) from public, anon;
grant execute on function public.usuario_pode_acessar_canal(integer) to authenticated;

alter table public.mensagens enable row level security;
revoke all on table public.mensagens from anon, authenticated;
grant select on table public.mensagens to authenticated;
drop policy if exists mensagens_leitura_membros_canal on public.mensagens;
create policy mensagens_leitura_membros_canal
  on public.mensagens for select to authenticated
  using (public.usuario_pode_acessar_canal(canal_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'mensagens'
     ) then
    alter publication supabase_realtime add table public.mensagens;
  end if;
end;
$$;
