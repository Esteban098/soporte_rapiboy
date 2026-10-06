/**
 * Fuente única de rutas, títulos y subsecciones del tablero.
 * Shell muestra las familias y NavegacionHorizontal muestra sus enlaces.
 */
export type EntradaNavegacion = {
  href: string;
  etiqueta: string;
  exacta?: boolean;
  activaEn?: string[];
};

export type FamiliaNavegacion = {
  etiqueta: string;
  principal: {
    href: string;
    nuevaVentana?: boolean;
    destacado?: boolean;
  };
  entradas: EntradaNavegacion[];
  rutas: string[];
};

export type SeccionPrincipal = {
  href: string;
  etiqueta: string | null;
  exacto?: boolean;
  destacado?: boolean;
  beta?: boolean;
  nuevaVentana?: boolean;
  rutasActivas?: string[];
};

const FAMILIAS: Omit<FamiliaNavegacion, "rutas">[] = [
  {
    etiqueta: "Operación",
    principal: { href: "/" },
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
    principal: { href: "/siniestrados" },
    entradas: [
      { href: "/siniestrados", etiqueta: "Casos", exacta: true },
      { href: "/siniestrados/historial", etiqueta: "Historial" },
    ],
  },
  {
    etiqueta: "Herramientas",
    principal: { href: "/seguimiento", destacado: true },
    entradas: [
      { href: "/seguimiento", etiqueta: "Seguimiento" },
      { href: "/cobertura", etiqueta: "Cobertura" },
      { href: "/live-tracker", etiqueta: "Live tracker" },
    ],
  },
  {
    etiqueta: "Chat de sellers",
    principal: { href: "/chats-sellers", nuevaVentana: true },
    entradas: [
      { href: "/chats-sellers", etiqueta: "Bandeja", exacta: true },
      { href: "/chats-sellers/contactos", etiqueta: "Contactos" },
      { href: "/chats-sellers/respuestas-rapidas", etiqueta: "Mensajes rápidos" },
      { href: "/chats-sellers/reportes", etiqueta: "Reportes" },
      { href: "/chats-sellers/usuarios", etiqueta: "Usuarios" },
    ],
  },
  {
    etiqueta: "Base de datos",
    principal: { href: "/sellers" },
    entradas: [
      { href: "/sellers", etiqueta: "Sellers" },
      { href: "/drivers", etiqueta: "Drivers" },
    ],
  },
  {
    etiqueta: "Colectas",
    principal: { href: "/colectas", nuevaVentana: true },
    entradas: [
      { href: "/colectas", etiqueta: "Asignación", exacta: true },
      { href: "/colectas/asistencia", etiqueta: "Asistencia" },
      { href: "/colectas/historial", etiqueta: "Historial" },
      { href: "/tiendas", etiqueta: "Ruta en vivo" },
    ],
  },
  {
    etiqueta: "Históricos",
    principal: { href: "/historico" },
    entradas: [
      { href: "/historico", etiqueta: "Casos" },
      { href: "/cancelados-historico", etiqueta: "Cancelados" },
    ],
  },
];

export const FAMILIAS_NAVEGACION: FamiliaNavegacion[] = FAMILIAS.map((familia) => ({
  ...familia,
  rutas: [...new Set(familia.entradas.flatMap((entrada) => [entrada.href, ...(entrada.activaEn ?? [])]))],
}));

export const SECCIONES_PRINCIPALES: SeccionPrincipal[] = [
  ...FAMILIAS_NAVEGACION.map((familia) => ({
    href: familia.principal.href,
    etiqueta: familia.etiqueta,
    nuevaVentana: familia.principal.nuevaVentana,
    destacado: familia.principal.destacado,
    rutasActivas: familia.rutas,
  })),
  { href: "/perfiles", etiqueta: null },
];
