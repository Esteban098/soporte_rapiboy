-- Estados operativos y eliminación de conversaciones del chat de sellers.
-- Conserva `bot` y `pendiente` como controles internos de un chat abierto;
-- agrega `cerrado` como estado persistente y registra quién lo cerró.

begin;

alter table public.seller_chat_conversaciones
  add column if not exists cerrado_por text;

alter table public.seller_chat_conversaciones
  drop constraint if exists seller_chat_conversaciones_estado_check;
alter table public.seller_chat_conversaciones
  add constraint seller_chat_conversaciones_estado_check
  check (estado in ('bot', 'pendiente', 'humano', 'cerrado'));

-- Cerrar ya no devuelve inmediatamente el control al bot. El chat permanece
-- cerrado hasta que llegue un mensaje entrante realmente nuevo.
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
     set estado = 'cerrado',
         asignado_a = null,
         cerrado_por = lower(trim(p_email)),
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

-- Recibe conversación, mensaje y evento dentro de una única transacción. Un
-- chat cerrado se reabre solo después de insertar un mensaje nuevo; un reintento
-- duplicado de Meta no altera su estado.
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
           when estado = 'cerrado' then
             case
               when seller_id is null or p_tipo_contenido not in ('text', 'interactive', 'button') then 'pendiente'
               else 'bot'
             end
           when estado = 'bot'
             and (seller_id is null or p_tipo_contenido not in ('text', 'interactive', 'button'))
             and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now()) then 'pendiente'
           else estado
         end,
         asignado_a = case when estado = 'cerrado' then null else asignado_a end,
         tomado_en = case when estado = 'cerrado' then null else tomado_en end,
         cerrado_en = case when estado = 'cerrado' then null else cerrado_en end,
         cerrado_por = case when estado = 'cerrado' then null else cerrado_por end,
         actualizado_en = now()
   where id = chat_id;

  insert into public.seller_chat_eventos (proveedor_id, conversacion_id, mensaje_id)
  values (p_proveedor_id, chat_id, mensaje_id);

  return jsonb_build_object('conversacion_id', chat_id, 'mensaje_id', mensaje_id, 'nuevo', true, 'evento_estado', 'pendiente');
end;
$$;

-- La eliminación es explícita y borra por cascada mensajes y eventos. La API
-- exige una sesión operativa antes de llamar esta función.
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
  delete from public.seller_chat_conversaciones
   where id = p_conversacion_id
     and (envio_bloquea_hasta is null or envio_bloquea_hasta <= now());
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

revoke all on function public.seller_chat_cerrar(uuid, text) from public, anon, authenticated;
revoke all on function public.seller_chat_recibir_mensaje(text, text, text, text, text, text, bigint, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.seller_chat_eliminar(uuid, text) from public, anon, authenticated;
grant execute on function public.seller_chat_cerrar(uuid, text) to service_role;
grant execute on function public.seller_chat_recibir_mensaje(text, text, text, text, text, text, bigint, text, text, text, text, timestamptz) to service_role;
grant execute on function public.seller_chat_eliminar(uuid, text) to service_role;

commit;
