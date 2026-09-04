<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tablero de soporte Rapiboy

## Modelo de datos

- `mensual` y `cancelados` son tablas operativas. Del día 1 al 9 contienen el
  mes anterior y el actual; desde el día 10 deben contener solamente el actual.
- `mensual_historico` y `cancelados_historico` acumulan los períodos cerrados.
  La web los muestra por mes y permite actualizar el rango elegido con
  `desde` / `hasta`.
- `ayer` es la cola de lo nuevo de una jornada. Se reconstruye en cada ingesta
  y solo entra un caso si su ID no está en `mensual` ni en `cancelados` —ni en
  sus históricas—. La misma corrida lo inserta en `mensual` y en `ayer`, así que
  todo ID de `ayer` está también en `mensual`; lo que no puede pasar es que
  aparezca en `ayer` un caso que ya venía de días anteriores.
- La separación física se instala con `supabase/historico.sql`. La función
  copia antes de borrar, corre dentro de una transacción y es idempotente.
- El mes de pedidos se determina con
  `coalesce(fecha_creacion, fecha_programado)`; el de cancelados, con
  `fecha_colectado`. Los cortes de calendario usan `America/Mexico_City`.

## Límites entre flujos

- Los workflows 01 y 02 trabajan únicamente sobre las tablas operativas.
- Los workflows 04 y 05 leen y escriben únicamente las tablas históricas y
  respetan el período seleccionado en el tablero.
- No cambiar `fecha_creacion` ni `fecha_colectado` en un refresco histórico:
  esas columnas fijan el mes al que pertenece cada fila.
- Los upserts automáticos nunca deben pisar `reclamo_tienda`, `ubicacion`,
  `telefono`, `aviso`, `avisado_en`, `foto`, `editado_por` ni `editado_en`.
- `ayer` se vacía solamente dentro de la ingesta diaria y después de confirmar
  que hubo jornada. Una limpieza manual es puntual y no se incorpora al flujo.

## Trabajo seguro

- La base se accede desde el servidor con `service_role`; esa clave no puede
  llegar a componentes de cliente, logs ni archivos versionados.
- Antes de borrar o mover datos en Supabase, contar las filas objetivo y
  verificar su destino. Después, comprobar cantidades e intersecciones.
- No truncar tablas ni cambiar workflows activos salvo pedido explícito.
- Los JSON de `../n8n/` son exportaciones importables. Conservar credenciales,
  conexiones, expresiones y columnas protegidas al modificarlos.
- Para una publicación compatible: desplegar la web, correr la migración SQL y
  luego importar los workflows actualizados.

## Validación

Desde `web/` ejecutar como mínimo:

```bash
npm run typecheck
npm run lint
```

Además, validar los workflows con `jq empty ../n8n/*.json`. El build no sale a
la red: la tipografía son archivos locales en `src/app/fonts/` cargados con
`next/font/local`.
