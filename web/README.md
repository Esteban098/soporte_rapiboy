# Tablero de Operación · México

Web con los tableros de entregas fallidas, demoras y cancelaciones. La base de
datos es el Google Sheet que el equipo ya actualiza todos los días: la app lo
lee, calcula las métricas y las muestra. No hay que cargar nada dos veces.

## Cómo está armado

```
Google Sheet  ──►  servidor Next.js  ──►  navegador
(pestañas CSV)     lee, normaliza,        solo agregados,
                   agrega y cachea        sin datos de clientes
```

Tres decisiones que vale la pena tener presentes:

- **El sheet se lee solo desde el servidor.** La URL del documento vive en una
  variable de entorno y nunca llega al navegador. Por eso el login protege de
  verdad: no hay forma de saltearlo pidiendo el CSV por afuera.
- **Al navegador solo viajan agregados.** Teléfonos, domicilios y links de Maps
  no salen del servidor. Las páginas que muestran pedidos individuales lo hacen
  con id, estado, repartidor, comercio y zona: nada de datos del cliente.
- **El esquema cambiante del libro se resuelve en un solo lugar.**
  `src/lib/normalizar.ts` conoce todos los nombres que tuvo cada columna
  (`Repartidor`/`Driver`, `Polígono`/`Poligono`, los tres formatos de fecha) y
  deduplica los pedidos que aparecen en más de una pestaña.

## Secciones

| Ruta | Qué muestra |
|---|---|
| `/` | Volumen y tasa de devolución mes a mes, y las tres variables que deciden el resultado: visitas, demora y repartidor. |
| `/operacion` | La cola del día: demorados, demorados sin entregar y abiertos de ayer, con el mismo semáforo que la columna `DEMORA` de la planilla. |
| `/repartidores` | Dispersión del equipo, ranking por tasa de devolución y cuántas devoluciones evitaría llevar a los críticos a la mediana. |
| `/comercios` | De dónde salen los casos y a qué zonas van. |
| `/cancelaciones` | Tiempo en ruta antes de que Mercado Libre cancele. El tablero recalcula los minutos que la hoja de 2026 dejó de calcular. |

## Correrlo local

Sin configurar nada, la app arranca con los fixtures y sin login:

```bash
npm install
npm run fixtures       # requiere XLSX=/ruta/al/libro.xlsx y pandas + openpyxl
npm run dev
```

Los fixtures se generan desde el libro real pero **sin teléfonos, domicilios ni
nombres de repartidor**: conservan los volúmenes y las fechas para que los
tableros se vean como en producción. No se versionan.

Para probar contra el sheet de verdad, copiá `.env.example` a `.env.local` y
completá `SHEET_ID`.

Comandos útiles:

```bash
npm run typecheck    # TypeScript
npm run verificar    # imprime todas las métricas por consola, contra fixtures
npm run build        # build de producción
```

## Publicar el sheet

El documento tiene que ser legible por la app. La opción más simple es
**Compartir → Cualquiera con el enlace → Lector**. Con eso alcanza: la app pide
cada pestaña por nombre al endpoint `gviz` de Google.

> Cuidado: mientras el documento esté compartido por enlace, cualquiera que
> tenga la URL puede abrirlo con todo su contenido, teléfonos incluidos. El
> login del tablero no cambia eso. Si en algún momento querés cerrarlo del todo,
> hay que pasar a una cuenta de servicio de Google Cloud; el único archivo a
> tocar es `src/lib/csv.ts`.

## Desplegar en Vercel

1. Importá el repo en Vercel y elegí `web` como **Root Directory**.
2. Cargá las variables de entorno de `.env.example`. Como mínimo: `SHEET_ID`,
   `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y una de
   `ALLOWED_EMAIL_DOMAIN` / `ALLOWED_EMAILS`.
3. En Google Cloud → Credenciales, creá un cliente OAuth de tipo *Aplicación
   web* y agregá como URI de redirección autorizada:
   `https://TU-DOMINIO/api/auth/callback/google`.

Sin `GOOGLE_CLIENT_ID` cargado, en producción no entra nadie: el ingreso falla
en vez de quedar abierto.

### Quién puede entrar

- `ALLOWED_EMAIL_DOMAIN=tuempresa.com` habilita a todo el dominio de Workspace.
- `ALLOWED_EMAILS=ana@gmail.com,juan@gmail.com` habilita cuentas sueltas.
- Se pueden usar las dos a la vez. Si no se configura ninguna, no entra nadie.

## Cuando el equipo archiva un mes nuevo

Agregá el nombre de la pestaña al principio de `SHEET_TABS` en Vercel:

```
SHEET_TABS=Septiembre2026,Mensual,Julio2026,Mayo2026,dic,nov,Oct,Sep,Agosto,Julio,Junio,Mayo
```

No hace falta tocar el código. Si `SHEET_TABS` está vacío, se usa la lista de
`src/lib/config.ts`.

## Límites conocidos

- Los meses de febrero a abril de 2025 no están en la serie: esas pestañas
  arrastran filas de `#REF!` de la planilla vieja y sus nombres no coinciden con
  el mes que contienen. Se pueden sumar a `SHEET_TABS` si hiciera falta.
- Los nombres de zona salen tal cual están cargados en el sheet, con sus
  variantes de acento y sufijo. Normalizarlos en la planilla mejora los
  rankings de `/comercios`.
- La caché es de una hora. Si el equipo actualiza el sheet y quiere verlo al
  instante, hay que bajar `SHEET_REVALIDATE`.
