-- Chat de soporte para sellers por WhatsApp.
-- Independiente de `seguimiento`: cada conversación conserva mensajes cifrados
-- y un estado que controla si responde el bot o una persona.

begin;

create table if not exists public.seller_chat_conversaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  canal text not null check (canal in ('directo', 'grupo')),
  clave_contacto text not null unique,
  contacto_cifrado text not null,
  contacto_iv text not null,
  contacto_tag text not null,
  seller_id bigint references public.sellers_activos (id_usuario) on delete set null,
  estado text not null default 'bot' check (estado in ('bot', 'pendiente', 'humano')),
  asignado_a text,
  envio_bloquea_hasta timestamptz,
  envio_token uuid,
  tomado_en timestamptz,
  cerrado_en timestamptz,
  ultima_entrada_en timestamptz,
  ultimo_mensaje_en timestamptz,
  ultimo_mensaje_cifrado text,
  ultimo_mensaje_iv text,
  ultimo_mensaje_tag text
);

alter table public.seller_chat_conversaciones add column if not exists envio_bloquea_hasta timestamptz;
alter table public.seller_chat_conversaciones add column if not exists envio_token uuid;
alter table public.seller_chat_conversaciones add column if not exists ultima_entrada_en timestamptz;

create table if not exists public.seller_chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.seller_chat_conversaciones (id) on delete cascade,
  creado_en timestamptz not null default now(),
  proveedor_id text unique,
  evento_id text,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  autor_tipo text not null check (autor_tipo in ('seller', 'bot', 'operador')),
  autor_email text,
  tipo_contenido text not null default 'text',
  estado_envio text check (estado_envio in ('pendiente', 'enviado', 'fallido')),
  contenido_cifrado text not null,
  contenido_iv text not null,
  contenido_tag text not null
);

alter table public.seller_chat_mensajes add column if not exists evento_id text;
alter table public.seller_chat_mensajes
  drop constraint if exists seller_chat_mensajes_estado_envio_check;
alter table public.seller_chat_mensajes
  add constraint seller_chat_mensajes_estado_envio_check
  check (estado_envio in ('pendiente', 'enviado', 'fallido', 'revision'));

-- Permite re-aplicar esta migración sobre una instalación que ya tenga chats.
update public.seller_chat_conversaciones c
   set ultima_entrada_en = (
     select max(m.creado_en)
       from public.seller_chat_mensajes m
      where m.conversacion_id = c.id and m.direccion = 'entrante'
   )
 where c.ultima_entrada_en is null;

-- Una respuesta de bot por evento entrante, incluso ante reintentos concurrentes.
create unique index if not exists seller_chat_mensajes_evento_idx
  on public.seller_chat_mensajes (evento_id)
  where evento_id is not null;

-- Bandeja duradera: Meta recibe 200 solo después de guardar el evento. n8n
-- procesa los pendientes y puede reintentar sin volver a insertar mensajes.
create table if not exists public.seller_chat_eventos (
  proveedor_id text primary key,
  conversacion_id uuid not null references public.seller_chat_conversaciones (id) on delete cascade,
  mensaje_id uuid not null references public.seller_chat_mensajes (id) on delete cascade,
  creado_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'procesando', 'procesado', 'fallido')),
  intentos integer not null default 0 check (intentos >= 0),
  disponible_en timestamptz not null default now(),
  error_codigo text,
  procesado_en timestamptz
);

create index if not exists seller_chat_conversaciones_bandeja_idx
  on public.seller_chat_conversaciones (estado, ultimo_mensaje_en desc);
create index if not exists seller_chat_conversaciones_seller_idx
  on public.seller_chat_conversaciones (seller_id, ultimo_mensaje_en desc);
create index if not exists seller_chat_mensajes_conversacion_idx
  on public.seller_chat_mensajes (conversacion_id, creado_en asc);
create index if not exists seller_chat_eventos_pendientes_idx
  on public.seller_chat_eventos (disponible_en, creado_en)
  where estado in ('pendiente', 'fallido');

