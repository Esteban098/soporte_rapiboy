"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarAvisado } from "@/app/cobros";
import type { OrigenCobro } from "@/lib/siniestrados";

export function AvisoSiniestrado({
  id,
  avisado,
  cobrado,
  origen,
}: {
  id: number;
  avisado: boolean;
  cobrado: boolean;
  origen: OrigenCobro;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  function cambiar(valor: boolean) {
    setError("");
    iniciar(async () => {
      try {
        const resultado = await marcarAvisado(id, valor, origen);
        if (!resultado.ok) setError(resultado.error ?? "No se pudo guardar el aviso.");
        else router.refresh();
      } catch {
        setError("No se pudo confirmar el aviso. Actualizá la tabla antes de reintentar.");
      }
    });
  }

  return (
    <div>
      <label title={cobrado ? "Un siniestro cobrado debe permanecer avisado." : undefined}>
        <input
          type="checkbox"
          checked={avisado}
          disabled={pendiente || cobrado}
          onChange={(evento) => cambiar(evento.target.checked)}
          aria-label={`Avisado el siniestro ${id}`}
        />{" "}
        {pendiente ? "Guardando…" : avisado ? "Sí" : "No"}
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
