# Auditoría independiente de ScanIA 2.0

Fecha: noviembre 2026 · Rama auditada: `main` (commit `3465061`) · Alcance: todo el repositorio (20 áreas pedidas).

**Método.** Se leyó el código completo sin dar por buenas la documentación ni las 44 pruebas anteriores. Cada hallazgo se comprobó contra el código (función y línea) y, cuando fue posible, con una prueba nueva que lo reproduce. Fuentes técnicas usadas: SAE J1979 (formatos de servicios $05/$06 para protocolos no CAN), tabla pública de PIDs OBD-II (fórmulas de los PIDs 13, 14–1B, 1D, 24–2B, 34–3B) y la documentación de Chrome sobre Web Serial por Bluetooth.

**Lo que esta auditoría NO pudo hacer:** conectar un carro real ni los adaptadores físicos. Todo lo que depende del hardware queda marcado como "sin prueba física".

Clasificación: **CRÍTICO** (puede dar un diagnóstico o un dato falso sin avisar, o perder información), **ALTO** (diagnóstico incompleto o engañoso en casos comunes, o riesgo de seguridad), **MEDIO** (falla funcional con salida visible o caso menos común), **BAJO** (calidad, redacción, mejoras).

Cada hallazgo tiene un identificador (A-xx) que se usa en `REGISTRO_DE_CAMBIOS_2_1.md` y en las pruebas de regresión.

---

## Resumen

| Nivel | Cantidad | Áreas más afectadas |
|---|---|---|
| CRÍTICO | 3 | datos en vivo, motor de diagnóstico, almacenamiento |
| ALTO | 11 | OBD-II (sensores O2, modo 06), diagnóstico, pruebas guiadas, conexión |
| MEDIO | 16 | protocolo ELM327, freeze frame, IA, servidor, interfaz |
| BAJO | 9 | redacción, documentación, detalles de seguridad |

Lo que sí estaba bien y se conserva: cola de comandos (nunca manda dos comandos a la vez), resincronización tras respuestas tardías, encabezados CAN con armado ISO-TP, validación de cada respuesta por servicio y PID, clave de Anthropic fuera de la app, VIN apagado por defecto, escape de HTML en todo lo que muestra texto de la IA, respaldo sin claves, confirmación antes de borrar códigos.

---

## CRÍTICO

### A-01 · Datos viejos tratados como lecturas nuevas
- **Archivo / función:** `src/elm327.js` → `ELM327.muestra()`
- **Evidencia:** la función devuelve `{ t: ahora, ...this._ultimos }`. Si un PID deja de responder (NO DATA, respuesta cortada, sensor desconectado), su último valor se sigue copiando en cada muestra nueva con la hora actual.
- **Consecuencia:** el motor de diagnóstico analiza valores que el carro ya no está enviando. Un sensor de oxígeno que dejó de responder aparece "plano" y se diagnostica como "sensor lento"; ajustes de combustible congelados ocultan una mezcla que cambió. Contradice la regla "no mostrar valores inventados cuando un sensor no responda".
- **Solución:** cada muestra lleva solo los datos leídos en esa vuelta (los rápidos) o hace menos de 20 s (los lentos). La interfaz sigue mostrando el último valor, marcado como "dato viejo".

### A-02 · Sensor de temperatura en corto diagnosticado como "motor sobrecalentado"
- **Archivo / función:** `src/analizador.js` → `reglaTemperatura()`, `reglaContradicciones()`
- **Evidencia:** solo se considera imposible una temperatura ≤ −35 °C. Un sensor en corto entrega el byte `FF` = 215 °C, que pasa a la regla de sobrecalentamiento (`t.max >= 108`).
- **Consecuencia:** la app dice "Motor SOBRECALENTADO (215 °C), apagá el motor" por un cable o sensor en corto, y no señala la falla real (circuito del sensor).
- **Solución:** rangos físicos por sensor (`S.RANGOS_FISICOS`); los valores fuera de rango se excluyen de las estadísticas y generan un hallazgo de "dato imposible" con la prueba eléctrica correspondiente. También se detectan saltos imposibles (más de 15 °C en 2 s).