-- Normaliza teléfonos del directorio sin devolverlos ni persistir otra copia.
-- Solo se vincula si la coincidencia es única.
create or replace function public.seller_chat_buscar_seller(p_telefono text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  normalizado text := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  coincidencias bigint[];
begin
  if normalizado like '521%' then normalizado := '52' || substr(normalizado, 4); end if;
  select array_agg(distinct s.id_usuario::bigint)
    into coincidencias
   from public.sellers_activos s
   where s.activo is true
     -- El directorio puede traer el teléfono local de 10 dígitos, 52+10 o
     -- 521+10; Meta normalmente envía el formato internacional 52+10.
     and regexp_replace(coalesce(s.celular, ''), '[^0-9]', '', 'g') in (
       normalizado,
       '521' || substr(normalizado, 3),
       case when normalizado like '52%' then substr(normalizado, 3) end,
       case when normalizado not like '52%' then '52' || normalizado end,
       case when normalizado not like '52%' then '521' || normalizado end
     );
  if coalesce(cardinality(coincidencias), 0) = 1 then return coincidencias[1]; end if;
  return null;
end;
$$;

-- Recibe conversación, mensaje y evento dentro de una única transacción.
create or replace function public.seller_chat_recibir_mensaje(
  p_proveedor_id text,
  p_canal text,
  p_clave_contacto text,
  p_contacto_cifrado text,
  p_contacto_iv text,
  p_contacto_tag text,
  p_seller_id bigint,
  p_contenido_cifrado text,
  p_contenido_iv text,
  p_contenido_tag text,
  p_tipo_contenido text,
  p_creado_en timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  chat_id uuid;
  mensaje_id uuid;
  mensaje_nuevo boolean;
  evento_estado text;
begin
  insert into public.seller_chat_conversaciones (
    canal, clave_contacto, contacto_cifrado, contacto_iv, contacto_tag, seller_id
  ) values (
    p_canal, p_clave_contacto, p_contacto_cifrado, p_contacto_iv, p_contacto_tag, p_seller_id
  )
  on conflict (clave_contacto) do update
    set contacto_cifrado = excluded.contacto_cifrado,
        contacto_iv = excluded.contacto_iv,
        contacto_tag = excluded.contacto_tag,
        -- Una coincidencia ambigua o un seller inactivo debe quitar el vínculo
        -- anterior; conservarlo podría exponer datos de otra tienda.
        seller_id = excluded.seller_id,
        actualizado_en = now()
  returning id into chat_id;

  insert into public.seller_chat_mensajes (
    conversacion_id, proveedor_id, direccion, autor_tipo,
    tipo_contenido, contenido_cifrado, contenido_iv, contenido_tag
  ) values (
    chat_id, p_proveedor_id, 'entrante', 'seller',
    left(coalesce(p_tipo_contenido, 'text'), 40),
    p_contenido_cifrado, p_contenido_iv, p_contenido_tag
  ) on conflict (proveedor_id) do nothing
  returning id into mensaje_id;

  mensaje_nuevo := mensaje_id is not null;
  if not mensaje_nuevo then
    select m.id, m.conversacion_id into mensaje_id, chat_id
      from public.seller_chat_mensajes m where m.proveedor_id = p_proveedor_id;
    select e.estado into evento_estado from public.seller_chat_eventos e where e.proveedor_id = p_proveedor_id;
    return jsonb_build_object('conversacion_id', chat_id, 'mensaje_id', mensaje_id, 'nuevo', false, 'evento_estado', evento_estado);
  end if;

  update public.seller_chat_conversaciones
     set ultimo_mensaje_en = coalesce(p_creado_en, now()),
         ultima_entrada_en = coalesce(p_creado_en, now()),
         ultimo_mensaje_cifrado = p_contenido_cifrado,
         ultimo_mensaje_iv = p_contenido_iv,
         ultimo_mensaje_tag = p_contenido_tag,
         estado = case
           when estado = 'bot'
             and (seller_id is null or p_tipo_contenido not in ('text', 'interactive', 'button'))
             and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now()) then 'pendiente'
           else estado
         end,
         actualizado_en = now()
   where id = chat_id;

  insert into public.seller_chat_eventos (proveedor_id, conversacion_id, mensaje_id)
  values (p_proveedor_id, chat_id, mensaje_id);

  return jsonb_build_object('conversacion_id', chat_id, 'mensaje_id', mensaje_id, 'nuevo', true, 'evento_estado', 'pendiente');
end;
$$;

-- Tomar solo cambia el control si el chat todavía está en manos del bot o en
-- espera. Evita que dos operadores se lo asignen por lecturas concurrentes.
create or replace function public.seller_chat_tomar(p_conversacion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  update public.seller_chat_conversaciones
     set estado = 'humano',
         asignado_a = lower(trim(p_email)),
         tomado_en = now(),
         envio_bloquea_hasta = null,
         envio_token = null,
         actualizado_en = now()
   where id = p_conversacion_id
     and estado in ('bot', 'pendiente')
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now());
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

-- Cerrar devuelve el control al bot para los mensajes siguientes.
create or replace function public.seller_chat_cerrar(p_conversacion_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  update public.seller_chat_conversaciones
     set estado = 'bot',
         asignado_a = null,
         tomado_en = null,
         cerrado_en = now(),
         envio_bloquea_hasta = null,
         envio_token = null,
         actualizado_en = now()
   where id = p_conversacion_id
     and estado = 'humano'
     and asignado_a = lower(trim(p_email))
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now())
     and nullif(trim(p_email), '') is not null;
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

create or replace function public.seller_chat_escalar(p_conversacion_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  update public.seller_chat_conversaciones
     set estado = 'pendiente',
         envio_bloquea_hasta = null,
         envio_token = null,
         actualizado_en = now()
   where id = p_conversacion_id
     and estado = 'bot'
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now());
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

-- Reserva brevemente el envío saliente: tomar/cerrar no puede ganar la carrera
-- entre la última comprobación del estado y la llamada externa a Meta.
create or replace function public.seller_chat_reservar_envio(
  p_conversacion_id uuid,
  p_estado text,
  p_email text,
  p_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  if p_estado not in ('bot', 'pendiente', 'humano') then return false; end if;
  update public.seller_chat_conversaciones
     set envio_bloquea_hasta = now() + interval '30 seconds',
         envio_token = p_token
   where id = p_conversacion_id
     and estado = p_estado
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now())
     and ultima_entrada_en >= now() - interval '24 hours'
     and (
       (p_estado = 'humano' and asignado_a = lower(trim(p_email)))
       or (p_estado in ('bot', 'pendiente') and asignado_a is null and p_email is null)
     );
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

create or replace function public.seller_chat_liberar_envio(p_conversacion_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  update public.seller_chat_conversaciones
     set envio_bloquea_hasta = null,
         envio_token = null
   where id = p_conversacion_id and envio_token = p_token;
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

-- Claim exclusivo del evento para que los reintentos simultáneos de n8n no
-- generen dos respuestas del bot.
create or replace function public.seller_chat_reclamar_evento(p_proveedor_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  update public.seller_chat_eventos
     set estado = 'procesando',
         intentos = intentos + 1,
         error_codigo = null,
         disponible_en = now() + interval '5 minutes'
   where proveedor_id = p_proveedor_id
     and (estado in ('pendiente', 'fallido') or estado = 'procesando')
     and disponible_en <= now();
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

create or replace function public.seller_chat_evento_finalizar(p_proveedor_id text, p_error_codigo text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  update public.seller_chat_eventos
     set estado = case when p_error_codigo is null then 'procesado' else 'fallido' end,
         error_codigo = left(nullif(p_error_codigo, ''), 80),
         procesado_en = case when p_error_codigo is null then now() else procesado_en end,
         disponible_en = case
           when p_error_codigo is null then disponible_en
           else now() + make_interval(secs => least(3600, greatest(30, intentos * intentos * 30)))
         end
   where proveedor_id = p_proveedor_id
     and estado = 'procesando';
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

revoke all on function public.seller_chat_buscar_seller(text) from public, anon, authenticated;
revoke all on function public.seller_chat_recibir_mensaje(text, text, text, text, text, text, bigint, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.seller_chat_tomar(uuid, text) from public, anon, authenticated;
revoke all on function public.seller_chat_cerrar(uuid, text) from public, anon, authenticated;
revoke all on function public.seller_chat_escalar(uuid) from public, anon, authenticated;
revoke all on function public.seller_chat_reservar_envio(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.seller_chat_liberar_envio(uuid, uuid) from public, anon, authenticated;
revoke all on function public.seller_chat_reclamar_evento(text) from public, anon, authenticated;
revoke all on function public.seller_chat_evento_finalizar(text, text) from public, anon, authenticated;
grant execute on function public.seller_chat_buscar_seller(text) to service_role;
grant execute on function public.seller_chat_recibir_mensaje(text, text, text, text, text, text, bigint, text, text, text, text, timestamptz) to service_role;
grant execute on function public.seller_chat_tomar(uuid, text) to service_role;
grant execute on function public.seller_chat_cerrar(uuid, text) to service_role;
grant execute on function public.seller_chat_escalar(uuid) to service_role;
grant execute on function public.seller_chat_reservar_envio(uuid, text, text, uuid) to service_role;
grant execute on function public.seller_chat_liberar_envio(uuid, uuid) to service_role;
grant execute on function public.seller_chat_reclamar_evento(text) to service_role;
grant execute on function public.seller_chat_evento_finalizar(text, text) to service_role;

alter table public.seller_chat_conversaciones enable row level security;
alter table public.seller_chat_mensajes enable row level security;
alter table public.seller_chat_eventos enable row level security;

commit;
