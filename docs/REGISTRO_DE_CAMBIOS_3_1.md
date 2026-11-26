# Registro de cambios 3.1 — correcciones de la auditoría independiente

Fecha: 26/11/2026. Versión: 3.1.0.

Este registro corresponde a la **fase 2** de `docs/AUDITORIA_INDEPENDIENTE_3_0.md`. La fase 1 (solo documento, sin tocar código) quedó en el commit `1a2bcd9`. Las correcciones se hicieron después, en el commit `e73fbc9` y los siguientes.

**Ninguna prueba física se hizo en un carro para esta versión.** Todo lo de abajo se comprobó con pruebas automáticas: lógica en Node (`npm test`) y la app completa en Chrome con Playwright (`tests/e2e.py`, `tests/e2e_ia.py`), usando el simulador y datos de prueba.

## Estado de cada hallazgo

| ID | Estado | Qué se cambió | Dónde se prueba |
|---|---|---|---|
| C-01 | Corregido | `S.validarMedicion`: rangos físicos por unidad (V de −0.3 a 20, Ω ≥ 0, mA hasta 10 000), coherencia con la batería, "reposo" con más de 13.2 V se rechaza. Una medición inválida da `invalida` / **No verificable** y no se guarda. | `auditoria_3_0.test.js` (C-01); E2E: "14.2 V en reposo es imposible: inválida y no se guarda" |
| C-02 | Corregido | `corto_tierra` pide confirmar que se desconectaron **todas** las cargas del fusible. Sin eso, el resultado es **Probable**, nunca confirmado. El texto de aislamiento lo explica. | `auditoria_3_0.test.js` (C-02); E2E: "corto a tierra sin desconectar cargas: solo probable" |
| C-03 | Corregido | `S.contradiccionesFusibles`: inspección contra mediciones del mismo fusible. La contradicción queda en "no se puede determinar" como **No verificable**, con la prueba "repetir". Las mediciones contradictorias no se usan para concluir. | `auditoria_3_0.test.js` (C-03) |
| A-01 | Corregido | `S.evaluarVoltajeFusible` es simétrica: toma el lado mayor como entrada. Convierte texto a número. | `auditoria_3_0.test.js` (A-01) |
| A-02 | Corregido con evidencia parcial | `INT-1`: opcional, 20 A, "luces antiniebla delanteras", nivel **Etiqueta en foto**. `INT-20`: **en conflicto**, 7.5 A según las tablas y 10 A según la foto; se muestran los dos valores. `INT-24` y `MOT-10` incluyen el techo corredizo. | `electrico.test.js`, `auditoria_3_0.test.js` (A-02); E2E: "INT-20: fuentes en conflicto (7.5 A / 10 A)" |
| A-03 | Corregido | Se borraron o reescribieron las afirmaciones sin fuente: falla "conocida" del relé del A/C (ahora cita la publicación de repuestos registrada), ubicación del relé PGM-FI ("No confirmada", con sus fuentes), relés de vidrios y calefacción (ubicación "No documentada"), tipo de fusible ("No documentado"), protocolo (sin confirmar que la prueba fuera en este CR-V). | `auditoria_3_0.test.js` (A-03) |
| A-04 | Corregido con aviso | La caja interior y la del motor se dibujan con la disposición leída de las fotos (interior: 3 filas de 11 más 4 repuestos; motor: grilla irregular con los 4 relés). Cada caja dice que la disposición sale de una foto **sin confirmar que sea de tu carro** y cita la fuente. "Ver como lista" muestra la vista anterior con su aviso de "orientativa". | `auditoria_3_0.test.js` (A-04); E2E: "33 posiciones y 4 repuestos", "4 relés", "vista de lista: 38 posiciones" |
| A-05 | Corregido (modelo); **sin datos del CR-V** | Modelo de circuitos por tramos (`S.TIPOS_NODO`, `S.validarCircuito`, `S.textoCircuito`): batería, fusible, relé, switch, conector, empalme, componente, pin de la computadora, tierra; terminal y color por tramo. La fuente es obligatoria. La sección "Diagramas" dice que es un **visor de archivos** y que ScanIA **no conoce el cableado** hasta que cargues circuitos desde el manual. La búsqueda encuentra los circuitos cargados. | `auditoria_3_0.test.js` (A-05); E2E: "circuito sin fuente: no se guarda", "circuito con fuente: se guarda", "la búsqueda encuentra el circuito" |
| A-06 | Corregido | `S.hipotesisElectricas`: relé principal (PGM-FI), alimentación general, cortos, sobrecalentamiento ("olor a quemado" → **¡Detener!**), falso contacto, circuito modificado (fusible en posición libre + batería que se descarga). Todas quedan como **Sospechoso** con su prueba. | `auditoria_3_0.test.js` (A-06) |
| A-07 | Corregido | El amperaje leído en una foto se guarda aparte (`amperaje_foto`). Nunca cuenta como observado; solo genera "la foto sugiere X A, miralo en persona". Al guardar el fusible a mano, el dato de foto se conserva y se muestra aparte. | `auditoria_3_0.test.js` (A-07); `e2e_ia.py` |
| A-08 | Corregido | `S.NIVELES_EVIDENCIA`: Confirmado, Probable, Sospechoso, No verificable, Requiere medición física, Requiere documentación técnica. Cada elemento del diagnóstico, cada fusible, cada medición y el informe llevan su nivel. La interfaz muestra el nivel como etiqueta de color. | `auditoria_3_0.test.js` (A-08); E2E: "informe: variante sin confirmar, circuitos y niveles" |
| A-09 | Corregido | `S.diferenciarFalla`: no confirma el componente sin conector revisado; no sospecha de la computadora sin conector bien y sin descartar el corto. | `auditoria_3_0.test.js` (A-09); `electrico.test.js` |
| A-10 | Corregido (modelo); **sin datos del CR-V** | `S.faltaParaRele` dice qué falta para diagnosticar cada relé con multímetro. El dueño puede anotar ubicación, terminales, bobina (mín./máx.), alimentación, control y diodo **con fuente obligatoria**; la resistencia de bobina anotada se usa como especificación de la prueba "bobina del relé". El intercambio sigue siendo la única prueba sin documentación. | `auditoria_3_0.test.js` (A-10); E2E: "datos del relé sin fuente: no se guardan", "con terminales y fuente, solo pide lo que sigue faltando" |
| M-01 | Corregido | `tierra_componente` pide el voltaje del circuito (batería o referencia de ~5 V) y compara contra ese. | `auditoria_3_0.test.js` (M-01) |
| M-02 | Corregido | `alimentacion_componente`: medir con el conector conectado (por detrás) y aviso de circuitos que solo tienen voltaje unos segundos. | Texto revisado en `electrico.js` |
| M-03 | Corregido | `consumo_parasito`: selector mA / A (se convierte), aviso del código del radio Honda y de no cambiar de escala. | `auditoria_3_0.test.js` (M-03) |
| M-04 | Corregido | `rele_bobina`: advertencia de polaridad (diodo) y cable con fusible para la prueba de banco. | `auditoria_3_0.test.js` (M-04) |
| M-05 | Corregido | `S.compararDiagrama`: avisa si año, motor o mercado no coinciden, en la lista de diagramas y en la búsqueda. | `auditoria_3_0.test.js` (M-05); E2E: "diagrama de otro año/motor" |
| M-06 | Corregido | La variante de la ficha queda **sin confirmar** hasta que el dueño compare la etiqueta de su tapa. Cambiar de variante quita la confirmación. El informe lo dice. | E2E: "la variante empieza SIN confirmar", "el dueño puede confirmar", "deshacer" |
| M-07 | Corregido | `opcional` en las posiciones entre paréntesis de la tapa (1, 14, 16, 18, 20, 23, 27, 33). Una opcional vacía se trata como "sin uso", no como "falta". Tipo de fusible "No documentado". | `auditoria_3_0.test.js` (M-07); E2E: "tipo no documentado" |
| M-08 | Corregido | `continuidad_cable` dice "criterio general", no "del fabricante". | `auditoria_3_0.test.js` (M-08) |
| M-09 | Corregido | Cubierto por C-01: 14.2 V como "reposo" se rechaza. | E2E |
| M-10 | Corregido | Texto según el tipo de circuito del sensor (2 cables no tiene alimentación propia). | `electrico.test.js` |
| B-01 | Corregido | Transmisión, ABS por versión, sensores dentro del distribuidor y ELD marcados como conocimiento general sin fuente registrada. | Revisión de `fichas.js` |
| B-02 | Corregido | Las guías de caída de voltaje dicen "varía entre guías". | Texto |
| B-03 | Corregido | "Ampliar" agranda la caja física. | E2E (celular, caja ampliada sin desbordar) |
| B-04 | Corregido | Incluido en A-02. | — |
| B-05 | Aceptado | Los casos simulados usan la ficha del CR-V y lo dicen. | — |
| B-06 | Corregido | Al restaurar un respaldo se avisa cuántos archivos trae y cuántos se restauraron. | Revisión de `ui_mas.js` |

