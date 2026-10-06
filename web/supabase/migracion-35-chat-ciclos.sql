-- Ciclos históricos del chat de sellers.
--
-- `seller_chat_conversaciones` sigue siendo el contacto durable: una fila por
-- número. Cada apertura/reapertura genera además un ciclo independiente para
-- que cerrar, reabrir o eliminar el historial visible no reescriba reportes.

begin;

create table if not exists public.seller_chat_ciclos (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.seller_chat_conversaciones (id) on delete cascade,
  seller_id bigint references public.sellers_activos (id_usuario) on delete set null,
  abierto_en timestamptz not null,
  tomado_en timestamptz,
  tomado_por text,
  cerrado_en timestamptz,
  cerrado_por text,
  eliminado_en timestamptz,
  primera_respuesta_en timestamptz,
  primera_respuesta_bot_en timestamptz,
  creado_en timestamptz not null default now(),
  check (cerrado_en is null or cerrado_en >= abierto_en),
  check (eliminado_en is null or eliminado_en >= abierto_en)
);

create unique index if not exists seller_chat_ciclos_activo_idx
  on public.seller_chat_ciclos (conversacion_id)
  where cerrado_en is null and eliminado_en is null;
create index if not exists seller_chat_ciclos_abierto_idx
  on public.seller_chat_ciclos (abierto_en);
create index if not exists seller_chat_ciclos_cerrado_idx
  on public.seller_chat_ciclos (cerrado_en)
  where cerrado_en is not null;

-- Foto inicial para instalaciones existentes. Primero conserva el último
-- cierre conocido. Las versiones iniciales devolvían el estado a `bot` al
-- cerrar, por eso `cerrado_en` puede existir aunque el contacto figure abierto.
insert into public.seller_chat_ciclos (
  conversacion_id, seller_id, abierto_en, tomado_en, tomado_por,
  cerrado_en, cerrado_por, eliminado_en,
  primera_respuesta_en, primera_respuesta_bot_en
)
select
  c.id,
  c.seller_id,
  coalesce(c.created_at, now()),
  case when c.estado = 'cerrado' then c.tomado_en end,
  case when c.estado = 'cerrado' and c.tomado_en is not null then coalesce(c.asignado_a, c.cerrado_por) end,
  c.cerrado_en,
  c.cerrado_por,
  c.eliminado_en,
  (
    select min(m.creado_en)
      from public.seller_chat_mensajes m
     where m.conversacion_id = c.id
       and m.direccion = 'saliente'
       and m.estado_envio = 'enviado'
       and m.creado_en <= coalesce(c.cerrado_en, c.eliminado_en, now())
  ),
  (
    select min(m.creado_en)
      from public.seller_chat_mensajes m
     where m.conversacion_id = c.id
       and m.autor_tipo = 'bot'
       and m.estado_envio = 'enviado'
       and m.creado_en <= coalesce(c.cerrado_en, c.eliminado_en, now())
  )
from public.seller_chat_conversaciones c
where (c.cerrado_en is not null or c.eliminado_en is not null)
  and not exists (
  select 1 from public.seller_chat_ciclos ciclo
   where ciclo.conversacion_id = c.id
);

-- Después abre el ciclo actual de todo contacto operativo. Si había un cierre
-- legado, comienza en la primera entrada posterior o, como mínimo, al cierre.
insert into public.seller_chat_ciclos (
  conversacion_id, seller_id, abierto_en, tomado_en, tomado_por,
  primera_respuesta_en, primera_respuesta_bot_en
)
select
  c.id,
  c.seller_id,
  case
    when c.cerrado_en is null then coalesce(c.created_at, now())
    else greatest(c.cerrado_en, coalesce(c.ultima_entrada_en, c.cerrado_en))
  end,
  case when c.estado = 'humano' then c.tomado_en end,
  case when c.estado = 'humano' then c.asignado_a end,
  (
    select min(m.creado_en)
      from public.seller_chat_mensajes m
     where m.conversacion_id = c.id
       and m.direccion = 'saliente'
       and m.estado_envio = 'enviado'
       and m.creado_en >= case
         when c.cerrado_en is null then coalesce(c.created_at, now())
         else greatest(c.cerrado_en, coalesce(c.ultima_entrada_en, c.cerrado_en))
       end
  ),
  (
    select min(m.creado_en)
      from public.seller_chat_mensajes m
     where m.conversacion_id = c.id
       and m.autor_tipo = 'bot'
       and m.estado_envio = 'enviado'
       and m.creado_en >= case
         when c.cerrado_en is null then coalesce(c.created_at, now())
         else greatest(c.cerrado_en, coalesce(c.ultima_entrada_en, c.cerrado_en))
       end
  )
