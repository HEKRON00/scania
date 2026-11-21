# Plan de pruebas físicas · ScanIA 2.1

**Estado de todas las pruebas de este documento: No probada.** Nadie ha conectado todavía un adaptador real ni un carro real a ScanIA 2.1. Una prueba solo se marca como *Aprobada* después de hacerla con el adaptador y el carro reales, anotando el resultado observado. Las pruebas con el simulador no cuentan aquí.

Cómo anotar: en la columna **Resultado** escribí lo que viste (texto, número o "no apareció"), y en **Estado** poné *Aprobada*, *Falló* o *No se pudo hacer*. Guardá los archivos que pide cada sección.

## Seguridad (siempre)

- Todas las pruebas se hacen **con el carro estacionado**, freno de mano puesto, en P (automático), en un lugar ventilado si el motor está encendido.
- Nadie usa el teléfono mientras maneja. Si una prueba pide datos en marcha, la hace un acompañante o se usa el modo tablero sin tocar la pantalla.
- No te acerqués a la faja, el ventilador ni el escape con el motor encendido. Las pruebas que requieren abrir el sistema de combustible o medir compresión son del taller.
- ScanIA no manda órdenes que accionen piezas. El único comando que cambia algo en el carro es borrar códigos, y pide confirmación.

## Lo que hay que tener

- Teléfono Android con Chrome actualizado (138 o más nuevo: Chrome → ⋮ → Configuración → Acerca de Chrome).
- Laptop con Windows y Chrome o Edge actualizados.
- Los dos adaptadores ELM327 Bluetooth clásicos (el azul y el negro). Ponéles una marca (A y B).
- El Honda CR-V 2000 con batería en buen estado.
- Opcional pero muy útil: otro escáner o app conocida para comparar códigos; un multímetro.

---

## 1. Adaptadores (repetir para A y B, en Android y en Windows)

| ID | Prueba | Cómo | Qué debe pasar | Resultado | Estado |
|---|---|---|---|---|---|
| AD-01 | Emparejar | Ajustes de Bluetooth del teléfono / Windows, PIN `1234` o `0000` | Queda emparejado con un nombre tipo `OBDII` | | No probada |
| AD-02 | Aparece en ScanIA | *Escanear → Conectar adaptador* | El adaptador aparece en la lista de Chrome (en Windows puede decir *Standard Serial over Bluetooth link*) | | No probada |
| AD-03 | Adaptador sin carro | Adaptador conectado a la corriente del carro pero **llave apagada** | ScanIA dice que el adaptador responde pero **el carro no**; NO dice "conectado al carro" | | No probada |
| AD-04 | Versión | Llave en ON, conectar; *Diagnóstico de conexión* | Muestra versión (`ATI`), descripción (`AT@1`) y voltaje (`ATRV`) | | No probada |
| AD-05 | Encabezados | Mismo diagnóstico | En el CR-V (no CAN) debe decir "no aplica"; anotar si hubo errores de comandos | | No probada |
| AD-06 | Velocidad | Mismo diagnóstico | Anotar "vueltas por segundo" y "ms por comando" | | No probada |
| AD-07 | Recordado | Desconectar, recargar la página | El adaptador aparece en "Usar adaptador 1/2" y conecta sin volver a elegirlo | | No probada |
| AD-08 | Dos adaptadores | Habiendo dado permiso a A y B | Aparecen los dos en la lista de recordados; "Olvidar" quita uno | | No probada |
| AD-09 | Desconexión | Con ScanIA leyendo en vivo, **sacar el adaptador** del conector | En pocos segundos deja de decir "conectado" y ofrece **Reconectar** | | No probada |
| AD-10 | Reconexión | Volver a meter el adaptador, tocar **Reconectar** | Vuelve a leer sin recargar la página | | No probada |
| AD-11 | Reinicio al arrancar | Conectado con llave en ON, dar arranque | Si el adaptador se reinicia, ScanIA lo detecta, reconfigura y avisa; anotar qué pasó | | No probada |
| AD-12 | Archivo sin internet (solo Windows) | Abrir `dist/ScanIA.html` con doble clic | Conecta igual que desde el enlace | | No probada |

**Guardar por cada combinación** (adaptador × plataforma): el `.json` del *Diagnóstico de conexión* y el registro técnico (*Más → Registro técnico → Descargar*). Nombralos, por ejemplo, `A-android.json`, `B-windows.json`.

## 2. Honda CR-V 2000: conexión y lectura

