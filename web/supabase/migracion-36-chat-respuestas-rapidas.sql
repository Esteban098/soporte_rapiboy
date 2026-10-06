-- Respuestas reutilizables del chat de sellers.
-- Los operadores las administran desde la plataforma y las insertan escribiendo
-- `/` en el compositor. No contienen datos del contacto ni de conversaciones.

begin;

create table if not exists public.seller_chat_respuestas_rapidas (
  id uuid primary key default gen_random_uuid(),
  atajo text not null,
  titulo text not null,
  contenido text not null,
  activa boolean not null default true,
  creado_por text not null,
  actualizado_por text not null,
  created_at timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (atajo = lower(atajo)),
  check (atajo ~ '^[a-z0-9_-]{1,40}$'),
  check (char_length(titulo) between 1 and 80),
  check (char_length(contenido) between 1 and 4000)
);

create unique index if not exists seller_chat_respuestas_rapidas_atajo_idx
  on public.seller_chat_respuestas_rapidas (lower(atajo));
create index if not exists seller_chat_respuestas_rapidas_activas_idx
  on public.seller_chat_respuestas_rapidas (atajo)
  where activa is true;

alter table public.seller_chat_respuestas_rapidas enable row level security;

commit;
