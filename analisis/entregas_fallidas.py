#!/usr/bin/env python3
"""Consolida y analiza el libro ENTREGAS FALLIDAS MENSUALES (operación México).

El libro tiene una hoja por mes con esquemas que fueron cambiando (nombres de
columna distintos, encabezados perdidos, filas de fórmula vacías). Este script
las normaliza a un único dataset y calcula las métricas de operación.

Uso:
    python3 analisis/entregas_fallidas.py ENTREGAS_FALLIDAS__MENSUALES.xlsx [-o salida.json]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# Hojas con detalle de pedidos, en orden cronológico de carga.
HOJAS_MENSUALES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
    "Sep", "Oct", "nov", "dic", "Mensual", "Julio2026", "Mayo2026",
]

COLUMNAS = [
    "ID", "FechaCreacion", "FechaProgramado", "Estado", "Repartidor",
    "Tienda", "Destino", "Poligono", "Visitas",
]

# Estados que cuentan como devolución al vendedor.
ESTADOS_DEVOLUCION = ["Devuelto", "Devolucion", "Devolución en centro de DropOff"]

# Meses con menos de 300 casos: son coletazos de otras hojas, no meses cargados.
MESES_RESIDUALES = {"2026-01", "2026-06"}


def parsear_fecha(valor) -> pd.Timestamp:
    """Las fechas vienen como datetime, como 'YYYY-MM-DD\\n' o como dd/mm/yyyy."""
    if isinstance(valor, (dt.datetime, dt.date)) and not isinstance(valor, bool):
        return pd.Timestamp(valor)
    if valor is None or (isinstance(valor, float) and np.isnan(valor)):
        return pd.NaT
    texto = str(valor).strip()
    if not texto or texto.lower() == "nan":
        return pd.NaT
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", texto)
    if m:
        return pd.Timestamp(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", texto)
    if m:
        return pd.Timestamp(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    return pd.NaT


def cargar(ruta: str) -> pd.DataFrame:
    """Une las hojas mensuales en un dataset con un caso por fila."""
    libro = pd.ExcelFile(ruta, engine="openpyxl")
    partes = []
    for hoja in HOJAS_MENSUALES:
        if hoja not in libro.sheet_names:
            continue
        cruda = libro.parse(hoja, header=None).dropna(how="all").dropna(axis=1, how="all")
        primera = [str(x) for x in cruda.iloc[0].tolist()]
        # La hoja Junio perdió su encabezado: la primera fila ya es un pedido.
        if any("Fecha" in x or "Estado" in x for x in primera):
            cruda = cruda.iloc[1:]
        parte = cruda.iloc[:, : len(COLUMNAS)].copy()
        parte.columns = COLUMNAS
        parte["ID"] = pd.to_numeric(parte["ID"], errors="coerce")
        parte = parte[parte["ID"].notna()]
        parte["ID"] = parte["ID"].astype("int64")
        for col in ("FechaCreacion", "FechaProgramado"):
            parte[col] = parte[col].map(parsear_fecha)
        for col in ("Estado", "Repartidor", "Tienda", "Poligono", "Destino"):
            parte[col] = parte[col].astype(str).str.strip().replace({"nan": np.nan, "None": np.nan})
        parte["Visitas"] = pd.to_numeric(parte["Visitas"], errors="coerce")
        parte["hoja"] = hoja
        partes.append(parte)

    datos = pd.concat(partes, ignore_index=True)
    datos = datos[datos["FechaProgramado"].notna()]
    # Un pedido reprogramado aparece en dos hojas: nos quedamos con la primera vez.
    datos = datos.sort_values(["ID", "FechaProgramado"]).drop_duplicates("ID", keep="first")
    datos["mes"] = datos["FechaProgramado"].dt.to_period("M")
    datos = datos[~datos["mes"].astype(str).isin(MESES_RESIDUALES)]
    datos["devuelto"] = datos["Estado"].isin(ESTADOS_DEVOLUCION)
    datos["entregado"] = datos["Estado"].eq("Entregado")
    datos["lead_time"] = (datos["FechaProgramado"] - datos["FechaCreacion"]).dt.days
    return datos.reset_index(drop=True)


def ranking(datos: pd.DataFrame, columna: str, minimo: int, top: int, peores: bool = True):
    tabla = datos.groupby(columna).agg(casos=("ID", "size"), dev=("devuelto", "sum"), visitas=("Visitas", "mean"))
    tabla = tabla[tabla["casos"] >= minimo]
    tabla["pct_dev"] = (tabla["dev"] / tabla["casos"] * 100).round(1)
    tabla["visitas"] = tabla["visitas"].round(2)
    tabla = tabla.sort_values("pct_dev", ascending=not peores).head(top)
    return [
        {"nombre": str(i), "casos": int(r.casos), "pct_dev": float(r.pct_dev), "visitas": float(r.visitas)}
        for i, r in tabla.iterrows()
    ]


def metricas(datos: pd.DataFrame) -> dict:
    resultado: dict = {}
    resultado["total"] = {
        "casos": int(len(datos)),
        "devoluciones": int(datos["devuelto"].sum()),
        "entregados": int(datos["entregado"].sum()),
        "siniestrados": int(datos["Estado"].eq("Siniestrado").sum()),
        "pct_devolucion": round(datos["devuelto"].mean() * 100, 1),
        "poligonos": int(datos["Poligono"].nunique()),
        "tiendas": int(datos["Tienda"].nunique()),
        "repartidores": int(datos["Repartidor"].nunique()),
        "desde": str(datos["mes"].min()),
        "hasta": str(datos["mes"].max()),
    }

    mensual = datos.groupby("mes").agg(casos=("ID", "size"), dev=("devuelto", "sum"), visitas=("Visitas", "mean"))
    mensual["pct_dev"] = (mensual["dev"] / mensual["casos"] * 100).round(1)
    resultado["mensual"] = [
        {"mes": str(i), "casos": int(r.casos), "devoluciones": int(r.dev),
         "pct_dev": float(r.pct_dev), "visitas": round(float(r.visitas), 2)}
        for i, r in mensual.iterrows()
    ]

    con_visitas = datos[datos["Visitas"].notna()].copy()
    con_visitas["tramo"] = con_visitas["Visitas"].clip(upper=5).astype(int)
    por_visita = con_visitas.groupby("tramo").agg(casos=("ID", "size"), dev=("devuelto", "sum"))
    por_visita["pct_dev"] = (por_visita["dev"] / por_visita["casos"] * 100).round(1)
    resultado["por_visitas"] = [
        {"visitas": int(i), "casos": int(r.casos), "pct_dev": float(r.pct_dev)} for i, r in por_visita.iterrows()
    ]

    ventana = datos[(datos["lead_time"] >= 0) & (datos["lead_time"] < 30)].copy()
    ventana["tramo"] = pd.cut(ventana["lead_time"], [-1, 1, 3, 7, 14, 30],
                              labels=["0-1 d", "2-3 d", "4-7 d", "8-14 d", "15-30 d"])
    por_lead = ventana.groupby("tramo").agg(casos=("ID", "size"), dev=("devuelto", "sum"))
    por_lead["pct_dev"] = (por_lead["dev"] / por_lead["casos"] * 100).round(1)
    resultado["por_lead_time"] = [
        {"tramo": str(i), "casos": int(r.casos), "pct_dev": float(r.pct_dev)} for i, r in por_lead.iterrows()
    ]

    dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    por_dia = datos.groupby(datos["FechaProgramado"].dt.dayofweek).agg(casos=("ID", "size"), dev=("devuelto", "sum"))
    por_dia["pct_dev"] = (por_dia["dev"] / por_dia["casos"] * 100).round(1)
    resultado["por_dia_semana"] = [
        {"dia": dias[i], "casos": int(r.casos), "pct_dev": float(r.pct_dev)} for i, r in por_dia.iterrows()
    ]

    resultado["repartidores_peores"] = ranking(datos, "Repartidor", 200, 12)
    resultado["repartidores_mejores"] = ranking(datos, "Repartidor", 200, 6, peores=False)
    resultado["poligonos_peores"] = ranking(datos, "Poligono", 200, 10)
    resultado["tiendas_peores"] = ranking(datos, "Tienda", 200, 10)

    por_rep = datos.groupby("Repartidor").agg(casos=("ID", "size"), dev=("devuelto", "sum"), visitas=("Visitas", "mean"))
    por_rep = por_rep[por_rep["casos"] >= 200]
    por_rep["pct_dev"] = por_rep["dev"] / por_rep["casos"] * 100
    mediana = por_rep["pct_dev"].median()
    criticos = por_rep[por_rep["pct_dev"] > 25]
    resultado["dispersion_repartidores"] = {
        "n": int(len(por_rep)),
        "mediana": round(mediana, 1),
        "p10": round(por_rep["pct_dev"].quantile(0.10), 1),
        "p90": round(por_rep["pct_dev"].quantile(0.90), 1),
        "correlacion_visitas": round(por_rep["pct_dev"].corr(por_rep["visitas"]), 2),
        "criticos": int(len(criticos)),
        "casos_criticos": int(criticos["casos"].sum()),
        "devoluciones_evitables": int(round((criticos["dev"] - criticos["casos"] * mediana / 100).sum())),
    }
    return resultado


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("xlsx", help="ruta al libro ENTREGAS FALLIDAS MENSUALES")
    ap.add_argument("-o", "--salida", default="analisis/metricas.json")
    args = ap.parse_args()

    datos = cargar(args.xlsx)
    resultado = metricas(datos)
    with open(args.salida, "w", encoding="utf-8") as fh:
        json.dump(resultado, fh, ensure_ascii=False, indent=2)

    t = resultado["total"]
    print(f"{t['casos']:,} casos entre {t['desde']} y {t['hasta']}")
    print(f"devoluciones: {t['devoluciones']:,} ({t['pct_devolucion']}%)")
    print(f"métricas escritas en {args.salida}")


if __name__ == "__main__":
    main()
