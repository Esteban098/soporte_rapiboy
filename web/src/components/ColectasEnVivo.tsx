"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualizarColectasEnVivo } from "@/app/colectas-vivo";
import {
  COLOR_FASE,
  ETIQUETA_ESTADO,
  ETIQUETA_FASE,
  FASES,
  alertasDelDia,
  antiguedadPosicion,
  estaActiva,
  hace,
  hitosDe,
  horaArgentina,
  momentoEnTienda,
  recorridoHecho,
  tiendasVisitadas,
  paquetesDe,
  paquetesEstimados,
  resumirPorDriver,
  textoMinutos,
  totalesDelDia,
  type ColectaVivo,
  type ColectasDelDia,
  type Fase,
  type PosicionRecorrido,
  type Punto,
  type ResumenDriver,
} from "@/lib/colectas-vivo";
import { responsableDe } from "@/lib/responsables";
import { enlaceAGoogleMaps } from "@/lib/tiendas";
import { distanciaKm } from "@/lib/tracker";
import { diaLargo, numero, porcentaje } from "@/lib/formato";
import { Kpi } from "./Card";
import { NombreTienda } from "./ColorTiendas";
import lt from "./live-tracker.module.css";
import ui from "./ui.module.css";
import estilos from "./colectas-vivo.module.css";
import { TablaOrdenable } from "./TablaOrdenable";

/**
 * Las colectas de hoy sobre el mapa de Tiendas: el panel con los repartidores
 * y sus paradas, la capa del mapa y el resumen de abajo.
 *
 * Todo lo que se calcula —estado, ruta, alertas— sale de `lib/colectas-vivo`,
 * que es puro y tiene pruebas. Acá solo se dibuja.
 */

/** Cada cuánto se vuelve a leer la foto con «En vivo» prendido. */
export const REFRESCO_VIVO_MS = 60_000;

function horaSegura(marca: string | null | undefined): string {
  return marca ? horaArgentina(marca) : "—";
}

function tiempoSeguro(marca: string | null | undefined): number | null {
  return marca ? Date.parse(marca) : null;
}

/**
 * El reloj del navegador, o `null` durante el render del servidor.
 *
 * Las antigüedades —«hace 12 min»— se calculan recién en el navegador:
 * calcularlas también en el servidor haría que los textos no coincidan al
 * hidratar.
 */
export function useReloj(cada = 30_000): number | null {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const primero = setTimeout(() => setAhora(Date.now()), 0);
    const intervalo = setInterval(() => setAhora(Date.now()), cada);
    return () => {
      clearTimeout(primero);
      clearInterval(intervalo);
    };
  }, [cada]);
  return ahora;
}

/** La clave con la que se elige un repartidor: su id, o «sin» para las colectas sin repartidor. */
export function claveDriver(id: number | null): string {
  return id == null ? "sin" : String(id);
}

/**
 * Los puntos que tiene que abarcar el encuadre según lo elegido. Sin nadie
 * elegido no hay nada que encuadrar: el mapa queda con la vista de siempre.
 */
export function puntosAEncuadrar(
  resumenes: ResumenDriver[],
  seleccion: string[],
  colecta: number | null,
): Punto[] {
  if (colecta != null) {
    for (const r of resumenes) {
      const c = r.colectas.find((x) => x.id_colecta === colecta);
      if (c) return [c.tienda, r.posicion].filter((p): p is Punto => p != null);
    }
  }
  return resumenes
    .filter((r) => seleccion.includes(claveDriver(r.id)))
    .flatMap((r) => [...r.colectas.map((c) => c.tienda), r.posicion, ...r.trazo])
    .filter((p): p is Punto => p != null);
}

/* ---------------------------------------------------------------------------
 * Panel
 * ------------------------------------------------------------------------- */

