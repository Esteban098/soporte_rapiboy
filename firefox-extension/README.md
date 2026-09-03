# Extensión Firefox · Datos de tienda

Envía el texto seleccionado en WhatsApp Web al flujo `07-firefox-gestiones`
de n8n. El flujo interpreta el ID y los datos aportados por la tienda y actualiza
las columnas de soporte de `public.mensual` en Supabase.

## Instalar para probar

1. Abrir `about:debugging#/runtime/this-firefox`.
2. Elegir **Cargar complemento temporal** y seleccionar `manifest.json`.
3. Abrir las opciones de la extensión y cargar el mismo token configurado en la
   credencial Header Auth del webhook de n8n.
4. Seleccionar en WhatsApp el mensaje completo, hacer clic derecho y elegir
   **Cargar datos de tienda en Rapiboy**.

La URL predeterminada es
`https://linux.rapitools.com.ar/webhook/firefox-gestiones`. Puede cambiarse en
las opciones sin volver a empaquetar la extensión, siempre que conserve el
host `linux.rapitools.com.ar`. Para usar otro dominio también hay que cambiar el
permiso de host en `manifest.json`.

## Empaquetar

Desde este directorio:

```bash
zip -r rapiboy-datos-tienda.zip manifest.json background.js options.html options.js options.css icons
```

El token queda en `browser.storage.local`: no se versiona ni se incluye en el
ZIP. Sigue siendo una credencial distribuida a operadores y debe rotarse si se
retira un equipo.
