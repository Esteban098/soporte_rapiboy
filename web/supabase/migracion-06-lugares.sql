-- ---------------------------------------------------------------------------
-- Live tracker · tiendas y domicilios de choferes
--
-- GENERADO POR `npx tsx scripts/lugares.mts` A PARTIR DE
-- `datos/tiendas.kmz` y `datos/choferes.kmz`. No editar a mano: la próxima
-- corrida del script pisa los cambios. Para corregir un domicilio se corrige
-- el punto en Google My Maps, se vuelve a exportar el KMZ y se regenera.
--
-- Las dos tablas son de referencia, no de operación: no las escribe ningún
-- flujo de n8n y no cambian solas. Su único trabajo es traducir un id del
-- sistema a un punto del mapa.
--
-- Correr una vez en el SQL Editor de Supabase. Es idempotente: se puede
-- volver a correr después de cada exportación del mapa.
--
-- Para volver atrás: `drop table public.tracker_tiendas, public.tracker_choferes;`.
-- No las mira ningún otro tablero.
-- ---------------------------------------------------------------------------

begin;

/*
 * Tiendas, dropoff y la bodega, todos en la misma tabla.
 *
 * La clave es el nombre tal cual figura en el mapa, y no el id de la tienda,
 * porque el id NO es único: #55004 «Marlovet» y #55004 «Marlovet 2» son dos
 * sucursales del mismo vendedor a 1,3 km una de la otra. Con el id como clave
 * primaria, una de las dos se perdería en silencio en cada importación.
 *
 * Por eso quien consulte por `id_tienda` tiene que estar listo para recibir
 * más de una fila. Es la realidad de la operación, no un defecto del modelo.
 */
create table if not exists public.tracker_tiendas (
  nombre_mapa    text primary key,
  id_tienda      integer,
  nombre         text        not null,
  tipo           text        not null check (tipo in ('TIENDA', 'DROPOFF', 'BODEGA')),
  latitud        double precision not null,
  longitud       double precision not null,
  actualizado_en timestamptz not null default now()
);

create index if not exists tracker_tiendas_por_id on public.tracker_tiendas (id_tienda);

/*
 * El domicilio de cada chofer.
 *
 * Acá el id sí es la clave: los 69 puntos del mapa tienen
 * 69 ids y ninguno repetido. `IdMotoboy` es el mismo
 * número que usa `tracker_drivers`, comprobado por nombre contra la jornada
 * cargada en la base.
 *
 * Es un dato sensible: es dónde vive una persona. Queda del lado del servidor
 * como todo el resto -RLS prendido y sin políticas- y solo llega al navegador
 * el domicilio del repartidor que alguien eligió mirar.
 */
create table if not exists public.tracker_choferes (
  id_motoboy     integer primary key,
  nombre         text        not null,
  latitud        double precision not null,
  longitud       double precision not null,
  actualizado_en timestamptz not null default now()
);

-- Mismo criterio que el resto del tracker: nada de acceso directo por API.
alter table public.tracker_tiendas  enable row level security;
alter table public.tracker_choferes enable row level security;

/*
 * El reemplazo es completo y va adentro de la transacción.
 *
 * Un punto borrado del mapa tiene que desaparecer de la tabla: si solo se
 * hiciera upsert, una tienda que operaciones sacó de la capa seguiría viva acá
 * para siempre. Y si algo falla a mitad, el `rollback` deja las tablas como
 * estaban en vez de vaciarlas.
 */
delete from public.tracker_tiendas;
delete from public.tracker_choferes;

