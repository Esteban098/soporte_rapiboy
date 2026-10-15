-- Migración 39: cobros de siniestros atómicos y auditables.
--
-- El cambio localiza y bloquea el caso aunque una rotación concurrente lo
-- mueva entre Mensual e Histórico. El historial registra solamente cambios
-- reales y permite reconstruir el último estado sin depender de editado_en,
-- que también se usa para otros datos de soporte.
begin;

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

    insert into public.siniestrados_cobros_historial (
      viaje_id, origen, cobrado_anterior, cobrado_nuevo, cambiado_por
    ) values (
      p_id, tabla_origen, cobrado_previo, p_cobrado, btrim(p_quien)
    );
  end if;

  return query select p_id, p_cobrado, tabla_origen;
end;
$$;

revoke all on function public.marcar_cobro_siniestrado(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_cobro_siniestrado(bigint, boolean, text) to postgres, service_role;

-- Reinstala además la versión autoritativa de la rotación. Esto hace que la
-- migración correctiva sea suficiente aunque una instalación haya ejecutado
-- nuevamente una migración antigua que no conocía cobrado.
create or replace function public.mover_a_historico(fecha_corte date)
returns table (pedidos_archivados bigint, cancelados_archivados bigint)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  pedidos_movidos bigint := 0;
  cancelados_movidos bigint := 0;
begin
  if fecha_corte is null then
    raise exception 'fecha_corte no puede ser null';
  end if;

  insert into public.mensual_historico (
    id, fecha_creacion, fecha_programado, estado, id_usuario, repartidor,
    tienda, destino, poligono, visitas, valor_producto, cobrado,
    motivo_siniestro, comentario_siniestro, reclamo_tienda, ubicacion,
    telefono, aviso, avisado_en, foto, editado_por, editado_en
  )
  select
    id, fecha_creacion, fecha_programado, estado, id_usuario, repartidor,
    tienda, destino, poligono, visitas, valor_producto, cobrado,
    motivo_siniestro, comentario_siniestro, reclamo_tienda, ubicacion,
    telefono, aviso, avisado_en, foto, editado_por, editado_en
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
    and exists (select 1 from public.mensual_historico h where h.id = m.id);
  get diagnostics pedidos_movidos = row_count;

  insert into public.cancelados_historico (
    id, id_meli, tienda, estado_rbp, estado_meli, fecha_colectado, fecha_cancelado
  )
  select
    id, id_meli, tienda, estado_rbp, estado_meli, fecha_colectado, fecha_cancelado
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
    and exists (select 1 from public.cancelados_historico h where h.id = c.id);
  get diagnostics cancelados_movidos = row_count;

  return query select pedidos_movidos, cancelados_movidos;
end;
$$;

revoke all on function public.mover_a_historico(date) from public;
grant execute on function public.mover_a_historico(date) to postgres, service_role;

commit;