### A-03 · Fallas de escritura del almacenamiento silenciosas
- **Archivo / función:** `src/almacen.js` → `escribir()`, `guardarEscaneo()`, `guardarCarro()`
- **Evidencia:** si `localStorage` está lleno o bloqueado, `escribir()` devuelve `false` y el dato queda solo en memoria. Ninguna función avisa: la app muestra "escaneo guardado" aunque se perderá al cerrar.
- **Consecuencia:** pérdida de escaneos (incluido el que se guarda antes de borrar códigos) sin que el usuario lo sepa.
- **Solución:** `S.almacen.ultimoError` y aviso `S.almacen.alFallar(info)`; la interfaz muestra el problema y sugiere exportar un respaldo. Se agrega `S.almacen.uso()` para ver el espacio ocupado.

---

## ALTO

### A-04 · Sensores de oxígeno: solo banco 1
- **Archivo:** `src/datos.js` → `S.PIDS`
- **Evidencia:** solo existen `o2_b1s1` (PID 14), `o2_b1s2` (15) y el A/F de banco 1 (24/34). No se leen los PIDs 16–1B, 25–2B, 35–3B, ni el mapa de ubicación (PID 13 o 1D). El byte B de los PIDs 14–1B (ajuste corto de ese sensor; `FF` = no usado) se ignora.
- **Consecuencia:** en motores V6/V8 no se ve el banco 2; con el mapa del PID 1D los PIDs 16–1B significan sensores distintos, así que asignarlos "a ciegas" daría nombres equivocados.
- **Solución:** se lee el PID 13 o 1D y se generan los sensores presentes con su nombre real (B1S1…B4S2), voltaje, ajuste por sensor, λ, voltaje y corriente de banda ancha.

### A-05 · Modo 06 solo en CAN
- **Archivo / función:** `src/elm327.js` → `leerPruebas06()`
- **Evidencia:** la función devuelve `disponible: false` en cuanto el protocolo no es CAN. SAE J1979 define el servicio $06 también para ISO 9141-2, ISO 14230-4 y J1850, con otro formato: `46 TID TLTCID TVHI TVLO TLHI TLLO`, donde el bit más alto del TLTCID dice si el límite es máximo o mínimo.
- **Consecuencia:** en carros como el Honda CR-V 2000 (ISO 9141-2 probable) no se leía ningún resultado de monitoreo.
- **Solución:** se implementa el formato no CAN. Como los TID y CID de ese formato los define cada fabricante, la app muestra los valores originales (0–65535), el tipo de límite y si pasó o falló según la computadora, y explica que no hay una correspondencia validada.

### A-06 · Certeza que cuenta dos veces la misma evidencia y títulos que afirman la causa
- **Archivo:** `src/analizador.js` (`certeza()`, `reglaMezcla`, `reglaMAF`, `reglaPruebas06`) y `src/ia.js` (`PROMPT_SISTEMA`)
- **Evidencia:** "confirmada" = 2 evidencias "independientes", pero se suman cosas que no lo son: el código P0171 se enciende **por** los ajustes de combustible altos, y el P0302 sale del mismo monitor que los contadores del modo 06. El título decía "patrón de fuga de vacío" como si la causa estuviera comprobada.
- **Consecuencia:** se presenta como confirmada una causa que solo es la más probable (correlación tomada como causalidad).
- **Solución:** la certeza se refiere a la **condición medida** (mezcla pobre, fallo en el cilindro 2), y cada causa lleva su "apoyo" y un texto `distinguir` que dice qué prueba separa una causa de otra. Se agrupan las evidencias por fuente (computadora, datos en vivo, prueba del usuario).

### A-07 · Reglas de mezcla pensadas solo para motores con sensor MAF
- **Archivo / función:** `src/analizador.js` → `reglaMezcla()`
- **Evidencia:** el patrón "pobre en ralentí que mejora al acelerar = fuga de vacío" es típico de motores con MAF (el aire que entra por la fuga no se mide). En motores con sensor MAP ("speed density", como el B20Z del CR-V) la computadora calcula el aire con la presión del múltiple, que sí incluye el aire de la fuga: la fuga aparece más como presión de múltiple alta y ralentí alto o inestable que como ajuste de combustible alto.
- **Consecuencia:** en el carro de la familia (Honda con MAP) una fuga de vacío podía pasar sin detectarse o atribuirse a otra cosa.
- **Solución:** se detecta el tipo de medición (MAF si el carro reporta el PID 10, MAP si no) y las reglas y causas cambian según el tipo. Regla nueva de vacío en ralentí (MAP contra barométrica).

