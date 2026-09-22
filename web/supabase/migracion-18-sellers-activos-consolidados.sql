-- Migración 18: seller activo consolidado por Usuario.Id.
-- Esta primera etapa no elimina las tablas del directorio anterior.

begin;

create table if not exists public.sellers_activos (
  id_usuario bigint primary key,
  nombre text not null,
  hora_corte time,
  direccion text,
  fecha_activacion date,
  celular text,
  comercial text,
  email text,
  lleva_bodega boolean,
  lleva_dropoff boolean,
  paga_colecta boolean,
  tope_maximo integer,
  grupo_jid text,
  grupo_nombre text,
  labels_waha jsonb not null default '[]'::jsonb,
  soporte_asignado text check (soporte_asignado in ('CANDE', 'ESTEBAN')),
  soporte_asignado_por text,
  soporte_asignado_en timestamptz,
  activo boolean not null default true,
  visto_por_ultima_vez timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_sync_id text not null
);

create index if not exists sellers_activos_activo_nombre_idx
  on public.sellers_activos (activo, nombre, id_usuario);

create index if not exists sellers_activos_soporte_idx
  on public.sellers_activos (soporte_asignado, activo);

create index if not exists sellers_activos_grupo_idx
  on public.sellers_activos (grupo_jid)
  where activo and grupo_jid is not null;

alter table public.sellers_activos enable row level security;

create or replace view public.sellers_activos_operativo
with (security_invoker = true) as
select
  id_usuario,
  nombre,
  hora_corte,
  direccion,
  fecha_activacion,
  celular,
  comercial,
  email,
  lleva_bodega,
  lleva_dropoff,
  paga_colecta,
  tope_maximo,
  grupo_jid,
  grupo_nombre,
  labels_waha,
  soporte_asignado,
  soporte_asignado_por,
  soporte_asignado_en,
  actualizado_en
from public.sellers_activos
where activo;

commit;

