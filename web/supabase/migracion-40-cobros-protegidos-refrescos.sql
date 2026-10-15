-- Migración 40: impide que un refresco automático borre cobros manuales.
-- Requiere migracion-39-cobros-auditoria.sql.
begin;

-- Cierra la ventana entre leer los checks existentes e instalar los triggers.
-- El bloqueo dura solamente esta migración y no impide lecturas del tablero.
lock table public.mensual, public.mensual_historico in share row exclusive mode;

-- Los true existentes pasan a tener una referencia durable. No se atribuyen a
-- una persona: esta fila registra el estado encontrado al instalar el blindaje.
insert into public.siniestrados_cobros_historial (
  viaje_id, origen, cobrado_anterior, cobrado_nuevo, cambiado_por, cambiado_en
)
select distinct on (caso.viaje_id)
  caso.viaje_id,
  caso.origen,
  false,
  true,
  'migracion-40',
  caso.cambiado_en
from (
  select m.id as viaje_id, 'mensual'::text as origen,
         coalesce(m.editado_en, now()) as cambiado_en
    from public.mensual m
   where m.cobrado is true
  union all
  select h.id as viaje_id, 'mensual_historico'::text as origen,
         coalesce(h.editado_en, now()) as cambiado_en
    from public.mensual_historico h
   where h.cobrado is true
) caso
where not exists (
  select 1
    from public.siniestrados_cobros_historial previo
   where previo.viaje_id = caso.viaje_id
)
order by caso.viaje_id, caso.cambiado_en desc;

-- El último evento auditado es la autoridad del campo. Un upsert de refresco
-- que intente mandar otro valor queda corregido antes de escribir la fila.
-- La función del checkbox inserta primero su evento y por eso sí puede cambiarlo.
create or replace function public.proteger_cobro_siniestrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cobrado_auditado boolean;
begin
  select historial.cobrado_nuevo
    into cobrado_auditado
    from public.siniestrados_cobros_historial historial
   where historial.viaje_id = new.id
   order by historial.id desc
   limit 1;

  if found and new.cobrado is distinct from cobrado_auditado then
    new.cobrado := cobrado_auditado;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_cobro_siniestrado_mensual on public.mensual;
create trigger proteger_cobro_siniestrado_mensual
before update of cobrado on public.mensual
for each row execute function public.proteger_cobro_siniestrado();

drop trigger if exists proteger_cobro_siniestrado_historico on public.mensual_historico;
create trigger proteger_cobro_siniestrado_historico
before update of cobrado on public.mensual_historico
for each row execute function public.proteger_cobro_siniestrado();

revoke all on function public.proteger_cobro_siniestrado() from public, anon, authenticated;

-- Registra primero la intención. El trigger ve ese evento dentro de la misma
-- transacción y permite exactamente el valor pedido por soporte.
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
    insert into public.siniestrados_cobros_historial (
      viaje_id, origen, cobrado_anterior, cobrado_nuevo, cambiado_por
    ) values (
      p_id, tabla_origen, cobrado_previo, p_cobrado, btrim(p_quien)
    );

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
  end if;

  return query select p_id, p_cobrado, tabla_origen;
end;
$$;

revoke all on function public.marcar_cobro_siniestrado(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_cobro_siniestrado(bigint, boolean, text) to postgres, service_role;

commit;
