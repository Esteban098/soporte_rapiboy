-- Migración 21: carga inicial masiva del soporte desde labels_waha.
-- Es intencionalmente de una sola vez: después, soporte_asignado se edita
-- desde la plataforma y n8n no lo pisa.

begin;

with candidatos as (
  select
    id_usuario,
    case
      when count(*) filter (where lower(trim(coalesce(label->>'name', ''))) in ('cande', 'candela', 'candelaria')) > 0
       and count(*) filter (where lower(trim(coalesce(label->>'name', ''))) = 'esteban') = 0
        then 'CANDE'
      when count(*) filter (where lower(trim(coalesce(label->>'name', ''))) = 'esteban') > 0
       and count(*) filter (where lower(trim(coalesce(label->>'name', ''))) in ('cande', 'candela', 'candelaria')) = 0
        then 'ESTEBAN'
      else null
    end as soporte
  from public.sellers_activos
  left join lateral jsonb_array_elements(
    case when jsonb_typeof(labels_waha) = 'array' then labels_waha else '[]'::jsonb end
  ) as etiquetas(label) on true
  where activo and soporte_asignado is null
  group by id_usuario
)
update public.sellers_activos s
set soporte_asignado = c.soporte,
    soporte_asignado_por = 'migracion-21-labels-waha',
    soporte_asignado_en = now()
from candidatos c
where s.id_usuario = c.id_usuario
  and c.soporte is not null
  and s.soporte_asignado is null;

commit;
