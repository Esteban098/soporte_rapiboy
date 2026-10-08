import { operadorActual } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/Shell";
import { ChatSellers } from "@/components/ChatSellers";
import { listarRespuestasRapidas } from "@/lib/chat-sellers";
import { leerSellersDirectorio } from "@/lib/directorio-datos";

export const metadata = { title: "Chat de sellers" };

export default async function ChatsSellersPage() {
  const operador = await operadorActual();
  if (!operador) redirect("/acceso");
  const [respuestasRapidas, sellers] = await Promise.all([
    listarRespuestasRapidas(),
    leerSellersDirectorio(),
  ]);
  return <>
    <PageHead
      eyebrow="Chat Bot de sellers · BETA"
      titulo="Chat de soporte"
      dek="Bandeja de WhatsApp por estado. Seleccioná una conversación, tomala para responder y cerrala al finalizar."
    />
    <ChatSellers
      usuario={operador.email}
      esAdmin={operador.rol === "admin"}
      respuestasRapidas={respuestasRapidas}
      sellers={sellers.map(({ id, nombre, celular, direccion, email, comercial, horaCorte }) => ({
        id, nombre, celular, direccion, email, comercial, horaCorte,
      }))}
    />
  </>;
}
