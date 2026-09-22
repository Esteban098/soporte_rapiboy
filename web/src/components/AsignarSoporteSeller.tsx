"use client";

import { useTransition } from "react";
import { asignarSoporteSeller, type SoporteSeller } from "@/app/sellers";

export function AsignarSoporteSeller({
  id,
  valor,
}: {
  id: number;
  valor: SoporteSeller | null;
}) {
  const [pendiente, iniciar] = useTransition();

  return (
    <select
      value={valor ?? ""}
      disabled={pendiente}
      aria-label={`Soporte del seller ${id}`}
      onChange={(evento) => {
        const soporte = evento.target.value as SoporteSeller;
        if (soporte !== "CANDE" && soporte !== "ESTEBAN") return;
        iniciar(async () => {
          const resultado = await asignarSoporteSeller(id, soporte);
          if (!resultado.ok) window.alert(resultado.error);
        });
      }}
    >
      <option value="">Sin asignar</option>
      <option value="CANDE">Cande</option>
      <option value="ESTEBAN">Esteban</option>
    </select>
  );
}
