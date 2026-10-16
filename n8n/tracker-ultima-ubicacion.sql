-- Última ubicación conocida: GPS o evento histórico del driver.
-- Las fechas crudas están en Argentina; el nodo Corregir zona de posición
-- conserva la conversión existente después de esta consulta.
SET NOCOUNT ON;
DECLARE @Dia date = '{{ $json.dia }}';
DECLARE @Hasta date = DATEADD(day, 1, @Dia);
DECLARE @ZonaOrigen varchar(60) = 'UTC';
DECLARE @AhoraOrigen datetime2 = CONVERT(datetime2,
  (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Argentina Standard Time');
DECLARE @InicioOrigen datetime2 = CONVERT(datetime2,
  (CONVERT(datetime2,@Dia) AT TIME ZONE 'Central Standard Time (Mexico)')
  AT TIME ZONE 'Argentina Standard Time');
DECLARE @FinOrigen datetime2 = DATEADD(day,1,@InicioOrigen);

SELECT R.Id AS IdReserva,R.IdMotoboy,R.IdLocalidad,R.IdModalidad,R.FechaDesde,R.FechaHasta,
 ROW_NUMBER() OVER(PARTITION BY R.IdMotoboy ORDER BY R.FechaDesde DESC,R.Id DESC) AS rn
INTO #ReservasDia
FROM dbo.ReservaxMotoboy R WITH(NOLOCK)
WHERE R.Fecha>=@Dia AND R.Fecha<@Hasta AND R.Cancelada=0 AND R.IdLocalidad=9;
CREATE UNIQUE CLUSTERED INDEX IX_ReservasDia ON #ReservasDia(IdReserva);

SELECT M.Id AS IdMotoboy,M.Nombre,M.Apellido,M.Latitud,M.Longitud,
 M.UltimaActualizacion,M.UltimaInfo,D.IdReserva,D.IdLocalidad,D.IdModalidad,D.FechaDesde,D.FechaHasta
INTO #DriversDia FROM #ReservasDia D
INNER JOIN dbo.Motoboy M WITH(NOLOCK) ON M.Id=D.IdMotoboy WHERE D.rn=1;
CREATE UNIQUE CLUSTERED INDEX IX_DriversDia ON #DriversDia(IdMotoboy);

-- Acotar por las reservas de la jornada antes de entrar al historial.
SELECT V.Id INTO #ViajesDia FROM #ReservasDia R
INNER JOIN dbo.Viaje V WITH(NOLOCK) ON V.IdReserva=R.IdReserva;
CREATE UNIQUE CLUSTERED INDEX IX_ViajesDia ON #ViajesDia(Id);

SELECT RH.IdMotoboy,H.Id,H.Fecha,H.Latitud,H.Longitud,
 ROW_NUMBER() OVER(PARTITION BY RH.IdMotoboy ORDER BY H.Fecha DESC,H.Id DESC) AS rn
INTO #EventosGPS
FROM #ViajesDia V
INNER LOOP JOIN dbo.HistorialViaje H WITH(NOLOCK,INDEX(IX_HistorialViaje_IdViaje)) ON H.IdViaje=V.Id
INNER JOIN dbo.ReservaxMotoboy RH WITH(NOLOCK) ON RH.Id=H.IdReserva
INNER JOIN #DriversDia M ON M.IdMotoboy=RH.IdMotoboy
WHERE H.Fecha>=@InicioOrigen AND H.Fecha<@FinOrigen AND H.Fecha<=@AhoraOrigen
 AND H.Latitud BETWEEN -90 AND 90 AND H.Longitud BETWEEN -180 AND 180
 AND (H.Latitud<>0 OR H.Longitud<>0)
 -- Los eventos pueden copiar el GPS viejo: no rejuvenecer ese mismo punto.
 AND (M.Latitud IS NULL OR M.Longitud IS NULL
      OR ABS(H.Latitud-M.Latitud)>0.00001 OR ABS(H.Longitud-M.Longitud)>0.00001);
CREATE INDEX IX_EventosGPS ON #EventosGPS(IdMotoboy,rn);

SELECT '{{ $json.sync_id }}' AS SyncId,@Dia AS Dia,
 M.IdMotoboy,M.Nombre,M.Apellido,
 COALESCE(P.Latitud,CASE WHEN M.Latitud BETWEEN -90 AND 90 AND M.Longitud BETWEEN -180 AND 180 AND (M.Latitud<>0 OR M.Longitud<>0) THEN M.Latitud END) AS Latitud,
 COALESCE(P.Longitud,CASE WHEN M.Latitud BETWEEN -90 AND 90 AND M.Longitud BETWEEN -180 AND 180 AND (M.Latitud<>0 OR M.Longitud<>0) THEN M.Longitud END) AS Longitud,
 CAST(P.Fecha AS datetime2(0)) AT TIME ZONE @ZonaOrigen AS UltimaActualizacion,
 P.Fecha AS UltimaActualizacionCruda,P.Origen AS OrigenPosicion,
 M.UltimaInfo,M.IdReserva,M.IdLocalidad,M.IdModalidad,M.FechaDesde,M.FechaHasta
FROM #DriversDia M
OUTER APPLY (
 SELECT TOP 1 C.Latitud,C.Longitud,C.Fecha,C.Origen FROM (
  SELECT M.Latitud,M.Longitud,CAST(M.UltimaActualizacion AS datetime2) AS Fecha,'gps' AS Origen,0 AS Prioridad
  WHERE M.Latitud BETWEEN -90 AND 90 AND M.Longitud BETWEEN -180 AND 180
    AND (M.Latitud<>0 OR M.Longitud<>0) AND M.UltimaActualizacion<=@AhoraOrigen
  UNION ALL
  SELECT E.Latitud,E.Longitud,E.Fecha,'evento',1 FROM #EventosGPS E WHERE E.IdMotoboy=M.IdMotoboy AND E.rn=1
 ) C ORDER BY C.Fecha DESC,C.Prioridad
) P
ORDER BY M.IdMotoboy;
