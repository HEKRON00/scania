# Registro de cambios · ScanIA 2.0 → 2.1

Base: commit `3465061` (ScanIA 2.0). Cada cambio lleva el identificador del hallazgo de [`AUDITORIA_INDEPENDIENTE_2_0.md`](AUDITORIA_INDEPENDIENTE_2_0.md) y la prueba automática que lo cubre.

> **Ninguna corrección de esta lista se probó con un carro real ni con los adaptadores físicos.** Las pruebas usan un ELM327 falso, el adaptador virtual del simulador y Chrome sin pantalla. El plan de prueba física está en [`PRUEBAS_FISICAS.md`](PRUEBAS_FISICAS.md).

## Pruebas al cerrar la versión

| Conjunto | Comando | Resultado |
|---|---|---|
| Lógica, OBD, análisis, IA, servidor y regresiones | `npm test` | 73 de 73 aprobadas |
| Interfaz en Chrome sin pantalla (escritorio 1280 px y celular 390 px) | `python3 tests/e2e.py` | 46 de 46 verificaciones aprobadas |
| Pantalla de IA con servidor falso | `python3 tests/e2e_ia.py` | aprobada |
| Prueba física con adaptadores y carro | `docs/PRUEBAS_FISICAS.md` | **No realizada** |

## Críticos

| ID | Corrección | Archivos | Prueba |
|---|---|---|---|
| A-01 | `muestra()` devuelve solo datos frescos (los rápidos de esta vuelta; los lentos de hace menos de 20 s). La pantalla usa `ultimos()` y marca el dato viejo. | `elm327.js`, `ui_conexion.js` | `regresiones_2_1` A-01 |
| A-02 | Rangos físicos por sensor (`S.RANGOS_FISICOS`, `S.valorPlausible`). Lo imposible se excluye del análisis y genera "dato imposible" con prueba eléctrica; saltos de temperatura imposibles; la pantalla marca "⚠ dato imposible". | `datos.js`, `analizador.js`, `ui_conexion.js` | A-02 |
| A-03 | `S.almacen.ultimoError` y `S.almacen.alFallar()`; aviso en pantalla con sugerencia de respaldo; espacio usado en *Más → Respaldo*. | `almacen.js`, `app.js`, `ui_mas.js` | A-03 |

## Altos

| ID | Corrección | Archivos | Prueba |
|---|---|---|---|
| A-04 | Se lee el mapa de sensores de oxígeno (PID 13 o 1D) y se crean solo los sensores presentes, con su ubicación real (B1S1…B4S2): voltaje, ajuste por sensor (`FF` = no usado), λ, voltaje y corriente de banda ancha. | `datos.js`, `elm327.js`, `analizador.js` | A-04 (13 y 1D), `logica` PIDs |
| A-05 | Modo 06 en protocolos no CAN (ISO 9141-2, KWP2000, J1850): mapa `06 00`, registros `46 TID TLTCID valor límite`, tipo de límite (máximo/mínimo) y si pasó. Se muestra en valores originales, sin inventar a qué pieza corresponde. | `elm327.js`, `datos.js`, `analizador.js`, `ui_pruebas.js`, `adaptador_virtual.js` | `obd` protocolos viejos |
| A-06 | Certeza calculada por **fuentes distintas** (datos en vivo, computadora, prueba guiada, cálculo); el título describe la condición medida, no la pieza. | `analizador.js` | A-06 |
| A-07 | Reglas de mezcla para motores con MAP: causas distintas, análisis de vacío en ralentí (`vacio_bajo`), sensor MAP con motor apagado contra presión barométrica. | `analizador.js`, `pruebas.js` | A-07 |
| A-08 | Voltaje con motor encendido y apagado en estados separados; nota sobre alternadores con control de carga. | `analizador.js`, `informes.js` | A-08 |
| A-09 | Se eliminó la prueba que pedía acelerar a fondo en marcha. La nueva "Sensor MAF contra MAP" se hace estacionado. | `pruebas.js`, `simulador.js` | A-09 |
| A-10 | La prueba del sensor de oxígeno mide la velocidad de lectura: con menos de 4 lecturas por segundo da "no concluyente". | `pruebas.js` | `logica` pruebas guiadas |
| A-11 | Detección de reinicio del adaptador (bienvenida o eco que reaparece), reconfiguración con el protocolo ya detectado y lectura marcada como cortada. | `elm327.js` | A-11 |
| A-12 | `S.clasificarLineas()` reconoce todos los mensajes de error del ELM327; se registran y se cuentan; `NO DATA` no se reintenta. | `elm327.js` | A-12 (×2) |
| A-13 | Perfil "Honda CR-V 1997–2001 (B20)" con lo genérico / de la marca / físico; regla de códigos de transmisión que explica la luz D4 y el PCM. | `perfiles.js`, `analizador.js`, `ui_carros.js` | Perfil Honda CR-V, A-20 |
| A-14 | La guía de mezcla orienta hacia fugas, combustible o sensores sin afirmar la causa. | `pruebas.js` | `logica` pruebas guiadas |

## Medios

