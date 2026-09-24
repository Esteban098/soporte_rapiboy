-- Migración 28: reemplaza el Sí/No inicial por los tres votos operativos.
-- Se preservan las filas existentes: un antiguo "SI" no permite inferir si
-- correspondía a Ruta o Ruta y colecta, por lo que requiere revisión humana.

begin;

alter table public.asistencia_votos
  drop constraint if exists asistencia_votos_respuesta;

alter table public.asistencia_votos
  add constraint asistencia_votos_respuesta
  check (respuesta in ('SI', 'NO', 'RUTA_Y_COLECTA', 'RUTA', 'NO_ASISTE'));

comment on constraint asistencia_votos_respuesta on public.asistencia_votos is
  'SI/NO quedan temporalmente por compatibilidad; los votos nuevos usan RUTA_Y_COLECTA, RUTA o NO_ASISTE.';

commit;