### A-08 · Voltaje con motor encendido y apagado mezclados
- **Archivo / función:** `src/analizador.js` → `reglaVoltaje()`, `S.resumir()`; `src/informes.js` → `revisionUsado()`
- **Evidencia:** `motor_encendido` sale solo de la última muestra. Si el motor estuvo encendido y luego se apagó, el promedio de voltaje (que incluye 14 V del alternador) se evalúa como "batería en reposo".
- **Consecuencia:** batería descargada reportada como normal, o alternador evaluado con muestras de motor apagado.
- **Solución:** estadísticas de voltaje separadas por estado (encendido, apagado con llave en ON) y reglas distintas para cada una.

### A-09 · Prueba guiada que pedía acelerar a fondo en marcha
- **Archivo:** `src/pruebas.js` → prueba `eficiencia`
- **Evidencia:** "en 2da o 3ra marcha, pisá el acelerador a fondo desde 2,000 hasta 5,000 rpm", aunque pedía que otra persona manejara.
- **Consecuencia:** una prueba peligrosa que se hace manejando. Va contra la regla de no ordenar operaciones mientras se conduce.
- **Solución:** se reemplaza por una comparación MAF contra MAP **con el carro estacionado** (ralentí y 2,500 rpm). La prueba en carretera queda derivada a un profesional.

### A-10 · Prueba del sensor de oxígeno sin revisar la velocidad de lectura
- **Archivo:** `src/pruebas.js` → prueba `o2`; `S.crucesO2()`
- **Evidencia:** cuenta cruces de 0.45 V en 10 s y exige 8 o más. No mira cuántas lecturas por segundo hubo. En ISO 9141-2 (o con un clon lento) puede haber 2–4 lecturas por segundo: un sensor sano que cambia 1–2 veces por segundo aparece lento.
- **Consecuencia:** falso "sensor lento"; se cambiaría un sensor bueno.
- **Solución:** se calcula la frecuencia de muestreo y, si es menor de 4 lecturas por segundo, el resultado es "no concluyente" con la explicación. También se permite elegir el sensor (banco 1 o banco 2).

### A-11 · Adaptador que se reinicia (por ejemplo al dar arranque) no se detectaba
- **Archivo / función:** `src/elm327.js` → `_enviar()`, `_consulta()`
- **Evidencia:** si el ELM327 se reinicia por bajo voltaje (respuestas `LV RESET`, el texto `ELM327 v…` o la vuelta del eco), vuelve a su configuración de fábrica: eco, espacios y encabezados desactivados. La app seguía esperando encabezados.
- **Consecuencia:** después de la prueba de arranque, los datos podían dejar de leerse sin explicación.
- **Solución:** se detecta el reinicio y se vuelve a configurar el adaptador (ATE0, ATL0, ATS0, ATH1/ATH0, ATAT1) antes de seguir. Queda en el registro técnico.

### A-12 · Mensajes de error del ELM327 descartados en silencio
- **Archivo / función:** `src/elm327.js` → `_consulta()`
- **Evidencia:** solo se reconocía `UNABLE TO CONNECT`. `BUFFER FULL`, `<DATA ERROR`, `CAN ERROR`, `BUS ERROR`, `BUS BUSY`, `FB ERROR`, `STOPPED`, `?` y `ERRxx` se descartaban como líneas sin datos.
- **Consecuencia:** respuestas cortadas o con error contadas como "sin dato", sin reintento ni registro.
- **Solución:** `S.clasificarLineas()` separa datos, errores, respuestas negativas y señales de reinicio. Los errores de transmisión se reintentan y quedan registrados.