| ID | Prueba | Cómo | Qué debe pasar | Resultado | Estado |
|---|---|---|---|---|---|
| CR-01 | Conector | Buscar el conector de 16 pines (ver `HONDA_CRV_2000_B20Z.md`, sección 0) | Existe el conector de 16 pines. Si solo hay uno de 3 pines: el carro no es OBD-II y se detienen las pruebas | | No probada |
| CR-02 | Protocolo | Llave en ON, conectar | Anotar el protocolo que muestra (se espera ISO 9141-2) y cuánto tardó | | No probada |
| CR-03 | Medición de aire | Panel de conexión | Anotar si dice MAP o MAF (se espera MAP) | | No probada |
| CR-04 | Sensores soportados | *Diagnóstico de conexión* → "Sensores disponibles" | Anotar la lista de PIDs | | No probada |
| CR-05 | Sensores de oxígeno | Panel de conexión | Anotar cuántos y qué mapa (PID 13 o 1D) | | No probada |
| CR-06 | VIN | Panel de conexión | Anotar si lo leyó; si no, debe decir "no disponible" sin inventar | | No probada |
| CR-07 | Códigos | *Revisión completa* | Comparar con otro escáner si hay. Anotar confirmados, pendientes y si avisó de diferencias con el conteo de la computadora | | No probada |
| CR-08 | Monitores | Misma revisión | Anotar cuáles están listos y cuáles no | | No probada |
| CR-09 | Freeze frame | Misma revisión (si hay código) | Anotar si leyó el mapa y qué datos mostró | | No probada |
| CR-10 | Datos en vivo | Motor encendido, *En vivo* | RPM y temperatura coinciden con el tablero; ningún dato marcado "imposible" sin razón | | No probada |
| CR-11 | Datos que no existen | *En vivo* | No aparece MAF si el carro no lo reporta; ningún dato inventado | | No probada |
| CR-12 | Modo 06 | *Pruebas → Pruebas internas → Leer* | Muestra tabla de TID/componente/valor/límite o dice que la computadora no lo soporta. Anotar lo que muestre | | No probada |
| CR-13 | Lazo cerrado | Motor caliente, *En vivo* → estado del sistema de combustible | Pasa a lazo cerrado al calentar | | No probada |

## 3. Honda CR-V 2000: pruebas guiadas

Anotar el veredicto que da ScanIA y, si hay forma, compararlo con una medición física.

| ID | Prueba guiada | Condición | Comparar con | Resultado | Estado |
|---|---|---|---|---|---|
| PG-01 | Comparación de sensores | Motor frío (8+ horas apagado), llave en ON | Temperatura ambiente real | | No probada |
| PG-02 | Batería en reposo | Motor apagado | Multímetro en los bornes | | No probada |
| PG-03 | Arranque | Motor apagado, luego arranque | Multímetro durante el arranque (acompañante) | | No probada |
| PG-04 | Alternador con carga | Ralentí, luego ~2,000 rpm estacionado | Multímetro en los bornes | | No probada |
| PG-05 | Calentamiento (termostato) | Desde frío, ralentí | Aguja del tablero; termostato del manual | | No probada |
| PG-06 | Refrigeración (ventilador) | Motor caliente, ralentí | Ver y oír cuándo enciende el ventilador | | No probada |
| PG-07 | Ralentí (estabilidad y vacío) | Motor caliente, sin cargas | Vacuómetro (taller) si hay | | No probada |
| PG-08 | Mezcla en ralentí y 2,500 rpm | Motor caliente, lazo cerrado | — | | No probada |
| PG-09 | Sensor de oxígeno | Motor caliente, ~2,500 rpm estacionado | Si la velocidad de lectura es baja debe decir "no concluyente" | | No probada |
| PG-10 | Sensor MAF contra MAP | Estacionado (con MAP solo calcula eficiencia volumétrica) | — | | No probada |
| PG-11 | Fallos de encendido | Motor caliente, ralentí | — | | No probada |
| PG-12 | Acelerador (barrido) | Motor apagado, llave en ON | Pisar el pedal despacio | | No probada |
| PG-13 | Caída de voltaje en cables | Multímetro + ayudante | Lecturas del multímetro | | No probada |

Opcionales (con resultados del taller): **Compresión** y **Presión de combustible** — escribir los números y el valor del manual.

## 4. Borrar códigos (solo si hace falta)

| ID | Prueba | Cómo | Qué debe pasar | Resultado | Estado |
|---|---|---|---|---|---|
| BC-01 | Advertencia | *Borrar códigos* | Explica que se pierden datos útiles y se reinician los monitores; el botón queda bloqueado hasta confirmar | | No probada |
| BC-02 | Escaneo guardado antes | Confirmar el borrado | Aparece un escaneo "antes de borrar" en el historial | | No probada |
| BC-03 | Respuesta del carro | Con el motor **apagado** y llave en ON | Si el carro rechaza (por ejemplo, con el motor encendido), ScanIA dice el motivo | | No probada |

## 5. Qué mandar después de las pruebas

1. Este documento con las columnas *Resultado* y *Estado* llenas (o una foto).
2. Los `.json` del diagnóstico de conexión de cada adaptador y plataforma.
3. Los registros técnicos descargados (el VIN sale tapado).
4. El respaldo de ScanIA (*Más → Respaldo → Descargar respaldo*), si querés que se revisen los escaneos guardados.

Con eso se corrigen los detalles reales de tus adaptadores y del CR-V, y recién ahí se puede actualizar la columna *Prueba física* del README.
