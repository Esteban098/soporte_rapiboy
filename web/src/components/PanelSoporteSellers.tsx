"use client";

import { AsignarSoporteSeller } from "./AsignarSoporteSeller";

export function PanelSoporteSellers({
  sellers,
}: {
  sellers: { id: number; nombre: string; soporte: "CANDE" | "ESTEBAN" | null }[];
}) {
  return (
    <section aria-label="Asignación de soporte">
      <h2>Responsable de soporte</h2>
      <p>La asignación queda guardada por ID de Usuario y no se modifica durante la sincronización de n8n.</p>
      <div>
        {sellers.map((seller) => (
          <div key={seller.id}>
            <span>{seller.nombre}</span> <small>#{seller.id}</small>{" "}
            <AsignarSoporteSeller id={seller.id} valor={seller.soporte} />
          </div>
        ))}
      </div>
    </section>
  );
}
