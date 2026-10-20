-- Registra o Microsoft OneDrive no catálogo usado por usuario_integracoes.
insert into public.integracoes (id, nome, status)
select
  coalesce((select max(id) + 1 from public.integracoes), 1),
  'Microsoft OneDrive',
  'ativo'
where not exists (
  select 1
  from public.integracoes
  where lower(trim(nome)) in ('onedrive', 'microsoft onedrive')
);
