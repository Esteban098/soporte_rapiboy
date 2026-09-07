"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarCobrado } from "@/app/cobros";
import type { OrigenCobro } from "@/lib/siniestrados";

export function CobroSiniestrado({ id, cobrado, origen }: {
  id: number;
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
        const resultado = await marcarCobrado(id, valor, origen);
        if (!resultado.ok) setError(resultado.error ?? "No se pudo guardar el cobro.");
        else router.refresh();
      } catch {
        setError("No se pudo confirmar el cobro. Actualizá la tabla antes de reintentar.");
      }
    });
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={cobrado}
          disabled={pendiente}
          onChange={(evento) => cambiar(evento.target.checked)}
          aria-label={`Cobrado el siniestro ${id}`}
        />{" "}
        {pendiente ? "Guardando…" : cobrado ? "Sí" : "No"}
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