export function PanelColectas({
  dia,
  resumenes,
  ahora,
  hayFlujo,
  seleccion,
  onAlternar,
  onLimpiar,
  colecta,
  onColecta,
}: {
  dia: ColectasDelDia;
  resumenes: ResumenDriver[];
  ahora: number | null;
  hayFlujo: boolean;
  /** Los repartidores que se ven en el mapa. Vacía, el mapa no muestra ninguno. */
  seleccion: string[];
  onAlternar: (clave: string) => void;
  onLimpiar: () => void;
  colecta: number | null;
  onColecta: (id: number | null) => void;
}) {
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const texto = normalizar(busqueda);
    if (!texto) return resumenes;
    return resumenes.filter(
      (r) =>
        normalizar(r.nombre).includes(texto) ||
        String(r.id ?? "").includes(texto) ||
        r.colectas.some(
          (c) => normalizar(c.seller ?? "").includes(texto) || String(c.id_colecta).includes(texto),
        ),
    );
  }, [resumenes, busqueda]);

  const elegida = colecta != null ? buscarColecta(resumenes, colecta) : null;

  return (
    <>
      <BarraFoto dia={dia} ahora={ahora} hayFlujo={hayFlujo} />

      {elegida ? (
        <FichaColecta
          c={elegida.colecta}
          resumen={elegida.resumen}
          ahora={ahora}
          sinPosiciones={dia.sinPosiciones}
          onVolver={() => onColecta(null)}
        />
      ) : (
        <>
          <div className={lt.panelBarra}>
            <input
              className={lt.buscador}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar repartidor, tienda o colecta"
              aria-label="Buscar repartidor, tienda o número de colecta"
              type="search"
            />
          </div>

          <Leyenda />

          <p className={estilos.seleccion} role="status">
            {seleccion.length === 0 ? (
              "Elegí uno o más repartidores para verlos en el mapa con su recorrido."
            ) : (
              <>
                {seleccion.length === 1 ? "1 repartidor en el mapa" : `${seleccion.length} repartidores en el mapa`}
                <button type="button" className={estilos.limpiar} onClick={onLimpiar}>
                  Quitar todos
                </button>
              </>
            )}
          </p>

          <ul className={lt.lista}>
            {dia.colectas.length === 0 ? (
              <li className={lt.vacio}>
                Todavía no hay colectas cargadas para hoy. Si ya deberían estar, apretá Actualizar.
              </li>
            ) : visibles.length === 0 ? (
              <li className={lt.vacio}>Ningún repartidor ni tienda coincide con la búsqueda.</li>
            ) : (
              visibles.map((r) => (
                <FilaDriver
                  key={claveDriver(r.id)}
                  r={r}
                  ahora={ahora}
                  sinPosiciones={dia.sinPosiciones}
                  elegido={seleccion.includes(claveDriver(r.id))}
                  onElegir={() => onAlternar(claveDriver(r.id))}
                  onColecta={onColecta}
                />
              ))
            )}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * De cuándo es la foto, el botón para rehacerla y el refresco automático.
 *
 * «Actualizar» corre el flujo 12 —vuelve a preguntarle al sistema dónde está
 * cada repartidor y en qué quedó cada colecta— y después relee. «En vivo»
 * solo relee lo guardado cada minuto: la foto la rehace n8n solo cada cinco,
 * en horario de colectas.
 */
function BarraFoto({ dia, ahora, hayFlujo }: { dia: ColectasDelDia; ahora: number | null; hayFlujo: boolean }) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [vivo, setVivo] = useState(true);

  useEffect(() => {
    if (!vivo) return;
    const reloj = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESCO_VIVO_MS);
    return () => clearInterval(reloj);
  }, [vivo, router]);

  const totales = useMemo(() => totalesDelDia(dia), [dia]);
  const antiguedad = hace(totales.sincronizadoEn, ahora);
  const vieja =
    ahora != null && totales.sincronizadoEn != null && ahora - Date.parse(totales.sincronizadoEn) > 15 * 60_000;

  return (
    <div className={estilos.foto}>
      <div className={estilos.fotoFila}>
        <span className={vieja ? lt.marcaFalla : lt.marca}>
          {totales.sincronizadoEn ? (
            <>
              Foto de las <b>{horaArgentina(totales.sincronizadoEn)}</b>
              {antiguedad ? ` · ${antiguedad}` : ""}
            </>
          ) : (
            "Sin datos de hoy"
          )}
        </span>
        <label className={lt.filtro} title="Vuelve a leer la foto guardada cada minuto mientras la pestaña está a la vista.">
          <input type="checkbox" checked={vivo} onChange={(e) => setVivo(e.target.checked)} />
          En vivo
        </label>
      </div>

      <div className={lt.acciones}>
        <button
          type="button"
          className={lt.sync}
          disabled={cargando}
          title={
            hayFlujo
              ? "Le pregunta al sistema dónde está cada repartidor y en qué estado quedó cada colecta. Tarda unos segundos."
              : "No hay flujo configurado: solo vuelve a leer lo guardado."
          }
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              if (hayFlujo) {
                const resultado = await actualizarColectasEnVivo();
                if (!resultado.ok) setAviso(resultado.mensaje);
              }
              router.refresh();
            })
          }
        >
          {cargando ? "Actualizando…" : "Actualizar posiciones y estados"}
        </button>
      </div>

      {aviso ? (
        <p className={`${lt.aviso} ${lt.avisoError}`} role="status">
          {aviso}
        </p>
      ) : null}

      {dia.sinPosiciones ? (
        <p className={estilos.detalleDatos}>
          Tu perfil ve el estado de las colectas, no la posición de los repartidores.
        </p>
      ) : null}
    </div>
  );
}

function Leyenda() {
  const fases: Fase[] = ["PENDIENTE", "EN_CURSO", "RETIRADA", "CERRADA", "CANCELADA"];
  return (
    <ul className={estilos.leyenda} aria-label="Colores de las colectas">
      {fases.map((f) => (
        <li key={f}>
          <span className={estilos.punto} style={{ background: COLOR_FASE[f] }} aria-hidden="true" />
          {ETIQUETA_FASE[f]}
        </li>
      ))}
    </ul>
  );
}