insert into public.tracker_tiendas (nombre_mapa, id_tienda, nombre, tipo, latitud, longitud) values
  ('Bodega', null, 'Bodega', 'BODEGA', 19.455207, -99.105858),
  ('#24626 SATUS', 24626, 'SATUS', 'TIENDA', 19.34538, -99.168323),
  ('#54724 homer design mexico', 54724, 'homer design mexico', 'TIENDA', 19.627038, -99.153578),
  ('#24770 stovmex', 24770, 'stovmex', 'TIENDA', 19.418198, -99.151604),
  ('#31311 Mistermascotas 2', 31311, 'Mistermascotas 2', 'TIENDA', 19.48446, -99.062335),
  ('#25979 Karzov', 25979, 'Karzov', 'DROPOFF', 19.380823, -99.153583),
  ('#31259 eToledo', 31259, 'eToledo', 'TIENDA', 19.478631, -99.198645),
  ('#20242 Fanc Croqueterias', 20242, 'Fanc Croqueterias', 'TIENDA', 19.640958, -99.133506),
  ('#51522 SPG Online', 51522, 'SPG Online', 'TIENDA', 19.407194, -99.060691),
  ('#54877 WEIDEWORDL', 54877, 'WEIDEWORDL', 'TIENDA', 19.621203, -99.154323),
  ('#55004 Marlovet', 55004, 'Marlovet', 'TIENDA', 19.346949, -99.20911),
  ('#55431 HALOMEDIC', 55431, 'HALOMEDIC', 'TIENDA', 19.382985, -99.175686),
  ('SPG Benito Juarez', null, 'SPG Benito Juarez', 'TIENDA', 19.379685, -99.168374),
  ('#55790 INSUMOS FANNY', 55790, 'INSUMOS FANNY', 'TIENDA', 19.409728, -99.131499),
  ('#58002 La Fontana Zapaterias S.A. de C.V', 58002, 'La Fontana Zapaterias S.A. de C.V', 'TIENDA', 19.259018, -99.108897),
  ('#58246 AniMALL', 58246, 'AniMALL', 'TIENDA', 19.380206, -99.139),
  ('#57820 Kuangeye', 57820, 'Kuangeye', 'TIENDA', 19.503538, -98.876828),
  ('#60062 Mayor Bag', 60062, 'Mayor Bag', 'DROPOFF', 19.384015, -99.137194),
  ('#59918 Grupo Basari', 59918, 'Grupo Basari', 'TIENDA', 19.437652, -99.172472),
  ('#61308 Productos Naturales Big Life', 61308, 'Productos Naturales Big Life', 'TIENDA', 19.398407, -99.128689),
  ('#21981 ENVASES XENA', 21981, 'ENVASES XENA', 'TIENDA', 19.361074, -99.150114),
  ('#59776 Mi moto', 59776, 'Mi moto', 'DROPOFF', 19.53619, -99.187655),
  ('#22032 BOOGIEPETSLANDIA', 22032, 'BOOGIEPETSLANDIA', 'DROPOFF', 19.426332, -99.259612),
  ('#61422 Innobeat', 61422, 'Innobeat', 'TIENDA', 19.449364, -99.210372),
  ('#63550 MLDonline', 63550, 'MLDonline', 'TIENDA', 19.46175, -99.178192),
  ('#65768 Dropoff TERESITA EXPRESS', 65768, 'Dropoff TERESITA EXPRESS', 'DROPOFF', 19.432501, -99.127262),
  ('#69789 Runsa Autopartes', 69789, 'Runsa Autopartes', 'TIENDA', 19.341063, -99.153437),
  ('#73052 Librenta México', 73052, 'Librenta México', 'TIENDA', 19.479543, -99.196495),
  ('#73441 Bache Critico', 73441, 'Bache Critico', 'DROPOFF', 19.632588, -99.152359),
  ('#73637 MULTICOMERCIALIZADORA DE HERRAMIENTAS SA DE CV', 73637, 'MULTICOMERCIALIZADORA DE HERRAMIENTAS SA DE CV', 'TIENDA', 19.476563, -99.101263),
  ('#73482 Lincky', 73482, 'Lincky', 'TIENDA', 19.465341, -99.240733),
  ('#73517 Volk''s Coruña', 73517, 'Volk''s Coruña', 'TIENDA', 19.401643, -99.125761),
  ('#74110 VITAZONE MEXICO', 74110, 'VITAZONE MEXICO', 'TIENDA', 19.404232, -99.027551),
  ('#74531 CARDIC AUTOMOTRIZ', 74531, 'CARDIC AUTOMOTRIZ', 'TIENDA', 19.508948, -99.141478),
  ('#73461 Amikoo Peek', 73461, 'Amikoo Peek', 'DROPOFF', 19.625937, -99.178794),
  ('#75113 STEELPRO', 75113, 'STEELPRO', 'TIENDA', 19.490512, -99.161004),
  ('#75163 Grupo Aruba Internacional', 75163, 'Grupo Aruba Internacional', 'TIENDA', 19.490512, -99.161004),
  ('#75384 DISTRIBUIDORA CORSICANA', 75384, 'DISTRIBUIDORA CORSICANA', 'TIENDA', 19.403161, -99.063696),
  ('#75445 REFACCIONARIA KROCK', 75445, 'REFACCIONARIA KROCK', 'TIENDA', 19.389132, -99.037867),
  ('#75703 Farmaenvios', 75703, 'Farmaenvios', 'TIENDA', 19.37853, -99.176255),
  ('#75704 Comercializadora y distribuidora bat yam sa de cv', 75704, 'Comercializadora y distribuidora bat yam sa de cv', 'TIENDA', 19.464063, -99.221626),
  ('#58078 Librerias Gandhi', 58078, 'Librerias Gandhi', 'TIENDA', 19.466791, -99.233034),
  ('#56297 DISTRIBUIDORAMILITAR', 56297, 'DISTRIBUIDORAMILITAR', 'DROPOFF', 19.401389, -99.009611),
  ('#76003 Motorepuestos Originales', 76003, 'Motorepuestos Originales', 'TIENDA', 19.357162, -99.137175),
  ('#75853 Comercializadora Valsan', 75853, 'Comercializadora Valsan', 'DROPOFF', 19.60444, -99.004745),
  ('#55401 Powerbatt', 55401, 'Powerbatt', 'DROPOFF', 19.315442, -99.107626),
  ('#74622 Distribu', 74622, 'Distribu', 'TIENDA', 19.395109, -99.059692),
  ('#75248 Mega Audio', 75248, 'Mega Audio', 'TIENDA', 19.512845, -99.156423),
  ('#76260 TAYGA SPORTS', 76260, 'TAYGA SPORTS', 'TIENDA', 19.483222, -99.226917),
  ('#76340 KEIK', 76340, 'KEIK', 'TIENDA', 19.446479, -99.203686),
  ('#55004 Marlovet 2', 55004, 'Marlovet 2', 'TIENDA', 19.337261, -99.215183),
  ('#76261 Distribuidora Mundo Animal', 76261, 'Distribuidora Mundo Animal', 'TIENDA', 19.498285, -99.128731),
  ('#73791 Grupo Fuentes Automotriz', 73791, 'Grupo Fuentes Automotriz', 'TIENDA', 19.348393, -99.015544),
  ('#76727 Navamatic Dropoff', 76727, 'Navamatic Dropoff', 'DROPOFF', 19.485136, -99.227978),
  ('#67504 SOMOS PURA', 67504, 'SOMOS PURA', 'TIENDA', 19.39737, -99.090201),
  ('#77153 Velomaravilloso', 77153, 'Velomaravilloso', 'TIENDA', 19.276073, -99.147173),
  ('#75681 EASY SHOP', 75681, 'EASY SHOP', 'TIENDA', 19.632707, -99.145919),
  ('#77022 VENCORT', 77022, 'VENCORT', 'TIENDA', 19.403535, -99.197189),
  ('#77134 FUXION MÉXICO', 77134, 'FUXION MÉXICO', 'TIENDA', 19.401113, -99.092894),
  ('#75665 Macross Pharma', 75665, 'Macross Pharma', 'TIENDA', 19.321573, -99.160815),
  ('#77640 FD FASTDRIVE', 77640, 'FD FASTDRIVE', 'TIENDA', 19.569853, -99.263637),
  ('#77789 Juguetes arlequin', 77789, 'Juguetes arlequin', 'TIENDA', 19.489241, -99.218525),
  ('#77723 GMG IMPORTACIONES', 77723, 'GMG IMPORTACIONES', 'TIENDA', 19.39895, -99.032358),
  ('#77963 Salud Natural', 77963, 'Salud Natural', 'TIENDA', 19.382307, -99.240507),
  ('David', null, 'David', 'TIENDA', 19.501563, -99.223134);

