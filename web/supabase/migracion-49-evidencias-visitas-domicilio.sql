-- Domicilio solo en la fila operativa (vence con ella). No cambia el historial durable.
begin;
alter table public.evidencias_entrega_revision
  add column if not exists domicilio_destino text,
  add column if not exists estado_evento text,
  add column if not exists visitado_evento boolean;

create or replace function public.evidencia_entrega_finalizar_visita(
  p_id uuid, p_foto_ruta text, p_foto_mime text, p_foto_bytes integer,
  p_calidad text, p_tipo_problema text, p_motivo text, p_confianza numeric,
  p_modelo text, p_tokens_entrada integer, p_tokens_salida integer,
  p_geografia_recibida boolean, p_estado_evento text, p_distancia_m double precision,
  p_visitado_evento boolean, p_domicilio_destino text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_viaje bigint;
  v_radio integer;
  v_estado text;
  v_distancia numeric;
  v_con_datos boolean;
begin
  select id_viaje into v_viaje from public.evidencias_entrega_revision
    where id = p_id and estado_proceso = 'PROCESANDO' for update;
  if not found then return jsonb_build_object('ok', false); end if;

  select radio_geografico_m into v_radio from public.evidencias_entrega_config where id = true;
  v_radio := coalesce(v_radio, 300);
  select exists (
    select 1 from public.mensual where id = v_viaje
      and (nullif(btrim(ubicacion), '') is not null or nullif(btrim(telefono), '') is not null)
    union all
    select 1 from public.mensual_historico where id = v_viaje
      and (nullif(btrim(ubicacion), '') is not null or nullif(btrim(telefono), '') is not null)
  ) into v_con_datos;

  if v_con_datos then v_estado := 'OMITIDA_DATOS_TIENDA';
  elsif not coalesce(p_geografia_recibida, false) then v_estado := 'NO_EVALUADA';
  elsif lower(btrim(coalesce(p_estado_evento, ''))) <> 'entregado' and not coalesce(p_visitado_evento, false) then v_estado := 'NO_ES_ENTREGA';
  elsif p_distancia_m is null or p_distancia_m < 0 or
        p_distancia_m in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8) then
    v_estado := 'SIN_COORDENADAS';
  else
    -- Se compara antes de redondear para no ocultar excesos sobre el umbral.
    v_distancia := round(p_distancia_m::numeric, 1);
    v_estado := case when p_distancia_m <= v_radio then 'DENTRO_DEL_RANGO' else 'FUERA_DEL_RANGO' end;
  end if;

  if not public.evidencia_entrega_finalizar(p_id, p_foto_ruta, p_foto_mime,
      p_foto_bytes, p_calidad, p_tipo_problema, p_motivo, p_confianza,
      p_modelo, p_tokens_entrada, p_tokens_salida) then
    return jsonb_build_object('ok', false);
  end if;

  update public.evidencias_entrega_revision
     set domicilio_destino = left(nullif(btrim(p_domicilio_destino), ''), 500),
         estado_evento = left(nullif(btrim(p_estado_evento), ''), 100),
         visitado_evento = p_visitado_evento,
         estado_geografico = v_estado, distancia_entrega_m = v_distancia,
         radio_geografico_m = v_radio,
         estado_proceso = case when v_estado = 'FUERA_DEL_RANGO' then 'PENDIENTE_REVISION' else estado_proceso end
   where id = p_id;
  update public.evidencias_entrega_historial
     set estado_geografico = v_estado, distancia_entrega_m = v_distancia,
         radio_geografico_m = v_radio,
         fue_dudosa = fue_dudosa or v_estado = 'FUERA_DEL_RANGO'
   where revision_id = p_id;
  return jsonb_build_object('ok', true, 'estado', v_estado);
end;
$$;

revoke all on function public.evidencia_entrega_finalizar_visita(uuid, text, text, integer, text, text, text, numeric, text, integer, integer, boolean, text, double precision, boolean, text) from public, anon, authenticated;
grant execute on function public.evidencia_entrega_finalizar_visita(uuid, text, text, integer, text, text, text, numeric, text, integer, integer, boolean, text, double precision, boolean, text) to service_role;
commit;
