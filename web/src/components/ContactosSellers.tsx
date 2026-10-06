"use client";

import { useMemo, useState } from "react";
import estilos from "./chat-admin.module.css";

type Contacto = {
  id: string;
  sellerId: number | null;
  telefono: string;
  creadoEn: string;
  ultimoMensajeEn: string | null;
  eliminadoEn: string | null;
};
type Seller = { id: number; nombre: string };

function fecha(valor: string | null): string {
  if (!valor) return "—";
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) return "—";
  return `${new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(instante)} hs arg`;
}

export function ContactosSellers({ iniciales, sellers }: { iniciales: Contacto[]; sellers: Seller[] }) {
  const [contactos, setContactos] = useState(iniciales);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const nombres = useMemo(() => new Map(sellers.map((seller) => [seller.id, seller.nombre])), [sellers]);
  const consulta = busqueda.trim().toLocaleLowerCase("es");
  const visibles = contactos.filter((contacto) => {
    const seller = contacto.sellerId ? nombres.get(contacto.sellerId) ?? "" : "";
    return !consulta || `${contacto.telefono} ${contacto.sellerId ?? ""} ${seller}`.toLocaleLowerCase("es").includes(consulta);
  });

  async function asignar(contacto: Contacto, valor: string) {
    setGuardando(contacto.id);
    setError("");
    const sellerId = valor ? Number(valor) : null;
    try {
      const respuesta = await fetch(`/api/whatsapp/contactos/${contacto.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellerId }),
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new Error(datos?.error || "No se pudo guardar la asignación.");
      setContactos((actuales) => actuales.map((fila) => fila.id === contacto.id ? { ...fila, sellerId } : fila));
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo guardar la asignación.");
    } finally {
      setGuardando(null);
    }
  }

  return <section className={estilos.panel}>
    <div className={estilos.toolbar}>
      <input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar número, ID o seller" aria-label="Buscar contactos" />
      <span>{visibles.length} contacto{visibles.length === 1 ? "" : "s"}</span>
    </div>
    {error ? <p className={estilos.error} role="alert">{error}</p> : null}
    <div className={estilos.tablaWrap}>
      <table className={estilos.tabla}>
        <thead><tr><th>WhatsApp</th><th>Seller asignado</th><th>Creado</th><th>Último mensaje</th><th>Estado</th></tr></thead>
        <tbody>
          {visibles.map((contacto) => <tr key={contacto.id}>
            <td className={estilos.telefono}>{contacto.telefono}</td>
            <td>
              <select value={contacto.sellerId ?? ""} disabled={guardando === contacto.id} onChange={(evento) => void asignar(contacto, evento.target.value)} aria-label={`Seller del contacto ${contacto.telefono}`}>
                <option value="">Sin asignar</option>
                {sellers.map((seller) => <option key={seller.id} value={seller.id}>#{seller.id} · {seller.nombre || "Sin nombre"}</option>)}
              </select>
              {guardando === contacto.id ? <span className={estilos.secundario}>Guardando…</span> : null}
            </td>
            <td>{fecha(contacto.creadoEn)}</td>
            <td>{fecha(contacto.ultimoMensajeEn)}</td>
            <td><span className={contacto.eliminadoEn ? estilos.inactivo : estilos.activo}>{contacto.eliminadoEn ? "Sin chat activo" : "Activo"}</span></td>
          </tr>)}
        </tbody>
      </table>
      {visibles.length === 0 ? <p className={estilos.vacio}>No hay contactos que coincidan.</p> : null}
    </div>
  </section>;
}