### A-13 · Transmisión: el PCM y la luz D4 del CR-V no estaban contemplados
- **Archivo:** `src/fabricantes.js`, documentación
- **Evidencia:** no existía ningún perfil por modelo. En el CR-V 1997–2001 la transmisión automática la controla el PCM y sus fallas se avisan con la luz D4 parpadeando; el OBD-II genérico solo muestra los códigos P que el PCM decida reportar.
- **Consecuencia:** el usuario podía creer que "sin códigos" significa transmisión sana.
- **Solución:** perfil Honda ampliable (`src/perfiles.js`) con lo que el OBD-II genérico puede y no puede ver, y documento `HONDA_CRV_2000_B20Z.md`.

### A-14 · Guía de prueba de mezcla que afirma la causa
- **Archivo:** `src/pruebas.js` → prueba `mezcla`
- **Evidencia:** el resultado decía "Fuga de vacío: …" como hecho, y el paso a 2,500 rpm no exigía lazo cerrado ni motor caliente.
- **Consecuencia:** lecturas en lazo abierto mezcladas; causa afirmada sin prueba.
- **Solución:** condiciones de medición completas (motor caliente y lazo cerrado), resultado expresado como patrón compatible y prueba física que lo confirma.

---

## MEDIO

| ID | Archivo / función | Evidencia | Consecuencia | Solución |
|---|---|---|---|---|
| A-15 | `elm327.js` → `leerFreezeFrame()` | Pide una lista fija de PIDs sin leer el mapa del freeze frame (`02 00 00`) | Faltan datos guardados (O2, MAP, λ…) y se pierden consultas en PIDs que no están | Se lee el mapa del freeze frame y se piden todos los PIDs que la app sabe interpretar |
| A-16 | `elm327.js` → `_consulta()`, `borrarCodigos()` | Las respuestas negativas `7F` no se interpretan | Un "7F 04 22" (condiciones incorrectas, motor encendido) se mostraba como "el carro no confirmó" | Se traducen los códigos de respuesta negativa (11, 12, 22, 31, 78…) y se muestran al usuario |
| A-17 | `elm327.js` → `leerTodo()` | No se compara la cantidad de códigos que dice la computadora (PID 01) con los que se leyeron | Códigos que la computadora no entregó pasan inadvertidos | Aviso "la computadora dice N, se leyeron M" |
| A-18 | `elm327.js` → `TransporteSerial._bucle()` | Si el flujo termina con `done` (sin error), el bucle sale sin llamar a `alCerrar` | La app sigue creyendo que está conectada hasta acumular 8 tiempos agotados | Se llama a `alCerrar` y se escucha el evento `disconnect` del puerto |
| A-19 | `ui_conexion.js` → "Usar el adaptador de siempre" | Siempre usa `getPorts()[0]` | Con dos adaptadores (el caso del usuario) no se puede elegir cuál | Lista de adaptadores recordados con opción de olvidar |
| A-20 | `analizador.js` | No hay reglas para sensor MAP, EGR, presión de combustible, inyectores ni bobinas por código | Diagnósticos pedidos (fase 3) sin cubrir | Reglas nuevas con evidencia, condiciones y pruebas |
| A-21 | `analizador.js` → `H()` | Los hallazgos no dicen en qué condiciones se midió, ni valores de referencia aplicables, ni urgencia explícita | El usuario no puede juzgar si la medición es válida | Campos `condiciones`, `referencia`, `urgencia`, `distinguir` |
| A-22 | `analizador.js` | Los síntomas del usuario solo se usaban en la IA | El análisis local no relaciona síntomas con datos | Lista de síntomas y regla que dice si los datos los respaldan o no, y qué prueba física hace falta |
| A-23 | `analizador.js` | Códigos pendientes contados igual que los confirmados | Sobreestima la evidencia | Se distingue confirmado / pendiente / permanente en la evidencia |
| A-24 | `pruebas.js` → `calentamiento` | Exige llegar a 85 °C en 12–15 min en ralentí | Falso "termostato malo" en días frescos o motores que calientan lento en ralentí | Se evalúa la forma de la curva (meseta baja = termostato abierto) y no solo el tiempo |
| A-25 | `ia.js` → `llamar()` | No se detecta `stop_reason: "max_tokens"` | Un JSON cortado se muestra como texto suelto sin aviso | Se marca la respuesta como incompleta y se avisa |
| A-26 | `ia.js` | No se revisa si la IA menciona códigos que no se leyeron | La IA podría inventar un código sin que nadie lo note | `S.verificarRespuestaIA()` marca códigos y sensores que no están en los datos |
| A-27 | `ia.js` → `construirContexto()` | No manda la lista de sensores que el carro NO reporta ni la calidad de los datos | La IA puede suponer lecturas que no existen | Se envían sensores disponibles/no disponibles, velocidad de muestreo, avisos del adaptador y perfil del vehículo |
| A-28 | `servidor/worker.js` | Un código familiar equivocado solo espera 400 ms; no hay bloqueo por intentos | Se puede probar códigos sin límite práctico | Bloqueo por IP tras 6 intentos fallidos en 15 min |
| A-29 | `informes.js` → `revisionUsado()` | Compara km declarados con el odómetro de la computadora sin considerar millas | En carros importados de EE. UU. (tablero en millas) da "kilometraje manipulado" falso | Unidad del odómetro por carro y en la revisión de usado |
| A-30 | `adaptador_virtual.js` | El adaptador virtual solo habla CAN | Las pruebas de integración nunca pasaban por ISO 9141-2 | Perfil virtual "Honda 2000 ISO 9141-2" sin MAF, con MAP y modo 06 no CAN (siempre marcado como simulador) |

