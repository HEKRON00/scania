# Auditoría independiente — ScanIA 3.0 (módulo eléctrico)

**Código auditado:** rama `main`, commit `c73c411` (ScanIA 3.0).
**Fase 1:** solo lectura y pruebas contra el código tal como estaba. No se cambió código antes de terminar este documento.
**Fase 2:** las correcciones están al final y en [REGISTRO_DE_CAMBIOS_3_1.md](REGISTRO_DE_CAMBIOS_3_1.md).

## 0. Método

1. Lectura completa de `src/fichas.js`, `src/electrico.js`, `src/ui_electrico.js` y de los puntos de unión con `analizador.js`, `almacen.js`, `ia.js` y `simulador.js`.
2. **Sondas adversariales** (un script aparte que llama a las funciones reales con datos malos): mediciones imposibles, datos contradictorios, fusibles intercambiados, foto ambigua, diagrama de otro mercado, síntomas sin códigos, condiciones de medición equivocadas. Los resultados textuales están citados como "Evidencia".
3. **Dos fotos de tapas de cajas de fusibles** que mandó el usuario el 26/11/2026 (ver sección 2). No se sabe si son de su carro.
4. Verificación de que IndexedDB guarda fotos y diagramas también cuando la app se abre como archivo (`file://`): **funciona** (prueba en Chrome sin pantalla).

**Conclusión general:** ScanIA 3.0 es un **asistente de inspección y registro** con reglas prudentes y una tabla de fusibles de fuentes secundarias. **No conoce el cableado del carro**: no tiene un modelo de circuitos (cables, colores, terminales, conectores, pines de la computadora), la "caja" que dibuja no es la disposición física, y varias funciones aceptaban datos imposibles o contradictorios como si fueran válidos. Lo que hacía bien: nunca recomienda un fusible más grande, exige medir sin energía, excluye bolsas de aire, no concluye con solo el voltaje OBD y no confirma un fusible quemado por una foto.

## 1. Resumen de hallazgos

| Nivel | Cantidad | IDs |
|---|---|---|
| Crítico | 3 | C-01 a C-03 |
| Alto | 10 | A-01 a A-10 |
| Medio | 10 | M-01 a M-10 |
| Bajo | 6 | B-01 a B-06 |

## 2. Las dos fotos de tapas (evidencia aportada, origen no confirmado)

| Foto | Código impreso | Idioma | Qué muestra |
|---|---|---|---|
| Tapa de la caja interior | `S10-A0` | Inglés | 3 filas de 11 fusibles + 4 casillas "SPARE FUSE" |
| Tapa de la caja del motor | `R4`, `S10-E0` | Inglés y japonés | 15 fusibles y 4 relés con su disposición física (sin números de posición) |

`S10` es un código usado en repuestos Honda para la 1ra generación del CR-V. **No sé** si las letras `A0` y `E0` indican mercados distintos, ni si las dos tapas son del mismo carro ni del carro del usuario. Por eso todo lo que sale de las fotos queda como "foto de una tapa (origen no confirmado)", nunca como "confirmado en tu carro".

**Lectura de la tapa interior** (los amperajes entre paréntesis en la etiqueta suelen indicar equipo opcional):

| Fila en la etiqueta | Posiciones (según el orden de las tablas) | Lo que dice la etiqueta |
|---|---|---|
| Inferior | 1–11 | **(20A) FR FOG LIGHTS** · (vacía) · 10A RR WIPER/WASHER · 10A HIGH BEAM (R) · 10A HIGH BEAM (L) · 10A REAR ACC SOCKET · 20A P/W RR-L · 20A P/W RR-R · 15A IGN COIL · 20A P/W FR-R · 20A P/W FR-L |
| Media | 12–22 | 7.5A TURN · 15A FUEL PUMP (SRS UNIT) · (7.5A) CRUISE · 7.5A ALTERNATOR SP SENSOR · (7.5A) ABS · 7.5A HEATER A/C RELAY · (7.5A) RUNNING LIGHT RELAY · 7.5A BACK UP LIGHTS · **(10A) RUNNING LIGHTS** · 10A R LOW · 10A L LOW |
| Superior | 23–33 | (10A) SRS · 7.5A **P/W RELAY (SUNROOF RELAY)** · 7.5A METER · 20A FR WIPER/WASHER · (10A) CIGARETTE LIGHTER (FR ACC SOCKET) · 10A RADIO · (vacía) · 7.5A INSTRUMENT LIGHTS · 7.5A STARTER SIGNAL · 7.5A LICENSE/TAIL · (7.5A) INTER LOCK UNIT |

