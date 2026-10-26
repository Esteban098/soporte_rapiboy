-- Las colectas del día en México, una fila por colecta, con su tienda, su
-- repartidor y la última posición conocida de ese repartidor.
--
-- El día llega resuelto desde el nodo anterior en hora de Ciudad de México y
-- ya convertido al reloj del sistema: RapiboyData guarda las fechas en hora
-- de Argentina (las vistas del propio sistema le restan tres horas para
-- llevarlas a México), así que el día 21 en México va de las 03:00 del 21 a
-- las 03:00 del 22 en ese reloj. El rango es semiabierto y contra la columna
-- sin envolver, para que el filtro pueda usar el índice de `Fecha`.
--
-- Todas las fechas salen como texto ISO con su zona (`AT TIME ZONE`), así
-- ningún driver en el medio puede reinterpretarlas: '2026-09-21T16:25:00-03:00'
-- es un instante, no un reloj de pared.
--
-- NOLOCK como en el resto de los flujos: es una foto que se rehace cada pocos
-- minutos y ninguna decisión se toma sobre una sola lectura.
SET NOCOUNT ON;

DECLARE @Desde DATETIME = '{{ $json.desde }}';
DECLARE @Hasta DATETIME = '{{ $json.hasta }}';
DECLARE @Zona  VARCHAR(60) = 'Argentina Standard Time';
DECLARE @Dia DATE = '{{ $json.dia }}';
DECLARE @AhoraOrigen DATETIME2 = CONVERT(DATETIME2,
    (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE @Zona);

/*
 * `HistorialColecta` es un heap de millones de filas con un único índice, por
 * `Id`. Filtrar por `IdColecta` la recorrería entera en cada corrida; acotar
 * primero por los últimos `Id` usa el índice. Un día de México deja unas
 * 5.000 filas de historial, así que 50.000 es un margen de varios días. Si un
 * día pasara de ese número, las colectas más viejas saldrían sin la hora de
 * cada estado, pero con su estado actual igual: sale de `Colecta.IdEstado`.
 */
DECLARE @DesdeHistorial INT =
    (SELECT MAX(Id) FROM dbo.HistorialColecta WITH (NOLOCK)) - 50000;

-- Materializar una sola foto de colectas y drivers, como en el flujo 08.
SELECT C.*
INTO #ColectasHoy
FROM dbo.Colecta C WITH (NOLOCK)
INNER JOIN dbo.Usuario U WITH (NOLOCK) ON U.Id = C.IdUsuario
WHERE U.IdLocalidad = 9
  AND U.IdModalidad IN (5, 7)
  AND C.Fecha >= @Desde
  AND C.Fecha <  @Hasta;
CREATE UNIQUE CLUSTERED INDEX IX_ColectasHoy ON #ColectasHoy (Id);

SELECT M.Id AS IdMotoboy, M.Nombre, M.Apellido,
       M.Latitud, M.Longitud, M.UltimaActualizacion
INTO #DriversHoy
FROM dbo.Motoboy M WITH (NOLOCK)
WHERE M.Id IN (
    SELECT COALESCE(C.IdMotoboy, R.IdMotoboy)
    FROM #ColectasHoy C
    LEFT JOIN dbo.ReservaxMotoboy R WITH (NOLOCK) ON R.Id = C.IdReserva
);
CREATE UNIQUE CLUSTERED INDEX IX_DriversHoy ON #DriversHoy (IdMotoboy);

-- Mismo universo de eventos que Live Tracker: viajes de reservas de la
-- jornada, atribuidos al driver del evento, no al dueño actual del paquete.
SELECT R.Id AS IdReserva
INTO #ReservasGPS
FROM dbo.ReservaxMotoboy R WITH (NOLOCK)
WHERE R.Fecha >= @Dia AND R.Fecha < DATEADD(DAY, 1, @Dia)
  AND R.Cancelada = 0 AND R.IdLocalidad = 9;
CREATE UNIQUE CLUSTERED INDEX IX_ReservasGPS ON #ReservasGPS (IdReserva);

SELECT V.Id
INTO #ViajesGPS
FROM #ReservasGPS R
INNER JOIN dbo.Viaje V WITH (NOLOCK) ON V.IdReserva = R.IdReserva;
CREATE UNIQUE CLUSTERED INDEX IX_ViajesGPS ON #ViajesGPS (Id);

SELECT RH.IdMotoboy, H.Id, H.Fecha, H.Latitud, H.Longitud,
       ROW_NUMBER() OVER (
           PARTITION BY RH.IdMotoboy ORDER BY H.Fecha DESC, H.Id DESC
       ) AS rn
INTO #EventosGPS
FROM #ViajesGPS V
INNER LOOP JOIN dbo.HistorialViaje H WITH (NOLOCK, INDEX(IX_HistorialViaje_IdViaje)) ON H.IdViaje = V.Id
INNER JOIN dbo.ReservaxMotoboy RH WITH (NOLOCK) ON RH.Id = H.IdReserva
INNER JOIN #DriversHoy M ON M.IdMotoboy = RH.IdMotoboy
WHERE H.Fecha >= @Desde AND H.Fecha < @Hasta AND H.Fecha <= @AhoraOrigen
  AND H.Latitud BETWEEN -90 AND 90 AND H.Longitud BETWEEN -180 AND 180
  AND (H.Latitud <> 0 OR H.Longitud <> 0)
  -- No rejuvenecer GPS viejo copiado en un evento más reciente.
  AND (M.Latitud IS NULL OR M.Longitud IS NULL
       OR ABS(H.Latitud - M.Latitud) > 0.00001
       OR ABS(H.Longitud - M.Longitud) > 0.00001);
CREATE INDEX IX_EventosGPS ON #EventosGPS (IdMotoboy, rn);

WITH Historial AS (
    /*
     * Una fila por colecta: el historial se agrega antes de unirlo, nunca se
     * une crudo, porque cada colecta tiene varios cambios y duplicaría la fila.
     * La primera vez que la colecta entró a cada estado, y el último cambio.
     */
    SELECT
        H.IdColecta,
        MAX(H.Fecha) AS EstadoDesde,
        MIN(CASE WHEN H.ValorNuevo = '7' THEN H.Fecha END) AS AceptadaEn,
        MIN(CASE WHEN H.ValorNuevo = '2' THEN H.Fecha END) AS EnCaminoEn,
        MIN(CASE WHEN H.ValorNuevo = '6' THEN H.Fecha END) AS EnLocalEn,
        MIN(CASE WHEN H.ValorNuevo = '3' THEN H.Fecha END) AS RetiradaEn,
        MIN(CASE WHEN H.ValorNuevo IN ('4', '5') THEN H.Fecha END) AS FinalizadaEn,
        MIN(CASE WHEN H.ValorNuevo = '8' THEN H.Fecha END) AS EnDepositoEn
    FROM dbo.HistorialColecta H WITH (NOLOCK)
    WHERE H.Id > @DesdeHistorial
      AND H.Propiedad = 'IdEstado'
      AND H.IdColecta IN (SELECT Id FROM #ColectasHoy)
    GROUP BY H.IdColecta
)
SELECT
    '{{ $json.dia }}'             AS Dia,
    '{{ $json.sincronizado_en }}' AS SincronizadoEn,

    C.Id       AS IdColecta,
    C.IdEstado AS IdEstado,

    CONVERT(VARCHAR(33), CAST(C.Fecha              AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS CreadaEn,
    CONVERT(VARCHAR(33), CAST(C.FechaSolicitud     AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS SolicitadaEn,
    CONVERT(VARCHAR(33), CAST(C.FechaColecta       AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS ColectadaEn,
    CONVERT(VARCHAR(33), CAST(C.FechaLlegoDeposito AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS LlegoDepositoEn,
    CONVERT(VARCHAR(33), CAST(C.FechaCancelada     AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS CanceladaEn,

    CONVERT(VARCHAR(33), CAST(H.EstadoDesde  AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS EstadoDesde,
    CONVERT(VARCHAR(33), CAST(H.AceptadaEn   AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS AceptadaEn,
    CONVERT(VARCHAR(33), CAST(H.EnCaminoEn   AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS EnCaminoEn,
    CONVERT(VARCHAR(33), CAST(H.EnLocalEn    AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS EnLocalEn,
    CONVERT(VARCHAR(33), CAST(H.RetiradaEn   AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS RetiradaEn,
    CONVERT(VARCHAR(33), CAST(H.FinalizadaEn AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS FinalizadaEn,
    CONVERT(VARCHAR(33), CAST(H.EnDepositoEn AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS EnDepositoEn,

    -- La ventana es una hora del día sin fecha ni zona, y así viaja: no hay
    -- de dónde saber contra qué reloj la cargaron.
    CONVERT(VARCHAR(5), C.HoraDesde, 108) AS HoraDesde,
    CONVERT(VARCHAR(5), C.HoraHasta, 108) AS HoraHasta,
    C.IdTurno,

    C.IdReserva,
    R.Cancelada AS ReservaCancelada,
    R.IdMotoboy AS IdMotoboyReserva,

    -- El repartidor de la colecta y, si falta, el de su reserva. Los dos ids
    -- salen igual para poder ver cuando no coinciden.
    C.IdMotoboy,
    M.Nombre   AS NombreRepartidor,
    M.Apellido AS ApellidoRepartidor,

    -- Última posición válida: GPS o evento histórico, con su hora real.
    COALESCE(P.Latitud, CASE WHEN M.Latitud BETWEEN -90 AND 90 AND M.Longitud BETWEEN -180 AND 180
        AND (M.Latitud <> 0 OR M.Longitud <> 0) THEN M.Latitud END) AS LatitudRepartidor,
    COALESCE(P.Longitud, CASE WHEN M.Latitud BETWEEN -90 AND 90 AND M.Longitud BETWEEN -180 AND 180
        AND (M.Latitud <> 0 OR M.Longitud <> 0) THEN M.Longitud END) AS LongitudRepartidor,
    CONVERT(VARCHAR(33), CAST(P.Fecha AS DATETIME2(0)) AT TIME ZONE @Zona, 127) AS PosicionEn,

    U.Id        AS IdSeller,
    U.Alias     AS Seller,
    U.Direccion AS DireccionSeller,
    -- La dirección normalizada manda cuando existe; si no, la del usuario.
    COALESCE(D.Latitud,  U.Latitud)  AS LatitudTienda,
    COALESCE(D.Longitud, U.Longitud) AS LongitudTienda,

    C.CantidadPaquetes           AS PaquetesSolicitados,
    C.CantidadPaquetesColectados AS PaquetesColectados,
    C.CantidadBultos,
    C.IdPedidos,
    C.IdDeposito,
    C.DepositosVisitados,
    C.Comentario
FROM #ColectasHoy C
INNER JOIN dbo.Usuario U WITH (NOLOCK) ON U.Id = C.IdUsuario
LEFT JOIN dbo.Direccion D WITH (NOLOCK) ON D.Id = U.IdDireccionOrigen
LEFT JOIN dbo.ReservaxMotoboy R WITH (NOLOCK) ON R.Id = C.IdReserva
LEFT JOIN #DriversHoy M ON M.IdMotoboy = COALESCE(C.IdMotoboy, R.IdMotoboy)
OUTER APPLY (
    SELECT TOP 1 Candidato.Latitud, Candidato.Longitud, Candidato.Fecha
    FROM (
        SELECT M.Latitud, M.Longitud, CAST(M.UltimaActualizacion AS DATETIME2) AS Fecha, 0 AS Prioridad
        WHERE M.Latitud BETWEEN -90 AND 90 AND M.Longitud BETWEEN -180 AND 180
          AND (M.Latitud <> 0 OR M.Longitud <> 0)
          AND M.UltimaActualizacion <= @AhoraOrigen
        UNION ALL
        SELECT E.Latitud, E.Longitud, E.Fecha, 1
        FROM #EventosGPS E
        WHERE E.IdMotoboy = M.IdMotoboy AND E.rn = 1
    ) Candidato
    ORDER BY Candidato.Fecha DESC, Candidato.Prioridad
) P
LEFT JOIN Historial H ON H.IdColecta = C.Id
ORDER BY C.Id;
