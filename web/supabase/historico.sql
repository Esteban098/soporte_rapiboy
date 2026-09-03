-- ---------------------------------------------------------------------------
-- Archivo físico de mensual y cancelados
--
-- Regla operativa:
--   días 1 al 9   mensual/cancelados conservan el mes anterior y el actual
--   desde el 10   todo lo anterior al mes actual vive solo en *_historico
--
-- Correr una vez en el SQL Editor de Supabase antes de importar los workflows
-- actualizados. El último SELECT ordena también los datos que ya existen:
-- nunca descarta filas, primero las copia y recién después las quita de la
-- tabla operativa, dentro de la misma transacción.
-- ---------------------------------------------------------------------------

-- LIKE mantiene exactamente el esquema operativo, incluidas las columnas
-- generadas. Los índices reciben nombres propios automáticamente.
create table if not exists public.mensual_historico
  (like public.mensual including all);

create table if not exists public.cancelados_historico
  (like public.cancelados including all);

alter table public.mensual_historico enable row level security;
alter table public.cancelados_historico enable row level security;

-- Mueve todo lo anterior a una fecha de corte. Es una unidad atómica: si falla
-- cualquier INSERT, PostgreSQL revierte también los DELETE.
create or replace function public.mover_a_historico(fecha_corte date)
returns table (
  pedidos_archivados bigint,
  cancelados_archivados bigint
)
language plpgsql
set search_path = public
as $$
declare
  pedidos_movidos bigint := 0;
  cancelados_movidos bigint := 0;
begin
  if fecha_corte is null then
    raise exception 'fecha_corte no puede ser null';
  end if;

  insert into public.mensual_historico (
    id,
    fecha_creacion,
    fecha_programado,
    estado,
    repartidor,
    tienda,
    destino,
    poligono,
    visitas,
    reclamo_tienda,
    ubicacion,
    telefono,
    aviso,
    avisado_en,
    foto,
    editado_por,
    editado_en
  )
  select
    id,
    fecha_creacion,
    fecha_programado,
    estado,
    repartidor,
    tienda,
    destino,
    poligono,
    visitas,
    reclamo_tienda,
    ubicacion,
    telefono,
    aviso,
    avisado_en,
    foto,
    editado_por,
    editado_en
  from public.mensual
  where coalesce(fecha_creacion, fecha_programado) < fecha_corte
  on conflict (id) do update set
    fecha_creacion = excluded.fecha_creacion,
    fecha_programado = excluded.fecha_programado,
    estado = excluded.estado,
    repartidor = excluded.repartidor,
    tienda = excluded.tienda,
    destino = excluded.destino,
    poligono = excluded.poligono,
    visitas = excluded.visitas,
    reclamo_tienda = excluded.reclamo_tienda,
    ubicacion = excluded.ubicacion,
    telefono = excluded.telefono,
    aviso = excluded.aviso,
    avisado_en = excluded.avisado_en,
    foto = excluded.foto,
    editado_por = excluded.editado_por,
    editado_en = excluded.editado_en;

  delete from public.mensual m
  where coalesce(m.fecha_creacion, m.fecha_programado) < fecha_corte
    and exists (
      select 1
      from public.mensual_historico h
      where h.id = m.id
    );
  get diagnostics pedidos_movidos = row_count;

  insert into public.cancelados_historico (
    id,
    id_meli,
    tienda,
    estado_rbp,
    estado_meli,
    fecha_colectado,
    fecha_cancelado
  )
  select
    id,
    id_meli,
    tienda,
    estado_rbp,
    estado_meli,
    fecha_colectado,
    fecha_cancelado
  from public.cancelados
  where fecha_colectado::date < fecha_corte
  on conflict (id) do update set
    id_meli = excluded.id_meli,
    tienda = excluded.tienda,
    estado_rbp = excluded.estado_rbp,
    estado_meli = excluded.estado_meli,
    fecha_colectado = excluded.fecha_colectado,
    fecha_cancelado = excluded.fecha_cancelado;

  delete from public.cancelados c
  where c.fecha_colectado::date < fecha_corte
    and exists (
      select 1
      from public.cancelados_historico h
      where h.id = c.id
    );
  get diagnostics cancelados_movidos = row_count;

  return query select pedidos_movidos, cancelados_movidos;
end;
$$;

-- La ingesta diaria llama esta función. Desde el día 10 intenta archivar todo
-- lo anterior al mes actual; repetirla es seguro y permite recuperar una
-- corrida fallida el día 11 o posterior.
create or replace function public.rotar_historicos(
  fecha_referencia date default ((now() at time zone 'America/Mexico_City')::date)
)
returns table (
  ejecutado boolean,
  fecha_corte date,
  pedidos_archivados bigint,
  cancelados_archivados bigint
)
language plpgsql
set search_path = public
as $$
declare
  corte date := date_trunc('month', fecha_referencia)::date;
begin
  if extract(day from fecha_referencia) < 10 then
    return query select false, corte, 0::bigint, 0::bigint;
    return;
  end if;

  return query
    select true, corte, m.pedidos_archivados, m.cancelados_archivados
    from public.mover_a_historico(corte) m;
end;
$$;

-- Las funciones no quedan expuestas a la anon key. n8n entra con la conexión
-- de base (postgres) y la web solo lee las tablas con service_role.
revoke all on function public.mover_a_historico(date) from public;
revoke all on function public.rotar_historicos(date) from public;
grant execute on function public.mover_a_historico(date) to postgres, service_role;
grant execute on function public.rotar_historicos(date) to postgres, service_role;

-- Orden inicial de lo que ya está cargado:
-- antes del día 10 conserva el mes anterior; desde el 10 conserva solo el mes
-- actual. El resultado informa cuántas filas fueron movidas.
select *
from public.mover_a_historico(
  case
    when extract(day from (now() at time zone 'America/Mexico_City')) < 10
      then (date_trunc('month', now() at time zone 'America/Mexico_City') - interval '1 month')::date
    else date_trunc('month', now() at time zone 'America/Mexico_City')::date
  end
);