El orden de funciones coincide exactamente con la numeración 1–33 de las tablas secundarias. **Diferencias con la ficha 3.0:** posición 1 (la ficha decía "No usado"; la tapa: luces antiniebla 20 A opcionales), posición 20 (la ficha decía 7.5 A; la tapa parece decir 10 A — lectura probable, hay brillo en la foto), posición 24 (también relé del techo corredizo).

**Lectura de la tapa del motor:** 15A FI E/M · 7.5A BACK UP (RADIO) · 20A DR LOCK UNIT, ROOF · 20A CONDENSER FAN · 20A COOLING FAN · 7.5A INTERIOR LIGHT · **40A POWER WINDOW** · 20A RR DEFROSTER · **40A HEATER MOTOR** · 40A IG1 · **40A OPTION** · 30A HEAD LIGHT · 10A HAZARD · 15A HORN, STOP · 100A BATTERY; relés en la columna derecha, de arriba hacia abajo: HEATER MOTOR, COOLING FAN, MG. CLUTCH (embrague del A/C), CONDENSER FAN.
Esto **resuelve el conflicto** de las posiciones 4 y 5: existen un 40 A de vidrios y un 40 A "option", y un solo 40 A del soplador (la fuente que ponía un 30 A del soplador estaba equivocada). La tapa **no trae números de posición**: la numeración sigue saliendo de las tablas.

## 3. Hallazgos

### Críticos

**C-01 · Mediciones imposibles o en la condición equivocada se aceptaban como válidas**
- **Archivo:** `src/electrico.js`, `S.evaluarMedicion` (rama `voltaje_bornes`) y entrada numérica en general.
- **Problema:** no había validación de rango físico ni de coherencia con la condición.
- **Evidencia:** `voltaje_bornes, reposo, 45 V` → "batería cargada". `reposo, 14.2 V` (motor encendido anotado como reposo) → "batería cargada". `resistencia −50 Ω` → "sin referencia" (aceptada como medición). `caída en la tierra 9 V` → solo "orientativo alto".
- **Riesgo:** conclusiones falsas con apariencia de medición real (una batería mala dada por buena).
- **Corrección:** validar rangos físicos por prueba y unidad (voltajes de 0 a 20 V, resistencias ≥ 0, corriente hasta 10 A) → "Medición imposible: revisá escala y puntas". En reposo, más de 13.2 V → "No parece reposo (motor encendido o carga superficial)".

**C-02 · "Corto a tierra" se daba por confirmado aunque el fusible alimente otras cargas**
- **Archivo:** `src/electrico.js`, prueba `corto_tierra` y su evaluación; `S.diagnosticoElectrico` (lista "sabe").
- **Problema:** un fusible suele alimentar varias cargas (bombillos, motores) que miden pocos ohmios a tierra. Desconectar "el componente" no basta.
- **Evidencia:** `corto_tierra: "si"` → "Hay continuidad a tierra con el componente desconectado: corto a tierra." y pasa a "lo que se sabe".
- **Riesgo:** desarmar el arnés buscando un corto que no existe.
- **Corrección:** preguntar si se desconectaron **todas** las cargas de ese fusible (según el diagrama) y anotar los ohmios. Si no, el resultado es "probable / requiere diagrama", nunca "confirmado".