insert into public.tracker_choferes (id_motoboy, nombre, latitud, longitud) values
  (648731, 'Victor Martínez', 19.336738, -98.990923),
  (685437, 'Eduardo Daniel Contreras Gutierrez Estrada', 19.646138, -99.136734),
  (327539, 'Jonathan Galicia', 19.307852, -99.233364),
  (596697, 'Alan Caballero', 19.445788, -99.280047),
  (521730, 'Alejandro Guzman', 19.399161, -99.14103),
  (452297, 'Danae Alejandra Gonzalez Trejo', 19.311284, -98.914186),
  (196984, 'Yazmin Vera Camacho', 19.519753, -99.171503),
  (158385, 'Julio Rodrigo Hernández Mejía', 19.381557, -99.053934),
  (689055, 'Ignacio Valentin Altamirano Mendoza', 19.234213, -99.165359),
  (158017, 'Berenice Maza Pérez', 19.597057, -99.023869),
  (44194, 'Daniel Castillejo franco', 19.480695, -99.213441),
  (519090, 'Flor Arteaga Orozco', 19.190439, -99.155386),
  (468972, 'Vicente Marino Argaez Sanabria', 19.266099, -99.165206),
  (538128, 'Oscar Adan Luna Leal', 19.590263, -99.005875),
  (539807, 'Guillermo San Juan', 19.394893, -98.971635),
  (496371, 'Victor Jesus Parra Bello', 19.48899, -99.204266),
  (550391, 'Ricardo Rodriguez Sabino', 19.762063, -99.059516),
  (499739, 'Angel Omar Aguilar Flores', 19.570624, -99.025459),
  (563067, 'Miguel Pérez Delgado', 19.669535, -99.207703),
  (537937, 'Carlos Ramirez', 19.435164, -99.103227),
  (278641, 'Israel Roldán', 19.37912, -99.242815),
  (609794, 'Rodolfo Hernández Morales', 19.594763, -99.267734),
  (169355, 'Raúl Muñoz', 19.389499, -99.05522),
  (638545, 'Guillermo Obed Becerril', 19.638113, -99.228047),
  (640753, 'Daniel Aceves', 19.337961, -99.208294),
  (645452, 'Miguel De Jesus Sanchez Esparza', 19.438802, -99.262109),
  (501347, 'Jose Carlos García', 19.546227, -99.042967),
  (652738, 'Oscar Quezada', 19.667892, -99.210316),
  (650932, 'Edgar Villagran', 19.656238, -99.096016),
  (666984, 'Pedro Miguel Martinez Miron', 19.570141, -99.022563),
  (672466, 'Adrian León Guerrero', 19.535538, -99.165766),
  (677324, 'Marco Antonio León Guerrero', 19.533038, -99.158672),
  (679939, 'Ulises Mayorga', 19.471938, -99.153563),
  (681749, 'Emmanuel Vargas Nieto', 19.393138, -99.124922),
  (352328, 'Luis Israel Lopez Pedroza', 19.421326, -99.096027),
  (690662, 'Jonathan Arteaga Martinez', 19.347981, -99.217753),
  (522726, 'Alejandro Salvador López Labastida', 19.631938, -99.029234),
  (629896, 'Rigoberto Lopez Garcia', 19.315088, -99.160391),
  (694161, 'Alfredo Trillo', 19.442038, -99.278484),
  (691442, 'Christian Ivan Martinez - Utilitario Pequeno', 19.247463, -99.112391),
  (680914, 'Jonatan Cruz Vázquez', 19.557389, -99.032611),
  (682228, 'Luis Guillermo Ortiz Ramos', 19.396376, -99.142219),
  (678901, 'Francisco Javier Pérez Arroyo', 19.292377, -99.031465),
  (699117, 'Jesus Alberto García Ramírez', 19.297901, -99.163828),
  (694864, 'Luis Javier León García', 19.329608, -99.151579),
  (238884, 'Dorian Rosas', 19.377951, -99.075484),
  (709032, 'Edgar Covarrubias', 19.379603, -99.104807),
  (710090, 'Erick Caballero Villagomez', 19.275233, -99.179508),
  (712809, 'Eduardo Loyola', 19.351613, -99.048984),
  (711802, 'Roberto Carlos Estevez', 19.243138, -99.146359),
  (30751, 'Luis Alberto Rodríguez', 19.559393, -99.209208),
  (715610, 'Erick Flores Camacho', 19.461222, -99.133083),
  (724435, 'Rafael Sanchez Rodriguez', 19.631871, -99.133023),
  (733594, 'Alexis Caballero', 19.451013, -99.273609),
  (711105, 'Israel Orozco', 19.386219, -99.213815),
  (743969, 'Eduardo Alavez', 19.583048, -98.984471),
  (744484, 'Cesar Tadeo Rubio Carrillo', 19.382402, -99.229727),
  (748326, 'Benjamin Guzman', 19.619151, -99.144923),
  (747781, 'Nicholas Centeno', 19.601421, -99.1765),
  (748617, 'Juan Bernal', 19.268829, -99.203317),
  (718400, 'César Augusto Galaz', 19.466938, -99.110547),
  (748721, 'Erik Rodolfo Rosas Reyes', 19.357614, -99.074204),
  (694360, 'Daniel López', 19.404779, -98.909358),
  (756757, 'Víctor Alfonso Ramos Lopez', 19.415913, -99.044391),
  (750369, 'Roberto Pavón Vergara', 19.367788, -99.113954),
  (759836, 'Sergio Mateo Pedraza', 19.506917, -99.015722),
  (772241, 'Emerson René Arruel Flores', 19.516694, -99.036694),
  (771975, 'Martin Rosa', 19.557472, -99.032639),
  (774392, 'Ricardo Baleon', 19.445306, -99.125556);

commit;
