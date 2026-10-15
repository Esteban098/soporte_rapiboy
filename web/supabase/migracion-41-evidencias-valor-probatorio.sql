-- Migración 41: motivos para distinguir calidad visual de valor probatorio.
-- SOLO_PAQUETE no demuestra por sí solo la entrega; SIN_CONTEXTO_DE_ENTREGA
-- cubre escenas sin persona receptora, chat/llamada ni domicilio identificable.

begin;

alter table public.evidencias_entrega_revision
  drop constraint if exists evidencias_entrega_revision_tipo_problema_modelo_check;
alter table public.evidencias_entrega_revision
  add constraint evidencias_entrega_revision_tipo_problema_modelo_check
  check (tipo_problema_modelo in (
    'BORROSA', 'OSCURA', 'CORTADA', 'ILEGIBLE',
    'PAQUETE_NO_DISTINGUIBLE', 'SOLO_PAQUETE',
    'SIN_CONTEXTO_DE_ENTREGA', 'OTRO', 'NINGUNO'
  ));

alter table public.evidencias_entrega_historial
  drop constraint if exists evidencias_entrega_historial_tipo_problema_check;
alter table public.evidencias_entrega_historial
  add constraint evidencias_entrega_historial_tipo_problema_check
  check (tipo_problema in (
    'BORROSA', 'OSCURA', 'CORTADA', 'ILEGIBLE',
    'PAQUETE_NO_DISTINGUIBLE', 'SOLO_PAQUETE',
    'SIN_CONTEXTO_DE_ENTREGA', 'OTRO', 'NINGUNO'
  ));

commit;
