# ScanIA · escáner OBD2 con diagnóstico por evidencia

ScanIA convierte un adaptador **ELM327** barato (Bluetooth) y un teléfono Android o una laptop con Windows en un escáner para revisar los carros de la familia. Desde la versión 3.0 también guía el **diagnóstico eléctrico**: fusibles, relés, mediciones con multímetro, batería y carga, sensores y actuadores, diagramas y fotos. Lee códigos, datos en vivo, freeze frame, monitores y pruebas internas de la computadora; los relaciona entre sí con reglas locales que dicen **qué tan seguro** es cada hallazgo y **cómo confirmarlo antes de cambiar piezas**. La IA (Claude) es opcional y pasa por un servidor propio: la app funciona completa sin internet.

> **Estado: versión 3.1** (corrige la [auditoría independiente de la 3.0](docs/AUDITORIA_INDEPENDIENTE_3_0.md)). Pasa 107 pruebas automáticas, una prueba de punta a punta de la interfaz en Chrome (escritorio y celular, 97 verificaciones) y una de la IA con un servidor falso. Cada conclusión eléctrica dice si está **confirmada, es probable, sospechosa, no verificable, o si requiere medición física o documentación técnica**. **Prueba física:** el 22/11/2026 ScanIA conectó con un carro real (no CAN) desde una laptop con Windows, leyó 7 códigos y las pruebas internas (falta confirmar modelo y adaptador para marcarlo como aprobado). **El módulo eléctrico no se ha probado con un carro ni con un multímetro.** Plan: [docs/PRUEBAS_FISICAS.md](docs/PRUEBAS_FISICAS.md).

App publicada (cuando GitHub Pages esté activado): **https://hekron00.github.io/scania/**

---

## Estado por función

