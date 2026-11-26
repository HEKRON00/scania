# Diagnóstico eléctrico y electrónico (ScanIA 3.0)

> **Estado:** implementado y con pruebas automáticas (casos simulados, interfaz en Chrome de escritorio y celular, IA con un servidor falso). **Ninguna función eléctrica se probó todavía en un carro real con un multímetro.** El plan está en [PRUEBAS_FISICAS.md](PRUEBAS_FISICAS.md), sección 5.

## 1. Auditoría previa (qué había y qué se reutilizó)

| Parte de ScanIA 2.1 | Cómo funcionaba | En 3.0 |
|---|---|---|
| Perfiles de vehículo (`perfiles.js`) | Perfil Honda CR-V 1G: qué se ve por OBD (A), qué necesita Honda (B), qué es físico (C) | Se mantiene. La ficha eléctrica (`fichas.js`) apunta al perfil (`perfil: "honda_crv_1g"`). |
| Conexión ELM327 (`elm327.js`) | Cola de órdenes, reinicios, estadísticas de errores | Se reutilizan las estadísticas: reinicios del adaptador y "la computadora dejó de responder" alimentan la regla de causa común. |
| Lectura de sensores / análisis (`analizador.js`) | Reglas con evidencia, certeza por fuentes, urgencia | Se agregó un punto de extensión `S.REGLAS_EXTRA`; la regla de causa común eléctrica se suma ahí. Ninguna regla existente se quitó. |
| Códigos DTC (`codigos.js`, `datos.js`) | Descripción en español | `S.clasificarCodigoElectrico` usa esas descripciones para saber si la señal es baja, alta, circuito, calentador, etc. |
| Pruebas guiadas (`pruebas.js`) | Batería, arranque, alternador, caída de voltaje… | Sus resultados guardados entran en la evaluación de batería y carga. La guía de caída de voltaje ahora dice explícitamente que es orientativa. |
| Historial y escaneos (`almacen.js`) | localStorage | Se agregó la inspección eléctrica por carro (`scania-electrico`) y un almacén de fotos y diagramas en IndexedDB (`S.archivos`). El respaldo los incluye. |
| Informes (`ui_carros.js`) | Reporte imprimible (PDF) + JSON | Se reutiliza para el informe eléctrico. |
| IA (`ia.js`, `servidor/worker.js`) | Servidor propio con código familiar | Se reutiliza `S.llamarIA` con instrucciones propias para fotos. El servidor no cambió (ya validaba fotos, límites e instrucciones). |
| Simulador (`simulador.js`) | 12 fallas del carro, 4 del adaptador | Se agregaron 6 fallas eléctricas visibles por OBD. Las que solo se ven con multímetro son 12 casos simulados del módulo eléctrico. |

## 2. Qué hay en la sección "Eléctrico"

| Pestaña | Qué hace |
|---|---|
| **Resumen** | Junta todo en cuatro listas: lo que se sabe, lo que se sospecha, lo que no se puede determinar todavía y las pruebas que faltan. Tabla de qué se revisa por OBD, con instrumentos o a la vista. Reglas de seguridad. Casos simulados para practicar. |
| **Fusibles y relés** | Caja interior, caja del motor, ABS, fusibles principales y relés. Cada posición con color: correcto, pendiente, defectuoso confirmado, posiblemente quemado, posible amperaje incorrecto, falso contacto, posición desconocida. Detalle: número, amperaje, nombre, circuito, componentes, ubicación, verificación, fuente, procedimiento y síntomas posibles. Botón "Ampliar". "Anotar desde la tapa" para cargar o corregir posiciones con la etiqueta real. |
| **Mediciones** | 14 pruebas con multímetro (continuidad, voltaje en ambos lados del fusible, cable abierto, corto a tierra, resistencia, alimentación, tierra, caída positivo/tierra, conector, consumo apagado, relé, bornes). Cada una con las 8 partes: componente, herramienta, dónde medir, valor del fabricante, valor obtenido, dentro/fuera, causas, siguiente comprobación. |
| **Batería y carga** | Combina OBD, pruebas guiadas, mediciones, historial de escaneos y síntomas eléctricos. Separa **hechos medidos** de **hipótesis** (batería, alternador, cables/tierras, faja, consumo, arranque). |
| **Sensores y actuadores** | 16 componentes. Flujo: conector → alimentación → tierra → cable → corto → componente → computadora. Dice qué está descartado, qué falta medir y qué no cambiar todavía. |
| **Diagramas** | Visor de los diagramas que subas de tu manual, con fuente, mercado, año, motor y versión obligatorios (no se mezclan versiones). Búsqueda por componente, circuito, fusible o código. |
| **Fotos** | Fotos de cajas, etiquetas, fusibles, relés, conectores y cables. Con el servidor de IA: lectura separada en "confirmada", "probable", "imagen insuficiente" y "requiere inspección física". |
| **Informe** | Estado general, fusibles revisados/pendientes/incorrectos, relés, mediciones, componentes, diagramas, fallas confirmadas, sospechas, pruebas y fuentes. PDF (imprimir) y JSON. |