**C-03 · Datos contradictorios no se detectaban**
- **Archivo:** `src/electrico.js`, `S.diagnosticoElectrico`.
- **Evidencia:** fusible 26 marcado "bien" (por continuidad) y, a la vez, una medición de continuidad "no" del mismo fusible → el informe tenía las dos cosas sin aviso.
- **Riesgo:** un informe que se contradice y una conclusión que depende del orden de lectura.
- **Corrección:** detectar contradicciones entre la inspección, las mediciones y la foto del mismo elemento, y marcar el elemento como "no verificable hasta repetir la medición".

### Altos

**A-01 · El voltaje en los dos lados del fusible dependía del orden**
- `S.evaluarVoltajeFusible`; la interfaz dice "Lado 1 / Lado 2" sin decir cuál es la entrada.
- **Evidencia:** lado 1 = 0 V, lado 2 = 12.4 V → "dudoso" (debía ser "abierto").
- **Corrección:** evaluación simétrica.

**A-02 · Datos de la ficha que parecen verificados pero difieren de una tapa real**
- `src/fichas.js` posiciones `INT-1`, `INT-20`, `INT-24`, `MOT-10`.
- **Evidencia:** `INT-1` "No usado" con nivel "fuentes que coinciden"; la tapa S10-A0 dice "(20A) FR FOG LIGHTS". `INT-20` 7.5 A; la tapa parece decir 10 A.
- **Riesgo:** decirle al usuario que una posición no se usa cuando lleva el fusible de las antiniebla, o recomendarle 7.5 A donde iría 10 A.
- **Corrección:** `INT-1` opcional (antiniebla 20 A según la tapa; las tablas de EE. UU. la dan sin uso); `INT-20` "en conflicto" (7.5 A según las tablas, 10 A según la tapa); agregar el techo corredizo a `INT-24` y `MOT-10`.

**A-03 · Afirmaciones sin fuente registrada presentadas como hechos**
- `src/fichas.js`:
  - Relé del A/C: "Es una falla conocida en esta generación según publicaciones de repuestos". No hay fuente.
  - Relé PGM-FI: "una publicación lo ubica detrás de la guantera". La fuente que tiene registrada no dice eso.
  - Relés "de vidrios" y "de calefacción" puestos dentro de la caja interior. Las tablas solo nombran los FUSIBLES que los alimentan.
  - Tamaño de fusible atribuido a "un vendedor" que no está registrado.
  - `protocolo`: "lo vio ScanIA en la primera prueba real". Esa prueba no confirmó que fuera el CR-V.
- **Corrección:** borrar o reescribir cada una. Los relés sin ubicación pasan a "ubicación no documentada".

**A-04 · No existe disposición física de las cajas**
- `ui_electrico.js` dibuja las posiciones por número en N columnas (6 en la interior). La interior real (según la tapa) es de 3 filas de 11 más 4 repuestos; la del motor es irregular.
- **Mitigación que ya existía:** el aviso "Representación orientativa".
- **Corrección:** agregar `fila`/`columna` por posición cuando haya una fuente (la foto de la tapa) y dibujar esa disposición con su fuente. Sin fuente, se sigue mostrando la lista con el aviso.

**A-05 · No hay modelo de circuitos: el "visor de diagramas" es un visor de archivos**
- No hay estructura para alimentación, tierras, fusible → relé → conector/terminal → componente, color de cable ni pines de la computadora.
- La relación fusible–código se hace por palabras del nombre (`CLAVES_CODIGO`), no por un circuito conocido.
- **Corrección:** un modelo de circuitos con fuente obligatoria por tramo, para cargar desde el manual del dueño. ScanIA no trae datos para el CR-V y lo dice.

**A-06 · 6 de 11 síntomas eléctricos no se usaban en ninguna regla**
- **Sin usar:** "da arranque pero no enciende", "falla intermitente", "varios sistemas a la vez", "fusible que se vuelve a quemar", "olor a quemado" y "se apaga en marcha".
- **Escenarios que no se infieren:** relé principal (PGM-FI), fusible principal o de encendido, circuito modificado.
- **Evidencia:** "arranca_no_enciende + se_apaga_marcha" → ninguna sospecha. "varios_sistemas + no_da_arranque" → solo batería, cables y arranque. Un fusible en una posición libre + batería que se descarga → no sugiere una instalación agregada.
- **Corrección:** hipótesis eléctricas por síntomas y por inspección. "Olor a quemado" pasa a urgencia "detener".

