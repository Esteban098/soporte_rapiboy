-- Contactos, lecturas y reportes del chat de sellers.
-- La conversación puede eliminarse sin perder el número ni su vínculo con el
-- seller: se borran mensajes/eventos y el contacto queda oculto del inbox.

begin;

alter table public.seller_chat_conversaciones
  add column if not exists eliminado_en timestamptz;
alter table public.seller_chat_conversaciones
  add column if not exists eliminado_por text;
alter table public.seller_chat_conversaciones
  add column if not exists seller_manual_id bigint references public.sellers_activos (id_usuario) on delete set null;

create index if not exists seller_chat_conversaciones_visibles_idx
  on public.seller_chat_conversaciones (ultimo_mensaje_en desc)
  where eliminado_en is null;

create table if not exists public.seller_chat_lecturas (
  conversacion_id uuid not null references public.seller_chat_conversaciones (id) on delete cascade,
  email text not null,
  leido_en timestamptz not null default now(),
  primary key (conversacion_id, email)
);
alter table public.seller_chat_lecturas enable row level security;

-- Solo una inserción entrante real dispara este trigger. ON CONFLICT DO NOTHING
-- no lo ejecuta, por lo que un reintento duplicado de Meta no reabre el chat.
create or replace function public.seller_chat_reactivar_contacto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direccion = 'entrante' then
    update public.seller_chat_conversaciones
       set eliminado_en = null,
           eliminado_por = null,
           estado = case when estado = 'cerrado' then 'bot' else estado end,
           asignado_a = case when estado = 'cerrado' then null else asignado_a end,
           tomado_en = case when estado = 'cerrado' then null else tomado_en end,
           cerrado_en = case when estado = 'cerrado' then null else cerrado_en end,
           cerrado_por = case when estado = 'cerrado' then null else cerrado_por end,
           -- La búsqueda automática del webhook puede haber escrito nulo u
           -- otro seller en el upsert previo. Una asignación humana manda.
           seller_id = coalesce(seller_manual_id, seller_id),
           actualizado_en = now()
     where id = new.conversacion_id;
  end if;
  return new;
end;
$$;

drop trigger if exists seller_chat_reactivar_contacto_trigger on public.seller_chat_mensajes;
create trigger seller_chat_reactivar_contacto_trigger
after insert on public.seller_chat_mensajes
for each row execute function public.seller_chat_reactivar_contacto();

-- Elimina el historial operativo, pero conserva el contacto y la asignación al
-- seller. Un mensaje nuevo vuelve a mostrarlo en la bandeja.
create or replace function public.seller_chat_eliminar(p_conversacion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  if nullif(trim(p_email), '') is null then return false; end if;

  update public.seller_chat_conversaciones
     set eliminado_en = now(),
         eliminado_por = lower(trim(p_email)),
         estado = 'cerrado',
         asignado_a = null,
         envio_bloquea_hasta = null,
         envio_token = null,
         ultimo_mensaje_en = null,
         ultima_entrada_en = null,
         ultimo_mensaje_cifrado = null,
         ultimo_mensaje_iv = null,
         ultimo_mensaje_tag = null,
         actualizado_en = now()
   where id = p_conversacion_id
     and eliminado_en is null
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now());
  get diagnostics filas = row_count;
  if filas <> 1 then return false; end if;

  delete from public.seller_chat_mensajes where conversacion_id = p_conversacion_id;
  return true;
end;
$$;

create or replace function public.seller_chat_asignar_contacto(
  p_conversacion_id uuid,
  p_seller_id bigint,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  if nullif(trim(p_email), '') is null then return false; end if;
  if p_seller_id is not null and not exists (
    select 1 from public.sellers_activos s
     where s.id_usuario = p_seller_id and s.activo is true
  ) then return false; end if;

  update public.seller_chat_conversaciones
     set seller_id = p_seller_id,
         seller_manual_id = p_seller_id,
         actualizado_en = now()
   where id = p_conversacion_id;
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

create or replace function public.seller_chat_marcar_leido(p_conversacion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_email), '') is null or not exists (
    select 1 from public.seller_chat_conversaciones
     where id = p_conversacion_id and eliminado_en is null
  ) then return false; end if;

  insert into public.seller_chat_lecturas (conversacion_id, email, leido_en)
  values (p_conversacion_id, lower(trim(p_email)), now())
  on conflict (conversacion_id, email) do update set leido_en = excluded.leido_en;
  return true;
