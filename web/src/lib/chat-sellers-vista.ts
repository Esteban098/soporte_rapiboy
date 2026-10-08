export type EstadoFiltroChat = "todos" | "abierto" | "asignado" | "cerrado";
export type AlcanceFiltroChat = "todos" | "mios";

export type ChatFiltrable = {
  id: string;
  estado: "abierto" | "asignado" | "cerrado";
  asignadoA: string | null;
  noLeido: boolean;
  nombreContacto: string | null;
  nombreSeller?: string | null;
  telefono: string;
  extracto: string;
};

export function chatsDelAlcance<T extends Pick<ChatFiltrable, "asignadoA">>(
  chats: T[],
  alcance: AlcanceFiltroChat,
  usuario: string,
): T[] {
  if (alcance === "todos") return chats;
  const correo = usuario.toLowerCase();
  return chats.filter((chat) => chat.asignadoA?.toLowerCase() === correo);
}

export function filtrarChats<T extends ChatFiltrable>(
  chats: T[],
  opciones: {
    estado: EstadoFiltroChat;
    alcance: AlcanceFiltroChat;
    usuario: string;
    soloNoLeidos: boolean;
    busqueda: string;
  },
): T[] {
  const consulta = opciones.busqueda.trim().toLocaleLowerCase("es");
  return chatsDelAlcance(chats, opciones.alcance, opciones.usuario).filter((chat) =>
    (opciones.estado === "todos" || chat.estado === opciones.estado) &&
    (!opciones.soloNoLeidos || chat.noLeido) &&
    (!consulta || `${chat.nombreSeller ?? ""} ${chat.nombreContacto ?? ""} ${chat.telefono} ${chat.extracto}`
      .toLocaleLowerCase("es").includes(consulta)),
  );
}

export function idSeleccionadoVisible<T extends { id: string }>(
  seleccionado: string | null,
  visibles: T[],
): string | null {
  return seleccionado && visibles.some((chat) => chat.id === seleccionado)
    ? seleccionado
    : visibles[0]?.id ?? null;
}
