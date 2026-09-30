-- O frontend não deve consultar nem alterar o cache de tokens diretamente.
alter table public.usuario_integracoes enable row level security;

revoke all on table public.usuario_integracoes from anon, authenticated;
