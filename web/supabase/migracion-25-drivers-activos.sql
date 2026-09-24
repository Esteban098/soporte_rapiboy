-- Migración 25: catálogo operativo consolidado de drivers.
-- La fila se identifica por Motoboy.Id; conserva la información sincronizada
-- desde SQL Server, el grupo de WhatsApp y el punto manual del KMZ.

begin;

create table if not exists public.drivers_activos (
  id_motoboy bigint primary key,
  nombre text not null,
  condicion text,
  flotilla text,
  ultima_reserva timestamptz,
  grupo_jid text,
  grupo_nombre text,
  labels_waha jsonb not null default '[{"id":"10","name":"Drivers"}]'::jsonb,
  ubicacion_manual text,
  latitud_manual double precision,
  longitud_manual double precision,
  activo boolean not null default true,
  visto_por_ultima_vez timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_sync_id text not null
);

create index if not exists drivers_activos_idx on public.drivers_activos (activo, nombre);
create index if not exists drivers_activos_ubicacion_idx on public.drivers_activos (id_motoboy)
  where latitud_manual is not null and longitud_manual is not null;

alter table public.drivers_activos enable row level security;

insert into public.drivers_activos (
  id_motoboy, nombre, condicion, flotilla, ultima_reserva,
  ubicacion_manual, latitud_manual, longitud_manual,
  activo, visto_por_ultima_vez, actualizado_en, ultimo_sync_id
)
select
  d.id_motoboy, d.nombre, d.condicion, d.flotilla, d.ultima_reserva,
  c.nombre, c.latitud, c.longitud,
  d.activo, d.visto_por_ultima_vez, d.actualizado_en, d.ultimo_sync_id
from public.directorio_drivers d
left join public.tracker_choferes c on c.id_motoboy = d.id_motoboy
on conflict (id_motoboy) do nothing;

-- Compatibilidad durante la transición: el flujo 13 existente todavía escribe
-- directorio_drivers hasta que se reemplace/importa su nodo de upsert.
create or replace function public.sincronizar_driver_legacy()
returns trigger language plpgsql as $$
begin
  insert into public.drivers_activos (
    id_motoboy, nombre, condicion, flotilla, ultima_reserva,
    activo, visto_por_ultima_vez, actualizado_en, ultimo_sync_id
  ) values (
    new.id_motoboy, new.nombre, new.condicion, new.flotilla, new.ultima_reserva,
    new.activo, new.visto_por_ultima_vez, new.actualizado_en, new.ultimo_sync_id
  )
  on conflict (id_motoboy) do update set
    nombre = excluded.nombre,
    condicion = excluded.condicion,
    flotilla = excluded.flotilla,
    ultima_reserva = excluded.ultima_reserva,
    activo = excluded.activo,
    visto_por_ultima_vez = excluded.visto_por_ultima_vez,
    actualizado_en = excluded.actualizado_en,
    ultimo_sync_id = excluded.ultimo_sync_id;
  return new;
end;
$$;

drop trigger if exists directorio_drivers_a_activos on public.directorio_drivers;
create trigger directorio_drivers_a_activos
after insert or update on public.directorio_drivers
for each row execute function public.sincronizar_driver_legacy();

create or replace view public.directorio_contactos_whatsapp
with (security_invoker = true) as
select 'SELLER'::text as tipo_entidad, s.id_usuario as id_entidad, s.nombre,
       s.activo, a.grupo_jid, g.nombre_grupo, a.origen, s.actualizado_en
from public.sellers_activos s
left join public.whatsapp_asignaciones a
  on a.tipo_entidad = 'SELLER' and a.id_entidad = s.id_usuario
left join public.whatsapp_grupos g on g.grupo_jid = a.grupo_jid
union all
select 'DRIVER'::text, d.id_motoboy, d.nombre, d.activo,
       coalesce(d.grupo_jid, a.grupo_jid),
       coalesce(d.grupo_nombre, g.nombre_grupo),
       coalesce(a.origen, 'AUTOMATICO'), d.actualizado_en
from public.drivers_activos d
left join public.whatsapp_asignaciones a
  on a.tipo_entidad = 'DRIVER' and a.id_entidad = d.id_motoboy
left join public.whatsapp_grupos g on g.grupo_jid = a.grupo_jid;

create or replace function public.sincronizar_grupo_driver()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    update public.drivers_activos
       set grupo_jid = null, grupo_nombre = null, actualizado_en = now()
     where id_motoboy = old.id_entidad and old.tipo_entidad = 'DRIVER';
    return old;
  end if;
  if new.tipo_entidad = 'DRIVER' then
    update public.drivers_activos d
       set grupo_jid = new.grupo_jid,
           grupo_nombre = g.nombre_grupo,
           actualizado_en = now()
      from public.whatsapp_grupos g
     where d.id_motoboy = new.id_entidad and g.grupo_jid = new.grupo_jid;
  end if;
  return new;
end;
$$;

drop trigger if exists asignacion_driver_a_activos on public.whatsapp_asignaciones;
create trigger asignacion_driver_a_activos
after insert or update or delete on public.whatsapp_asignaciones
for each row execute function public.sincronizar_grupo_driver();

create or replace view public.whatsapp_grupos_diagnostico
with (security_invoker = true) as
with candidatos as (
  select g.grupo_jid, 'SELLER'::text as tipo_entidad, s.id_usuario as id_entidad
    from public.whatsapp_grupos g join public.sellers_activos s
      on s.id_usuario = g.id_extraido and s.activo where g.activo
  union all
  select g.grupo_jid, 'DRIVER'::text, d.id_motoboy
    from public.whatsapp_grupos g join public.drivers_activos d
      on d.id_motoboy = g.id_extraido and d.activo where g.activo
), conteo as (
  select grupo_jid, count(*) as coincidencias from candidatos group by grupo_jid
)
select g.grupo_jid, g.nombre_grupo, g.id_extraido, g.nombre_extraido,
       coalesce(c.coincidencias, 0) as coincidencias,
       case when g.id_extraido is null then 'SIN_ID'
            when coalesce(c.coincidencias, 0) = 0 then 'SIN_COINCIDENCIA'
            when c.coincidencias = 1 then 'VINCULABLE' else 'AMBIGUO' end as estado
  from public.whatsapp_grupos g left join conteo c on c.grupo_jid = g.grupo_jid
 where g.activo;

commit;
