-- Migración 37: agradecimiento semanal a tiendas por información útil.
--
-- Conserva el Usuario.Id en los casos para resolver el grupo de WhatsApp por
-- la clave estable de sellers_activos. Una entrega se atribuye a la información
-- de tienda solamente si esa información fue cargada antes (o el mismo día) de
-- que el viaje quedara Entregado.

begin;

alter table public.mensual
  add column if not exists id_usuario bigint;
alter table public.mensual_historico
  add column if not exists id_usuario bigint;

create index if not exists mensual_id_usuario_idx
  on public.mensual (id_usuario)
  where id_usuario is not null;
create index if not exists mensual_historico_id_usuario_idx
  on public.mensual_historico (id_usuario)
  where id_usuario is not null;

-- La rotación debe conservar el vínculo estable; de otro modo el resumen de
-- una semana que cruza el cambio de mes perdería el seller al archivar.
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

create table if not exists public.resumenes_tiendas_semanales (
  id                 uuid primary key default gen_random_uuid(),
  semana_desde       date not null,
  semana_hasta       date not null,
  id_usuario         bigint not null,
  tienda             text not null,
  grupo_jid          text,
  grupo_nombre       text,
  cantidad_paquetes  integer not null check (cantidad_paquetes > 0),
  paquetes           bigint[] not null,
  estado             text not null default 'PENDIENTE'
                     check (estado in ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'ERROR', 'SIN_GRUPO')),
  intentos           integer not null default 0,
  mensaje            text,
  enviado_en         timestamptz,
  ultimo_intento_en  timestamptz,
  detalle_error      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (semana_desde, id_usuario),
  check (semana_hasta = semana_desde + 6)
);

create index if not exists resumenes_tiendas_semanales_estado_idx
  on public.resumenes_tiendas_semanales (estado, semana_desde desc);

alter table public.resumenes_tiendas_semanales enable row level security;

alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones
  add constraint notificaciones_tipo_check
  check (tipo in ('mencion', 'demora_paquete', 'seguimiento_vencido', 'tienda_sin_grupo'));

-- Prepara la semana cerrada anterior a fecha_referencia. Repetir la función no
-- duplica resúmenes ni notificaciones. Los ENVIADOS nunca vuelven a la cola.
create or replace function public.preparar_resumenes_tiendas_semanales(
  fecha_referencia date default ((now() at time zone 'America/Mexico_City')::date)
)
returns table (
  resumen_id uuid,
  semana_desde date,
  semana_hasta date,
  id_usuario bigint,
  tienda text,
  grupo_jid text,
  grupo_nombre text,
  cantidad_paquetes integer,
  paquetes bigint[]
)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  inicio date := (date_trunc('week', fecha_referencia)::date - 7);
  fin date := (date_trunc('week', fecha_referencia)::date - 1);
begin
  insert into public.resumenes_tiendas_semanales (
    semana_desde,
    semana_hasta,
    id_usuario,
    tienda,
    grupo_jid,
    grupo_nombre,
    cantidad_paquetes,
    paquetes,
    estado,
    detalle_error,
    updated_at
  )
  with casos as (
    select id, id_usuario, tienda, fecha_programado, estado,
           reclamo_tienda, editado_en
      from public.mensual
    union all
    select id, id_usuario, tienda, fecha_programado, estado,
           reclamo_tienda, editado_en
      from public.mensual_historico
  ), entregas as (
    select distinct on (c.id)
      c.id,
      c.id_usuario,
      coalesce(nullif(btrim(s.nombre), ''), nullif(btrim(c.tienda), ''), 'Seller #' || c.id_usuario) as tienda,
      nullif(btrim(s.grupo_jid), '') as grupo_jid,
      nullif(btrim(s.grupo_nombre), '') as grupo_nombre
    from casos c
    left join public.sellers_activos s on s.id_usuario = c.id_usuario and s.activo
    where c.id_usuario is not null
      and lower(btrim(coalesce(c.estado, ''))) = 'entregado'
      and c.fecha_programado between inicio and fin
      and nullif(btrim(c.reclamo_tienda), '') is not null
      and c.editado_en is not null
      and (c.editado_en at time zone 'America/Mexico_City')::date <= c.fecha_programado
    order by c.id, c.editado_en desc
  ), agrupadas as (
    select
      e.id_usuario,
      max(e.tienda) as tienda,
      max(e.grupo_jid) as grupo_jid,
      max(e.grupo_nombre) as grupo_nombre,
      count(*)::integer as cantidad_paquetes,
      array_agg(e.id order by e.id) as paquetes
    from entregas e
    group by e.id_usuario
  )
  select
    inicio,
    fin,
    a.id_usuario,
    a.tienda,
    a.grupo_jid,
    a.grupo_nombre,
    a.cantidad_paquetes,
    a.paquetes,
    case when a.grupo_jid is null then 'SIN_GRUPO' else 'PENDIENTE' end,
    case when a.grupo_jid is null then 'El seller no tiene un grupo de WhatsApp vinculado.' else null end,
    now()
  from agrupadas a
  on conflict (semana_desde, id_usuario) do update set
    tienda = excluded.tienda,
    grupo_jid = excluded.grupo_jid,
    grupo_nombre = excluded.grupo_nombre,
    cantidad_paquetes = excluded.cantidad_paquetes,
    paquetes = excluded.paquetes,
    estado = case
      when resumenes_tiendas_semanales.estado in ('ENVIANDO', 'ENVIADO')
        then resumenes_tiendas_semanales.estado
      when excluded.grupo_jid is null then 'SIN_GRUPO'
      else 'PENDIENTE'
    end,
    detalle_error = case
      when resumenes_tiendas_semanales.estado in ('ENVIANDO', 'ENVIADO')
        then resumenes_tiendas_semanales.detalle_error
      when excluded.grupo_jid is null then 'El seller no tiene un grupo de WhatsApp vinculado.'
      else null
    end,
    updated_at = now();

  insert into public.notificaciones (destinatario, tipo, autor, extracto, clave)
  select
    lower(btrim(p.email)),
    'tienda_sin_grupo',
    'sistema@rapiboy',
    'No se pudo enviar el resumen semanal a «' || r.tienda || '»: no tiene un grupo de WhatsApp vinculado en Sellers.',
    'tienda-sin-grupo:' || r.semana_desde || ':' || r.id_usuario
  from public.resumenes_tiendas_semanales r
  cross join public.perfiles p
  where r.semana_desde = inicio
    and r.estado = 'SIN_GRUPO'
    and p.activo
    and p.rol <> 'comercial'
  on conflict (destinatario, clave) do nothing;

  -- Reclama las filas antes de entregarlas a n8n. Dos ejecuciones simultáneas
  -- no pueden enviar el mismo resumen y un corte después de que WAHA aceptó el
  -- mensaje queda ENVIANDO para revisión, en vez de reenviarlo a ciegas.
  return query
  update public.resumenes_tiendas_semanales r
  set estado = 'ENVIANDO',
      intentos = r.intentos + 1,
      ultimo_intento_en = now(),
      updated_at = now()
  where r.semana_desde = inicio
    and r.estado in ('PENDIENTE', 'ERROR')
    and r.grupo_jid is not null
  returning
    r.id,
    r.semana_desde,
    r.semana_hasta,
    r.id_usuario,
    r.tienda,
    r.grupo_jid,
    r.grupo_nombre,
    r.cantidad_paquetes,
    r.paquetes;
end;
$$;

revoke all on function public.preparar_resumenes_tiendas_semanales(date) from public;
grant execute on function public.preparar_resumenes_tiendas_semanales(date) to postgres, service_role;

commit;
