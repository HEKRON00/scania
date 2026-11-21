# Compatibilidad real de ScanIA 2.1

Este documento separa tres cosas que no son lo mismo:

- **Documentado**: lo que dicen las especificaciones o la documentación oficial del navegador.
- **Prueba automática**: lo que se comprobó con el ELM327 falso de las pruebas (`tests/`), el adaptador virtual del simulador y Chrome sin pantalla.
- **Prueba física**: con un adaptador real y un carro real. **A la fecha de esta versión no se ha hecho ninguna prueba física.** Todo lo que dependa del hardware queda como *No probada* hasta que se complete `docs/PRUEBAS_FISICAS.md`.

---

## 1. Qué permite cada tecnología del navegador

| Tecnología | Para qué sirve | Qué NO hace | Dónde existe |
|---|---|---|---|
| **Web Serial** con Bluetooth RFCOMM | Abrir un puerto serie con un dispositivo **Bluetooth clásico ya emparejado** que ofrece el perfil de puerto serie (SPP). Es la vía para los ELM327 Bluetooth clásicos. | No busca ni empareja dispositivos: el emparejamiento se hace antes en el sistema operativo. | Chrome de escritorio desde la versión 117. Chrome para Android desde la 138 (estable desde el 24 de junio de 2025). |
| **Web Serial** con USB | ELM327 con cable USB. | — | Solo en computadora. En Android, Chrome no habilita puertos serie USB (la política para USB queda para cuando Android lo soporte a nivel de sistema). |
| **Web Bluetooth** | Dispositivos **Bluetooth Low Energy (BLE / 4.0)** mediante GATT. | **No conecta Bluetooth clásico ni el perfil SPP.** Un ELM327 Bluetooth clásico nunca va a aparecer por esta vía. | Chrome/Edge en Android, Windows, macOS, ChromeOS. |
| Evento `connect`/`disconnect` y atributo `connected` en puertos Bluetooth | Saber si el puerto Bluetooth está disponible sin abrirlo. | — | Chrome de escritorio 130+. ScanIA lo usa si existe y si no, funciona igual. |
| **WebView** (navegadores internos de apps) | — | No tiene Web Serial. Si abrís el enlace de ScanIA desde WhatsApp, TikTok, Facebook, etc., se abre en un WebView y **no va a poder conectar**. Abrilo en Chrome. | — |
| Safari / iPhone / iPad | — | Sin Web Serial ni Web Bluetooth. | — |
| Firefox | — | Sin Web Serial (solo lo implementa Chromium). | — |
| Microsoft Edge | Usa el mismo motor que Chrome; se espera el mismo soporte de Web Serial por Bluetooth en las mismas versiones. | **No verificado** con documentación propia de Edge ni con un adaptador. | Windows. |

Fuentes: blog de Chrome *Serial over Bluetooth on the web* (Chrome 117 escritorio), notas de versión de Chrome 138 (Web Serial por Bluetooth en Android), *Bluetooth RFCOMM updates in Web Serial* (Chrome 130), *Intent to Ship* de Web Serial en Android (WebView sin soporte).

## 2. Matriz por plataforma y adaptador

Columnas: **Doc** = documentado · **Auto** = prueba automática · **Física** = prueba con el adaptador real.

| Plataforma | Adaptador | Botón en ScanIA | Doc | Auto | Física |
|---|---|---|---|---|---|
| Android + Chrome 138 o más nuevo | ELM327 Bluetooth clásico (tus dos adaptadores) | **Conectar adaptador** (Web Serial) | Sí | Sí (ELM327 falso por la misma capa de transporte) | **No probada** |
| Android + Chrome menor a 138 | ELM327 Bluetooth clásico | — | No compatible | — | — |
| Android + Chrome | ELM327 BLE | *Conectar por BLE* | Sí | Parcial (sin BLE real) | No probada |
| Windows + Chrome 117 o más nuevo | ELM327 Bluetooth clásico emparejado | **Conectar adaptador** | Sí | Sí | **No probada** |
| Windows + Edge | ELM327 Bluetooth clásico emparejado | **Conectar adaptador** | Esperado (mismo motor), sin confirmar | Sí (misma lógica) | **No probada** |
| Windows + Chrome/Edge | ELM327 USB | **Conectar adaptador** | Sí | Sí | No probada |
| Cualquier plataforma | ELM327 WiFi | — | No compatible: el navegador no abre conexiones TCP a un equipo de la red local | — | — |
| iPhone / iPad | Cualquiera | — | No compatible | — | — |
| Cualquier navegador | Simulador, análisis, carros, reportes, respaldo, IA | — | Sí | Sí | No aplica |

