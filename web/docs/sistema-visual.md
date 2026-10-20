# Sistema visual · Grafito / Lima / Fucsia

La referencia aprobada es la primera propuesta oscura de Live Tracker. La
implementación aplica su material, color y jerarquía al producto existente;
no incorpora los números, nombres, mapa ficticio ni otros datos de la imagen.

## Fuente única de estilos

- `src/app/theme.css`: paletas, estados, superficies, mapas, tipografía,
  radios y movimiento. `globals.css` la importa desde el layout raíz.
- Los títulos de página y sección (`h1`–`h3`) usan The Led Display St, alojada
  localmente y cargada con `next/font/local`; los rótulos pequeños (`h4`),
  controles y texto de lectura conservan SF Pro. La fuente sigue siendo texto
  seleccionable. Su licencia, incluida junto al TTF, permite uso gratuito
  personal y sin fines de lucro, pero exige contactar al autor para uso
  comercial. Verificar esa autorización antes de publicar.
- `ui.module.css` y `Card.tsx`: estructura general, sidebar, encabezados,
  tarjetas, KPI, tablas compartidas y avisos.
- `IconoSeccion.tsx`: iconos decorativos; los destinos y permisos siguen en
  `lib/navegacion.ts` y `lib/permisos.ts`.
- `ValorMetrica.tsx`: los KPI muestran texto real, seleccionable y copiable;
  cifras, porcentajes, signos y unidades (horas, minutos, etc.) usan la misma
  fuente LED de los títulos. También se aplica a los totales destacados de
  gráficos y tarjetas. Los números de tablas, ejes y texto de lectura
  mantienen SF Pro para conservar la legibilidad operativa.
- Las cifras KPI se ajustan al ancho de su tarjeta; los valores largos pueden
  ocupar dos líneas. Los titulares y valores LED usan una escala ligeramente
  menor y menor altura de línea para no dominar tarjetas y móviles, sin
  estrechar el espacio entre letras. Los títulos LCD suman un interletraje
  leve (`--led-word-spacing`, 0,022 em) sin alterar el de las cifras; las tablas y
  formularios conservan su tipografía. El tema claro oscurece levemente los
  tonos LED dentro de cada color original para que los puntos conserven
  contraste. Todos los KPI y
  badges llevan un degradado sutil derivado de su tono propio; el fucsia
  identifica acentos secundarios neutrales.
- `charts/ArcoDistribucion.tsx`: semicírculo ampliado con pista rayada, arco
  grueso y borde exterior fino por categoría, total central y tooltip. El
  desglose de estados muestra hasta ocho categorías y agrupa el resto en
  «Otros»; su leyenda queda debajo del gráfico y la tabla conserva el detalle.
- El menú plegado deja íconos circulares con nombres en `title`; Perfiles queda
  como engranaje al pie y el botón de sesión conserva su nombre accesible.
  Actualizar y los filtros de alcance del
  chat usan botones claros en el tema oscuro.
- Los módulos especializados consumen los mismos tokens: Colectas, chat y
  administración del chat, Evidencias, mapas, acceso, errores y editores.

No crear nuevas paletas locales para una pantalla. Un color de estado se
expresa con su token (`--critical`, `--estado-entregado`, etc.), nunca
reutilizando el acento de marca para representar todos los resultados.

## Paleta y contraste

| Función | Tema oscuro |
| --- | --- |
| Fondo | `#0c100e` |
| Tarjeta | `#141d18` |
| Superficie elevada | `#1c2921` |
| Borde | `#304334` |
| Texto | `#f1f5ef` |
| Texto secundario | `#c2cec4` |
| Texto auxiliar | `#9eafa2` |
| Acción principal | `#b2f018` con texto `#142006` |
| Acento secundario | fucsia `#ff69c9` |

Las advertencias usan ámbar y los problemas coral; Esteban sigue en azul y
Candelaria en rosa. Los identificadores y colores de repartidores no cambian.
`--warning-solid` permite controles ámbar con tinta oscura en ambas paletas;
`--warning` es el texto semántico que contrasta sobre `--warning-soft`.

Las superficies son opacas, con degradados discretos. No hay desenfoque global,
animaciones de letras ni efectos que oculten información durante el trabajo.
Se respeta `prefers-reduced-motion` y el foco de teclado sigue siendo visible.
`--tracking-boost` suma 0,02 em a los espaciados originales de texto y cifras;
`--radio` y `--radio-2` definen los marcos principales más redondeados.

## Preferencias

Sin preferencia guardada se aplica «Sistema». Se respetan las elecciones previas
`light` y `dark`. «Sistema» se guarda explícitamente como `system`; el script
del encabezado resuelve la paleta antes del primer pintado. El selector escucha
cambios de sistema y sincroniza pestañas mediante el evento `storage`.
Sin acceso a almacenamiento el arranque también sigue al sistema. Si el navegador
no ofrece `matchMedia`, se usa claro como fallback.

La alternativa clara usa la misma estructura y familia de colores. Su fondo
gris neutro (`--plane`) contrasta con tarjetas blancas (`--surface`); los
bordes y las sombras delimitan las superficies anidadas. La tinta principal,
secundaria y auxiliar es más intensa, y las métricas mantienen colores
saturados sin perder contraste de lectura.

La impresión mantiene papel blanco y texto oscuro; no imprime botones de control.

## Alcance y verificación

El cambio es de presentación. No modifica datos, permisos, APIs, horarios,
consultas, automatizaciones ni criterios operativos. Las tablas conservan su
orden, filtros, columnas y expansión de filas. Colectas y chat mantienen sus
accesos en ventana independiente.

Pruebas: `npm run test:tema`, `npm run test:responsables`, `npm run typecheck`,
`npm run lint`, suites operativas de `AGENTS.md` y `npm run build`.
La prueba de tema comprueba primer pintado, almacenamiento inaccesible y
contraste de texto de al menos 4,5:1 en los pares principales de ambas paletas.

La revisión visual local usa datos ficticios: escritorio y móvil, formulario de
acceso, tabla expandida, selección de tema, Tracker, Asistencia, Evidencias,
conversaciones, perfiles, contactos, mensajes rápidos y reportes. Las rutas
dependientes de Supabase requieren esa conexión para una comprobación integral
con datos reales; las vistas de prueba no se incluyen en producción.
