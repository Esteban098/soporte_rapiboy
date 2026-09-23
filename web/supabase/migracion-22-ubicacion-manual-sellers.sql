-- Migración 22: ubicación manual del seller tomada del KMZ.
-- La dirección de SQL Server permanece en `direccion` y nunca se modifica.

begin;

alter table public.sellers_activos
  add column if not exists ubicacion_manual text,
  add column if not exists latitud_manual double precision,
  add column if not exists longitud_manual double precision,
  add column if not exists ubicacion_manual_por text,
  add column if not exists ubicacion_manual_en timestamptz;

create index if not exists sellers_activos_ubicacion_manual_idx
  on public.sellers_activos (id_usuario)
  where latitud_manual is not null and longitud_manual is not null;

-- El KMZ puede tener dos puntos para el mismo Usuario.Id (por ejemplo,
-- sucursales). Solo se carga automáticamente cuando la relación es única.
with puntos as (
  select
    id_tienda,
    min(nombre) as ubicacion_manual,
    min(latitud) as latitud_manual,
    min(longitud) as longitud_manual,
    count(*) as cantidad
  from public.tracker_tiendas
  where id_tienda is not null
    and tipo in ('TIENDA', 'DROPOFF')
  group by id_tienda
)
update public.sellers_activos s
set ubicacion_manual = p.ubicacion_manual,
    latitud_manual = p.latitud_manual,
    longitud_manual = p.longitud_manual,
    ubicacion_manual_por = 'migracion-22-kmz',
    ubicacion_manual_en = now()
from puntos p
where s.id_usuario = p.id_tienda
  and p.cantidad = 1
  and s.ubicacion_manual is null;

commit;