**A-07 · El amperaje leído por la IA en una foto se trataba como observado**
- `S.sugerenciasDeFoto` + `S.evaluarFusible`.
- **Evidencia:** una foto "probable" con 10 A en la posición 20 → estado "posible amperaje incorrecto" y la acción "poné uno de 7.5 A".
- **Corrección:** guardar el amperaje de la foto aparte; solo genera "probable: confirmalo mirando el fusible".

**A-08 · No había una escala única de certeza**
- Se pedía: Confirmado, Probable, Sospechoso, No verificable, Requiere medición física, Requiere documentación técnica.
- Cada función usaba su propio vocabulario (sabe/sospecha, veredictos, estados de fusible).
- **Corrección:** `S.NIVELES_EVIDENCIA` y un nivel en cada elemento del diagnóstico y del informe.

**A-09 · El flujo de sensores podía condenar el componente o la computadora sin revisar el conector**
- `S.diferenciarFalla`.
- **Evidencia:** en un sensor de 2 cables (ECT) con resistencia fuera de valor → "confirmada: cambiá el componente" sin revisar el conector; la medición en los pines incluye el sulfato del propio conector.
- "Computadora" se proponía sin conector ni corto revisados.
- **Corrección:** exigir el conector revisado antes de confirmar el componente, y el conector y el corto antes de sospechar de la computadora.

**A-10 · Los relés no tienen datos para diagnosticarlos con multímetro**
- Faltan terminales, diagrama de conexión, voltaje esperado en el zócalo, cuál pin controla la computadora y resistencia de la bobina.
- **Corrección:** modelar esos campos con fuente obligatoria y decir explícitamente qué falta. El intercambio queda como única prueba posible sin documentación. Este hallazgo no se cierra con código: hace falta el manual de servicio.

### Medios

| ID | Archivo | Problema | Corrección |
|---|---|---|---|
| M-01 | `electrico.js` `tierra_componente` | El criterio físico de "tierra abierta" (casi el voltaje de batería) solo vale para circuitos alimentados con batería. La tierra de un sensor abierta lee como mucho la referencia (~5 V) → "sin referencia". | Pedir el voltaje del circuito (batería o referencia) y comparar contra ese. |
| M-02 | `alimentacion_componente` | Medir con el conector desconectado no detecta una alimentación con resistencia de más. Algunos circuitos solo tienen voltaje unos segundos (por ejemplo, el cebado de la bomba). | Recomendar medir con carga (por detrás del conector). Avisar que 0 V puede ser normal fuera de esa ventana. |
| M-03 | `consumo_parasito` | Unidad ambigua (0.05 ¿A o mA?). Desconectar la batería despierta los módulos y pide el código del radio Honda; cambiar de escala abre el circuito. | Selector de unidad, valor convertido y advertencias. |
| M-04 | `rele_bobina` | La prueba de banco con 12 V no advierte la polaridad (los relés con diodo hacen corto si se invierte). | Agregar la advertencia: polaridad según el diagrama del relé y cable con fusible. |
| M-05 | Diagramas | No se compara mercado, año y motor del diagrama con el carro: uno de otro mercado se mezcla sin aviso. | Avisar al subir y al buscar. |
| M-06 | `fichas.js` `coincide` | La variante de EE. UU. se aplica a cualquier CR-V 2000–2001 sin un estado "variante sin confirmar". | Mostrar "variante sin confirmar" hasta que el dueño compare la tapa. |
| M-07 | `fichas.js` | No hay tipo de fusible por posición ni marca de opcionales. | Agregar `opcional` (paréntesis de la tapa) y `tipo: null` con "no documentado". |
| M-08 | `continuidad_cable` | El texto decía "criterio del fabricante", pero es un criterio general. | Corregir el texto. |
| M-09 | `voltaje_bornes` (interfaz) | La condición por defecto es "reposo": si se olvida cambiarla, la lectura con motor encendido se interpreta mal (ligado a C-01). | Validación de coherencia (C-01). |
| M-10 | `diferenciarFalla` | Para sensores de 2 cables decía "alimentación y tierra ya verificadas" sin haber medido alimentación. | Texto según el tipo de circuito. |

