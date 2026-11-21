# Auditoría de ScanIA (antes de la versión 2)

Fecha: 20 de noviembre de 2026.

Los repositorios `HEKRON00/scania` y `HEKRON00/scania-` estaban **vacíos**. La auditoría se hizo sobre el código fuente de la app web que existía hasta ese momento (`src/`, `construir.py`, `tests/`). También se revisó la primera versión en Python (panel Flask), que ya no se usa.

## 1. Qué existía y funcionaba (verificado con pruebas)

| Área | Estado real | Cómo se verificó |
|---|---|---|
| Conexión Web Serial (Bluetooth clásico/USB) y Web Bluetooth (BLE) | Implementada | Puerto falso en Chrome sin interfaz; nunca con un adaptador físico |
| Driver ELM327: ATZ/ATE0/ATL0/ATS0/ATH0/ATSP0, búsqueda de protocolo, cola de comandos | Implementado | Emulador ELM327 (CAN) y adaptador falso |
| Modos 01, 02, 03, 04, 07, 09 (VIN), 0A | Implementados | Emulador y respuestas sintéticas CAN y KWP |
| Base de códigos en español | 178 códigos | Pruebas unitarias |
| Reglas locales (mezcla, fuga de vacío, termostato, alternador, O2, catalizador, ralentí, monitores, freeze frame) | Implementadas | 8 escenarios del simulador × 3 semillas |
| IA (diagnóstico JSON + chat de seguimiento) | Implementada, llamada **directa desde el navegador** | Respuestas simuladas; nunca con una clave real |
| Simulador (8 fallas) | Funcionaba a nivel de "datos ya interpretados" | Pruebas |
| Historial y reporte imprimible | Solo para diagnósticos de IA | Navegador sin interfaz |
| PWA (manifest, service worker, íconos) | Implementada | Registro del service worker en localhost |

## 2. Cosas mencionadas que NO existían en el código

- Contadores de misfire por cilindro (modo 06): **no existían**.
- Sensores de banda ancha (A/F) y estado de lazo abierto/cerrado (PID 03): **no existían**.
- Lectura de varios sensores por consulta (multi-PID): **no existía**.
- Registro técnico, reconexión, pruebas guiadas, "Mis carros", mantenimiento, modo tablero, revisión de usado, buscador de códigos, respaldo/restauración, unidades configurables: **no existían**.
- Diagnóstico por fabricante (ABS, SRS, transmisión, BCM): **no existe** y no se puede hacer con OBD2 genérico sin documentación de cada marca (ver `COMPATIBILIDAD.md`).

## 3. Problemas encontrados, por prioridad

### Críticos (seguridad y confiabilidad)
1. **Clave de Anthropic guardada en `localStorage` y usada desde el navegador.** Cualquiera con acceso al teléfono o a una extensión del navegador podría leerla. → Se reemplazó por un **servidor propio** (Cloudflare Worker) con la clave en una variable de entorno, código familiar y límite de solicitudes.
2. **Respuestas atrasadas del ELM327.** Si un adaptador lento respondía después del tiempo de espera, esa respuesta podía asignarse al comando siguiente. → Se resincroniza el canal después de cada tiempo de espera vencido.
3. **Sin encabezados CAN (ATH0).** Si respondían dos computadoras con mensajes de varias tramas, las tramas se podían mezclar. Tampoco se sabía qué computadora reportaba cada código. → Se activan los encabezados (ATH1) en CAN y se arma ISO-TP por computadora.
4. **El VIN se enviaba a la NHTSA y a la IA sin pedir permiso.** → Ahora es opcional y está apagado por defecto.

### Importantes (precisión del diagnóstico)
5. La IA daba **porcentajes de probabilidad inventados**. → Ahora usa niveles de certeza razonados (confirmada / sospecha / posibilidad), cada uno con su evidencia.
6. Los hallazgos locales no decían qué tan seguros eran, cuál era la prueba para confirmarlos ni el resultado esperado. → Se agregó una estructura completa a cada hallazgo.
7. No se leían el PID 03 (lazo abierto/cerrado), los sensores de banda ancha ni el modo 06. Los ajustes de combustible se juzgaban por temperatura y no por el estado real del control de mezcla.
8. No se detectaban datos imposibles o contradictorios (sensor desconectado, velocidad sin RPM).
9. El simulador no pasaba por el driver ELM327, así que las pruebas no ejercitaban el parser real. Tampoco había fallas de protocolo (respuestas incompletas, tiempo de espera, desconexión).

### Funcionales
10. Solo se guardaban los diagnósticos de IA. Los escaneos no, y al borrar códigos se perdía la información. → Ahora se guarda el escaneo automáticamente antes de borrar.
11. No había vehículos, mantenimiento, comparación de escaneos ni revisión de carro usado.
12. No había unidades configurables, ni la fuente, la validez y la hora de cada dato.
13. No había reconexión ni registro técnico exportable.
14. La interfaz era una sola página larga, sin panel principal ni navegación.
15. Las pruebas automáticas quedaron rotas durante la transición a la versión 2.

### Limitaciones que no son errores (dependen del carro o del adaptador)
- Modo 06 solo en formato CAN. En protocolos viejos (ISO 9141, KWP, J1850) el formato del modo 06 es distinto y depende del fabricante.
- Sensores de oxígeno del banco 2: el número de PID depende de cómo estén ubicados los sensores (PID 13 o 1D). Por ahora solo se leen los del banco 1.
- iPhone: Safari no permite Web Serial ni Web Bluetooth.

## 4. Estado al cerrar la versión 2

Todos los problemas de las secciones 3 (1 a 15) quedaron corregidos en el código y cubiertos por pruebas automáticas (`npm test`: 44 pruebas; `npm run e2e`: prueba de la interfaz en Chrome con el simulador). Lo que sigue pendiente está en el README ("Qué está terminado y qué falta") y en `docs/COMPATIBILIDAD.md`. La prueba con un carro real y con los adaptadores físicos **no se ha hecho**.
