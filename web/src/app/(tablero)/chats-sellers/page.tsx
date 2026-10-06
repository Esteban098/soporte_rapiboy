import { operadorActual } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/Shell";
import { ChatSellers } from "@/components/ChatSellers";

export const metadata = { title: "Chat de sellers" };

export default async function ChatsSellersPage() {
  const operador = await operadorActual();
  if (!operador) redirect("/acceso");
  return <>
    <PageHead
      eyebrow="Atención a sellers"
      titulo="Chat de soporte"
      dek="Bandeja de WhatsApp por estado. Seleccioná una conversación, tomala para responder y cerrala al finalizar."
    />
    <ChatSellers usuario={operador.email} />
  </>;
}
