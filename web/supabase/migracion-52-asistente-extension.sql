-- Tokens personales para la extensión de Firefox.
-- Se guarda únicamente SHA-256(token): el secreto en claro se muestra una vez.
create table if not exists public.asistente_extension_tokens (
  id           uuid primary key default gen_random_uuid(),
  perfil_id    uuid not null unique references public.perfiles(id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  vence_en     timestamptz not null,
  ultimo_uso   timestamptz,
  revocado_en  timestamptz
);

create index if not exists asistente_extension_tokens_activos_idx
  on public.asistente_extension_tokens (token_hash, vence_en)
  where revocado_en is null;

alter table public.asistente_extension_tokens enable row level security;

-- Sin políticas: solo el backend con service role puede leer o escribir.