## 3. Reglas que el código hace cumplir (y sus pruebas)

| Regla | Dónde | Prueba automática |
|---|---|---|
| Cada fusible y relé de una ficha tiene fuente y nivel de verificación; una ficha sin fuentes se rechaza | `S.registrarFicha` | `electrico.test.js` "ficha…" |
| Fuentes que no coinciden → "Configuración del fusible pendiente de verificación" | `S.evaluarFusible` | "con fuentes en conflicto…" |
| Nunca se recomienda un fusible de más amperaje (se revisan todas las combinaciones y el código fuente) | `S.evaluarFusible` | "NUNCA se recomienda…" |
| Un fusible no queda "quemado confirmado" por apariencia ni por una foto: solo con continuidad, voltaje o probador | `S.evaluarFusible`, `S.interpretarFotoElectrica` | "visual = probable…", "fotos…" |
| No se afirma que un fusible está mal colocado solo por un código: solo comparando lo observado con la documentación (intercambios) | `S.detectarIntercambios`, `S.fusiblesParaCodigo` (relación "posible, no confirmada") | "principal, falso contacto…", "códigos…" |
| Sin valor del manual: "Valor de referencia no disponible: requiere documentación técnica" | `S.evaluarMedicion` | "mediciones: sin especificación…" |
| Resistencia y continuidad siempre con el circuito sin energía y con instrucciones de aislamiento; SRS excluido | `S.PRUEBAS_CIRCUITO`, `S.SEGURIDAD_ELECTRICA` | "seguridad…" |
| No se recomienda cambiar un sensor sin verificar alimentación, tierra y señal; la computadora es lo último | `S.diferenciarFalla` | "sensores…" |
| El voltaje OBD solo nunca da una conclusión; lo confirmado son los hechos medidos | `S.evaluarSistemaCarga` | "batería y carga…" |
| Varios códigos de circuito no se tratan como averías separadas: se buscan causas comunes con su evidencia | `reglaCausaComun` (en el análisis) | "causa común…" |
| Diagramas: ninguno inventado; los del dueño exigen fuente | `fichas.js` (`diagramas: []`), interfaz | "ficha…", `e2e.py` |

## 4. Casos simulados (los 12 pedidos)

Cada caso se corre contra la ficha del CR-V y la prueba exige qué **sabe**, qué **sospecha**, qué **no puede determinar** y qué **prueba** propone ScanIA.

| Caso | Sabe | Sospecha | No puede determinar | Prueba |
|---|---|---|---|---|
| Fusible quemado | El fusible 26 está abierto (continuidad) | — | Por qué se quemó | Reemplazar por el mismo amperaje |
| Fusible ausente | Falta el 19 | — | Si lo sacaron a propósito | Confirmar amperaje con la tapa y ponerlo |
| Amperaje incorrecto | Hay 30 A donde dice 20 A | Alguien tapó una falla | Si la documentación aplica a tu variante | Poner el documentado (nunca más grande) |
| Relé defectuoso | Con un relé idéntico funciona | — | Posición exacta del relé | Cambiar el relé |
| Tierra deficiente | — | Caída alta en la tierra (guía orientativa) | Límite exacto del fabricante | Limpiar/apretar y repetir |
| Batería baja | 12.0 V en reposo: descargada | Batería, consumo o carga | Estado interno de la batería | Cargar y probar con probador |
| Alternador | No carga (12.4 V en bornes) | Alternador / faja / excitación | — | Medir con cargas, revisar faja y fusible 15 |
| Cable interrumpido | Cable de señal abierto; P0118 | Explicación del código | — | Reparar el cable (no cambiar el sensor) |
| Cortocircuito | Se quemó 3 veces; continuidad a tierra | Corto en el circuito | — | Ubicar el roce moviendo el arnés |
| Sensor sin alimentación | MAP y TPS sin referencia; P0107 y P0122 | Causa común (referencia de 5 V) | — | Desconectar sensores uno por uno |
| Resistencia fuera | Sensor fuera de valor (valor de EJEMPLO) | — | — | Cambiar el sensor (alimentación y tierra ya verificadas) |
| Conector defectuoso | Sulfato; el dato salta al moverlo | — | — | Limpiar o reparar terminales |

