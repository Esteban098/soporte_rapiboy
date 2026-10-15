/**
 * Política horaria única de la plataforma.
 *
 * Argentina es el reloj técnico: toda hora que ve el equipo y toda agenda de
 * n8n se expresa en esta zona. México queda exclusivamente como calendario de
 * la operación logística (rutas, domingos y cortes de jornada). Separar los
 * dos roles evita convertir dos veces un instante y permite conservar el mismo
 * momento real al mover una agenda de n8n a Argentina.
 */
export const ZONA_PLATAFORMA = "America/Argentina/Buenos_Aires";
export const ZONA_OPERACION_LOGISTICA = "America/Mexico_City";
export const ETIQUETA_HORA_PLATAFORMA = "hs arg";