function FilaDriver({
  r,
  ahora,
  sinPosiciones,
  elegido,
  onElegir,
  onColecta,
}: {
  r: ResumenDriver;
  ahora: number | null;
  sinPosiciones: boolean;
  elegido: boolean;
  onElegir: () => void;
  onColecta: (id: number) => void;
}) {
  const abiertas = r.porFase.PENDIENTE + r.porFase.EN_CURSO + r.porFase.RETIRADA;
  const posicion = r.id != null && !sinPosiciones && ahora != null ? antiguedadPosicion(r.posicion, r.posicionEn, ahora) : null;

  const partes = [
    r.porFase.PENDIENTE ? `${r.porFase.PENDIENTE} por colectar` : null,
    r.porFase.EN_CURSO ? `${r.porFase.EN_CURSO} en curso` : null,
    r.porFase.RETIRADA ? `${r.porFase.RETIRADA} a bodega` : null,
    r.porFase.CERRADA ? `${r.porFase.CERRADA} en bodega` : null,
    r.porFase.CANCELADA ? `${r.porFase.CANCELADA} cancelada${r.porFase.CANCELADA === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        className={`${lt.fila} ${estilos.botonFila}`}
        aria-pressed={elegido}
        onClick={onElegir}
      >
        <span className={lt.chip} style={{ background: r.color }} aria-hidden="true" />
        <span className={lt.filaTexto}>
          <span className={lt.filaNombre}>{r.nombre}</span>
          <span className={lt.filaDato}>
            {partes.join(" · ") || "sin colectas"}
            {abiertas === 0 && r.id != null ? " · terminó" : ""}
          </span>
        </span>
        {posicion ? (
          <span className={`${lt.pastilla} ${lt[`pos${posicion.estado}`] ?? ""}`} title="Última posición conocida">
            {posicion.texto}
          </span>
        ) : null}
      </button>

      {elegido ? <DetalleDriver r={r} ahora={ahora} onColecta={onColecta} /> : null}
    </li>
  );
}

/**
 * Lo que le queda a un repartidor, en el orden calculado, y lo que ya hizo.
 */
function DetalleDriver({
  r,
  ahora,
  onColecta,
}: {
  r: ResumenDriver;
  ahora: number | null;
  onColecta: (id: number) => void;
}) {
  // Lo que ya hizo, en el orden en que pasó por cada tienda. Una colecta
  // cerrada sin hora de paso en el historial va al final, sin inventarle una.
  const visitadas = tiendasVisitadas(r.colectas);
  const sinHora = r.colectas.filter(
    (c) => (c.fase === "RETIRADA" || c.fase === "CERRADA") && !visitadas.includes(c),
  );
  const otras = r.colectas.filter((c) => c.fase === "CANCELADA" || c.fase === "SIN_CLASIFICAR");

  const datos = [
    `${r.tiendas} tienda${r.tiendas === 1 ? "" : "s"}`,
    `${numero(r.paquetes)} paquetes`,
    r.kmRestantes != null ? `${r.kmRestantes.toFixed(1)} km en línea recta hasta bodega` : null,
    r.ultimoMovimiento ? `último cambio ${horaArgentina(r.ultimoMovimiento)}` : null,
  ].filter(Boolean);

  return (
    <div className={estilos.detalle} style={{ "--color-driver": r.color } as React.CSSProperties}>
      <p className={estilos.detalleDatos}>{datos.join(" · ")}</p>

      {r.id == null ? (
        <Grupo titulo="Sin repartidor asignado" colectas={r.colectas} ahora={ahora} onColecta={onColecta} />
      ) : (
        <>
          {r.ruta.length > 0 ? (
            <>
              <p className={estilos.grupo}>
                Próximas paradas <span title="El sistema no guarda un orden de paradas para las colectas.">(orden calculado)</span>
              </p>
              {r.ruta.map((c, i) => (
                <FilaParada
                  key={c.id_colecta}
                  c={c}
                  numero={i + 1}
                  distancia={i === 0 && r.posicion && c.tienda ? distanciaKm(r.posicion, c.tienda) : null}
                  ahora={ahora}
                  onElegir={() => onColecta(c.id_colecta)}
                />
              ))}
            </>
          ) : null}
          {visitadas.length > 0 ? (
            <>
              <p className={estilos.grupo}>Ya pasó por (en orden)</p>
              {visitadas.map((c, i) => (
                <FilaParada
                  key={c.id_colecta}
                  c={c}
                  numero={i + 1}
                  hecha
                  distancia={null}
                  ahora={ahora}
                  onElegir={() => onColecta(c.id_colecta)}
                />
              ))}
            </>
          ) : null}
          {sinHora.length > 0 ? (
            <Grupo titulo="Retiradas sin hora de paso" colectas={sinHora} ahora={ahora} onColecta={onColecta} />
          ) : null}
          {otras.length > 0 ? (
            <Grupo titulo="Canceladas o sin clasificar" colectas={otras} ahora={ahora} onColecta={onColecta} />
          ) : null}
        </>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  colectas,
  ahora,
  onColecta,
}: {
  titulo: string;
  colectas: ColectaVivo[];
  ahora: number | null;
  onColecta: (id: number) => void;
}) {
  return (
    <>
      <p className={estilos.grupo}>{titulo}</p>
      {colectas.map((c) => (
        <FilaParada key={c.id_colecta} c={c} numero={null} distancia={null} ahora={ahora} onElegir={() => onColecta(c.id_colecta)} />
      ))}
    </>
  );
}

function FilaParada({
  c,
  numero: orden,
  hecha = false,
  distancia,
  ahora,
  onElegir,
}: {
  c: ColectaVivo;
  numero: number | null;
  /** Una parada por la que ya pasó: el número es el orden en que pasó. */
  hecha?: boolean;
  distancia: number | null;
  ahora: number | null;
  onElegir: () => void;
}) {
  const desde = hace(c.estado_desde, ahora);
  const paquetes = paquetesEstimados(c);
  const paso = hecha ? momentoEnTienda(c) : null;
  const dato = [
    paso ? `pasó ${horaArgentina(paso)}` : null,
    ETIQUETA_ESTADO[c.estado] + (desde ? ` ${desde}` : c.estado_desde ? ` desde ${horaArgentina(c.estado_desde)}` : ""),
    paquetes > 0 ? `${paquetes} paq.` : null,
    distancia != null ? `a ${distancia.toFixed(1)} km` : null,
    c.lugar ? c.lugar : null,
  ].filter(Boolean);

  return (
    <button type="button" className={estilos.parada} onClick={onElegir}>
      <span
        className={`${estilos.numero} ${c.fase === "EN_CURSO" ? estilos.numeroOscuro : ""}`}
        style={{ background: COLOR_FASE[c.fase] }}
        aria-hidden="true"
      >
        {orden != null ? (hecha ? `✓${orden}` : orden) : ""}
      </span>
      <span className={estilos.paradaTexto}>
        <span>
          <NombreTienda nombre={c.seller ?? `Tienda ${c.id_seller ?? ""}`} />
        </span>
        <span className={estilos.paradaDato}>{dato.join(" · ")}</span>
      </span>
    </button>
  );
}

/**
 * La ficha de una colecta: todo lo que el sistema sabe de ella, con la hora
 * de cada paso en hora argentina.
 */
function FichaColecta({
  c,
  resumen,
  ahora,
  sinPosiciones,
  onVolver,
}: {
  c: ColectaVivo;
  resumen: ResumenDriver;
  ahora: number | null;
  sinPosiciones: boolean;
  onVolver: () => void;
}) {
  const p = paquetesDe(c);
  const desde = hace(c.estado_desde, ahora);
  const orden = resumen.ruta.findIndex((x) => x.id_colecta === c.id_colecta);
  const distancia = resumen.posicion && c.tienda ? distanciaKm(resumen.posicion, c.tienda) : null;
  const hitos = hitosDe(c);

  return (
    <div className={estilos.ficha}>
      <button type="button" className={estilos.volver} onClick={onVolver}>
        ← Volver a la lista
      </button>

      <h3 className={estilos.fichaTitulo}>
        <NombreTienda nombre={c.seller ?? `Tienda ${c.id_seller ?? ""}`} />
      </h3>

      <span className={estilos.estado}>
        <span className={estilos.punto} style={{ background: COLOR_FASE[c.fase] }} aria-hidden="true" />
        {ETIQUETA_ESTADO[c.estado]}
        {desde ? ` · ${desde}` : ""}
      </span>

      <dl className={estilos.datos}>
        <dt>Colecta</dt>
        <dd>#{c.id_colecta}</dd>
        <dt>Repartidor</dt>
        <dd>
          {resumen.nombre}
          {orden >= 0 ? ` · parada ${orden + 1} de ${resumen.ruta.length}` : ""}
        </dd>
        {!sinPosiciones && distancia != null && estaActiva(c.fase) ? (
          <>
            <dt>Distancia</dt>
            <dd>
              {distancia.toFixed(1)} km en línea recta desde su última posición
              {ahora != null && resumen.posicionEn ? ` (${antiguedadPosicion(resumen.posicion, resumen.posicionEn, ahora).texto})` : ""}
            </dd>
          </>
        ) : null}
        {c.lugar ? (
          <>
            <dt>Se colecta en</dt>
            <dd>{c.lugar}</dd>
          </>
        ) : null}
        <dt>Dirección</dt>
        <dd>
          {c.direccion_seller ?? "—"}
          {c.tienda ? (
            <>
              {" · "}
              <a href={enlaceAGoogleMaps(c.tienda)} target="_blank" rel="noopener noreferrer">
                Google Maps
              </a>
            </>
          ) : " · sin coordenadas"}
        </dd>
        <dt>Paquetes</dt>
        <dd>
          {p.esperados != null ? `${p.esperados} en el pedido · ` : ""}
          {p.retirados} retirados · {p.enBodega} en bodega
          {p.faltantes ? ` · faltan ${p.faltantes}` : ""}
          {p.porcentaje != null ? ` (${porcentaje(p.porcentaje)})` : ""}
        </dd>
        {c.cantidad_bultos ? (
          <>
            <dt>Bultos</dt>
            <dd>{c.cantidad_bultos}</dd>
          </>
        ) : null}
        {c.ventana ? (
          <>
            <dt>Ventana</dt>
            <dd>
              {c.hora_desde}–{c.hora_hasta} <span title="El sistema guarda la hora sin zona.">(hora del sistema)</span>
            </dd>
          </>
        ) : null}
        <dt>Reserva</dt>
        <dd>
          {c.id_reserva ?? "sin reserva"}
          {c.reserva_cancelada ? " · cancelada" : ""}
        </dd>
        {c.depositos_visitados ? (
          <>
            <dt>Depósito</dt>
            <dd>{c.depositos_visitados}</dd>
          </>
        ) : null}
        {c.comentario ? (
          <>
            <dt>Comentario</dt>
            <dd>{c.comentario}</dd>
          </>
        ) : null}
      </dl>

      {hitos.length > 0 ? (
        <>
          <p className={estilos.grupo}>Recorrido (hora argentina)</p>
          <ol className={estilos.hitos}>
            {hitos.map((h) => (
              <li key={`${h.etiqueta}-${h.fecha}`}>
                <span>{h.etiqueta}</span>
                <time dateTime={h.fecha}>{horaArgentina(h.fecha)}</time>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

function buscarColecta(resumenes: ResumenDriver[], id: number) {
  for (const resumen of resumenes) {
    const colecta = resumen.colectas.find((c) => c.id_colecta === id);
    if (colecta) return { colecta, resumen };
  }
  return null;
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/* ---------------------------------------------------------------------------
 * Capa del mapa
 * ------------------------------------------------------------------------- */

/**
 * Los repartidores elegidos sobre el mapa. Solo esos: sin nadie elegido, el
 * mapa no muestra ninguna colecta ni ninguna posición.
 *
 * Para cada uno se dibuja:
 *
 * - **el camino recorrido**, en línea continua: las tiendas por las que ya
 *   pasó y los reportes de su teléfono, en orden de hora, hasta su última
 *   posición (`recorridoHecho`);
 * - **lo que le falta**, en línea punteada: las tiendas pendientes en el
 *   orden calculado y la bodega;
 * - cada tienda, con el relleno de la fase de su colecta y el borde de su
 *   dueño —azul Esteban, rosa Candelaria—. El número es la próxima parada; el
 *   tilde con número, el orden en que ya pasó.
 */
export function CapaColectas({
  resumenes,
  seleccion,
  recorridos,
  colecta,
  proyectar,
  k,
  indice,
  ahora,
  onDriver,
  onColecta,
}: {
  resumenes: ResumenDriver[];
  seleccion: string[];
  /** Los reportes de posición guardados de cada repartidor elegido. */
  recorridos: Record<number, PosicionRecorrido[]>;
  colecta: number | null;
  proyectar: (lat: number, lon: number) => { x: number; y: number };
  k: number;
  indice: Record<string, string>;
  ahora: number | null;
  onDriver: (clave: string) => void;
  onColecta: (id: number) => void;
}) {
  const elegidos = resumenes.filter((r) => seleccion.includes(claveDriver(r.id)));
  const linea = (puntos: Punto[]) =>
    puntos.map((p) => { const q = proyectar(p.lat, p.lon); return `${q.x},${q.y}`; }).join(" ");

  return (
    <g>
      {elegidos.map((r) => {
        if (r.id == null) return null;
        const hecho = recorridoHecho(
          r.colectas,
          recorridos[r.id] ?? [],
          r.posicion ? { punto: r.posicion, en: r.posicionEn } : null,
        );
        return (
          <g key={`recorrido-${r.id}`} pointerEvents="none">
            {hecho.length >= 2 ? (
              <>
                {/* Un borde claro debajo, para que la línea se lea sobre
                    cualquier color de zona. */}
                <polyline points={linea(hecho)} fill="none" stroke="var(--surface, #fff)" strokeWidth={6 * k} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
                <polyline points={linea(hecho)} fill="none" stroke={r.color} strokeWidth={3.5 * k} strokeLinecap="round" strokeLinejoin="round" />
                {hecho
                  .filter((p) => p.tipo === "GPS")
                  .map((p) => {
                    const q = proyectar(p.lat, p.lon);
                    return <circle key={`gps-${r.id}-${p.en}`} cx={q.x} cy={q.y} r={2.6 * k} fill={r.color} stroke="var(--surface, #fff)" strokeWidth={1 * k} />;
                  })}
              </>
            ) : null}
            {r.trazo.length >= 2 ? (
              <polyline
                points={linea(r.trazo)}
                fill="none"
                stroke={r.color}
                strokeWidth={2.5 * k}
                strokeDasharray={`${6 * k} ${5 * k}`}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.75}
              />
            ) : null}
          </g>
        );
      })}

      {elegidos.flatMap((r) => {
        const visitadas = tiendasVisitadas(r.colectas);
        return r.colectas.map((c) => {
          if (!c.tienda) return null;
          const q = proyectar(c.tienda.lat, c.tienda.lon);
          const pendiente = r.ruta.findIndex((x) => x.id_colecta === c.id_colecta);
          const pasada = visitadas.findIndex((x) => x.id_colecta === c.id_colecta);
          const etiqueta = pendiente >= 0 ? String(pendiente + 1) : pasada >= 0 ? `✓${pasada + 1}` : "";
          const dueno = responsableDe(indice, c.seller ?? "");
          const radio = (etiqueta.length > 1 ? 11 : 9) * k;
          const paso = momentoEnTienda(c);
          return (
            <g
              key={`colecta-${c.id_colecta}`}
              transform={`translate(${q.x} ${q.y})`}
              className={lt.destino}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onColecta(c.id_colecta);
              }}
            >
              <title>
                {`${c.seller ?? "Tienda"} · colecta #${c.id_colecta}\n${ETIQUETA_ESTADO[c.estado]} · ${r.nombre}` +
                  (pendiente >= 0 ? ` · próxima parada ${pendiente + 1}` : "") +
                  (pasada >= 0 && paso ? ` · pasó a las ${horaArgentina(paso)}` : "") +
                  (dueno ? `\nGrupo ${dueno.grupo} (${dueno.nombre})` : "")}
              </title>
              {colecta === c.id_colecta ? <circle r={radio * 2.1} fill="none" stroke={r.color} strokeWidth={2.4 * k} /> : null}
              <circle r={radio} fill={COLOR_FASE[c.fase]} stroke={dueno?.color ?? "var(--surface, #fff)"} strokeWidth={2.4 * k} />
              {etiqueta ? (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={(etiqueta.length > 1 ? 8.5 : 10) * k}
                  fontWeight={700}
                  fill={c.fase === "EN_CURSO" ? "#111" : "#fff"}
                  pointerEvents="none"
                >
                  {etiqueta}
                </text>
              ) : null}
            </g>
          );
        });
      })}

      {elegidos.map((r) =>
        r.posicion && r.id != null ? (
          <PinDriver
            key={`driver-${r.id}`}
            r={r}
            punto={proyectar(r.posicion.lat, r.posicion.lon)}
            k={k}
            ahora={ahora}
            onElegir={() => onDriver(claveDriver(r.id))}
          />
        ) : null,
      )}
    </g>
  );
}

