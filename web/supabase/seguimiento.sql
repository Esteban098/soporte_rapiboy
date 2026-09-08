-- ---------------------------------------------------------------------------
-- Seguimiento
--
-- Lo que el equipo reporta sobre un caso mientras trabaja: un comentario, los
-- archivos que lo respalden y si sigue abierto o ya fue cerrado.
--
-- Es una tabla aparte de `mensual` a propósito. `mensual` la reescribe n8n
-- todas las mañanas y guarda UNA fila por pedido; el seguimiento es un registro
-- de personas, con varias entradas por caso y sin nada que el flujo pueda
-- pisar. Por eso `caso_id` es texto y no una foreign key a `mensual`: se puede
-- reportar sobre un viaje que todavía no entró a la tabla, o que ya salió.
--
-- Correr una vez en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

-- Estado del reporte. `create type` no acepta `if not exists`, así que
-- va envuelto para que correr el script dos veces no falle.
do $$
begin
  create type public.estado_seguimiento as enum ('abierto', 'cerrado');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.seguimiento (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  -- Id del viaje al que se refiere el reporte, tal como lo escribió quien
  -- reporta. Texto y sin FK: ver el comentario de arriba.
  caso_id             text not null,

  -- Foto de los responsables del pedido al crear el reporte. No son FK porque
  -- el pedido puede moverse de Mensual a Histórico o no estar todavía cargado.
  driver              text,
  seller              text,

  -- El comentario tal cual se escribió. No se toca nunca: es la fuente, y el
  -- resumen es una lectura de esto.
  comentario_original text not null,

  -- El resumen del modelo. Nullable porque puede fallar la API, faltar la clave
  -- o vencer el tiempo de espera, y nada de eso puede impedir que el reporte se
  -- guarde: el dato que importa es el comentario.
  resumen_llm         text,

  -- Rutas dentro del bucket, NO URLs. Las URLs firmadas vencen, así que
  -- guardarlas dejaría la tabla llena de links muertos en una hora; el tablero
  -- las firma al momento de mostrar.
  archivos            text[] not null default '{}',

  estado              public.estado_seguimiento not null default 'abierto',
  -- Inicio del período abierto actual. Se reinicia al reabrir para que el
  -- tiempo de resolución no sume un cierre anterior.
  abierto_en          timestamptz not null default now(),

  -- Quién reportó y quién lo cerró, por correo.
  --
  -- El proyecto autentica con Google vía next-auth y lee la base con la service
  -- key, así que no hay sesión de Supabase: `auth.users` está vacío y un uuid
  -- con FK ahí no podría completarse desde la app. El correo es el identificador
  -- que la app sí tiene, y es el mismo criterio que ya usa `mensual.editado_por`.
  creado_por          text not null,
  atendido_por        text,
  atendido_en         timestamptz
);

-- Actualiza instalaciones creadas con una versión anterior del script.
alter table public.seguimiento add column if not exists driver text;
alter table public.seguimiento add column if not exists seller text;
alter table public.seguimiento add column if not exists abierto_en timestamptz;
update public.seguimiento set abierto_en = created_at where abierto_en is null;
alter table public.seguimiento alter column abierto_en set default now();
alter table public.seguimiento alter column abierto_en set not null;

-- `tomado` era un paso intermedio que ya no existe. Un caso tomado pero no
-- cerrado sigue pendiente, por eso vuelve a abierto y entra en la cola.
update public.seguimiento
   set estado = 'abierto',
       atendido_por = null,
       atendido_en = null,
       abierto_en = now()
 where estado::text = 'tomado';

-- En bases existentes el enum conserva físicamente el valor legado porque
-- PostgreSQL no permite quitarlo en sitio. Este check impide volver a usarlo.
alter table public.seguimiento drop constraint if exists seguimiento_estado_valido_check;
alter table public.seguimiento
  add constraint seguimiento_estado_valido_check
  check (estado::text in ('abierto', 'cerrado'));

-- Completa los reportes existentes sin pisar datos ya guardados. Mensual tiene
-- prioridad durante la ventana operativa; Histórico cubre los períodos rotados.
update public.seguimiento as s
   set driver = coalesce(
         nullif(btrim(s.driver), ''),
         (select nullif(btrim(m.repartidor), '') from public.mensual m where m.id::text = s.caso_id limit 1),
         (select nullif(btrim(h.repartidor), '') from public.mensual_historico h where h.id::text = s.caso_id limit 1)
       ),
       seller = coalesce(
         nullif(btrim(s.seller), ''),
         (select nullif(btrim(m.tienda), '') from public.mensual m where m.id::text = s.caso_id limit 1),
         (select nullif(btrim(h.tienda), '') from public.mensual_historico h where h.id::text = s.caso_id limit 1)
       )
 where nullif(btrim(s.driver), '') is null
    or nullif(btrim(s.seller), '') is null;

-- El tablero lista por fecha, filtra por estado y busca por viaje.
create index if not exists seguimiento_created_at_idx   on public.seguimiento (created_at desc);
create index if not exists seguimiento_estado_idx       on public.seguimiento (estado);
create index if not exists seguimiento_caso_id_idx      on public.seguimiento (caso_id);
create index if not exists seguimiento_atendido_por_idx on public.seguimiento (atendido_por);

-- ---------------------------------------------------------------------------
-- Acceso
--
-- Igual que el resto de las tablas: RLS prendido y sin políticas. El tablero
-- entra con la service key desde el servidor, que saltea RLS; el navegador
-- nunca ve una credencial. Sin políticas, la anon key no lee ni escribe nada,
-- así que si esa clave se filtra no expone comentarios ni adjuntos.
--
-- Políticas del tipo `to authenticated using (true)` serían código muerto acá:
-- no hay JWT de Supabase en juego, nadie llega como `authenticated`. Lo que
-- controla quién entra es el login del sitio (ALLOWED_EMAILS / dominio).
-- ---------------------------------------------------------------------------
alter table public.seguimiento enable row level security;

-- ---------------------------------------------------------------------------
-- Bucket de adjuntos
--
-- Privado. Las fotos de un reclamo llevan domicilios, etiquetas y a veces la
-- cara de quien recibe: un bucket público las deja accesibles a cualquiera que
-- tenga el link, para siempre y sin login. El tablero firma URLs de una hora al
-- mostrarlas.
--
-- Si el bucket ya existe, esto no lo toca.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('seguimiento', 'seguimiento', false, 10485760)
on conflict (id) do nothing;

-- Sin políticas sobre storage.objects, por lo mismo: sube y firma la service
-- key desde el servidor. Si alguna vez se quiere subir desde el navegador con
-- la anon key, ahí sí van a hacer falta políticas y una sesión de Supabase.
