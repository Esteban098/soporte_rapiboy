import { MensajesRapidos } from "@/components/MensajesRapidos";
import { PageHead } from "@/components/Shell";
import { listarRespuestasRapidas } from "@/lib/chat-sellers";
import { operadorActual } from "@/lib/sesion";
import { redirect } from "next/navigation";

export const metadata = { title: "Mensajes rápidos · Chat de sellers" };
export const dynamic = "force-dynamic";

export default async function RespuestasRapidasPage() {
  if (!await operadorActual()) redirect("/acceso");
  const respuestas = await listarRespuestasRapidas(true);
  return <>
    <PageHead eyebrow="Chat de sellers" titulo="Mensajes rápidos" dek="Creá respuestas reutilizables. En una conversación escribí / para buscarlas e insertarlas." />
    <MensajesRapidos iniciales={respuestas} />
  </>;
}
