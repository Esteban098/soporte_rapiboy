# soporte_rapiboy

Plataforma de operación de soporte para entregas fallidas, cancelaciones,
reclamos y colectas.

- `web/`: tablero Next.js conectado a Supabase.
- `n8n/`: workflows importables de ingesta y automatización.
- La asistencia de repartidores se guarda en Supabase por jornada de México e
  `Motoboy.Id`; el webhook de votos reemplaza la escritura operativa en Google
  Sheets. La pantalla está dentro del espacio **Colectas** y distingue Ruta y
  colecta, Ruta, No asiste y No votó.
- El directorio operativo se consolida por ID estable: `Usuario.Id` en
  `sellers_activos` y `Motoboy.Id` en `drivers_activos`. Se instala con las
  migraciones 17 a 25; la 26 retira los catálogos antiguos después de validar
  una sincronización. El flujo
  `n8n/13-directorio-activos-whatsapp.json` sincroniza sellers, drivers, grupos
  y labels de soporte de WAHA; la plataforma muestra el directorio en
  **Sellers** y **Drivers**.
- `firefox-extension/`: extensión para cargar en `mensual` los datos de tienda
  seleccionados en WhatsApp Web. Se usa junto con
  `n8n/07-firefox-gestiones.json`.

La ubicación manual de cada seller vive en `sellers_activos` (`ubicacion_manual`,
`latitud_manual` y `longitud_manual`). La migración 22 la carga desde el KMZ
cuando el `Usuario.Id` tiene una única ubicación y la pantalla Sellers permite
editarla o borrarla. Esa ubicación se usa para las capas de tiendas de
Colectas y Ruta; los paquetes del Live Tracker conservan siempre el domicilio
de entrega de `Viaje.LatitudDestino` y `Viaje.LongitudDestino`. La dirección de
SQL Server permanece separada y no es editable.

La ubicación manual de cada driver vive en `drivers_activos` con las mismas
columnas y permite agregar, editar o borrar dirección, latitud y longitud desde
la pantalla Drivers. Los datos de SQL Server permanecen separados y no son
editables desde la plataforma.
La lógica operativa continúa usando la hora de Ciudad de México para resolver
la jornada, los cortes y las sincronizaciones. Las fechas y horas que ve el
usuario se presentan en horario argentino y llevan el sufijo `hs arg` (por
ejemplo, `13:29 hs arg`) para evitar mezclar relojes en la pantalla.
