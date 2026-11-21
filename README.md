# ScanIA · escáner OBD2 con diagnóstico por evidencia

ScanIA convierte un adaptador **ELM327** barato (Bluetooth) y un teléfono Android o una laptop con Windows en un escáner para revisar los carros de la familia. Lee códigos, datos en vivo, freeze frame, monitores y pruebas internas de la computadora; los relaciona entre sí con reglas locales que dicen **qué tan seguro** es cada hallazgo y **cómo confirmarlo antes de cambiar piezas**. La IA (Claude) es opcional y pasa por un servidor propio: la app funciona completa sin internet.

> **Estado: versión 2.0.** Probada con 44 pruebas automáticas, un adaptador ELM327 falso, el adaptador virtual del simulador y una prueba de punta a punta en Chrome. **Todavía no se probó con un carro real ni con los adaptadores físicos.** Ver [docs/COMPATIBILIDAD.md](docs/COMPATIBILIDAD.md).

App publicada (cuando GitHub Pages esté activado): **https://hekron00.github.io/scania/**

---

## Qué hace

- **Conexión**: Bluetooth clásico (la mayoría de ELM327) por Web Serial, Bluetooth BLE por Web Bluetooth, USB en la compu. Reconexión, adaptador recordado, registro técnico exportable.
- **Protocolos**: CAN 11 y 29 bits (ISO 15765-4), ISO 9141-2, KWP2000 (ISO 14230-4) y SAE J1850, detectados automáticamente. La app **nunca dice "conectado al carro" si solo respondió el adaptador**.
- **Modos OBD2**: 01 (datos en vivo, varios a la vez en CAN), 02 (freeze frame), 03/07/0A (códigos almacenados, pendientes y permanentes, con la computadora que los reporta), 04 (borrar, con confirmación y escaneo guardado antes), 06 (pruebas internas: misfire por cilindro, catalizador, sensores O2), 09 (VIN, calibración).
- **Diagnóstico local (sin internet)**: relaciona códigos, freeze frame, lazo de combustible, ajustes de mezcla, eficiencia volumétrica, O2, voltaje, temperaturas y modo 06. Cada hallazgo trae: evidencia, nivel de certeza (*confirmada / sospecha / posibilidad*), causas ordenadas, otras posibilidades, prueba para confirmar, resultado esperado, qué **no** cambiar todavía y si se hace en casa o con mecánico. Sin porcentajes inventados.
- **Pruebas guiadas**: batería y arranque, alternador con carga, sensor de oxígeno, fuga de vacío/mezcla, respiración del motor (riesgo alto, con advertencia), fallos por cilindro, termostato. Cada una dice herramientas, condiciones, dificultad, riesgo y valores de referencia.
- **Mis carros**: datos de cada carro, mantenimiento con recordatorios configurables, reparaciones, historial de escaneos, pruebas y diagnósticos, comparación entre dos escaneos.
- **Revisión de carro usado**: códigos (incluidos permanentes), monitores, señales de códigos borrados hace poco, VIN y kilometraje de la computadora contra lo que dice el vendedor.
- **Reportes** para imprimir o guardar en PDF, y en JSON. **Respaldo** completo y restauración.
- **Modo tablero** para manejar: números grandes, alertas por voz, pantalla encendida, sin tocar el teléfono.
- **Unidades**: °C/°F, km/millas, kPa/PSI, L/h o gal/h.
- **Simulador** con un carro sano, 11 fallas del carro y 4 fallas del adaptador, siempre marcado como simulador.

## Cómo usarla

### Android (Chrome 138 o más nuevo)
1. Conectá el adaptador al puerto OBD2 (debajo del timón) y poné la llave en ON o encendé el motor.
2. **Solo la primera vez**: en *Ajustes → Bluetooth* del teléfono, emparejá el adaptador (se llama `OBDII`, `OBD II` o parecido; PIN `1234` o `0000`).
3. Abrí la app en Chrome. Tocá **Instalar app** (o menú ⋮ → *Agregar a pantalla principal*).
4. **Escanear → Conectar adaptador** y elegilo de la lista. Las siguientes veces aparece **Usar el adaptador de siempre**.

