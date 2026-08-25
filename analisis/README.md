# Análisis del libro de entregas fallidas (operación México)

## Estructura del libro

El archivo `ENTREGAS_FALLIDAS__MENSUALES.xlsx` tiene 28 hojas agrupadas en cinco funciones:

| Grupo | Hojas | Para qué sirven |
|---|---|---|
| Planillas de mes | `Enero`…`dic`, `Mayo2026`, `Julio2026`, `Mensual` | La cola de trabajo de soporte. Columnas `A–I` pegadas del sistema; `J–R` son el trabajo encima del pedido (reclamo, ubicación, teléfono, avisos y el mensaje de WhatsApp que arma la columna `COPIAR`). `Mensual` es la hoja viva. |
| Vistas del día | `Ayer`, `Demorados`, `DemoradoNoEntregado` | Recortes del estado actual que se vuelven a pegar cada mañana. No son histórico. |
| Cancelaciones MELI | `Cancelados`, `Cancelados Abril/Julio/Agosto/Sep/Oct` | Miden cuánto tiempo estuvo el paquete en ruta antes de que Mercado Libre cancelara el envío. |
| Apoyo | `UPDATE`, `Enero planilla facu` | Mesa de trabajo para refrescar estados en lote, y la planilla vieja (hoy sin datos: sus `VLOOKUP` apuntan a una hoja `SQL` que ya no existe). |
| Vacías | `GRAFICOS 2025`, `GRAFICOS 2026` | Sin datos ni gráficos en el `.xlsx` exportado. |

Detalles a tener en cuenta al leer el libro:

- El nombre de la hoja no es confiable como fecha: `Enero` contiene febrero 2025 y `Febrero` mezcla febrero con marzo.
- De 2026 solo están mayo, julio y agosto (`Mensual`).
- 433 pedidos aparecen en más de una hoja (reprogramados a fin de mes) y hay que deduplicar por ID.
- Los nombres de polígono tienen variantes con acento, guion o sufijo `V`: 227 valores crudos para unos 130 polígonos reales.

## Script

`entregas_fallidas.py` normaliza las 15 hojas con detalle de pedidos a un único dataset
y calcula las métricas de operación (volumen mensual, tasa de devolución, efecto de las
visitas y del lead time, rankings por repartidor, polígono y tienda).

```bash
pip install pandas openpyxl
python3 analisis/entregas_fallidas.py ENTREGAS_FALLIDAS__MENSUALES.xlsx
```

Escribe `analisis/metricas.json` (ignorado por git) e imprime un resumen por consola.