| Función | Implementada | Prueba automática | Prueba física | Limitaciones |
|---|---|---|---|---|
| Conexión ELM327 Bluetooth clásico (Web Serial) | Sí | Sí (ELM327 falso) | Funcionó 1 vez (22/11/2026, Windows, carro real no CAN); falta confirmar modelo y adaptador; Android no probada | Android: Chrome 138+. Windows: Chrome 117+ (Edge esperado igual, sin confirmar). No funciona desde el navegador interno de otras apps ni en iPhone. |
| Conexión ELM327 BLE (Web Bluetooth) | Sí | Parcial | No probada | Solo adaptadores BLE con servicios serie comunes. Web Bluetooth **no** conecta Bluetooth clásico. |
| Conexión USB (compu) | Sí | Sí | No probada | No en Android. |
| Adaptador WiFi | No | — | — | El navegador no abre conexiones TCP. |
| Varios adaptadores recordados, olvidar, reconectar | Sí | Sí | No probada | Recordar depende del permiso que guarda Chrome. |
| Detección de desconexión y de reinicio del adaptador | Sí | Sí | No probada | — |
| Diagnóstico de conexión exportable | Sí | Sí (simulador) | No probada | — |
| Protocolos CAN 11/29 bits | Sí | Sí | No probada | — |
| Protocolos ISO 9141-2, KWP2000, J1850 | Sí | Sí (incluido adaptador virtual ISO 9141-2) | Funcionó 1 vez (22/11/2026, Windows, carro real no CAN); falta confirmar modelo y adaptador (protocolo exacto sin anotar) | Un dato por consulta (más lento). |
| Modo 01 datos en vivo (solo los soportados; sin datos viejos ni imposibles) | Sí | Sí | No probada | — |
| Sensores de oxígeno de todos los bancos (PID 13/1D), banda ancha | Sí | Sí | No probada | — |
| Modo 02 freeze frame con su mapa | Sí | Sí | No probada | — |
| Modos 03 / 07 / 0A (confirmados, pendientes, permanentes) | Sí | Sí | Funcionó 1 vez (22/11/2026, Windows, carro real no CAN); falta confirmar modelo y adaptador: leyó 7 códigos | 0A raro en carros viejos. |
| Modo 04 borrar códigos (con confirmación y escaneo guardado) | Sí | Sí | No probada | La computadora puede rechazarlo (se explica el motivo). |
| Modo 06 en CAN (nombres y escalas estándar) | Sí | Sí | No probada | — |
| Modo 06 en protocolos no CAN | Sí (valores originales) | Sí | Funcionó 1 vez (22/11/2026, Windows, carro real no CAN); falta confirmar modelo y adaptador: mostró 2 resultados fuera de límite | Sin interpretación por componente: la define cada fabricante. |
| Modo 09 VIN / calibración | Sí | Sí | No probada | Muchos carros antes de ~2005 no entregan el VIN. |
| Servicio $05 (O2 en no CAN) | No | — | — | Formato no verificado: no se inventó. |
| Respuestas negativas 7F y errores del ELM327 | Sí | Sí | No probada | — |
| Diagnóstico local por evidencia (motores con MAF y con MAP) | Sí | Sí (12 escenarios + Honda simulado) | No probada | Orienta: no reemplaza pruebas físicas. |
| Síntomas relacionados con los datos | Sí | Sí | No aplica | — |
| 15 pruebas guiadas (8 partes cada una) | Sí | Sí (evaluadores) | No probada | Compresión y presión de combustible solo interpretan resultados del taller. |
| Perfil Honda CR-V 1997–2001 (B20) | Sí | Sí | No probada | Sin validar con información de servicio de Honda. |
| Datos del manual por carro | Sí | Sí | No aplica | La app no trae valores de fábrica. |
| Mis carros, mantenimiento, historial, comparación | Sí | Sí | No aplica | — |
| Odómetro en km o millas | Sí | Sí | No aplica | — |
| Revisión de carro usado | Sí | Sí | No probada | — |
| Reportes y respaldo/restauración | Sí | Sí | No aplica | Todo queda en el dispositivo: respaldá seguido. |
| Modo tablero (sin tocar el teléfono) | Sí | Sí | No probada | — |
| IA con servidor propio (Cloudflare Worker) | Sí | Sí (servidor y Anthropic falsos) | No probada con la API real | Requiere desplegar el servidor y su clave. |
| Revisión automática de la respuesta de la IA | Sí | Sí | No aplica | Detecta códigos o lecturas no leídos; no garantiza que el resto sea correcto. |
| ABS, bolsas de aire, carrocería, datos propios de transmisión | No | — | — | No son OBD-II genérico. |
| **Sistema eléctrico (3.0, corregido en 3.1)** | | | | |
| Ficha técnica por vehículo con fuentes y verificación | Sí (Honda CR-V 2000–2001 EE. UU./Canadá) | Sí | No probada | Fuentes secundarias y dos fotos de tapas de origen sin confirmar; posición 20 en conflicto (7.5 A / 10 A); variante sin confirmar hasta que la compares con tu tapa; sin manual de servicio. |
| Cajas de fusibles interactivas (interior, motor, ABS, principales, relés) | Sí | Sí | No probada | Interior y motor con la disposición de las fotos de las tapas (sin confirmar que sean de tu carro); ABS en lista orientativa. Relés sin terminales ni bobina documentados: se anotan desde tu manual con fuente. |
| Inspección de fusibles (quemado, ausente, amperaje, tipo, falso contacto, se vuelve a quemar, intercambios) | Sí | Sí | No probada | Lo confirma tu medición; a ojo o por foto queda "probable". |
| Fusibles anotados desde la etiqueta de la tapa | Sí | Sí | No aplica | — |
| Mediciones con multímetro (14 pruebas, 8 partes cada una) | Sí | Sí | No probada | Sin valor del manual: "Valor de referencia no disponible". Mediciones imposibles o contradictorias: "no verificable" y no se guardan. Corto a tierra solo confirmado con todas las cargas desconectadas. |
| Batería, arranque y carga combinando fuentes | Sí | Sí | No probada | El voltaje OBD solo es orientativo. |
| Sensores y actuadores (16 componentes) | Sí | Sí | No probada | Tipos de sensor "más comunes": confirmar con el diagrama. |
| Causa común eléctrica en el análisis | Sí | Sí | No probada | Son hipótesis hasta medir. |
| Visor y búsqueda de diagramas | Sí (los que subas) | Sí | No aplica | Es un visor de archivos: ScanIA no lee tus diagramas. Avisa si el año, el motor o el mercado no coinciden. |
| Circuitos documentados (batería → fusible → relé → conector → componente → tierra) | Sí (los que cargues, con fuente) | Sí | No aplica | La ficha del CR-V no trae ninguno: ScanIA no conoce el cableado hasta que lo cargues del manual. |
| Hipótesis por síntomas (relé principal, alimentación general, corto, olor a quemado, intermitencia, circuito agregado) | Sí | Sí | No probada | Son sospechas con su prueba, nunca conclusiones. |
| Fotos con IA (confirmada / probable / insuficiente / física) | Sí | Sí (servidor falso) | No probada con la API real | Requiere el servidor de IA. |
| Informe eléctrico PDF/JSON | Sí | Sí | No aplica | — |
| 12 casos eléctricos + 6 fallas eléctricas en el simulador | Sí | Sí | No aplica | Simulación: no prueba el hardware. |