from public.seller_chat_conversaciones c
where c.estado <> 'cerrado'
  and c.eliminado_en is null
  and not exists (
    select 1 from public.seller_chat_ciclos ciclo
     where ciclo.conversacion_id = c.id
       and ciclo.cerrado_en is null
       and ciclo.eliminado_en is null
  );

alter table public.seller_chat_ciclos enable row level security;

-- El trigger ya existente conserva el contacto y ahora abre un ciclo solo ante
-- una inserción entrante real. Un reintento con ON CONFLICT DO NOTHING no pasa
-- por acá y por eso no duplica tickets ni reabre cerrados.
create or replace function public.seller_chat_reactivar_contacto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_actual bigint;
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
           seller_id = coalesce(seller_manual_id, seller_id),
           actualizado_en = now()
     where id = new.conversacion_id
     returning seller_id into seller_actual;

    insert into public.seller_chat_ciclos (conversacion_id, seller_id, abierto_en)
    select new.conversacion_id, seller_actual, new.creado_en
    where not exists (
      select 1 from public.seller_chat_ciclos c
       where c.conversacion_id = new.conversacion_id
         and c.cerrado_en is null
         and c.eliminado_en is null
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Las métricas cuentan una respuesta cuando Meta la confirmó, no cuando se
-- creó la fila pendiente. Un timeout o un envío en revisión no infla el SLA.
create or replace function public.seller_chat_registrar_respuesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direccion = 'saliente' and new.estado_envio = 'enviado' then
    if tg_op = 'UPDATE' then
      if old.estado_envio is not distinct from 'enviado' then
        return new;
      end if;
    end if;
    update public.seller_chat_ciclos
       set primera_respuesta_en = coalesce(primera_respuesta_en, new.creado_en),
           primera_respuesta_bot_en = case
             when new.autor_tipo = 'bot' then coalesce(primera_respuesta_bot_en, new.creado_en)
             else primera_respuesta_bot_en
           end
     where id = (
       select c.id
         from public.seller_chat_ciclos c
        where c.conversacion_id = new.conversacion_id
          and c.cerrado_en is null
          and c.eliminado_en is null
          and c.abierto_en <= new.creado_en
        order by c.abierto_en desc
        limit 1
     );
  end if;
  return new;
end;
$$;

drop trigger if exists seller_chat_registrar_respuesta_trigger on public.seller_chat_mensajes;
create trigger seller_chat_registrar_respuesta_trigger
after insert or update of estado_envio on public.seller_chat_mensajes
for each row execute function public.seller_chat_registrar_respuesta();

create or replace function public.seller_chat_tomar(p_conversacion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
  correo text := lower(trim(p_email));
  instante timestamptz := now();
begin
  if nullif(correo, '') is null then return false; end if;
  update public.seller_chat_conversaciones
     set estado = 'humano',
         asignado_a = correo,
         tomado_en = instante,
         envio_bloquea_hasta = null,
         envio_token = null,
         actualizado_en = instante
   where id = p_conversacion_id
     and estado in ('bot', 'pendiente')
     and eliminado_en is null
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= instante);
  get diagnostics filas = row_count;
  if filas <> 1 then return false; end if;

  update public.seller_chat_ciclos
     set tomado_en = coalesce(tomado_en, instante),
         tomado_por = coalesce(tomado_por, correo)
   where conversacion_id = p_conversacion_id
     and cerrado_en is null
     and eliminado_en is null;
  return true;
end;
$$;

create or replace function public.seller_chat_cerrar(p_conversacion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
  correo text := lower(trim(p_email));
  instante timestamptz := now();
begin
  if nullif(correo, '') is null then return false; end if;
  update public.seller_chat_conversaciones
     set estado = 'cerrado',
         asignado_a = null,
         cerrado_por = correo,
         cerrado_en = instante,
         envio_bloquea_hasta = null,
         envio_token = null,
         actualizado_en = instante
   where id = p_conversacion_id
     and estado = 'humano'
     and asignado_a = correo
     and eliminado_en is null
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= instante);
  get diagnostics filas = row_count;
  if filas <> 1 then return false; end if;

  update public.seller_chat_ciclos
     set cerrado_en = instante,
         cerrado_por = correo
   where conversacion_id = p_conversacion_id
     and cerrado_en is null
     and eliminado_en is null;
  return true;
end;
$$;

-- Un operador puede borrar un chat libre, cerrado o propio. Solo un
-- administrador puede borrar el que está asignado a otra persona.
create or replace function public.seller_chat_eliminar(
  p_conversacion_id uuid,
  p_email text,
  p_es_admin boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
  correo text := lower(trim(p_email));
  instante timestamptz := now();
begin
  if nullif(correo, '') is null then return false; end if;
  update public.seller_chat_conversaciones
     set eliminado_en = instante,
         eliminado_por = correo,
         estado = 'cerrado',
         asignado_a = null,
         envio_bloquea_hasta = null,
         envio_token = null,
         ultimo_mensaje_en = null,
         ultima_entrada_en = null,
         ultimo_mensaje_cifrado = null,
         ultimo_mensaje_iv = null,
         ultimo_mensaje_tag = null,
         actualizado_en = instante
   where id = p_conversacion_id
     and eliminado_en is null
     and (estado <> 'humano' or asignado_a = correo or p_es_admin is true)
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= instante);
  get diagnostics filas = row_count;
  if filas <> 1 then return false; end if;

  update public.seller_chat_ciclos
     set eliminado_en = instante
   where conversacion_id = p_conversacion_id
     and cerrado_en is null
     and eliminado_en is null;
  delete from public.seller_chat_mensajes where conversacion_id = p_conversacion_id;
  return true;
end;
$$;

-- Compatibilidad durante el despliegue: la versión web anterior sigue segura
-- y puede borrar chats libres o propios mientras se publica la nueva.
create or replace function public.seller_chat_eliminar(p_conversacion_id uuid, p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.seller_chat_eliminar(p_conversacion_id, p_email, false);
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
  if filas <> 1 then return false; end if;

  update public.seller_chat_ciclos
     set seller_id = p_seller_id
   where conversacion_id = p_conversacion_id
     and cerrado_en is null
     and eliminado_en is null;
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
  usuario text := lower(nullif(trim(p_usuario), ''));
  resultado jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'Rango de fechas inválido';
  end if;
  desde_ts := p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires';
  hasta_ts := (p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  with alcance as (
    select c.*
      from public.seller_chat_ciclos c
     where usuario is null or c.tomado_por = usuario or c.cerrado_por = usuario
  ), base as (
    select * from alcance where abierto_en >= desde_ts and abierto_en < hasta_ts
  ), contactos as (
    select conv.id as conversacion_id, conv.created_at
      from public.seller_chat_conversaciones conv
     where conv.created_at >= desde_ts and conv.created_at < hasta_ts
       and (
         usuario is null
         or exists (
           select 1 from public.seller_chat_ciclos ciclo
            where ciclo.conversacion_id = conv.id
              and (ciclo.tomado_por = usuario or ciclo.cerrado_por = usuario)
         )
       )
  ), horas as (
    select h as hora,
           (select count(*)::int from base b where extract(hour from b.abierto_en at time zone 'America/Argentina/Buenos_Aires') = h) as creados,
           (select count(*)::int from alcance a where a.cerrado_en >= desde_ts and a.cerrado_en < hasta_ts and extract(hour from a.cerrado_en at time zone 'America/Argentina/Buenos_Aires') = h) as cerrados,
           (select count(*)::int from contactos c where extract(hour from c.created_at at time zone 'America/Argentina/Buenos_Aires') = h) as contactos
      from generate_series(0, 23) h
     order by h
  )
  select jsonb_build_object(
    'creados', (select count(*)::int from base),
    'cerrados', (select count(*)::int from alcance where cerrado_en >= desde_ts and cerrado_en < hasta_ts),
    'asignados', (select count(*)::int from alcance where tomado_en >= desde_ts and tomado_en < hasta_ts),
    'conRespuesta', (select count(*)::int from base where primera_respuesta_en is not null),
    'sinRespuesta', (select count(*)::int from base where primera_respuesta_en is null),
    'primeraRespuestaSegundos', (select round(avg(greatest(0, extract(epoch from (primera_respuesta_en - abierto_en)))))::bigint from base where primera_respuesta_en is not null),
    'resolucionSegundos', (select round(avg(greatest(0, extract(epoch from (cerrado_en - abierto_en)))))::bigint from alcance where cerrado_en >= desde_ts and cerrado_en < hasta_ts),
    'botSegundos', (select round(avg(greatest(0, extract(epoch from (primera_respuesta_bot_en - abierto_en)))))::bigint from base where primera_respuesta_bot_en is not null),
    'atencionHumanaSegundos', (select round(avg(greatest(0, extract(epoch from (cerrado_en - tomado_en)))))::bigint from alcance where cerrado_en >= desde_ts and cerrado_en < hasta_ts and tomado_en is not null),
    'horas', (select coalesce(jsonb_agg(jsonb_build_object('hora', hora, 'creados', creados, 'cerrados', cerrados, 'contactos', contactos) order by hora), '[]'::jsonb) from horas)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on table public.seller_chat_ciclos from public, anon, authenticated;
revoke all on function public.seller_chat_registrar_respuesta() from public, anon, authenticated;
revoke all on function public.seller_chat_eliminar(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.seller_chat_eliminar(uuid, text) from public, anon, authenticated;
grant execute on function public.seller_chat_eliminar(uuid, text, boolean) to service_role;
grant execute on function public.seller_chat_eliminar(uuid, text) to service_role;

commit;
