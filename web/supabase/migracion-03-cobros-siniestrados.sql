-- Ejecutar sobre una base con historico.sql instalado. No crea tablas ni mueve filas.
-- Incluye valor_producto si todavía no se aplicó migracion-02.
begin;

alter table public.mensual
  add column if not exists valor_producto numeric(18, 2),
  add column if not exists valor_70 numeric(18, 2) generated always as (round(valor_producto * 0.70, 2)) stored,
  add column if not exists cobrado boolean not null default false;

alter table public.mensual_historico
  add column if not exists valor_producto numeric(18, 2),
  add column if not exists valor_70 numeric(18, 2) generated always as (round(valor_producto * 0.70, 2)) stored,
  add column if not exists cobrado boolean not null default false;

-- El bloqueo de las filas evita perder una marca de cobro concurrente al archivar.
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
    valor_producto,
    cobrado,
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
    valor_producto,
    cobrado,
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
    repartidor = excluded.repartidor,
    tienda = excluded.tienda,
    destino = excluded.destino,
    poligono = excluded.poligono,
    visitas = excluded.visitas,
    valor_producto = excluded.valor_producto,
    cobrado = excluded.cobrado,
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

revoke all on function public.mover_a_historico(date) from public;
grant execute on function public.mover_a_historico(date) to postgres, service_role;

commit;
