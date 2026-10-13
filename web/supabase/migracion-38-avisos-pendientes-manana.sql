-- Avisos automáticos de recuperación de entregas.
-- Una clave por día, driver y destinatario evita duplicar WhatsApps si n8n
-- reintenta la ejecución de las 07:50 o alguien la corre manualmente.

begin;

create table if not exists public.avisos_pendientes_manana (
  fecha_operacion date not null,
  jornada date not null,
  id_motoboy bigint not null references public.drivers_activos (id_motoboy),
  tipo text not null check (tipo in ('DRIVER', 'OPERATIVO')),
  mensaje text not null,
  enviado_en timestamptz not null default now(),
  primary key (fecha_operacion, id_motoboy, tipo)
);

alter table public.avisos_pendientes_manana enable row level security;

commit;