## 3. Cómo maneja ScanIA la conexión (lo que se probó automáticamente)

**Una sola orden a la vez.** Todas las órdenes al adaptador pasan por una cola. Nunca se mandan dos comandos simultáneos: cada orden espera el signo `>` del ELM327 antes de enviar la siguiente.

**Inicio (en este orden):**

| Orden | Para qué | Si falla |
|---|---|---|
| `ATZ` (los reintentos usan `ATWS`) | Reinicia el ELM327 | Tres intentos; si no responde: "El adaptador no responde" (no se declara conectado) |
| `ATE0`, `ATL0`, `ATS0` | Sin eco, sin saltos de línea extra, sin espacios | Se toleran: el lector descarta el eco y acepta espacios |
| `ATH0`, `ATAT1`, `ATSP0` | Sin encabezados mientras se busca, tiempo de espera adaptativo, búsqueda automática de protocolo | Se toleran |
| `ATI` | Versión del adaptador | Solo informativo |
| `0100` (hasta 2 intentos, 20 s) | Hace que el adaptador busque el protocolo y confirma que **la computadora del carro** responde | "El adaptador funciona, pero la computadora del carro no responde": no se declara conectado |
| `ATDPN`, `ATDP` | Número y nombre del protocolo encontrado | — |
| Solo en CAN: `ATH1` + `0100` | Encabezados para saber qué computadora responde cada cosa | Si la respuesta con encabezados no se entiende (clones), vuelve a `ATH0` y lo anota |
| `0100`, `0120`… `01C0`, PID `13`/`1D` | Sensores soportados y ubicación de los sensores de oxígeno | — |
| `ATRV` (si el carro no tiene PID 42) | Voltaje en el conector OBD | Solo informativo |

Si el adaptador se reinicia durante el uso, se repite `ATE0`, `ATL0`, `ATS0`, `ATH1`/`ATH0`, `ATAT1` y `ATSPA` + número de protocolo ya detectado.

**Respuestas difíciles que se reconocen:** `SEARCHING...`, `BUS INIT: ...OK`, `NO DATA`, `UNABLE TO CONNECT`, `BUFFER FULL`, `DATA ERROR`, `<DATA ERROR`, `STOPPED`, `CAN ERROR`, `BUS ERROR`, `BUS BUSY`, `FB ERROR`, `ERRxx`, `?`, `LV RESET`, `ACT ALERT`, y respuestas negativas de la computadora `7F xx yy` (con su significado). Ninguna se descarta en silencio: quedan en el registro técnico y en el diagnóstico de conexión.

**Respuestas tardías.** Si llega texto de una orden anterior, ScanIA lo detecta y se resincroniza con `ATI` antes de seguir.

**Adaptador que se reinicia** (típico al dar arranque, por la caída de voltaje): si aparece de nuevo el texto de bienvenida o el eco, ScanIA lo detecta, vuelve a configurar el adaptador con el mismo protocolo (`ATSPA` + número) y avisa. La lectura de ese momento se marca como cortada.

**Desconexión.** Se escucha el evento `disconnect` del puerto y el fin del flujo de lectura. La app deja de decir "conectado" de inmediato y ofrece **Reconectar**.

**Adaptadores recordados.** Chrome recuerda los puertos a los que diste permiso. ScanIA los lista (útil con dos adaptadores) y deja **Olvidar** cada uno.

**Diagnóstico de conexión** (Escanear → *Diagnóstico de conexión*): revisa navegador, Web Serial, BLE, contexto seguro, adaptador (`ATI`, `AT@1`, `ATRV`), protocolo, encabezados, lectura múltiple, sensores soportados, mapa de sensores de oxígeno, VIN y velocidad de lectura (15 lecturas). Se puede copiar o descargar en `.txt` y `.json`. El VIN sale tapado.

