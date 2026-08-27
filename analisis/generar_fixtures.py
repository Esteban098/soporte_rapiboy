#!/usr/bin/env python3
"""Genera fixtures CSV a partir del libro real, sin datos personales.

La app los usa cuando SHEET_MODE=fixture, para poder desarrollar y correr los
tests sin acceso al Google Sheet. Se quitan teléfono, domicilio y link de Maps,
y se anonimiza el nombre del repartidor; el resto conserva la forma real de los
datos (volúmenes, fechas, estados, polígonos) para que los tableros se vean
como en producción.

Uso:
    python3 analisis/generar_fixtures.py ENTREGAS_FALLIDAS__MENSUALES.xlsx -o web/fixtures
"""
from __future__ import annotations

import argparse
import hashlib
import os
import warnings

import pandas as pd

warnings.filterwarnings("ignore")

# Pestañas que consume la web. Las de meses anteriores quedaron como archivo en
# el libro y no se leen, así que tampoco se exportan.
TABS = {
    "Mensual": "Mensual",
    "Ayer": "Ayer",
    "Cancelados": "Cancelados",
}

# La app lee las nueve primeras columnas por posición, así que el fixture
# conserva ese orden. Los encabezados van solo como referencia para quien lo
# abra: la app descarta la fila de encabezado por sí sola.
COLUMNAS_PEDIDO = [
    "Id", "FechaCreacion", "FechaProgramado", "Estado",
    "Repartidor", "Tienda", "Destino", "Poligono", "Visitas",
]
# La hoja Cancelados se lee por nombre de encabezado, no por posición: entre
# medio hay columnas auxiliares (=CONCAT) que no son datos. Los minutos en ruta
# los calcula la app a partir de las dos fechas, porque la columna
# Minutos_Diferencia está vacía en la hoja de 2026.
COLUMNAS_CANCELADO = {
    "Id": "Id",
    "Id_MELI": "IdMeli",
    "Tienda": "Tienda",
    "Estado_RBP": "EstadoRpb",
    "Estado_MELI": "EstadoMeli",
    "Fecha_ColectadoMEX": "FechaColectado",
    "Fecha_CanceladoMEX": "FechaCancelado",
}

# Columnas con datos personales: nunca salen del libro.
PII = {"Destino", "Telefono", "Ubicacion", "TELEFONO", "UBICACION"}


def seudonimo(nombre: object) -> str:
    """Nombre estable pero anónimo, para que los rankings sigan teniendo sentido."""
    texto = str(nombre).strip()
    if not texto or texto.lower() == "nan":
        return ""
    digest = hashlib.sha256(texto.encode("utf-8")).hexdigest()
    return f"Repartidor {int(digest[:6], 16) % 200 + 1:03d}"


def encabezado(fila) -> bool:
    valores = [str(v) for v in fila.tolist()]
    return any("Fecha" in v or "Estado" in v for v in valores)


def exportar_pedidos(cruda: pd.DataFrame) -> pd.DataFrame:
    if encabezado(cruda.iloc[0]):
        cruda = cruda.iloc[1:]
    datos = cruda.iloc[:, : len(COLUMNAS_PEDIDO)].copy()
    datos.columns = COLUMNAS_PEDIDO
    datos = datos[pd.to_numeric(datos["Id"], errors="coerce").notna()]
    datos["Repartidor"] = datos["Repartidor"].map(seudonimo)
    datos["Destino"] = ""  # domicilio del cliente: fuera
    return datos


def exportar_cancelados(cruda: pd.DataFrame) -> pd.DataFrame:
    cruda.columns = [str(c).strip() for c in cruda.iloc[0]]
    cruda = cruda.iloc[1:]
    cruda = cruda.loc[:, ~cruda.columns.duplicated()]
    faltantes = [c for c in COLUMNAS_CANCELADO if c not in cruda.columns]
    if faltantes:
        raise SystemExit(f"la hoja Cancelados no tiene las columnas {faltantes}")
    datos = cruda[list(COLUMNAS_CANCELADO)].copy()
    datos.columns = list(COLUMNAS_CANCELADO.values())
    return datos[pd.to_numeric(datos["Id"], errors="coerce").notna()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("xlsx")
    ap.add_argument("-o", "--salida", default="web/fixtures")
    args = ap.parse_args()

    os.makedirs(args.salida, exist_ok=True)
    libro = pd.ExcelFile(args.xlsx, engine="openpyxl")

    for hoja, nombre in TABS.items():
        if hoja not in libro.sheet_names:
            print(f"  falta la hoja {hoja}, se omite")
            continue
        cruda = libro.parse(hoja, header=None).dropna(how="all").dropna(axis=1, how="all")
        datos = exportar_cancelados(cruda) if hoja == "Cancelados" else exportar_pedidos(cruda)
        destino = os.path.join(args.salida, f"{nombre}.csv")
        datos.to_csv(destino, index=False)
        print(f"  {nombre}.csv · {len(datos)} filas")

    print(f"fixtures escritos en {args.salida}/ (sin teléfonos, domicilios ni nombres reales)")


if __name__ == "__main__":
    main()
