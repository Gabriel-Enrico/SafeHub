-- Apply after 011_interacoes_detalhadas.sql.
-- Adds the organization profile fields shown in the client CRM prototype.
alter table public.clientes
  add column if not exists endereco varchar(500),
  add column if not exists observacoes text;

create index if not exists clientes_active_country_status_idx
  on public.clientes (pais, status_pipeline);
