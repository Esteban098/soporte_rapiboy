import Link from "next/link";
import type { UsoPorPersona } from "@/lib/asistente-costos";
import { mesLargo, numero } from "@/lib/formato";
import { Callout, Card, Kpi } from "./Card";
import estilos from "./ui.module.css";

/**
 * Cuánto se usó el asistente en un mes, por persona. Solo lo ve el
 * administrador: la página no lo lee para nadie más.
 *
 * Es un componente de servidor y recibe los números ya agrupados; las filas
 * sueltas de cada pregunta no salen del servidor.
 */

const DOLARES = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const CUANDO = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

export function UsoAsistente({
  mes,
  anterior,
  siguiente,
  personas,
  sinTabla,
}: {
  mes: string;
  anterior: string;
  /** `null` cuando el mes mostrado es el actual: no hay futuro que mirar. */
  siguiente: string | null;
  personas: UsoPorPersona[];
  sinTabla: boolean;
}) {
  const consultas = personas.reduce((suma, p) => suma + p.consultas, 0);
  const costo = personas.reduce((suma, p) => suma + p.costoUsd, 0);
  const tokens = personas.reduce((suma, p) => suma + p.tokensEntrada + p.tokensSalida, 0);
  const sinPrecio = personas.reduce((suma, p) => suma + p.sinPrecio, 0);

  const navegacion = (
    <div className={estilos.cardNote}>
      <Link href={`?uso=${anterior}`} scroll={false}>
        ← {mesLargo(anterior)}
      </Link>
      {siguiente ? " · " : null}
      {siguiente ? (
        <Link href={`?uso=${siguiente}`} scroll={false}>
          {mesLargo(siguiente)} →
        </Link>
      ) : null}
    </div>
  );

  return (
    <Card
      titulo={`Uso del asistente · ${mesLargo(mes)}`}
      nota="Preguntas por persona, tokens y costo estimado con los precios de OpenAI. La factura real está en platform.openai.com/usage."
      extra={navegacion}
    >
      {sinTabla ? (
        <Callout tono="warning" titulo="Falta la tabla de uso">
          Corré supabase/migracion-14-asistente-uso.sql en Supabase. Hasta entonces el asistente funciona, pero no
          registra el uso ni aplica el tope diario.
        </Callout>
      ) : personas.length === 0 ? (
        <p className={estilos.cardNote}>Nadie usó el asistente en {mesLargo(mes)}.</p>
      ) : (
        <>
          <div className={estilos.kpis}>
            <Kpi etiqueta="Consultas" valor={numero(consultas)} nota={`${personas.length} personas`} />
            <Kpi etiqueta="Costo estimado" valor={DOLARES.format(costo)} nota={sinPrecio ? `${sinPrecio} sin precio conocido` : undefined} />
            <Kpi etiqueta="Por consulta" valor={DOLARES.format(consultas ? costo / consultas : 0)} />
            <Kpi etiqueta="Tokens" valor={numero(tokens)} nota="entrada + salida" />
          </div>

          <div className={estilos.tableWrap}>
            <table className={estilos.table}>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className={estilos.num}>Consultas</th>
                  <th className={estilos.num}>Fallidas</th>
                  <th className={estilos.num}>Tokens de entrada</th>
                  <th className={estilos.num}>Tokens de salida</th>
                  <th className={estilos.num}>Costo estimado</th>
                  <th>Última</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((p) => (
                  <tr key={p.email}>
                    <td>{p.email}</td>
                    <td className={estilos.num}>{numero(p.consultas)}</td>
                    <td className={estilos.num}>{p.fallidas ? numero(p.fallidas) : "—"}</td>
                    <td className={estilos.num}>{numero(p.tokensEntrada)}</td>
                    <td className={estilos.num}>{numero(p.tokensSalida)}</td>
                    <td className={estilos.num}>
                      {DOLARES.format(p.costoUsd)}
                      {p.sinPrecio ? " *" : ""}
                    </td>
                    <td>{p.ultima ? CUANDO.format(new Date(p.ultima)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sinPrecio ? (
            <p className={estilos.cardNote}>
              * Incluye consultas con un modelo que no está en la tabla de precios: su costo no se sumó.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