## Qué hace

- **Conexión**: Bluetooth clásico (la mayoría de ELM327) por Web Serial, Bluetooth BLE por Web Bluetooth, USB en la compu. Una sola orden a la vez, resincronización ante respuestas tardías, detección de reinicio y desconexión, adaptadores recordados, diagnóstico de conexión y registro técnico exportables.
- **Protocolos**: CAN 11 y 29 bits, ISO 9141-2, KWP2000 y SAE J1850, detectados automáticamente. La app **nunca dice "conectado al carro" si solo respondió el adaptador**.
- **Modos OBD2**: 01, 02 (con su mapa), 03/07/0A, 04 (con confirmación), 06 (CAN con nombres; no CAN en valores originales), 09.
- **Datos honestos**: un sensor que no responde no se repite como lectura nueva; un valor físicamente imposible (por ejemplo, 215 °C de un sensor en corto) se marca y no se usa para diagnosticar; un PID no soportado no se confunde con un cero.
- **Diagnóstico local (sin internet)**: relaciona códigos (confirmados, pendientes, permanentes), freeze frame, lazo de combustible, ajustes de mezcla, MAF o MAP, vacío, O2 y banda ancha de todos los bancos, voltaje con motor encendido y apagado, temperaturas, modo 06 y síntomas. Cada hallazgo trae evidencia, condiciones de medición, referencia aplicable, certeza de la condición (*confirmada / sospecha / posibilidad*), urgencia, causas, qué no se puede distinguir solo con OBD, prueba para confirmar y qué **no** cambiar todavía. Sin porcentajes inventados.
- **Pruebas guiadas** por sistema (eléctrico, motor y mezcla, refrigeración, sensores, taller), cada una con preparación, herramientas, procedimiento, condiciones, referencias, interpretación, resultado y próxima prueba. Ninguna pide manejar ni acelerar a fondo en marcha.
- **Perfiles de vehículo**: el del Honda CR-V 1997–2001 separa lo que se ve por OBD genérico, lo que necesita el escáner de Honda y lo que necesita pruebas físicas. Ver [docs/HONDA_CRV_2000_B20Z.md](docs/HONDA_CRV_2000_B20Z.md).
- **Sistema eléctrico** (3.0, corregido en 3.1): niveles de evidencia, validación de mediciones, contradicciones, fichas técnicas con fuentes, cajas de fusibles interactivas, inspección de fusibles y relés, mediciones con multímetro sin valores inventados, batería/arranque/carga, sensores y actuadores, causa común, diagramas propios, fotos con IA e informe. Ver [docs/DIAGNOSTICO_ELECTRICO.md](docs/DIAGNOSTICO_ELECTRICO.md).
- **Mis carros**, **revisión de carro usado**, **reportes**, **respaldo**, **modo tablero**, **unidades** y **simulador** (carro moderno CAN con MAF o Honda 2000 ISO 9141-2 con MAP; 12 fallas del carro y 4 del adaptador; siempre marcado como simulador).

## Cómo usarla

### Android (Chrome 138 o más nuevo)
1. Conectá el adaptador al puerto OBD2 (casi siempre debajo del tablero; en algunos carros, como el CR-V 1997–2001, junto a la consola central) y poné la llave en ON o encendé el motor.
2. **Solo la primera vez**: en *Ajustes → Bluetooth* del teléfono, emparejá el adaptador (se llama `OBDII`, `OBD II` o parecido; PIN `1234` o `0000`).
3. Abrí la app **en Chrome** (no desde el enlace dentro de WhatsApp u otra app). Tocá **Instalar app** (o menú ⋮ → *Agregar a pantalla principal*).
4. **Escanear → Conectar adaptador** y elegilo de la lista. Las siguientes veces aparece en la lista de adaptadores recordados.

