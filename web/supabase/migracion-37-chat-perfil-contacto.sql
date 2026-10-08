-- Nombre de perfil que WhatsApp incluye en el webhook de mensajes.
-- Se cifra con las mismas claves que el número y el contenido del chat.

begin;

alter table public.seller_chat_conversaciones
  add column if not exists contacto_nombre_cifrado text;
alter table public.seller_chat_conversaciones
  add column if not exists contacto_nombre_iv text;
alter table public.seller_chat_conversaciones
  add column if not exists contacto_nombre_tag text;

create or replace function public.seller_chat_guardar_nombre_contacto(
  p_proveedor_id text,
  p_nombre_cifrado text,
  p_nombre_iv text,
  p_nombre_tag text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  if nullif(trim(p_proveedor_id), '') is null
     or nullif(p_nombre_cifrado, '') is null
     or nullif(p_nombre_iv, '') is null
     or nullif(p_nombre_tag, '') is null then
    return false;
  end if;

  update public.seller_chat_conversaciones c
     set contacto_nombre_cifrado = p_nombre_cifrado,
         contacto_nombre_iv = p_nombre_iv,
         contacto_nombre_tag = p_nombre_tag,
         actualizado_en = now()
    from public.seller_chat_mensajes m
   where m.proveedor_id = p_proveedor_id
     and m.direccion = 'entrante'
     and c.id = m.conversacion_id;
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

revoke all on function public.seller_chat_guardar_nombre_contacto(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.seller_chat_guardar_nombre_contacto(text, text, text, text)
  to service_role;

commit;
