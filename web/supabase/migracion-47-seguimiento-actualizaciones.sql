-- Hace visible la última actualización del comentario de un seguimiento.
-- No se reutiliza `tomado_por`: quien actualiza información puede ser otra
-- persona y cambiar de estado no equivale a agregar un comentario.

alter table public.seguimiento
  add column if not exists comentario_actualizado_por text;

alter table public.seguimiento
  add column if not exists comentario_actualizado_en timestamptz;

alter table public.seguimiento
  drop constraint if exists seguimiento_comentario_actualizado_check;

alter table public.seguimiento
  add constraint seguimiento_comentario_actualizado_check
  check (
    (comentario_actualizado_por is null and comentario_actualizado_en is null)
    or
    (nullif(btrim(comentario_actualizado_por), '') is not null and comentario_actualizado_en is not null)
  );

comment on column public.seguimiento.comentario_actualizado_por is
  'Correo de quien hizo la última modificación real del comentario.';

comment on column public.seguimiento.comentario_actualizado_en is
  'Instante de la última modificación real del comentario.';
