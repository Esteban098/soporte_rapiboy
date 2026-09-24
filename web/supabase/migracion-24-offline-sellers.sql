-- Migración 24: conservar el estado offline de Rapiboy para sellers/dropoff.

begin;

alter table public.sellers_activos
  add column if not exists offline_sistema boolean not null default false;

create index if not exists sellers_activos_offline_idx
  on public.sellers_activos (offline_sistema, lleva_dropoff, activo);

commit;
