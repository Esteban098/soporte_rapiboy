# soporte_rapiboy

Plataforma de operación de soporte para entregas fallidas, cancelaciones,
reclamos y colectas.

- `web/`: tablero Next.js conectado a Supabase.
- `n8n/`: workflows importables de ingesta y automatización.
- El directorio operativo de sellers, drivers y grupos de WhatsApp se instala
  con `web/supabase/migracion-17-directorio-activos-whatsapp.sql` y se sincroniza
  con `n8n/13-directorio-activos-whatsapp.json`. La plataforma lo muestra en
  las pantallas **Sellers** y **Drivers** del grupo **Directorio**.
- `firefox-extension/`: extensión para cargar en `mensual` los datos de tienda
  seleccionados en WhatsApp Web. Se usa junto con
  `n8n/07-firefox-gestiones.json`.