## Otras correcciones encontradas durante la fase 2

- La continuidad acepta "OL" en el campo de ohmios. "Continuidad sí" con OL se rechaza como datos contradictorios (antes daba un mensaje de "resistencia negativa").
- En celular, el nombre largo de la fuente de la foto desbordaba la pantalla. Ahora es una nota normal.

## Lo que el código no puede cerrar

1. **Manual de servicio de Honda del CR-V 2000 (B20Z, automático, 4x4):** diagramas, terminales de los relés, resistencia de las bobinas, pines de la computadora, puntos de tierra y valores de los sensores. Sin eso, ScanIA dice "Requiere documentación técnica".
2. **Confirmar las fotos de las tapas (S10-A0 y S10-E0):** no se sabe si son del CR-V del usuario ni de qué mercado. Hasta confirmarlo, la disposición física y los datos que salen de ellas quedan como "Etiqueta en foto (sin confirmar)". Las fotos **no** se subieron al repositorio.
3. **Pruebas físicas en el carro:** ninguna se hizo para esta versión. Ver `docs/PRUEBAS_FISICAS.md`.

## Resultado de las pruebas automáticas

- `npm test`: 107 de 107 (incluye las 15 de `tests/auditoria_3_0.test.js`, una por hallazgo o grupo).
- `tests/e2e.py`: 97 comprobaciones, todas bien (escritorio y celular de 390 px, sin desbordamiento ni errores de JavaScript).
- `tests/e2e_ia.py`: bien (servidor de IA falso; la foto deja el fusible como "posiblemente quemado", nunca confirmado).