### Windows (Chrome o Edge)
1. Emparejá el adaptador en *Configuración → Bluetooth y dispositivos → Agregar dispositivo* (PIN `1234` o `0000`).
2. Abrí la app (el enlace de arriba) o, sin internet, el archivo [`dist/ScanIA.html`](dist/ScanIA.html) con doble clic.
3. **Conectar adaptador** y elegí el dispositivo (puede aparecer como `OBDII` o como *Standard Serial over Bluetooth link (COMx)*).

### Adaptadores
| Adaptador | Cómo se conecta | Botón |
|---|---|---|
| ELM327 Bluetooth clásico (el azul "Mini", el negro "OBD II Interface") | Web Serial (perfil SPP) | **Conectar adaptador** |
| ELM327 Bluetooth 4.0 / BLE | Web Bluetooth | *Conectar por BLE* |
| ELM327 USB (solo compu) | Web Serial | **Conectar adaptador** |
| ELM327 WiFi | No compatible (el navegador no abre conexiones TCP) | — |

Los clones baratos varían mucho. Si uno falla, mandá el **registro técnico** (Más → Registro técnico → Descargar).

### IA (opcional)
1. Desplegá el servidor gratis en Cloudflare: [servidor/LEEME.md](servidor/LEEME.md). La clave de Anthropic queda **solo** ahí, como secreto.
2. En la app: **⚙ Ajustes → Servidor de IA**, pegá la dirección y el código familiar y tocá **Probar conexión**.

## Privacidad y seguridad
- Todo (carros, escaneos, diagnósticos) se guarda **solo en el dispositivo**. El respaldo es un archivo JSON que descargás vos.
- La clave de Anthropic **nunca** está en la app, el repositorio, `localStorage` ni IndexedDB. Si una versión vieja la había guardado, se borra al abrir la app.
- El servidor exige el código familiar, solo acepta tu sitio (CORS), limita consultas por minuto y por día, valida modelo/tamaño/herramientas y no devuelve la clave en ningún error.
- El **VIN no se envía** a la IA ni a la NHTSA salvo que lo permitás en *Ajustes → Privacidad*. El registro técnico que se comparte tapa el VIN.
- La app no manda comandos que accionen componentes ni toquen sistemas de seguridad. El único comando que cambia algo es borrar códigos (modo 04), con confirmación.

## Desarrollo
```
src/              código fuente (JavaScript sin dependencias, HTML y CSS)
servidor/         servidor de IA (Cloudflare Worker)
tests/            pruebas automáticas (Node) y de punta a punta (Python + Playwright)
docs/             auditoría y compatibilidad
index.html …      app construida (la publica GitHub Pages)
dist/ScanIA.html  app en un solo archivo, para usar sin internet
```
```bash
npm test            # 44 pruebas: parser ELM327, protocolos, fallas del adaptador, diagnóstico, IA, servidor
npm run build       # arma index.html, sw.js, manifest, íconos y dist/ScanIA.html (requiere Python 3 + Pillow)
npm run e2e         # prueba la interfaz en Chrome sin pantalla con el simulador (requiere Playwright)
```
Publicar: en GitHub, **Settings → Pages → Deploy from a branch → `main` / `(root)`**.

## Qué está terminado y qué falta
**Terminado**: todo lo de la lista "Qué hace", con pruebas automáticas.

**Pendiente o limitado**:
- Probar con un carro real y con los dos adaptadores físicos (ver la lista de verificación en [docs/COMPATIBILIDAD.md](docs/COMPATIBILIDAD.md)).
- Modo 06 solo en carros CAN; en protocolos viejos el formato depende de cada fabricante.
- Sensores de oxígeno del banco 2 y datos propios de la transmisión no se leen todavía.
- ABS, bolsas de aire, dirección y carrocería **no** son parte del OBD2 genérico: hay una arquitectura por marca lista para agregarlos cuando exista documentación validada (ver *Más → Qué se puede leer de cada marca*). No se inventan comandos propietarios.
- iPhone no es compatible (Safari no permite Web Serial ni Web Bluetooth).

ScanIA orienta el diagnóstico; no reemplaza la revisión física de un mecánico. Nunca uses el teléfono mientras manejás.