end;
$$;

create or replace function public.seller_chat_reporte(
  p_desde date,
  p_hasta date,
  p_usuario text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  desde_ts timestamptz;
  hasta_ts timestamptz;
  resultado jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'Rango de fechas inválido';
  end if;
  desde_ts := p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires';
  hasta_ts := (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  with alcance as (
    select c.*
      from public.seller_chat_conversaciones c
     where c.eliminado_en is null
       and (
         nullif(trim(p_usuario), '') is null
         or c.asignado_a = lower(trim(p_usuario))
         or c.cerrado_por = lower(trim(p_usuario))
         or exists (
           select 1 from public.seller_chat_mensajes mu
            where mu.conversacion_id = c.id
              and mu.autor_tipo = 'operador'
              and mu.autor_email = lower(trim(p_usuario))
         )
       )
  ), base as (
    select * from alcance
     where created_at >= desde_ts and created_at < hasta_ts
  ), tiempos as (
    select b.id,
           min(m.creado_en) filter (where m.direccion = 'saliente') as primera_respuesta,
           min(m.creado_en) filter (where m.autor_tipo = 'bot') as primera_respuesta_bot
      from base b
      left join public.seller_chat_mensajes m on m.conversacion_id = b.id
     group by b.id
  ), horas as (
    select h as hora,
           (select count(*)::int from base b where extract(hour from b.created_at at time zone 'America/Argentina/Buenos_Aires') = h) as creados,
           (select count(*)::int from alcance a where a.cerrado_en >= desde_ts and a.cerrado_en < hasta_ts and extract(hour from a.cerrado_en at time zone 'America/Argentina/Buenos_Aires') = h) as cerrados
      from generate_series(0, 23) h
     order by h
  )
  select jsonb_build_object(
    'creados', (select count(*)::int from base),
    'cerrados', (select count(*)::int from alcance where cerrado_en >= desde_ts and cerrado_en < hasta_ts),
    'asignados', (select count(*)::int from alcance where tomado_en >= desde_ts and tomado_en < hasta_ts),
    'conRespuesta', (select count(*)::int from tiempos where primera_respuesta is not null),
    'sinRespuesta', (select count(*)::int from tiempos where primera_respuesta is null),
    'primeraRespuestaSegundos', (select round(avg(greatest(0, extract(epoch from (t.primera_respuesta - b.created_at)))))::bigint from tiempos t join base b using (id) where t.primera_respuesta is not null),
    'resolucionSegundos', (select round(avg(greatest(0, extract(epoch from (cerrado_en - created_at)))))::bigint from alcance where cerrado_en >= desde_ts and cerrado_en < hasta_ts),
    'botSegundos', (select round(avg(greatest(0, extract(epoch from (t.primera_respuesta_bot - b.created_at)))))::bigint from tiempos t join base b using (id) where t.primera_respuesta_bot is not null),
    'atencionHumanaSegundos', (select round(avg(greatest(0, extract(epoch from (cerrado_en - tomado_en)))))::bigint from alcance where cerrado_en >= desde_ts and cerrado_en < hasta_ts and tomado_en is not null),
    'horas', (select coalesce(jsonb_agg(jsonb_build_object('hora', hora, 'creados', creados, 'cerrados', cerrados, 'contactos', creados) order by hora), '[]'::jsonb) from horas)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function public.seller_chat_eliminar(uuid, text) from public, anon, authenticated;
revoke all on function public.seller_chat_reactivar_contacto() from public, anon, authenticated;
revoke all on function public.seller_chat_asignar_contacto(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.seller_chat_marcar_leido(uuid, text) from public, anon, authenticated;
revoke all on function public.seller_chat_reporte(date, date, text) from public, anon, authenticated;
grant execute on function public.seller_chat_eliminar(uuid, text) to service_role;
grant execute on function public.seller_chat_asignar_contacto(uuid, bigint, text) to service_role;
grant execute on function public.seller_chat_marcar_leido(uuid, text) to service_role;
grant execute on function public.seller_chat_reporte(date, date, text) to service_role;

commit;
