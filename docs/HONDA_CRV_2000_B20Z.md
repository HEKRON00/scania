# Honda CR-V 2000 · motor B20Z · automático · 4x4 · volante a la izquierda

Perfil de ScanIA: `honda_crv_1g` en `src/perfiles.js` (Honda CR-V 1997–2001, motor B20). Se activa solo si el carro guardado dice Honda + CR-V + año 1997–2001, si el VIN empieza con `JHL`/`SHS` y tiene `RD1` en las posiciones 4–6, o si el código de motor empieza con `B20`.

> **Estado: perfil sin validar con información de fábrica de Honda y sin prueba física.** ScanIA no tiene el manual de servicio de Honda. Todo lo que aquí dice "esperado" se confirma (o se corrige) en la primera conexión con el carro real.

**Regla del perfil:** no agrega comandos propietarios de Honda ni valores de fábrica. Solo dice qué se puede ver por OBD-II genérico, qué necesita el equipo de la marca y qué necesita pruebas físicas. Los valores del manual los escribe el dueño en *Carros → Editar → Datos del manual* y las pruebas los usan para comparar.

---

## 0. Antes de conectar: ¿tu CR-V es OBD-II?

1. **Buscá el conector de 16 pines** (forma de trapecio). En los CR-V de EE. UU. de esta generación, según las guías de ubicación, está **debajo del tablero junto a la consola central, del lado del pasajero** (a la altura de la rodilla izquierda del pasajero), no debajo del timón.
2. **Si solo encontrás un conector Honda de 3 pines** (y otro de 2 pines de servicio), el carro es de un mercado donde se usó el sistema anterior: **no es OBD-II** y ningún ELM327 lo va a leer. Hay reportes de que algunos CR-V de fin de la generación (otros mercados) traen el de 16 pines en otra posición: buscalo con una lámpara.
3. En el capó o en el manual puede haber una etiqueta de emisiones que diga *OBD II certified*: ayuda a confirmarlo.
4. **Tablero en millas** (carro importado de EE. UU.): en *Carros → Editar*, elegí "millas" junto al odómetro. ScanIA guarda internamente en km y la revisión de usado no da falsos "kilometraje manipulado".

## 1. Lo que se espera encontrar (se confirma al conectar)

| Dato | Esperado | Cómo lo confirma ScanIA |
|---|---|---|
| Protocolo | ISO 9141-2 (lo más común en Honda OBD-II de esa época) | `ATDPN`/`ATDP` al conectar; la app usa el que detecte. Si responde por CAN, avisa que no coincide con lo esperado. |
| Medición de aire | Sensor **MAP** (sin MAF) | PIDs soportados: si aparece el `0B` (MAP) y no el `10` (MAF), el análisis usa las reglas de motor con MAP. Si aparece MAF, avisa que no coincide. |
| Velocidad de lectura | Lenta: un dato por consulta (no CAN) | Se mide en el diagnóstico de conexión. Con menos de ~4 lecturas por segundo, la prueba del sensor de oxígeno queda "no concluyente". |
| Sensores de oxígeno | Uno antes y uno después del catalizador (banco 1). Puede variar por mercado y norma de emisiones: algunos Honda de la época usaban sensor de banda ancha (A/F) como primario. | Mapa del PID `13` o `1D`. ScanIA genera solo los sensores presentes y elige voltaje (PIDs 14–1B) o λ (24–2B / 34–3B) según lo que el carro reporte. |
| Voltaje | Probablemente sin PID `42` | Usa `ATRV` (voltaje medido por el adaptador en el conector). |
| VIN por OBD (modo 09) | Probablemente no disponible | Si no responde, se pide escribirlo a mano (está en el parabrisas y en la puerta). |
| Modo 06 | Formato no CAN: números de prueba (TID) y componente definidos por Honda | ScanIA muestra **los valores originales**: TID, componente, valor, límite, si es máximo o mínimo y si pasó. No inventa a qué pieza corresponde cada TID. |
| Encendido | Distribuidor (una bobina para todos los cilindros) | El análisis no sugiere "bobina de un cilindro" ante un fallo en un solo cilindro. |

## 2. A · Lo que ScanIA puede ver por OBD-II genérico

- Códigos de falla del motor confirmados (modo 03) y pendientes (modo 07), y los de transmisión que el PCM reporte como códigos P. Códigos permanentes (modo 0A): raros en carros de esta edad.
- Luz check engine, estado de los monitores de emisiones y freeze frame (con su mapa de PIDs).
- Datos en vivo que el carro diga soportar; lo típico de la época: RPM, velocidad, temperatura del motor y del aire de admisión, MAP, acelerador, carga calculada, avance de encendido, ajustes de combustible corto y largo, estado del lazo (abierto/cerrado), sensores de oxígeno.
- Voltaje en el conector OBD (lo mide el adaptador).
- Modo 06 no CAN en valores originales.
- Análisis local: vacío en ralentí con el MAP, mezcla (ajustes en ralentí contra 2,500 rpm), temperatura y curva de calentamiento, comparación de sensores con el motor frío (temperatura del motor, del aire y MAP contra presión barométrica), fallos de encendido por código y estabilidad del ralentí.

