-- Migración 27: asistencia diaria de repartidores.
--
-- Una asistencia pertenece al repartidor y a la jornada operativa de México.
-- No se fuerza IdColecta ni IdUsuario: un repartidor puede trabajar varias
-- colectas/sellers en una jornada y grabar alguno de esos IDs acá inventaría
-- una relación uno-a-uno que no existe.

begin;

create table if not exists public.asistencia_contactos (
  telefono_normalizado text primary key,
  id_motoboy bigint not null references public.drivers_activos(id_motoboy) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint asistencia_contactos_telefono_formato
    check (telefono_normalizado ~ '^[0-9]{8,18}$')
);

create unique index if not exists asistencia_contactos_motoboy_unico_idx
  on public.asistencia_contactos (id_motoboy);

create table if not exists public.asistencia_votos (
  id uuid primary key default gen_random_uuid(),
  fecha_operacion date not null,
  id_motoboy bigint not null references public.drivers_activos(id_motoboy) on delete restrict,
  respuesta text not null,
  origen text not null default 'ENCUESTA',
  id_poll text,
  votado_en timestamptz not null,
  recibido_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por text,
  constraint asistencia_votos_respuesta check (respuesta in ('RUTA_Y_COLECTA', 'RUTA', 'NO_ASISTE')),
  constraint asistencia_votos_origen check (origen in ('ENCUESTA', 'MANUAL')),
  constraint asistencia_votos_una_respuesta_por_dia unique (fecha_operacion, id_motoboy)
);

create index if not exists asistencia_votos_dia_idx
  on public.asistencia_votos (fecha_operacion desc, respuesta, id_motoboy);
create index if not exists asistencia_votos_motoboy_idx
  on public.asistencia_votos (id_motoboy, fecha_operacion desc);

alter table public.asistencia_contactos enable row level security;
alter table public.asistencia_votos enable row level security;

comment on table public.asistencia_contactos is
  'Vínculo privado entre teléfono de encuesta y Motoboy.Id. No se expone al navegador.';
comment on table public.asistencia_votos is
  'Una respuesta vigente por repartidor y jornada de México; no depende de Google Sheets.';

commit;
