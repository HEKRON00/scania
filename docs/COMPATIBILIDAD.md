# Compatibilidad de ScanIA 2.0

Leyenda: **✓** funciona según la especificación y las pruebas automáticas · **~** funciona con limitaciones · **✗** no compatible · **?** debería funcionar, sin probar.

> Ninguna combinación se ha probado todavía con un **carro real** ni con un **adaptador físico**. "Probado" en esta tabla significa: pruebas automáticas con un ELM327 falso que imita respuestas reales (eco, espacios, encabezados, tramas ISO-TP, protocolos viejos, respuestas tardías y cortadas), el adaptador virtual del simulador y Chrome sin pantalla.

## 1. Navegador y sistema

| Función | Android · Chrome 138+ | Windows · Chrome/Edge 117+ | macOS/Linux · Chrome | Android · Chrome < 138 | Firefox | iPhone/iPad (cualquier navegador) |
|---|---|---|---|---|---|---|
| ELM327 Bluetooth clásico (Web Serial) | ✓ | ✓ | ? | ✗ | ✗ | ✗ |
| ELM327 BLE (Web Bluetooth) | ✓ | ✓ | ? | ✓ | ✗ | ✗ |
| ELM327 USB (Web Serial) | ✗ (Android no expone puertos USB serie al navegador) | ✓ | ? | ✗ | ✗ | ✗ |
| Simulador, análisis local, carros, reportes, respaldo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Instalar como app (PWA) y abrir sin internet | ✓ | ✓ | ✓ | ✓ | ~ | ~ |
| Archivo `dist/ScanIA.html` sin servidor | ~ (mejor usar el enlace) | ✓ | ✓ | — | — | — |
| Dictado por voz | ✓ | ✓ | ✓ | ✓ | ✗ | ~ |
| Pantalla encendida (modo tablero) | ✓ | ✓ | ✓ | ✓ | ~ | ~ |
| IA (vía servidor propio) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Notas:
- Web Serial por Bluetooth llegó a Chrome para Android en la versión 138 (junio 2025) y a Chrome de escritorio en la 117.
- En Windows, el adaptador debe estar **emparejado** antes. Puede aparecer con su nombre o como *Standard Serial over Bluetooth link (COMx)*.
- Bluetooth y el modo sin internet necesitan **https** (el enlace de GitHub Pages) o `localhost`. En la laptop, el archivo `ScanIA.html` también funciona porque Chrome lo trata como contexto seguro.

## 2. Adaptador

| Adaptador | Conexión | Estado |
|---|---|---|
| ELM327 v1.5 Bluetooth clásico (clones comunes, como el azul "Mini" y el negro "OBD II Interface") | SPP → Web Serial | ✓ en pruebas; **pendiente con los adaptadores reales** |
| ELM327 v2.1 (clones) | SPP → Web Serial | ~ Muchos v2.1 son clones recortados: algunos fallan con encabezados (ATH1). ScanIA lo detecta y sigue sin encabezados. |
| Adaptadores ELM327 BLE (Bluetooth 4.0) | BLE → Web Bluetooth | ? La app busca los servicios de puerto serie más comunes (FFF0, FFE0, 18F0 y uno de 128 bits usado por algunos modelos). Si el tuyo usa otro, no va a aparecer. |
| ELM327 USB | Web Serial (solo compu) | ? |
| ELM327 WiFi | — | ✗ (el navegador no puede abrir conexiones TCP) |

## 3. Carro (protocolo OBD2)

| Función | CAN 11 bits (la mayoría desde 2008) | CAN 29 bits | ISO 9141-2 | KWP2000 | SAE J1850 PWM/VPW |
|---|---|---|---|---|---|
| Detectar protocolo y confirmar que el carro responde | ✓ | ✓ | ✓ | ✓ | ✓ |
| Datos en vivo (modo 01) | ✓ varios por consulta | ✓ varios por consulta | ✓ uno por uno | ✓ uno por uno | ✓ uno por uno |
| Saber qué computadora reporta cada código (encabezados) | ✓ | ✓ | ✗ | ✗ | ✗ |
| Códigos almacenados y pendientes (03/07) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Códigos permanentes (0A) | ✓ si el carro lo soporta (típico 2010+) | ✓ | ~ raro | ~ raro | ~ raro |
| Freeze frame (02) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pruebas internas (06): misfire por cilindro, catalizador, O2 | ✓ | ✓ | ✗ formato distinto por fabricante | ✗ | ✗ |
| VIN, calibración, nombre de la computadora (09) | ✓ | ✓ | ~ (VIN en la mayoría desde 2005) | ~ | ~ |
| Borrar códigos (04) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sensor de oxígeno de banda ancha (λ) | ✓ si el carro lo reporta | ✓ | ✓ | ✓ | ✓ |
| ABS, bolsas de aire, dirección, carrocería | ✗ no son OBD2 genérico | ✗ | ✗ | ✗ | ✗ |
| Datos propios de la transmisión | ✗ (solo sus códigos, si los reporta) | ✗ | ✗ | ✗ | ✗ |

Lo que cada carro reporta depende del fabricante y del año: ScanIA primero pregunta qué sensores soporta y solo muestra esos.

## 4. Lista de verificación para la primera prueba con un carro real

1. Abrí **Más → Registro técnico** y dejalo grabando.
2. Conectá con la llave en ON y motor apagado: debe decir "Carro conectado · (protocolo)". Si dice que el carro no responde, probá con el motor encendido.
3. **Revisión completa**: compará los códigos con otro escáner si tenés.
4. **En vivo**: RPM y temperatura deben coincidir con el tablero.
5. **Pruebas → Batería y arranque** (algunos adaptadores se reinician al dar arranque: si pasa, queda en el registro).
6. Descargá el registro técnico y guardalo: sirve para corregir cualquier detalle del adaptador.