function PinDriver({
  r,
  punto,
  k,
  ahora,
  onElegir,
}: {
  r: ResumenDriver;
  punto: { x: number; y: number };
  k: number;
  ahora: number | null;
  onElegir: () => void;
}) {
  const radio = 12 * k;
  const posicion = ahora != null ? antiguedadPosicion(r.posicion, r.posicionEn, ahora) : null;
  const vieja = posicion?.estado === "VIEJA" || posicion?.estado === "SIN_FECHA";

  return (
    <g
      transform={`translate(${punto.x} ${punto.y})`}
      className={lt.destino}
      opacity={vieja ? 0.5 : 1}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onElegir();
      }}
    >
      <title>
        {`${r.nombre} · #${r.id}\nÚltima posición conocida${posicion ? ` ${posicion.texto}` : ""}` +
          `\n${r.ruta.length} parada${r.ruta.length === 1 ? "" : "s"} pendiente${r.ruta.length === 1 ? "" : "s"}`}
      </title>
      <circle r={radio + 2.5 * k} fill="var(--surface, #fff)" />
      <circle r={radio} fill={r.color} />
      <g
        transform={`scale(${k * 0.72}) translate(-12 -12)`}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6.5" cy="15.5" r="3.4" />
        <circle cx="17.5" cy="15.5" r="3.4" />
        <path d="M6.5 15.5h4l3-5h4" />
        <path d="M13 8.5h3l1.5 7" />
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------------------
 * Debajo del mapa
 * ------------------------------------------------------------------------- */

