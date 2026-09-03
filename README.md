# soporte_rapiboy

Plataforma de operación de soporte para entregas fallidas, cancelaciones,
reclamos y colectas.

- `web/`: tablero Next.js conectado a Supabase.
- `n8n/`: workflows importables de ingesta y automatización.
- `firefox-extension/`: extensión para cargar en `mensual` los datos de tienda
  seleccionados en WhatsApp Web. Se usa junto con
  `n8n/07-firefox-gestiones.json`.
