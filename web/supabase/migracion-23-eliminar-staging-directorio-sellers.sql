-- Migración 23: eliminar el staging antiguo de sellers.
--
-- El workflow 13 ya escribe directamente en sellers_activos. Se conservan
-- whatsapp_grupos, whatsapp_asignaciones y directorio_drivers porque todavía
-- son necesarios para resolver grupos, labels y el directorio de drivers.

begin;

create or replace view public.directorio_contactos_whatsapp
with (security_invoker = true) as
select
  'SELLER'::text as tipo_entidad,
  s.id_usuario as id_entidad,
  s.nombre,
  s.activo,
  a.grupo_jid,
  g.nombre_grupo,
  a.origen,
  s.actualizado_en
from public.sellers_activos s
left join public.whatsapp_asignaciones a
  on a.tipo_entidad = 'SELLER' and a.id_entidad = s.id_usuario
left join public.whatsapp_grupos g on g.grupo_jid = a.grupo_jid
union all
select
  'DRIVER'::text,
  d.id_motoboy,
  d.nombre,
  d.activo,
  a.grupo_jid,
  g.nombre_grupo,
  a.origen,
  d.actualizado_en
from public.directorio_drivers d
left join public.whatsapp_asignaciones a
  on a.tipo_entidad = 'DRIVER' and a.id_entidad = d.id_motoboy
left join public.whatsapp_grupos g on g.grupo_jid = a.grupo_jid;

create or replace view public.whatsapp_grupos_diagnostico
with (security_invoker = true) as
with candidatos as (
  select g.grupo_jid, 'SELLER'::text as tipo_entidad, s.id_usuario as id_entidad
  from public.whatsapp_grupos g
  join public.sellers_activos s on s.id_usuario = g.id_extraido and s.activo
  where g.activo
  union all
  select g.grupo_jid, 'DRIVER'::text, d.id_motoboy
  from public.whatsapp_grupos g
  join public.directorio_drivers d on d.id_motoboy = g.id_extraido and d.activo
  where g.activo
), conteo as (
  select grupo_jid, count(*) as coincidencias
  from candidatos
  group by grupo_jid
)
select
  g.grupo_jid,
  g.nombre_grupo,
  g.id_extraido,
  g.nombre_extraido,
  coalesce(c.coincidencias, 0) as coincidencias,
  case
    when g.id_extraido is null then 'SIN_ID'
    when coalesce(c.coincidencias, 0) = 0 then 'SIN_COINCIDENCIA'
    when c.coincidencias = 1 then 'VINCULABLE'
    else 'AMBIGUO'
  end as estado
from public.whatsapp_grupos g
left join conteo c on c.grupo_jid = g.grupo_jid
where g.activo;

drop table if exists public.directorio_sellers;

commit;
