-- ---------------------------------------------------------------------------
-- Notificaciones
--
-- Avisos para una persona del equipo. Hoy hay un solo tipo: alguien la arrobó
-- en el comentario de un reporte de seguimiento. La campana de la barra
-- superior lee las del usuario que tiene la sesión.
--
-- `destinatario` y `autor` son correos en minúsculas, el mismo identificador
-- que `creado_por` o `tomado_por`: no hay sesión de Supabase ni `auth.users`.
-- Si se borra el reporte, sus avisos se van con él.
--
-- Ejecutar una vez en el SQL Editor de Supabase antes de desplegar la web.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.notificaciones (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  destinatario    text not null,
  tipo            text not null default 'mencion',
  autor           text not null,
  seguimiento_id  uuid references public.seguimiento (id) on delete cascade,
  caso_id         text,
  extracto        text,
  leida_en        timestamptz
);

alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones
  add constraint notificaciones_tipo_check check (tipo in ('mencion'));

-- La campana lista las últimas de una persona y cuenta las no leídas.
create index if not exists notificaciones_destinatario_idx
  on public.notificaciones (destinatario, created_at desc);
create index if not exists notificaciones_no_leidas_idx
  on public.notificaciones (destinatario)
  where leida_en is null;

-- Igual que el resto: RLS prendido y sin políticas. Lee y escribe el servidor
-- con la service key; la anon key no ve nada.
alter table public.notificaciones enable row level security;

commit;