### Windows (Chrome o Edge)
1. Emparejá el adaptador en *Configuración → Bluetooth y dispositivos → Agregar dispositivo* (PIN `1234` o `0000`).
2. Abrí la app (el enlace de arriba) o, sin internet, el archivo [`dist/ScanIA.html`](dist/ScanIA.html) con doble clic.
3. **Conectar adaptador** y elegí el dispositivo (puede aparecer como `OBDII` o como *Standard Serial over Bluetooth link (COMx)*).

Si algo falla: **Escanear → Diagnóstico de conexión → Descargar .json**. Detalles en [docs/COMPATIBILIDAD_REAL.md](docs/COMPATIBILIDAD_REAL.md).

### IA (opcional)
1. Desplegá el servidor gratis en Cloudflare: [servidor/LEEME.md](servidor/LEEME.md). La clave de Anthropic queda **solo** ahí, como secreto.
2. En la app: **⚙ Ajustes → Servidor de IA**, pegá la dirección y el código familiar y tocá **Probar conexión**.
3. Antes de consultar podés tocar **Ver qué se envía**.

## Privacidad y seguridad
- Todo (carros, escaneos, diagnósticos) se guarda **solo en el dispositivo**. Si el navegador no deja guardar, la app avisa. El respaldo es un archivo JSON que descargás vos.
- La clave de Anthropic **nunca** está en la app, el repositorio, `localStorage` ni IndexedDB.
- El servidor exige el código familiar, bloquea una dirección tras 6 códigos equivocados en 15 minutos, solo acepta tu sitio (CORS), limita consultas por minuto y por día, valida modelo, tamaño, herramientas y cantidad de fotos, y no devuelve la clave en ningún error.
- El **VIN no se envía** a la IA ni a la NHTSA salvo que lo permitás en *Ajustes → Privacidad*. El apodo del carro nunca se envía. El registro técnico y el diagnóstico de conexión tapan el VIN.
- La IA recibe los sensores que el carro reporta y los que no; ScanIA revisa su respuesta y avisa si cita códigos o lecturas que no existen.
- El módulo eléctrico nunca recomienda un fusible de más amperaje ni medir resistencia con el circuito energizado, y excluye los circuitos de bolsas de aire.
- La app no manda comandos que accionen componentes ni toquen sistemas de seguridad. El único comando que cambia algo es borrar códigos (modo 04), con confirmación y escaneo guardado antes.

## Desarrollo
```
src/              código fuente (JavaScript sin dependencias, HTML y CSS)
servidor/         servidor de IA (Cloudflare Worker)
tests/            pruebas automáticas (Node) y de punta a punta (Python + Playwright)
docs/             auditoría, compatibilidad, Honda CR-V, pruebas físicas, registro de cambios
index.html …      app construida (la publica GitHub Pages)
dist/ScanIA.html  app en un solo archivo, para usar sin internet
```
```bash
npm test            # 107 pruebas: parser ELM327, protocolos, fallas del adaptador, diagnóstico, eléctrico, IA, servidor, regresiones
npm run build       # arma index.html, sw.js, manifest, íconos y dist/ScanIA.html (requiere Python 3 + Pillow)
npm run e2e         # prueba la interfaz en Chrome sin pantalla con el simulador (requiere Playwright)
python3 tests/e2e_ia.py   # pantalla de IA con un servidor falso
```
Publicar: en GitHub, **Settings → Pages → Deploy from a branch → `main` / `(root)`**.

## Documentos
- [Auditoría independiente de la 2.0](docs/AUDITORIA_INDEPENDIENTE_2_0.md) (39 hallazgos)
- [Registro de cambios 2.1](docs/REGISTRO_DE_CAMBIOS_2_1.md)
- [Compatibilidad real](docs/COMPATIBILIDAD_REAL.md)
- [Honda CR-V 2000 B20Z](docs/HONDA_CRV_2000_B20Z.md)
- [Plan de pruebas físicas](docs/PRUEBAS_FISICAS.md)
- [Diagnóstico eléctrico](docs/DIAGNOSTICO_ELECTRICO.md)
- [Compatibilidad eléctrica por vehículo](docs/COMPATIBILIDAD_ELECTRICA_VEHICULOS.md)
- [Auditoría independiente de la 3.0](docs/AUDITORIA_INDEPENDIENTE_3_0.md) y [registro de cambios 3.1](docs/REGISTRO_DE_CAMBIOS_3_1.md)

ScanIA orienta el diagnóstico; no reemplaza la revisión física de un mecánico. Nunca uses el teléfono mientras manejás.