| ID | Corrección | Prueba |
|---|---|---|
| A-15 | Freeze frame según su mapa (`02 00 00`). | A-15 |
| A-16 | Respuestas negativas `7F` traducidas (11, 12, 22, 31, 78…) y mostradas, incluido el borrado rechazado. | A-16 |
| A-17 | Aviso si la cantidad de códigos que declara la computadora no coincide con los entregados. | A-17 |
| A-18 | Fin del flujo del puerto y evento `disconnect` cierran la conexión de inmediato. | A-18 |
| A-19 | Lista de adaptadores recordados con opción "Olvidar". | A-19 |
| A-20 | Reglas nuevas: sensor MAP, vacío bajo, EGR, circuito de inyector, circuito de bobina, presión de combustible, transmisión, temperaturas de aceite y catalizador. | A-20, A-07 |
| A-21 | Cada hallazgo trae urgencia (detener / pronto / programar / vigilar), condiciones de medición, referencia aplicable y qué no se puede distinguir. | A-21 |
| A-22 | 15 síntomas marcables; el análisis dice si los datos los explican, que coincidir no prueba la causa, y qué revisar si el OBD no los ve. | A-22, `e2e` |
| A-23 | Código pendiente = evidencia débil; confirmado y pendiente se nombran distinto. | A-23, A-20 |
| A-24 | Termostato evaluado por la forma de la curva (meseta baja), no solo por tiempo. | `logica` pruebas guiadas |
| A-25 | Respuesta de la IA cortada (`max_tokens`) marcada como incompleta y avisada. | A-25 |
| A-26 | `S.verificarRespuestaIA()` avisa si la IA cita códigos no leídos o lecturas de MAF en un carro sin MAF. | A-26, `e2e_ia` |
| A-27 | La IA recibe sensores reportados y NO reportados, velocidad de lectura, avisos del adaptador, perfil y síntomas marcados. | A-27, `e2e` |
| A-28 | Servidor: bloqueo por IP tras 6 códigos equivocados en 15 minutos. | A-28 |
| A-29 | Odómetro en millas por carro (se guarda en km) y en la revisión de usado. | A-29, `e2e` |
| A-30 | Adaptador virtual "Honda 2000 (ISO 9141-2, MAP)" para probar el controlador real con un protocolo no CAN. | A-30, `e2e` |

## Bajos

| ID | Corrección |
|---|---|
| A-31 | La prueba de O2 distingue sensor de voltaje y de banda ancha (sin hablar de "4 cables"). |
| A-32 | Las referencias de batería dicen de qué dependen (tipo de batería, temperatura, medición en el conector). |
| A-33 | El apodo del carro ya no se envía a la IA; botón **Ver qué se envía**. (prueba A-27, `e2e`) |
| A-34 | Comentario de `ia.js` corregido. |
| A-35 | Solo enlaces `http(s)` en fuentes. (prueba A-35) |
| A-36 | Máximo 6 fotos por consulta en el servidor. (prueba A-36) |
| A-37 | `getInfo()` y `connected` en el diagnóstico de conexión. |
| A-38 | Documentos nuevos: auditoría, compatibilidad real, Honda CR-V, pruebas físicas, este registro; matriz en el README. |
| A-39 | Eliminado el evento "a fondo" del simulador junto con A-09. |

## Funciones nuevas en 2.1

- **Diagnóstico de conexión** exportable (`.txt` / `.json`): navegador, Web Serial, BLE, adaptador, protocolo, encabezados, sensores, velocidad, errores y respuestas negativas. VIN tapado.
- **Perfiles de vehículo** ampliables (`S.registrarPerfil`, exige fuente) y contraste entre lo esperado y lo que respondió el carro.
- **Datos del manual** por carro (ralentí, termostato, ventilador, compresión, presión de combustible, voltaje de carga), usados por las pruebas.
- **Pruebas guiadas** reorganizadas por sistema, con 8 partes cada una (preparación, herramientas, procedimiento, condiciones, referencias, interpretación, resultado, próxima prueba). Nuevas: arranque, caída de voltaje en cables, ralentí, MAF contra MAP, calentamiento, refrigeración, comparación de sensores, acelerador, compresión y presión de combustible (estas dos con resultados del taller). Veredicto "no concluyente" cuando los datos no alcanzan.
- **Síntomas** en el análisis local.
- **Simulador**: elección de carro simulado (moderno CAN con MAF, Honda 2000 ISO 9141-2 con MAP).
- **IA**: evidencias usadas, limitaciones, revisión automática de la respuesta y vista previa de lo que se envía.
- PIDs nuevos: presión del riel relativa al vacío (22), error de EGR (2D), presión de vapores EVAP (32), temperatura del catalizador B2S1 (3D), acelerador relativo (45), norma OBD (1C) y tipo de combustible (51).

## Pendiente (no implementado, a propósito)

- **Servicio $05** (resultados de sensores de oxígeno en protocolos no CAN): no se encontró una fuente verificable del formato; no se inventó.
- **Puente nativo para Android**: documentado en `COMPATIBILIDAD_REAL.md`, solo si la prueba física demuestra que Chrome no conecta los adaptadores.
- **Validación del perfil Honda** con información de servicio de Honda y con el carro real.
- **Todas las pruebas físicas.**
