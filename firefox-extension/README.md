# Extensión Firefox · Datos de tienda

Envía el texto seleccionado en WhatsApp Web al flujo `07-firefox-gestiones`
de n8n. El flujo interpreta el ID y los datos aportados por la tienda y actualiza
las columnas de soporte de `public.mensual` en Supabase.

## Instalación permanente (lo que usan los operadores)

Firefox de release solo instala de forma permanente extensiones **firmadas por
Mozilla**. La firma es gratuita y no obliga a publicar en la tienda pública: se
usa el canal **unlisted** (autodistribución), que devuelve un `.xpi` firmado
para repartir por nuestros medios.

### 1. Credenciales de AMO (una sola vez)

Crear una cuenta en <https://addons.mozilla.org> y generar las claves en
<https://addons.mozilla.org/developers/addon/api/key/>. Quedan dos valores:
`JWT issuer` y `JWT secret`. **No se versionan.**

### 2. Guardar las claves localmente

Copiar la plantilla y completarla:

```bash
cp firma.ejemplo.cjs firma.cjs
```

`firma.cjs` está en `.gitignore`. Alternativa sin archivo: exportar
`WEB_EXT_API_KEY` y `WEB_EXT_API_SECRET` en el entorno.

### 3. Firmar

```bash
npm install
npm run lint    # reproduce las validaciones de AMO
npm run sign
```

Mozilla valida y firma automáticamente (suele tardar un par de minutos). El
resultado queda en `artefactos/`, con un nombre generado por AMO
(`<hash>-<version>.xpi`). Conviene renombrarlo antes de repartirlo:

```bash
mv artefactos/*-2.1.0.xpi artefactos/rapiboy-datos-tienda-2.1.0.xpi
```

Renombrar no invalida la firma: va dentro del paquete, no en el nombre.

Correr `npm run lint` antes de firmar evita subir una versión que AMO va a
rechazar; con 0 errores la firma pasa sin intervención humana.

### 4. Instalar en la máquina del operador

1. Abrir Firefox y arrastrar el `.xpi` a una ventana (o `Ctrl+O` y elegirlo).
2. Aceptar los permisos que pide el diálogo.
3. Abrir las opciones de la extensión (`about:addons` → Datos de tienda →
   Preferencias) y cargar el nombre del operador y el token configurado en la
   credencial Header Auth del webhook de n8n.

La extensión queda instalada de forma permanente: sobrevive reinicios y
actualizaciones de Firefox. **No** hay que volver a cargarla cada día.

### 5. Publicar una versión nueva

Subir el `version` de `manifest.json` (AMO rechaza una versión ya firmada),
volver a firmar y repartir el `.xpi` nuevo. Instalarlo encima actualiza la
extensión conservando la configuración, porque el `browser_specific_settings.
gecko.id` no cambia.

Si en algún momento queremos actualizaciones automáticas, hay que agregar
`applications.gecko.update_url` al manifest y alojar un `updates.json` propio;
hoy no está en uso.

## Desarrollo

Para probar cambios sin firmar:

```bash
npm install
npx web-ext run          # abre un Firefox limpio con la extensión cargada
```

Alternativa manual: `about:debugging#/runtime/this-firefox` →
**Cargar complemento temporal** → `manifest.json`. Esa carga es temporal y se
pierde al cerrar Firefox; sirve solo para desarrollo.

## Configuración

La URL predeterminada es
`https://linux.rapitools.com.ar/webhook/firefox-gestiones`. Puede cambiarse en
las opciones sin volver a empaquetar la extensión, siempre que conserve el
host `linux.rapitools.com.ar`. Para usar otro dominio también hay que cambiar el
permiso de host en `manifest.json` y volver a firmar.

El token queda en `browser.storage.local`: no se versiona ni se incluye en el
paquete. Sigue siendo una credencial distribuida a operadores y debe rotarse si
se retira un equipo.
