"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { puedeVerRuta, type RolPerfil } from "@/lib/permisos";
import estilos from "./navegacion-horizontal.module.css";

type Entrada = { href: string; etiqueta: string; exacta?: boolean; activaEn?: string[] };
type Familia = { rutas: string[]; entradas: Entrada[]; etiqueta: string };

const FAMILIAS: Familia[] = [
  {
    etiqueta: "Operación",
    rutas: ["/", "/operacion", "/demorados", "/reclamos", "/cancelados", "/detalle"],
    entradas: [
      { href: "/", etiqueta: "Mes en curso", exacta: true, activaEn: ["/", "/detalle"] },
      { href: "/operacion", etiqueta: "Última jornada" },
      { href: "/demorados", etiqueta: "Demorados" },
      { href: "/reclamos", etiqueta: "Información de tiendas" },
      { href: "/cancelados", etiqueta: "Cancelados" },
    ],
  },
  {
    etiqueta: "Siniestrados",
    rutas: ["/siniestrados"],
    entradas: [
      { href: "/siniestrados", etiqueta: "Casos", exacta: true },
      { href: "/siniestrados/historial", etiqueta: "Historial" },
    ],
  },
  {
    etiqueta: "Herramientas",
    rutas: ["/seguimiento", "/cobertura", "/live-tracker"],
    entradas: [
      { href: "/seguimiento", etiqueta: "Seguimiento" },
      { href: "/cobertura", etiqueta: "Cobertura" },
      { href: "/live-tracker", etiqueta: "Live tracker" },
    ],
  },
  {
    etiqueta: "Chat de sellers",
    rutas: ["/chats-sellers"],
    entradas: [
      { href: "/chats-sellers", etiqueta: "Bandeja", exacta: true },
      { href: "/chats-sellers/contactos", etiqueta: "Contactos" },
      { href: "/chats-sellers/reportes", etiqueta: "Reportes" },
      { href: "/chats-sellers/usuarios", etiqueta: "Usuarios" },
    ],
  },
  {
    etiqueta: "Base de datos",
    rutas: ["/sellers", "/drivers"],
    entradas: [
      { href: "/sellers", etiqueta: "Sellers" },
      { href: "/drivers", etiqueta: "Drivers" },
    ],
  },
  {
    etiqueta: "Históricos",
    rutas: ["/historico", "/cancelados-historico"],
    entradas: [
      { href: "/historico", etiqueta: "Casos" },
      { href: "/cancelados-historico", etiqueta: "Cancelados" },
    ],
  },
  {
    etiqueta: "Colectas",
    rutas: ["/colectas", "/tiendas"],
    entradas: [
      { href: "/colectas", etiqueta: "Asignación", exacta: true },
      { href: "/colectas/asistencia", etiqueta: "Asistencia" },
      { href: "/colectas/historial", etiqueta: "Historial" },
      { href: "/tiendas", etiqueta: "Ruta en vivo" },
    ],
  },
];

function coincide(ruta: string, base: string): boolean {
  return base === "/" ? ruta === "/" : ruta === base || ruta.startsWith(`${base}/`);
}

export function NavegacionHorizontal({ rol = null }: { rol?: RolPerfil | null }) {
  const ruta = usePathname();
  const familia = FAMILIAS.find((grupo) => grupo.rutas.some((base) => coincide(ruta, base)));
  if (!familia) return null;
  const entradas = familia.entradas.filter((entrada) => puedeVerRuta(rol, entrada.href));
  if (entradas.length < 2) return null;

  return <nav className={estilos.nav} aria-label={familia.etiqueta}>
    {entradas.map((entrada) => {
      const activa = entrada.activaEn
        ? entrada.activaEn.some((base) => coincide(ruta, base))
        : entrada.exacta ? ruta === entrada.href : coincide(ruta, entrada.href);
      return <Link key={entrada.href} href={entrada.href} className={activa ? estilos.activa : ""} aria-current={activa ? "page" : undefined}>
        {entrada.etiqueta}
      </Link>;
    })}
  </nav>;
}