### Bajos

| ID | Problema | Corrección |
|---|---|---|
| B-01 | Datos generales sin fuente marcados "verificar": transmisión de 4 velocidades, ABS según versión, sensores de giro dentro del distribuidor, detector de carga (ELD) | Etiquetarlos "conocimiento general, sin fuente registrada" |
| B-02 | Las guías de caída de voltaje (0.3–0.5 V) varían entre fuentes de taller | Ya dicen "orientativa"; agregar "varía entre guías" |
| B-03 | "Ampliar" solo agranda la lista | Con la disposición física (A-04) la ampliación muestra la caja |
| B-04 | `MOT-10` y `INT-24` sin el techo corredizo | Incluido en A-02 |
| B-05 | Los casos simulados usan siempre la ficha del CR-V | Aceptable; documentado |
| B-06 | El respaldo importa fotos sin esperar la confirmación | Avisar cuántos archivos se restauraron |

## 4. Auditoría por área

### 4.1 Fusibles

| Pregunta | Respuesta (3.0) |
|---|---|
| ¿Las posiciones representan la disposición física? | **No.** Lista ordenada por número en una grilla (con aviso "orientativa"). |
| ¿Cada fusible tiene posición, amperaje, tipo, función y fuente? | Número, amperaje, función y fuente: sí. **Tipo: no** (1 de 56). Posición física: no. |
| ¿Corresponde exactamente a año, motor, mercado y versión? | Año y modelo (2000–2001, sin distinguir motor, aunque en EE. UU. solo hubo B20Z). Mercado: EE. UU./Canadá por las tablas. **Versión/equipamiento: no** (opcionales sin marcar). |
| ¿Diferencia ausentes, incorrectos, intercambiados y defectuosos? | Sí (intercambio exacto entre dos posiciones). |
| ¿Evita confirmar fallas sin mediciones? | Quemado: sí. **Corto a tierra: no** (C-02). **Contradicciones: no** (C-03). |
| ¿Diferencia interior, motor y ABS? | Sí, por caja. |
| ¿Errores de asignación? | **Sí:** INT-1, INT-20 (frente a la tapa); los relés interiores ubicados sin fuente. |

### 4.2 Relés

| Dato | Interior | Motor (4 relés) | ABS | PGM-FI |
|---|---|---|---|---|
| Ubicación física | No | **Solo por la foto de la tapa (origen no confirmado)** | No | No |
| Identificación (nombre) | De la función del fusible que lo alimenta | Sí (2 fuentes + foto) | Sí (2 fuentes) | Sí (1 fuente) |
| Función | Por el nombre | Por el nombre | Por el nombre | Por el nombre |
| Terminales | No | No | No | No |
| Diagrama de conexión | No | No | No | No |
| Voltaje de alimentación | No | No | No | No |
| Circuito controlado | Por el nombre | Por el nombre | Por el nombre | Por el nombre |
| Procedimiento de prueba | Genérico (intercambio, bobina con especificación) | Genérico | Genérico | Genérico |

**Para diagnosticar un relé con multímetro falta:** la numeración de sus terminales (bobina y contactos), la resistencia de la bobina, qué terminal del zócalo debe tener voltaje de batería y en qué condición (llave en ON, A/C pedido), qué terminal pone a tierra la computadora para activarlo, el fusible que alimenta la bobina y el que alimenta la carga, y si el relé tiene diodo (polaridad). Todo eso está en el manual de servicio de Honda, que ScanIA no tiene.

### 4.3 Las 14 mediciones

