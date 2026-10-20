/** Solo presentación: destinos, etiquetas y permisos viven en navegacion.ts. */
export function IconoSeccion({ ruta }: { ruta: string }) {
  const trazos: Record<string, string> = {
    "/": "m3 10 9-7 9 7v11h-6v-7H9v7H3z",
    "/siniestrados": "m12 3 10 18H2z M12 9v5m0 3v1",
    "/seguimiento": "m12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5m-9 5v9m-5-17 9 5",
    "/chats-sellers": "M4 4h16v12H9l-5 4z",
    "/sellers": "M3 6c0-5 18-5 18 0s-18 5-18 0m0 0v6c0 5 18 5 18 0V6M3 12v6c0 5 18 5 18 0v-6",
    "/colectas": "m3 7 9-4 9 4v13H3z M3 7l9 5 9-5m-9 5v8",
    "/historico": "M3 10a9 9 0 1 1 1 8M3 3v7h7m2-4v6l4 3",
    "/perfiles": "M12 3l1.2 2.2 2.5.4.5 2.5 2 1.4-1 2.3 1 2.3-2 1.4-.5 2.5-2.5.4L12 21l-1.2-2.2-2.5-.4-.5-2.5-2-1.4 1-2.3-1-2.3 2-1.4.5-2.5 2.5-.4z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={trazos[ruta] ?? trazos["/"]} /></svg>;
}
