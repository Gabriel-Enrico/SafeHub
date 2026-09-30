-- Registra o Microsoft Outlook no catálogo de integrações.
-- O status aqui indica que o serviço está disponível no SafeHub;
-- o status da conexão de cada pessoa fica em public.usuario_integracoes.
insert into public.integracoes (id, nome, status)
select
  coalesce((select max(id) + 1 from public.integracoes), 1),
  'Microsoft Outlook',
  'ativo'
where not exists (
  select 1
  from public.integracoes
  where lower(trim(nome)) in ('outlook', 'microsoft outlook')
);
