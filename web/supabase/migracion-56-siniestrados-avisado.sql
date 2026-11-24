-- Migración 56: doble control Avisado -> Cobrado para siniestros.
-- Requiere las migraciones 39 y 40 de auditoría y protección de cobros.
begin;

alter table public.mensual
  add column if not exists siniestro_avisado boolean not null default false;
alter table public.mensual_historico
  add column if not exists siniestro_avisado boolean not null default false;

comment on column public.mensual.siniestro_avisado is
  'Confirmación manual de que soporte notificó el siniestro antes del cobro.';
comment on column public.mensual_historico.siniestro_avisado is
  'Confirmación manual de que soporte notificó el siniestro antes del cobro.';

-- Todo cobro existente necesariamente ya atravesó el aviso.
update public.mensual set siniestro_avisado = true where cobrado is true;
update public.mensual_historico set siniestro_avisado = true where cobrado is true;

alter table public.mensual drop constraint if exists mensual_cobrado_requiere_aviso;
alter table public.mensual
  add constraint mensual_cobrado_requiere_aviso
  check (cobrado is not true or siniestro_avisado is true);
alter table public.mensual_historico drop constraint if exists mensual_historico_cobrado_requiere_aviso;
alter table public.mensual_historico
  add constraint mensual_historico_cobrado_requiere_aviso
  check (cobrado is not true or siniestro_avisado is true);

create table if not exists public.siniestrados_avisos_historial (
  id                 bigint generated always as identity primary key,
  viaje_id           bigint not null,
  origen             text not null check (origen in ('mensual', 'mensual_historico')),
  avisado_anterior   boolean not null,
  avisado_nuevo      boolean not null,
  cambiado_por       text not null,
  cambiado_en        timestamptz not null default now(),
  constraint siniestrados_avisos_cambio_real
    check (avisado_anterior is distinct from avisado_nuevo)
);

create index if not exists siniestrados_avisos_historial_viaje_idx
  on public.siniestrados_avisos_historial (viaje_id, cambiado_en desc);

alter table public.siniestrados_avisos_historial enable row level security;
revoke all on table public.siniestrados_avisos_historial from public, anon, authenticated;
grant select, insert on table public.siniestrados_avisos_historial to service_role;
grant usage, select on sequence public.siniestrados_avisos_historial_id_seq to service_role;

-- Registra los avisos preexistentes sin atribuirlos a una persona.
insert into public.siniestrados_avisos_historial (
  viaje_id, origen, avisado_anterior, avisado_nuevo, cambiado_por, cambiado_en
)
select distinct on (caso.viaje_id)
  caso.viaje_id, caso.origen, false, true, 'migracion-56', caso.cambiado_en
from (
  select m.id as viaje_id, 'mensual'::text as origen,
         coalesce(m.editado_en, now()) as cambiado_en
    from public.mensual m where m.siniestro_avisado is true
  union all
  select h.id as viaje_id, 'mensual_historico'::text as origen,
         coalesce(h.editado_en, now()) as cambiado_en
    from public.mensual_historico h where h.siniestro_avisado is true
) caso
where not exists (
  select 1 from public.siniestrados_avisos_historial previo
   where previo.viaje_id = caso.viaje_id
)
order by caso.viaje_id, caso.cambiado_en desc;

create or replace function public.proteger_aviso_siniestrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  avisado_auditado boolean;
begin
  select historial.avisado_nuevo
    into avisado_auditado
    from public.siniestrados_avisos_historial historial
   where historial.viaje_id = new.id
   order by historial.id desc
   limit 1;

  if found and new.siniestro_avisado is distinct from avisado_auditado then
    new.siniestro_avisado := avisado_auditado;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_aviso_siniestrado_mensual on public.mensual;
create trigger proteger_aviso_siniestrado_mensual
before update of siniestro_avisado on public.mensual
for each row execute function public.proteger_aviso_siniestrado();

