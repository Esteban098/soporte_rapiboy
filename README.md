# soporte_rapiboy

Plataforma de operación de soporte para entregas fallidas, cancelaciones,
reclamos y colectas.

- `web/`: tablero Next.js conectado a Supabase.
- `n8n/`: workflows importables de ingesta y automatización.
- El directorio operativo se consolida por `Usuario.Id` en `sellers_activos`.
  Se instala con las migraciones 17, 18 y 19, se limpia la antigua distribución
  con la 20 y la asignación inicial desde labels se carga con la 21. El flujo
  `n8n/13-directorio-activos-whatsapp.json` sincroniza sellers, drivers, grupos
  y labels de soporte de WAHA; la plataforma muestra el directorio en
  **Sellers** y **Drivers**.
- `firefox-extension/`: extensión para cargar en `mensual` los datos de tienda
  seleccionados en WhatsApp Web. Se usa junto con
  `n8n/07-firefox-gestiones.json`.

La ubicación manual de cada seller vive en `sellers_activos` (`ubicacion_manual`,
`latitud_manual` y `longitud_manual`). La migración 22 la carga desde el KMZ
cuando el `Usuario.Id` tiene una única ubicación y la pantalla Sellers permite
editarla o borrarla. Esa ubicación tiene prioridad en Live Tracker, Colectas y
Ruta; la dirección de SQL Server permanece separada y no es editable.