## BAJO

| ID | Archivo | Evidencia | Solución |
|---|---|---|---|
| A-31 | `pruebas.js` (O2) | Dice "sensor de 4 cables" como si eso definiera el tipo | Se habla de sensor de voltaje (0–1 V) frente a banda ancha (A/F) |
| A-32 | `pruebas.js` (batería) | Referencias presentadas como universales | Cada referencia dice de qué depende (tipo de batería, temperatura, medición en el conector OBD) |
| A-33 | `ia.js` | El apodo del carro (ej. "de mamá") se enviaba a la IA | Se excluye; se agrega "Ver qué se envía" antes de consultar |
| A-34 | `ia.js` | Comentario inicial dice "llamado directo desde el navegador" | Corregido |
| A-35 | `ui_ia.js` | Los enlaces de fuentes no filtraban el esquema de la URL | Solo se aceptan `http(s)://` |
| A-36 | `servidor/worker.js` | Sin límite de cantidad de fotos (solo tamaño total) | Máximo 6 imágenes por consulta |
| A-37 | `elm327.js` | `getInfo()` y el atributo `connected` (Chrome 130+) no se usaban en el diagnóstico | Se incluyen en el diagnóstico de conexión |
| A-38 | Documentación | README y COMPATIBILIDAD no tenían la matriz pedida ni separaban prueba automática de física | Nuevos documentos 2.1 |
| A-39 | `adaptador_virtual.js` / pruebas | La prueba guiada de eficiencia dependía de un evento "a fondo" que solo existe en el simulador | Se elimina junto con A-09 |

---

## Áreas revisadas sin hallazgos relevantes

- **Cola de comandos** (`ELM327.comando`): serializa todos los comandos; nunca hay dos en vuelo.
- **Seguridad de credenciales**: la clave de Anthropic no aparece en el código, el HTML, `localStorage` ni el respaldo; la versión vieja que la guardaba se limpia al abrir la app.
- **Escape de HTML**: todo texto que viene de la IA, de códigos o del usuario se escapa antes de mostrarse (`U.esc`, `U.md`).
- **Borrado de códigos**: exige confirmación explícita y guarda el escaneo antes.
- **PWA**: caché versionada, red primero, solo se registra en https o localhost.
- **Exportar / importar**: no exporta el código familiar salvo que se pida, nunca importa claves, reasigna los ids de carro.

## Límites de esta auditoría

- Sin vehículo ni adaptadores físicos: todo lo relacionado con tiempos reales de Bluetooth, clones específicos y respuestas reales del Honda queda para `PRUEBAS_FISICAS.md`.
- El servicio $05 (monitoreo de sensores de oxígeno en protocolos no CAN) existe en el estándar, pero el formato exacto de la consulta de TIDs soportados no se pudo confirmar con fuentes públicas: no se implementa para no inventar comandos. Queda como pendiente documentado.