| Prueba | Dónde medir | Energizado | Aislamiento | Referencia | Veredicto sin especificación | Hallazgo |
|---|---|---|---|---|---|---|
| Continuidad de fusible | Sí | No | Sí | Física | Sí (física) | — |
| Voltaje en ambos lados | Sí | Sí (voltaje) | n/a | Física | Sí (física) | A-01 |
| Continuidad de cable | Sí | No | Sí | Física/general | Sí | M-08 |
| Corto a tierra | Sí | No | Incompleto | Física | **Sí, de más** | C-02 |
| Resistencia de componente | Sí | No | Sí | Fabricante | No ("sin referencia") | C-01 (valores negativos) |
| Alimentación | Sí | Sí | n/a | Fabricante + 0 V físico | Solo 0 V | M-02 |
| Tierra (caída) | Sí | Sí | n/a | Fabricante + físico | Parcial | M-01 |
| Caída positivo | Sí | Sí | n/a | Guía orientativa | Orientativo | B-02 |
| Caída tierra | Sí | Sí | n/a | Guía orientativa | Orientativo | B-02 |
| Conector | Sí | Mixto | Sí | Física | Sí | — |
| Consumo apagado | Sí | Sí (corriente) | Sí | Fabricante | No | M-03 |
| Relé (intercambio) | Sí | No | Sí | Práctica | Sí | — |
| Relé (bobina) | Sí | No | Sí | Fabricante + OL físico | Solo OL | M-04 |
| Bornes | Sí | Sí | n/a | Referencia general plomo-ácido / guía de carga | Orientativo | C-01, M-09 |

Resistencia, continuidad y caída de voltaje están separadas correctamente. Ningún procedimiento pide medir resistencia con energía ni tocar bolsas de aire.

### 4.4 Diagramas

El visor **solo muestra documentos que sube el usuario** (foto o PDF) con su metadato. No sabe nada de los circuitos.

| Elemento | ¿Lo puede representar? |
|---|---|
| Alimentación principal, tierras, fusibles, relés, conectores, computadora, sensores, actuadores, colores de cables, numeración de terminales | **No** (no existe una estructura de datos para eso) |
| Fusibles (lista y función) | Sí, desde la ficha |
| Búsqueda | Texto en ficha y títulos de diagramas; la relación código–fusible es por palabras clave |

### 4.5 Diagnóstico inteligente (sondas)

| Escenario | Resultado en 3.0 | ¿Correcto? |
|---|---|---|
| Varios sensores sin alimentación (MAP+TPS bajos) | Causa común "referencia de 5 V" | Sí |
| Referencia de 5 V en corto | Igual que arriba; sugiere desconectar sensores uno por uno | Sí |
| Tierra deficiente (dos sensores altos) | Causa común "tierra de sensores" | Sí |
| Fusible principal defectuoso | Solo si se marca el fusible; los síntomas "varios sistemas + no da arranque" no lo sugieren | **No** (A-06) |
| Relé principal defectuoso | Solo con pérdida de comunicación OBD; los síntomas típicos no lo sugieren | **No** (A-06) |
| Batería baja | Hecho medido + hipótesis | Sí |
| Alternador con carga insuficiente | Hecho "no carga" + hipótesis | Sí |
| Consumo parasitario | Solo con especificación del fabricante; si no, "posibilidad" | Parcial (M-03) |
| Circuito modificado | No se reconoce | **No** (A-06) |
| No cambiar sensores ni computadora antes de alimentación, tierra, cableado y conector | Faltaba el conector | **Parcial** (A-09) |

### 4.6 Honda CR-V 2000 B20Z (automática, 4x4): qué está verificado

