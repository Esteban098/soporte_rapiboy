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
      dek="Conversaciones de WhatsApp. Al tomar un chat, el bot deja de responder; al cerrarlo, vuelve a atender los mensajes nuevos."
    />
    <ChatSellers usuario={operador.email} />
  </>;
}
