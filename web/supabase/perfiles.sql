-- ---------------------------------------------------------------------------
-- Perfiles
--
-- Quién puede entrar al tablero y con qué permiso. Los crea el administrador
-- desde la web; no hay registro abierto.
--
-- Convive con el ingreso por Google, no lo reemplaza: quien tenga perfil activo
-- entra con correo y contraseña, y quien esté en ALLOWED_EMAILS o en el dominio
-- habilitado sigue entrando con Google. Los dos caminos terminan en la misma
-- sesión.
--
-- Correr una vez en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.rol_perfil as enum ('admin', 'operador');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.perfiles (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- Siempre en minúsculas. Es la identidad de la persona en todo el proyecto:
  -- lo mismo que queda en `editado_por`, `creado_por` y `atendido_por`.
  email          text not null unique,
  nombre         text,

  /*
   * La contraseña, derivada con scrypt. Nunca en claro.
   *
   * El formato guarda los parámetros junto al hash —`scrypt$N$r$p$sal$hash`—
   * para poder subir el costo más adelante sin invalidar las contraseñas que ya
   * existen: cada fila dice con qué parámetros se derivó la suya.
   *
   * scrypt y no bcrypt porque viene en Node: una dependencia menos en un
   * proyecto que ya habla con Supabase y con OpenAI por `fetch` pelado.
   */
  password_hash  text not null,

  /*
   * `admin` es el único que puede crear, desactivar y resetear perfiles.
   * `operador` usa el tablero y cambia su propia contraseña, nada más.
   */
  rol            public.rol_perfil not null default 'operador',

  -- Desactivar en vez de borrar: el correo sigue apareciendo en los reportes y
  -- las ediciones que hizo, y borrar la fila dejaría ese rastro sin dueño.
  activo         boolean not null default true,

  creado_por     text,
  ultimo_ingreso timestamptz
);

create index if not exists perfiles_activo_idx on public.perfiles (activo);

-- ---------------------------------------------------------------------------
-- Acceso
--
-- Igual que el resto: RLS prendido y sin políticas. Solo el servidor, con la
-- service key, lee esta tabla. Importa más que en las otras: acá están los
-- hashes de las contraseñas.
-- ---------------------------------------------------------------------------
alter table public.perfiles enable row level security;

-- ---------------------------------------------------------------------------
-- Administrador
--
-- El hash de abajo corresponde a la contraseña acordada. Guardar el hash y no
-- la contraseña es justamente el punto: quien lea este archivo no puede entrar
-- con lo que ve.
--
-- `on conflict do nothing` para que correr el script dos veces no pise una
-- contraseña ya cambiada desde la web.
-- ---------------------------------------------------------------------------
insert into public.perfiles (email, nombre, password_hash, rol, creado_por)
values (
  'esteban@rapiboy.com',
  'Esteban',
  'scrypt$16384$8$1$ac7a04b658c2eec437a2909b74fbd9d0$c22037c65907c7163a6beacaa67aae6f4e75513aa66659fcc8ace7555592eb5467c5a10bb83fd628249b20fe129466e4efeb30c7f751e326459f911a2e96e0bf',
  'admin',
  'script inicial'
)
on conflict (email) do nothing;