const FILAS_INICIALES = 12;
const DRIVERS_INICIALES = 8;

/**
 * El resumen de la jornada: cifras, lo que hay que revisar, cada repartidor y
 * cada colecta con su detalle.
 */
export function ResumenColectasVivo({ dia }: { dia: ColectasDelDia }) {
  const ahora = useReloj();
  const resumenes = useMemo(() => resumirPorDriver(dia), [dia]);
  const totales = useMemo(() => totalesDelDia(dia), [dia]);
  const alertas = useMemo(() => alertasDelDia(dia, ahora), [dia, ahora]);
  const [todas, setTodas] = useState(false);
  const [todosDrivers, setTodosDrivers] = useState(false);
  const [todasAlertas, setTodasAlertas] = useState(false);

  const colectas = useMemo(
    () =>
      resumenes
        .flatMap((r) => r.colectas.map((c) => ({ c, r })))
        .sort(
          (a, b) =>
            FASES.indexOf(a.c.fase) - FASES.indexOf(b.c.fase) ||
            (a.c.seller ?? "").localeCompare(b.c.seller ?? "", "es", { sensitivity: "base" }),
        ),
    [resumenes],
  );

  if (dia.colectas.length === 0) return null;

  const abiertas = totales.porFase.PENDIENTE + totales.porFase.EN_CURSO;
  const criticas = alertas.filter((a) => a.nivel === "critica").length;

  return (
    <section className={ui.stack} aria-label="Resumen de las colectas de hoy">
      <div className={ui.kpis}>
        <Kpi
          etiqueta="Colectas de hoy"
          valor={numero(totales.colectas)}
          nota={`${diaLargo(dia.dia)} · ${totales.tiendas} tiendas · ${totales.drivers} repartidores`}
        />
        <Kpi
          etiqueta="Por colectar"
          valor={numero(abiertas)}
          nota={`${totales.porFase.EN_CURSO} en camino o en el local`}
          tono={abiertas > 0 ? "warning" : "neutral"}
        />
        <Kpi
          etiqueta="Van a bodega"
          valor={numero(totales.porFase.RETIRADA)}
          nota={`${numero(totales.paquetes.retirados)} paquetes retirados en el día`}
        />
        <Kpi
          etiqueta="En bodega"
          valor={numero(totales.porFase.CERRADA)}
          nota={
            `${numero(totales.paquetes.enBodega)} paquetes` +
            (totales.minutosABodega != null ? ` · ${textoMinutos(totales.minutosABodega)} promedio de la tienda a la bodega` : "")
          }
          tono="good"
        />
        <Kpi
          etiqueta="Para revisar"
          valor={numero(alertas.length)}
          nota={criticas > 0 ? `${criticas} urgente${criticas === 1 ? "" : "s"}` : "nada urgente"}
          tono={criticas > 0 ? "bad" : "neutral"}
        />
      </div>

      {alertas.length > 0 ? (
        <div className={lt.tablaBloque}>
          <h2>Para revisar</h2>
          <ul className={estilos.alertas}>
            {(todasAlertas ? alertas : alertas.slice(0, 8)).map((a, i) => (
              <li
                key={`${a.tipo}-${a.id_colecta ?? a.id_motoboy}-${i}`}
                className={`${estilos.alerta} ${a.nivel === "critica" ? estilos.alertaCritica : ""}`}
              >
                <span className={estilos.alertaNivel}>{a.nivel === "critica" ? "Urgente" : "Revisar"}</span>
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
          {alertas.length > 8 ? (
            <button type="button" className={estilos.masFilas} onClick={() => setTodasAlertas(!todasAlertas)}>
              {todasAlertas ? "Mostrar menos" : `Mostrar las ${alertas.length}`}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={lt.tablaBloque}>
        <h2>Por repartidor</h2>
        <div className={estilos.tablaScroll}>
          <TablaOrdenable
            filas={resumenes}
            limite={todosDrivers ? undefined : DRIVERS_INICIALES}
            claveFila={(r) => claveDriver(r.id)}
            className={estilos.tabla}
            ordenInicial={{ clave: "posicion", asc: false }}
            columnas={[
              {
                clave: "driver",
                titulo: "Repartidor",
                valor: (r) => r.nombre,
                render: (r) => <><span className={lt.chip} style={{ background: r.color, display: "inline-block", marginRight: 6 }} aria-hidden="true" />{r.nombre}</>,
              },
              { clave: "tiendas", titulo: "Tiendas", valor: (r) => r.tiendas, className: estilos.num },
              { clave: "pendientes", titulo: "Por colectar", valor: (r) => r.porFase.PENDIENTE, className: estilos.num },
              { clave: "curso", titulo: "En curso", valor: (r) => r.porFase.EN_CURSO, className: estilos.num },
              { clave: "retirada", titulo: "A bodega", valor: (r) => r.porFase.RETIRADA, className: estilos.num },
              { clave: "cerrada", titulo: "En bodega", valor: (r) => r.porFase.CERRADA, className: estilos.num },
              { clave: "cancelada", titulo: "Canceladas", valor: (r) => r.porFase.CANCELADA, className: estilos.num },
              { clave: "paquetes", titulo: "Paquetes", valor: (r) => r.paquetes, className: estilos.num, render: (r) => numero(r.paquetes) },
              { clave: "proxima", titulo: "Próxima parada", valor: (r) => r.ruta[0]?.seller ?? "—", render: (r) => r.ruta[0] ? <NombreTienda nombre={r.ruta[0].seller ?? "—"} /> : "—" },
              ...(!dia.sinPosiciones ? [{ clave: "posicion", titulo: "Última posición", valor: (r: ResumenDriver) => r.posicionEn ? Date.parse(r.posicionEn) : null, render: (r: ResumenDriver) => r.id == null ? "—" : ahora != null ? antiguedadPosicion(r.posicion, r.posicionEn, ahora).texto : horaArgentina(r.posicionEn) }] : []),
              { clave: "movimiento", titulo: "Último cambio", valor: (r) => r.ultimoMovimiento ? Date.parse(r.ultimoMovimiento) : null, render: (r) => r.ultimoMovimiento ? horaArgentina(r.ultimoMovimiento) : "—" },
            ]}
          />
        </div>
        {resumenes.length > DRIVERS_INICIALES ? (
          <button type="button" className={estilos.masFilas} onClick={() => setTodosDrivers(!todosDrivers)}>
            {todosDrivers ? "Mostrar menos" : `Mostrar los ${resumenes.length}`}
          </button>
        ) : null}
      </div>

      <div className={lt.tablaBloque}>
        <h2>Colectas de hoy</h2>
        <div className={estilos.tablaScroll}>
          <TablaOrdenable
            filas={colectas}
            limite={todas ? undefined : FILAS_INICIALES}
            claveFila={({ c }) => c.id_colecta}
            className={estilos.tabla}
            ordenInicial={{ clave: "colecta", asc: false }}
            columnas={[
              { clave: "colecta", titulo: "Colecta", valor: ({ c }) => c.id_colecta, render: ({ c }) => `#${c.id_colecta}` },
              { clave: "tienda", titulo: "Tienda", valor: ({ c }) => c.seller ?? "—", render: ({ c }) => <><NombreTienda nombre={c.seller ?? "—"} />{c.lugar ? <span className={estilos.paradaDato}> · {c.lugar}</span> : null}</> },
              { clave: "estado", titulo: "Estado", valor: ({ c }) => ETIQUETA_ESTADO[c.estado], render: ({ c }) => <span className={estilos.estado}><span className={estilos.punto} style={{ background: COLOR_FASE[c.fase] }} aria-hidden="true" />{ETIQUETA_ESTADO[c.estado]}</span> },
              { clave: "driver", titulo: "Repartidor", valor: ({ r }) => r.nombre },
              { clave: "esperados", titulo: "En pedido", valor: ({ c }) => paquetesDe(c).esperados, className: estilos.num },
              { clave: "retirados", titulo: "Retirados", valor: ({ c }) => paquetesDe(c).retirados, className: estilos.num },
              { clave: "bodega", titulo: "En bodega", valor: ({ c }) => paquetesDe(c).enBodega, className: estilos.num },
              { clave: "creada", titulo: "Creada", valor: ({ c }) => c.creada_en ? Date.parse(c.creada_en) : null, render: ({ c }) => horaSegura(c.creada_en) },
              { clave: "aceptada", titulo: "Aceptada", valor: ({ c }) => c.aceptada_en ? Date.parse(c.aceptada_en) : null, render: ({ c }) => c.aceptada_en ? horaArgentina(c.aceptada_en) : "—" },
              { clave: "local", titulo: "En local", valor: ({ c }) => c.en_local_en ? Date.parse(c.en_local_en) : null, render: ({ c }) => c.en_local_en ? horaArgentina(c.en_local_en) : "—" },
              { clave: "retirada", titulo: "Retirada", valor: ({ c }) => c.retirada_en ? Date.parse(c.retirada_en) : null, render: ({ c }) => c.retirada_en ? horaArgentina(c.retirada_en) : "—" },
              { clave: "finalizada", titulo: "En bodega", valor: ({ c }) => tiempoSeguro(c.en_deposito_en ?? c.finalizada_en ?? c.llego_deposito_en), render: ({ c }) => horaSegura(c.en_deposito_en ?? c.finalizada_en ?? c.llego_deposito_en) },
            ]}
          />
        </div>
        {colectas.length > FILAS_INICIALES ? (
          <button type="button" className={estilos.masFilas} onClick={() => setTodas(!todas)}>
            {todas ? "Mostrar menos" : `Mostrar las ${colectas.length}`}
          </button>
        ) : null}
        <p className={lt.ayuda}>
          Horas de Ciudad de México. «En pedido» son los IDs que trae la colecta (los dropOFF no los traen);
          «Retirados» se llena al retirar y «En bodega» al llegar.
        </p>
      </div>
    </section>
  );
}