## 3. B · Lo que requiere el escáner de Honda o su información de servicio

- **Transmisión automática**: en esta generación la controla la computadora del motor (PCM). Si la luz **D4 parpadea**, hay una falla de transmisión guardada. El OBD genérico puede mostrar códigos P de transmisión, pero no los datos propios de la transmisión (solenoides, presiones, temperatura del aceite si existe) ni su detalle.
- ABS, bolsas de aire (SRS) y otros módulos: no responden por OBD-II genérico.
- Datos propios del PCM de Honda que no son PIDs estándar (por ejemplo, válvula de control de ralentí, detector de carga eléctrica ELD, solenoides).
- Significado de cada número de prueba del modo 06 (TID/componente).
- Códigos por destellos con el conector de servicio y procedimientos de reaprendizaje (por ejemplo, del ralentí después de desconectar la batería): según el manual de servicio.

## 4. C · Lo que requiere pruebas físicas

- Compresión de cada cilindro (compresímetro, en el taller) y, si sale baja, prueba de fuga de cilindros. ScanIA interpreta los números si los escribís (prueba "Compresión").
- Presión de combustible con manómetro (taller: el sistema está presurizado). ScanIA compara con el valor del manual si lo anotaste.
- Vacío del múltiple con vacuómetro (confirma fugas, tiempo de encendido, escape tapado).
- Chispa con probador de chispa; estado de tapa, rotor y cables del distribuidor.
- Resistencia de los sensores de temperatura (tabla del manual) y de los inyectores con multímetro.
- Voltaje de carga y caída de voltaje en los cables (multímetro en los bornes; prueba "Caída de voltaje en cables").
- Nivel y estado del aceite de transmisión (ATF) según el procedimiento del manual.
- Ajuste de válvulas: en muchos motores Honda de la época es mantenimiento periódico; revisá el manual.
- Presión del sistema de enfriamiento y del tapón del radiador.
- **Tracción 4x4 "Real Time"**: es mecánica/hidráulica (sistema de bombas en el diferencial trasero). El OBD no la ve; los ruidos o saltos al girar se revisan físicamente (incluido el aceite del diferencial trasero según el manual).

## 5. Datos del manual que conviene anotar

En *Carros → Editar → Datos del manual*: ralentí caliente (rpm), temperatura de apertura del termostato, temperatura de encendido del ventilador, compresión mínima por cilindro y presión de combustible (con su condición de medición). **ScanIA no trae estos valores**: si no los anotás, las pruebas usan rangos generales y lo dicen.

## 5b. Fusibles, relés y sistema eléctrico

La ficha eléctrica de este carro (fusibles de las cajas interior, del motor y del ABS, relés conocidos y fuentes) está en la sección **Eléctrico** de la app y documentada en [DIAGNOSTICO_ELECTRICO.md](DIAGNOSTICO_ELECTRICO.md) y [COMPATIBILIDAD_ELECTRICA_VEHICULOS.md](COMPATIBILIDAD_ELECTRICA_VEHICULOS.md). Es de fuentes secundarias para EE. UU./Canadá: compará cada posición con la etiqueta de la tapa de tu caja.

## 6. Primera conexión con el CR-V (paso a paso)

1. Motor apagado, llave en ON (sin dar arranque). Adaptador en el conector de 16 pines, luz del adaptador encendida.
2. En ScanIA: *Escanear → Conectar adaptador*. La primera conexión con ISO 9141-2 puede tardar varios segundos ("BUS INIT").
3. Revisá en el panel de conexión: protocolo, medición de aire (debería decir MAP), sensores de oxígeno, VIN.
4. *Diagnóstico de conexión* → descargá el `.json` y guardalo.
5. *Revisión completa* (códigos, monitores, freeze frame).
6. Comparación de sensores con el motor **frío** (prueba "Comparación de sensores"): temperatura del motor ≈ temperatura del aire, MAP ≈ presión barométrica.
7. Encendé el motor. *En vivo*: RPM y temperatura deben coincidir con el tablero.
8. Con el motor caliente: pruebas "Ralentí", "Mezcla", "Sensor de oxígeno" (si la velocidad de lectura alcanza) y "Alternador con carga".
9. Más → Registro técnico → Descargar.

El plan completo con casillas para anotar resultados está en `docs/PRUEBAS_FISICAS.md`.

## 7. Cómo se probó este perfil sin el carro

El simulador incluye el perfil **"Honda 2000 simulado (ISO 9141-2, sensor MAP)"**: adaptador virtual que responde como ISO 9141-2 (un PID por consulta, `SEARCHING...`, `BUS INIT`), sin MAF, sin VIN, con modo 06 en formato no CAN. Con él se prueban el controlador ELM327 real, el análisis con MAP y la interfaz (pruebas `tests/regresiones_2_1.test.js` A-30 y `tests/e2e.py`). **Eso no reemplaza la prueba con el carro**: los PIDs reales que soporte tu CR-V pueden ser otros.
