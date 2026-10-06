import { ContactosSellers } from "@/components/ContactosSellers";
import { PageHead } from "@/components/Shell";
import { listarContactosChat } from "@/lib/chat-sellers";
import { leerSellersDirectorio } from "@/lib/directorio-datos";
import { operadorActual } from "@/lib/sesion";
import { redirect } from "next/navigation";

export const metadata = { title: "Contactos · Chat de sellers" };
export const dynamic = "force-dynamic";

export default async function ContactosChatPage() {
  if (!await operadorActual()) redirect("/acceso");
  const [contactos, sellers] = await Promise.all([listarContactosChat(), leerSellersDirectorio()]);
  return <>
    <PageHead eyebrow="Chat de sellers" titulo="Contactos" dek="Números que escribieron por WhatsApp. Asigná cada contacto a un seller activo de la base de datos." />
    <ContactosSellers iniciales={contactos} sellers={sellers.map((seller) => ({ id: seller.id, nombre: seller.nombre }))} />
  </>;
}