drop trigger if exists proteger_aviso_siniestrado_historico on public.mensual_historico;
create trigger proteger_aviso_siniestrado_historico
before update of siniestro_avisado on public.mensual_historico
for each row execute function public.proteger_aviso_siniestrado();

revoke all on function public.proteger_aviso_siniestrado() from public, anon, authenticated;

create or replace function public.marcar_aviso_siniestrado(
  p_id bigint,
  p_avisado boolean,
  p_quien text
)
returns table (id bigint, avisado boolean, cobrado boolean, origen text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  avisado_previo boolean;
  cobrado_actual boolean;
  tabla_origen text;
begin
  if p_id is null or p_id <= 0 or p_avisado is null then
    raise exception 'Datos de aviso inválidos' using errcode = '22023';
  end if;
  if nullif(btrim(p_quien), '') is null then
    raise exception 'Falta identificar al operador' using errcode = '22023';
  end if;

  select m.siniestro_avisado, m.cobrado
    into avisado_previo, cobrado_actual
    from public.mensual m
   where m.id = p_id and m.estado ilike 'Siniestrado'
   for update;
  if found then
    tabla_origen := 'mensual';
  else
    select h.siniestro_avisado, h.cobrado
      into avisado_previo, cobrado_actual
      from public.mensual_historico h
     where h.id = p_id and h.estado ilike 'Siniestrado'
     for update;
    if not found then
      raise exception 'El siniestro % no existe o cambió de estado', p_id using errcode = 'P0002';
    end if;
    tabla_origen := 'mensual_historico';
  end if;

  if cobrado_actual is true and p_avisado is false then
    raise exception 'Un siniestro cobrado no puede quedar sin avisar' using errcode = '23514';
  end if;

  if avisado_previo is distinct from p_avisado then
    insert into public.siniestrados_avisos_historial (
      viaje_id, origen, avisado_anterior, avisado_nuevo, cambiado_por
    ) values (p_id, tabla_origen, avisado_previo, p_avisado, btrim(p_quien));

    if tabla_origen = 'mensual' then
      update public.mensual
         set siniestro_avisado = p_avisado, editado_por = btrim(p_quien), editado_en = now()
       where mensual.id = p_id;
    else
      update public.mensual_historico
         set siniestro_avisado = p_avisado, editado_por = btrim(p_quien), editado_en = now()
       where mensual_historico.id = p_id;
    end if;
  end if;

  return query select p_id, p_avisado, cobrado_actual, tabla_origen;
end;
$$;

revoke all on function public.marcar_aviso_siniestrado(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_aviso_siniestrado(bigint, boolean, text) to postgres, service_role;

-- Mantiene el contrato anterior. Marcar cobrado activa Avisado en la misma
-- transacción; desmarcar cobrado conserva el aviso para respetar el circuito.
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
  avisado_previo boolean;
  cobrado_previo boolean;
  avisado_nuevo boolean;
  tabla_origen text;
begin
  if p_id is null or p_id <= 0 or p_cobrado is null then
    raise exception 'Datos de cobro inválidos' using errcode = '22023';
  end if;
  if nullif(btrim(p_quien), '') is null then
    raise exception 'Falta identificar al operador' using errcode = '22023';
  end if;

  select m.siniestro_avisado, m.cobrado
    into avisado_previo, cobrado_previo
    from public.mensual m
   where m.id = p_id and m.estado ilike 'Siniestrado'
   for update;
  if found then
    tabla_origen := 'mensual';
  else
    select h.siniestro_avisado, h.cobrado
      into avisado_previo, cobrado_previo
      from public.mensual_historico h
     where h.id = p_id and h.estado ilike 'Siniestrado'
     for update;
    if not found then
      raise exception 'El siniestro % no existe o cambió de estado', p_id using errcode = 'P0002';
    end if;
    tabla_origen := 'mensual_historico';
  end if;

  avisado_nuevo := avisado_previo or p_cobrado;
  if avisado_previo is distinct from avisado_nuevo then
    insert into public.siniestrados_avisos_historial (
      viaje_id, origen, avisado_anterior, avisado_nuevo, cambiado_por
    ) values (p_id, tabla_origen, avisado_previo, avisado_nuevo, btrim(p_quien));
  end if;
  if cobrado_previo is distinct from p_cobrado then
    insert into public.siniestrados_cobros_historial (
      viaje_id, origen, cobrado_anterior, cobrado_nuevo, cambiado_por
    ) values (p_id, tabla_origen, cobrado_previo, p_cobrado, btrim(p_quien));
  end if;

  if avisado_previo is distinct from avisado_nuevo or cobrado_previo is distinct from p_cobrado then
    if tabla_origen = 'mensual' then
      update public.mensual
         set siniestro_avisado = avisado_nuevo, cobrado = p_cobrado,
             editado_por = btrim(p_quien), editado_en = now()
       where mensual.id = p_id;
    else
      update public.mensual_historico
         set siniestro_avisado = avisado_nuevo, cobrado = p_cobrado,
             editado_por = btrim(p_quien), editado_en = now()
       where mensual_historico.id = p_id;
    end if;
  end if;

  return query select p_id, p_cobrado, tabla_origen;
end;
$$;

revoke all on function public.marcar_cobro_siniestrado(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_cobro_siniestrado(bigint, boolean, text) to postgres, service_role;

-- Reinstala la rotación vigente incluyendo el nuevo dato manual.
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
  if fecha_corte is null then raise exception 'fecha_corte no puede ser null'; end if;

  insert into public.mensual_historico (
    id, fecha_creacion, fecha_programado, estado, id_usuario, repartidor,
    tienda, destino, poligono, visitas, valor_producto, cobrado, siniestro_avisado,
    motivo_siniestro, comentario_siniestro, reclamo_tienda, ubicacion,
    telefono, aviso, avisado_en, foto, editado_por, editado_en
  )
  select
    id, fecha_creacion, fecha_programado, estado, id_usuario, repartidor,
    tienda, destino, poligono, visitas, valor_producto, cobrado, siniestro_avisado,
    motivo_siniestro, comentario_siniestro, reclamo_tienda, ubicacion,
    telefono, aviso, avisado_en, foto, editado_por, editado_en
  from public.mensual
  where coalesce(fecha_creacion, fecha_programado) < fecha_corte
  for update
  on conflict (id) do update set
    fecha_creacion = excluded.fecha_creacion, fecha_programado = excluded.fecha_programado,
    estado = excluded.estado, id_usuario = excluded.id_usuario,
    repartidor = excluded.repartidor, tienda = excluded.tienda,
    destino = excluded.destino, poligono = excluded.poligono, visitas = excluded.visitas,
    valor_producto = excluded.valor_producto, cobrado = excluded.cobrado,
    siniestro_avisado = excluded.siniestro_avisado,
    motivo_siniestro = excluded.motivo_siniestro,
    comentario_siniestro = excluded.comentario_siniestro,
    reclamo_tienda = excluded.reclamo_tienda, ubicacion = excluded.ubicacion,
    telefono = excluded.telefono, aviso = excluded.aviso, avisado_en = excluded.avisado_en,
    foto = excluded.foto, editado_por = excluded.editado_por, editado_en = excluded.editado_en;

  delete from public.mensual m
   where coalesce(m.fecha_creacion, m.fecha_programado) < fecha_corte
     and exists (select 1 from public.mensual_historico h where h.id = m.id);
  get diagnostics pedidos_movidos = row_count;

  insert into public.cancelados_historico (
    id, id_meli, tienda, estado_rbp, estado_meli, fecha_colectado, fecha_cancelado
  )
  select id, id_meli, tienda, estado_rbp, estado_meli, fecha_colectado, fecha_cancelado
  from public.cancelados where fecha_colectado::date < fecha_corte
  on conflict (id) do update set
    id_meli = excluded.id_meli, tienda = excluded.tienda,
    estado_rbp = excluded.estado_rbp, estado_meli = excluded.estado_meli,
    fecha_colectado = excluded.fecha_colectado, fecha_cancelado = excluded.fecha_cancelado;

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