## 4. Protocolos del carro

| Función | CAN 11 bits | CAN 29 bits | ISO 9141-2 | KWP2000 | SAE J1850 |
|---|---|---|---|---|---|
| Detectar protocolo y confirmar que el carro (no solo el adaptador) responde | Auto ✓ | Auto ✓ | Auto ✓ | Auto ✓ | Auto ✓ |
| Datos en vivo (modo 01) | varios por consulta | varios por consulta | uno por uno | uno por uno | uno por uno |
| Qué computadora reporta cada código | ✓ (encabezados) | ✓ | no aplica | no aplica | no aplica |
| Códigos 03 / 07 / 0A | ✓ | ✓ | ✓ (0A raro) | ✓ (0A raro) | ✓ (0A raro) |
| Freeze frame (02) con su mapa de PIDs | ✓ | ✓ | ✓ | ✓ | ✓ |
| Modo 06 | ✓ con nombres y escalas estándar | ✓ | **valores originales** (TID, componente, valor, límite y si pasó); sin interpretación por componente | igual que ISO 9141-2 | igual |
| VIN (09) | ✓ | ✓ | depende del carro (poco común antes de ~2005) | depende | depende |
| Sensores de oxígeno: todos los bancos (PID 13 o 1D), voltaje, λ, banda ancha | ✓ | ✓ | ✓ | ✓ | ✓ |
| Servicio $05 (sensores O2 en protocolos no CAN) | **No implementado**: el formato no se pudo confirmar con una fuente verificable | | | | |
| ABS, bolsas de aire, módulos de carrocería | No es OBD-II genérico | | | | |

Todo lo anterior: prueba automática sí, **prueba física no**.

## 5. Si el navegador no puede conectar tu adaptador

1. Confirmá que abriste ScanIA **en Chrome** (no desde el navegador interno de otra app) y que es la versión 138 o más nueva en Android.
2. Confirmá que el adaptador está **emparejado** en los ajustes de Bluetooth del teléfono o de Windows.
3. Abrí *Diagnóstico de conexión* y guardá el resultado.
4. Si el adaptador no aparece en la lista de Chrome aunque esté emparejado, puede que use un servicio RFCOMM distinto al SPP estándar. Mandá el diagnóstico: con el identificador del servicio se puede agregar.

### Alternativa si el navegador no sirve: puente nativo para Android (no incluido)

No está implementado; se documenta como camino posible:

- **Opción A — app puente mínima.** Una app Android abre el socket RFCOMM con el UUID estándar de SPP (`00001101-0000-1000-8000-00805F9B34FB`) usando las APIs nativas de Bluetooth y reenvía los bytes por un WebSocket en `127.0.0.1`. ScanIA necesitaría un transporte nuevo (`TransporteWebSocket`) con la misma interfaz que `TransporteSerial`. Hay que verificar en el teléfono que Chrome permita esa conexión local desde una página `https`.
- **Opción B — app con WebView.** Empaquetar ScanIA dentro de una app Android con WebView y una interfaz JavaScript nativa que haga de transporte. El WebView **no** tiene Web Serial, así que todo el Bluetooth lo haría el código nativo.

Ambas requieren permisos de Bluetooth de Android, firma de la app e instalación fuera de la tienda. Solo vale la pena si la prueba física demuestra que Chrome no conecta tus adaptadores.

## 6. Adaptadores clones

| Tipo | Qué puede pasar | Qué hace ScanIA |
|---|---|---|
| ELM327 "v1.5" (los más comunes) | Responden bien a los comandos básicos | Configuración normal |
| ELM327 "v2.1" | Muchos son clones recortados que fallan con `ATH1` u otros comandos | Si `ATH1` falla, sigue sin encabezados y lo avisa |
| Adaptadores que se reinician al dar arranque | Pierden la configuración | Detecta el reinicio, reconfigura y marca la lectura como cortada |
| Adaptadores lentos | Tiempos agotados | Tiempos adaptativos, reintentos contados y velocidad de lectura medida (con menos de ~4 lecturas por segundo, la prueba del sensor de oxígeno queda como "no concluyente") |

Nada de esta tabla está confirmado con tus dos adaptadores físicos todavía.