Además, el simulador OBD tiene 6 fallas eléctricas (batería baja, tierra de sensores, sensores sin referencia de 5 V, sensor en corto, cable cortado y conector con falso contacto) que el análisis reconoce.

## 5. Qué necesita cada cosa

**Lo que ve el ELM327 (OBD genérico):** códigos de la computadora del motor, voltaje en el conector OBD (orientativo), lecturas de sensores ya interpretadas, si la computadora deja de responder.

**Lo que necesita un multímetro:** estado de cualquier fusible (voltaje en ambos lados o continuidad), voltaje real en bornes, caídas de voltaje en cables y tierras, alimentación y tierra de sensores, continuidad y cortos de cables, resistencia de sensores y actuadores (con el valor del manual), consumo con el carro apagado, bobina de relés.

**Lo que necesita un escáner especializado o un taller:** ABS, bolsas de aire (SRS), carrocería, transmisión en detalle, activación de actuadores (ScanIA no activa nada), prueba de carga o conductancia de batería, prueba de banco del alternador y del motor de arranque, osciloscopio para señales de CKP/CMP.

## 6. Fuentes técnicas usadas para el Honda CR-V 2000

| Fuente | Tipo | Para qué |
|---|---|---|
| [Honda — 2000 CR-V Online Reference Owner's Manual](https://techinfo.honda.com/rjanisis/pubs/om/CR0000/CR0000MAINIDX.pdf) | Fabricante | Existencia del manual oficial (las páginas de fusibles no se pudieron abrir directamente) |
| [2000 CR-V Owner's Manual, pág. 267 (manualowl)](https://www.manualowl.com/am/Honda/2000-CR-V/Manual/6985?page=267) | Reproducción del manual | Ubicación de las tres cajas |
| [fuse-box.info](https://fuse-box.info/?p=12669), [fuseboxinfo.com](https://fuseboxinfo.com/index.php/cars/29-honda/1634-honda-cr-v-2000-fuses), [autogenius.info](https://www.autogenius.info/honda-cr-v-2000-2001-fuse-box-diagram) | Secundarias | Tablas de fusibles 2000–2001 (coinciden en la interior; difieren en las posiciones 4 y 5 del motor) |
| [startmycar.com](https://www.startmycar.com/us/honda/cr-v/info/fusebox/2000) | Secundaria | Nombres de relés bajo el capó (numeración propia) |
| [fuseandrelay.com](https://fuseandrelay.com/?p=15260) | Secundaria, mercado no identificado | Muestra una distribución distinta: prueba de que hay variantes |

No se encontró ni se usó el manual de servicio de Honda (diagramas eléctricos, valores de resistencia, ubicación de conectores).

## 7. Limitaciones

- La ficha del CR-V es de fuentes secundarias para EE. UU./Canadá y no está comparada con la etiqueta de la tapa de tu carro.
- La representación de la caja es orientativa (ordenada por número), no la disposición real.
- Los relés no tienen posición documentada; el relé principal PGM-FI no tiene ubicación confirmada.
- No hay valores de resistencia, voltajes de referencia ni consumos del fabricante: se anotan desde tu manual.
- Las fotos y diagramas viven en el navegador del teléfono o de la compu (IndexedDB). Si el navegador no lo permite, la app avisa; el respaldo los incluye si marcás la casilla.
- La lectura de fotos necesita el servidor de IA (de pago por uso en Anthropic).
