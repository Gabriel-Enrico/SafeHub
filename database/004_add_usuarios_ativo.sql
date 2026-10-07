alter table public.usuarios
  add column if not exists ativo boolean not null default true;
