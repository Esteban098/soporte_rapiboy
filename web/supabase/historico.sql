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
alter table public.mensual add column if not exists valor_producto numeric(18, 2);
alter table public.mensual
  add column if not exists valor_70 numeric(18, 2) generated always as (round(valor_producto * 0.70, 2)) stored,
  add column if not exists cobrado boolean not null default false,
  add column if not exists motivo_siniestro text,
  add column if not exists comentario_siniestro text;

create table if not exists public.mensual_historico
  (like public.mensual including all);

alter table public.mensual_historico add column if not exists valor_producto numeric(18, 2);
alter table public.mensual_historico
  add column if not exists valor_70 numeric(18, 2) generated always as (round(valor_producto * 0.70, 2)) stored,
  add column if not exists cobrado boolean not null default false,
  add column if not exists motivo_siniestro text,
  add column if not exists comentario_siniestro text;

create table if not exists public.cancelados_historico
  (like public.cancelados including all);

alter table public.mensual_historico enable row level security;
alter table public.cancelados_historico enable row level security;

-- Auditoría específica del checkbox. editado_en no alcanza para reconstruir
-- cobros porque también cambia al editar otros datos de soporte.
create table if not exists public.siniestrados_cobros_historial (
  id                 bigint generated always as identity primary key,
  viaje_id           bigint not null,
  origen             text not null check (origen in ('mensual', 'mensual_historico')),
  cobrado_anterior   boolean not null,
  cobrado_nuevo      boolean not null,
  cambiado_por       text not null,
  cambiado_en        timestamptz not null default now(),
  constraint siniestrados_cobros_cambio_real
    check (cobrado_anterior is distinct from cobrado_nuevo)
);

create index if not exists siniestrados_cobros_historial_viaje_idx
  on public.siniestrados_cobros_historial (viaje_id, cambiado_en desc);

alter table public.siniestrados_cobros_historial enable row level security;
revoke all on table public.siniestrados_cobros_historial from public, anon, authenticated;
grant select, insert on table public.siniestrados_cobros_historial to service_role;
grant usage, select on sequence public.siniestrados_cobros_historial_id_seq to service_role;

-- Conserva como punto de partida cualquier cobro marcado antes de instalar la
-- auditoría. No se atribuye a una persona porque no hay evidencia de quién lo
-- cambió originalmente.
insert into public.siniestrados_cobros_historial (
  viaje_id, origen, cobrado_anterior, cobrado_nuevo, cambiado_por, cambiado_en
)
select distinct on (caso.viaje_id)
  caso.viaje_id, caso.origen, false, true, 'instalacion-historico', caso.cambiado_en
from (
  select m.id as viaje_id, 'mensual'::text as origen,
         coalesce(m.editado_en, now()) as cambiado_en
    from public.mensual m where m.cobrado is true
  union all
  select h.id as viaje_id, 'mensual_historico'::text as origen,
         coalesce(h.editado_en, now()) as cambiado_en
    from public.mensual_historico h where h.cobrado is true
) caso
where not exists (
  select 1 from public.siniestrados_cobros_historial previo
   where previo.viaje_id = caso.viaje_id
)
order by caso.viaje_id, caso.cambiado_en desc;

-- El último evento auditado es la autoridad. Los refrescos pueden actualizar
-- estado e importe, pero aunque manden cobrado por error no pueden cambiarlo.
create or replace function public.proteger_cobro_siniestrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cobrado_auditado boolean;
begin
  select historial.cobrado_nuevo
    into cobrado_auditado
    from public.siniestrados_cobros_historial historial
   where historial.viaje_id = new.id
   order by historial.id desc
   limit 1;

  if found and new.cobrado is distinct from cobrado_auditado then
    new.cobrado := cobrado_auditado;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_cobro_siniestrado_mensual on public.mensual;
create trigger proteger_cobro_siniestrado_mensual
before update of cobrado on public.mensual
for each row execute function public.proteger_cobro_siniestrado();

drop trigger if exists proteger_cobro_siniestrado_historico on public.mensual_historico;
create trigger proteger_cobro_siniestrado_historico
before update of cobrado on public.mensual_historico
for each row execute function public.proteger_cobro_siniestrado();

revoke all on function public.proteger_cobro_siniestrado() from public, anon, authenticated;

-- Busca y bloquea la fila en cualquiera de las dos tablas. El bloqueo y la
-- rotación usan la misma fila, por lo que un clic concurrente queda aplicado
-- antes de copiarla o directamente sobre su destino histórico.
create or replace function public.marcar_cobro_siniestrado(
  p_id bigint,
  p_cobrado boolean,
  p_quien text
)
returns table (id bigint, cobrado boolean, origen text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cobrado_previo boolean;
  tabla_origen text;
begin
  if p_id is null or p_id <= 0 or p_cobrado is null then
    raise exception 'Datos de cobro inválidos' using errcode = '22023';
  end if;
  if nullif(btrim(p_quien), '') is null then
    raise exception 'Falta identificar al operador' using errcode = '22023';
  end if;

  select m.cobrado
    into cobrado_previo
    from public.mensual m
   where m.id = p_id
     and m.estado ilike 'Siniestrado'
   for update;

  if found then
    tabla_origen := 'mensual';
  else
    select h.cobrado
      into cobrado_previo
      from public.mensual_historico h
     where h.id = p_id
       and h.estado ilike 'Siniestrado'
     for update;

    if not found then
      raise exception 'El siniestro % no existe o cambió de estado', p_id
        using errcode = 'P0002';
    end if;
    tabla_origen := 'mensual_historico';
  end if;

  if cobrado_previo is distinct from p_cobrado then
    insert into public.siniestrados_cobros_historial (
      viaje_id, origen, cobrado_anterior, cobrado_nuevo, cambiado_por
    ) values (
      p_id, tabla_origen, cobrado_previo, p_cobrado, btrim(p_quien)
    );

    if tabla_origen = 'mensual' then
      update public.mensual
         set cobrado = p_cobrado,
             editado_por = btrim(p_quien),
             editado_en = now()
       where mensual.id = p_id;
    else
      update public.mensual_historico
         set cobrado = p_cobrado,
             editado_por = btrim(p_quien),
             editado_en = now()
       where mensual_historico.id = p_id;
    end if;
  end if;

  return query select p_id, p_cobrado, tabla_origen;
end;
$$;

revoke all on function public.marcar_cobro_siniestrado(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_cobro_siniestrado(bigint, boolean, text) to postgres, service_role;

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
    id_usuario,
    repartidor,
    tienda,
    destino,
    poligono,
    visitas,
    valor_producto,
    cobrado,
    motivo_siniestro,
    comentario_siniestro,
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
    id_usuario,
    repartidor,
    tienda,
    destino,
    poligono,
    visitas,
    valor_producto,
    cobrado,
    motivo_siniestro,
    comentario_siniestro,
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
  for update
  on conflict (id) do update set
    fecha_creacion = excluded.fecha_creacion,
    fecha_programado = excluded.fecha_programado,
    estado = excluded.estado,
    id_usuario = excluded.id_usuario,
    repartidor = excluded.repartidor,
    tienda = excluded.tienda,
    destino = excluded.destino,
    poligono = excluded.poligono,
    visitas = excluded.visitas,
    valor_producto = excluded.valor_producto,
    cobrado = excluded.cobrado,
    motivo_siniestro = excluded.motivo_siniestro,
    comentario_siniestro = excluded.comentario_siniestro,
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
