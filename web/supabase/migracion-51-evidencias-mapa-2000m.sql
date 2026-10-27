-- Guarda los dos puntos solo durante la retencion operativa de 7 dias.
-- El historial durable sigue sin coordenadas ni fotografias.
begin;

alter table public.evidencias_entrega_config
  alter column radio_geografico_m set default 2000;

update public.evidencias_entrega_config
   set radio_geografico_m = 2000,
       actualizado_en = now()
 where id = true;

alter table public.evidencias_entrega_revision
  add column if not exists latitud_evento double precision,
  add column if not exists longitud_evento double precision,
  add column if not exists latitud_destino double precision,
  add column if not exists longitud_destino double precision;

alter table public.evidencias_entrega_revision
  drop constraint if exists evidencias_revision_latitud_evento_check,
  drop constraint if exists evidencias_revision_longitud_evento_check,
  drop constraint if exists evidencias_revision_latitud_destino_check,
  drop constraint if exists evidencias_revision_longitud_destino_check;

alter table public.evidencias_entrega_revision
  add constraint evidencias_revision_latitud_evento_check
    check (latitud_evento is null or latitud_evento between -90 and 90),
  add constraint evidencias_revision_longitud_evento_check
    check (longitud_evento is null or longitud_evento between -180 and 180),
  add constraint evidencias_revision_latitud_destino_check
    check (latitud_destino is null or latitud_destino between -90 and 90),
  add constraint evidencias_revision_longitud_destino_check
    check (longitud_destino is null or longitud_destino between -180 and 180);

create or replace function public.evidencia_entrega_finalizar_visita_mapa(
  p_id uuid, p_foto_ruta text, p_foto_mime text, p_foto_bytes integer,
  p_calidad text, p_tipo_problema text, p_motivo text, p_confianza numeric,
  p_modelo text, p_tokens_entrada integer, p_tokens_salida integer,
  p_geografia_recibida boolean, p_estado_evento text, p_distancia_m double precision,
  p_visitado_evento boolean, p_domicilio_destino text,
  p_latitud_evento double precision, p_longitud_evento double precision,
  p_latitud_destino double precision, p_longitud_destino double precision
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  v_resultado := public.evidencia_entrega_finalizar_visita(
    p_id, p_foto_ruta, p_foto_mime, p_foto_bytes,
    p_calidad, p_tipo_problema, p_motivo, p_confianza,
    p_modelo, p_tokens_entrada, p_tokens_salida,
    p_geografia_recibida, p_estado_evento, p_distancia_m,
    p_visitado_evento, p_domicilio_destino
  );

  if coalesce((v_resultado ->> 'ok')::boolean, false) then
    update public.evidencias_entrega_revision
       set latitud_evento = p_latitud_evento,
           longitud_evento = p_longitud_evento,
           latitud_destino = p_latitud_destino,
           longitud_destino = p_longitud_destino
     where id = p_id;
  end if;

  return v_resultado;
end;
$$;

revoke all on function public.evidencia_entrega_finalizar_visita_mapa(uuid, text, text, integer, text, text, text, numeric, text, integer, integer, boolean, text, double precision, boolean, text, double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.evidencia_entrega_finalizar_visita_mapa(uuid, text, text, integer, text, text, text, numeric, text, integer, integer, boolean, text, double precision, boolean, text, double precision, double precision, double precision, double precision) to service_role;

commit;