| Sistema | Estado en 3.0 | Con las fotos (origen no confirmado) | Falta |
|---|---|---|---|
| Distribución física de cajas | No había | Interior: 3 × 11 + 4 repuestos. Motor: disposición completa con relés | Confirmar con la tapa del carro del usuario |
| Fusibles y amperajes | 3 tablas secundarias (interior), 2 + 1 discrepante (motor) | Resuelve 4 y 5 del motor; revela antiniebla (pos. 1) y posible 10 A en pos. 20 | Confirmar la variante |
| Relés y ubicaciones | Nombres; ubicación sin fuente | Posición de 4 relés del motor | Interiores, PGM-FI, arranque, ABS |
| Alimentación de la computadora | Fusibles FI E/M 15 A (motor) y 15 A bomba/SRS (interior) por nombre | Igual | Diagrama, relé PGM-FI, pines |
| Sistema PGM-FI | Solo nombres | — | Todo el circuito |
| Sistema de carga | Fusible "ALTERNATOR SP SENSOR" 7.5 A, principal 100 A | La tapa confirma el nombre | Cableado del alternador y control de carga |
| Sistema de arranque | IG1 40 A, señal de arranque 7.5 A | La tapa confirma | Relé/corte de arranque, switch de posición neutra |
| Tierras principales | **Nada** | — | Ubicaciones y pruebas |
| Circuitos de sensores | Genéricos (tipos comunes) | — | Pines, colores, referencias |
| Aire acondicionado | Fusible 7.5 A del relé, 20 A del condensador | Relé del embrague (MG CLUTCH) ubicado | Circuito del embrague y presostato |
| Ventiladores | 20 A radiador y condensador | Relés ubicados | Control y sensores de temperatura del ventilador |
| Transmisión automática | Fusible del bloqueo (interlock) y reversa; la computadora la controla (perfil) | Interlock es opcional (paréntesis) | Solenoides, circuito, códigos de marca |
| ABS | Caja de 3 fusibles (si tiene) + relé por nombre | ABS opcional en la tapa interior | Si el carro tiene ABS |

**Nada de esta lista está verificado contra un documento del fabricante ni contra el carro del usuario.**

### 4.7 Pruebas adversariales

| Entrada | Debía responder | 3.0 respondía | Hallazgo |
|---|---|---|---|
| 45 V en bornes | Medición imposible | "Batería cargada" | C-01 |
| 14.2 V anotado como reposo | No parece reposo | "Batería cargada" | C-01 |
| −50 Ω | Medición imposible | "Sin referencia" | C-01 |
| 0 V / 12.4 V en el fusible | Abierto (confirmado) | "Dudoso" | A-01 |
| Corto a tierra con cargas sin confirmar | Probable / requiere diagrama | "Corto a tierra" (confirmado) | C-02 |
| Fusible "bien" + medición "abierto" | Contradicción → no verificable | Las dos cosas | C-03 |
| Foto "probable" con otro amperaje | Probable, mirarlo en persona | "Poné uno de 7.5 A" | A-07 |
| Diagrama de otro mercado | Aviso | Sin aviso | M-05 |
| Fusibles intercambiados (exacto) | Sospechoso | "Posible intercambio" | correcto |
| Foto ambigua | Insuficiente / requiere físico | Correcto | correcto |
| Síntomas de relé principal | Sospechoso + medir | Nada | A-06 |
| Sensor con resistencia fuera y sin conector revisado | Requiere medición (conector) | "Cambiá el componente" | A-09 |

## 5. Fase 2: correcciones prioritarias (en este orden)

1. **C-01, M-09:** validación física de mediciones y de la condición.
2. **C-02:** corto a tierra con confirmación de cargas desconectadas.
3. **C-03:** detección de contradicciones.
4. **A-08:** escala única de evidencia en el diagnóstico, la interfaz y el informe.
5. **A-01:** voltaje del fusible simétrico.
6. **A-02, A-03, M-07, B-01, B-04:** corrección de la ficha con las fotos (sin inventar) y limpieza de afirmaciones sin fuente.
7. **A-04:** disposición física desde la foto de la tapa, con su fuente y su aviso.
8. **A-06:** hipótesis eléctricas por síntomas e inspección (relé principal, fusible principal, circuito modificado, cortos, intermitencias).
9. **A-07:** el amperaje de la foto queda aparte y como "probable".
10. **A-09, M-10:** flujo de sensores con el conector obligatorio.
11. **A-05, A-10:** modelo de circuitos y de relés (terminales) con fuente obligatoria. Sin datos del CR-V hasta tener el manual.
12. **M-01 a M-05, M-08:** textos técnicos y avisos.
13. **M-06:** variante sin confirmar.

Lo que **no** se puede corregir con código: falta el manual de servicio de Honda (diagramas, terminales, valores) y falta confirmar con la tapa del carro del usuario.
