# Compatibilidad eléctrica por vehículo

Qué tan completa está la información eléctrica de cada carro en ScanIA. Ningún dato está confirmado contra un carro real todavía.

## Niveles de verificación que usa la app

| Nivel | Significa |
|---|---|
| Confirmado en tu carro | Lo marcaste vos comparando con la etiqueta de la tapa o con el manual de tu carro |
| Documentación del fabricante | Sale de un documento del fabricante para esa variante |
| Fuentes secundarias que coinciden | Varias publicaciones coinciden, pero no se comparó con el original ni con tu caja |
| Una sola fuente secundaria | Una sola publicación lo dice |
| Fuentes en conflicto | Las publicaciones no coinciden → "Configuración del fusible pendiente de verificación" |
| Sin información | No hay fuente verificable |

## Vehículos

| Vehículo | Ficha | Cajas | Fusibles | Relés | Diagramas | Valores de referencia | Prueba física |
|---|---|---|---|---|---|---|---|
| Honda CR-V 2000–2001, B20Z (EE. UU./Canadá) | Sí | Interior (38), motor (15), ABS (3) | Interior: 3 fuentes secundarias coinciden. Motor: 2 coinciden y 1 difiere en las posiciones 4 y 5 (en conflicto). ABS: 2 coinciden | Nombres de 4 relés del motor, 1 del ABS, 2 interiores y el principal PGM-FI; **sin posición** | Ninguno del fabricante | Ninguno | No probada |
| Honda CR-V 2000–2001 de otro mercado | No (existe al menos una distribución distinta publicada) | Anotar desde la tapa | Anotar desde la tapa | — | — | — | No probada |
| Honda CR-V 1997–1999 | No (la ficha cubre 2000–2001) | Anotar desde la tapa | — | — | — | — | — |
| Cualquier otro carro | No | Anotar desde la tapa | Anotar desde la tapa | — | Los que subas | Los que anotes | — |

Las funciones que no dependen de la ficha sirven para cualquier carro de 12 V: mediciones con multímetro, batería y carga, sensores y actuadores, causa común, diagramas propios, fotos e informe.

## Cómo agregar un vehículo (Toyota, Nissan, Hyundai, Kia, Ford, Chevrolet u otros)

`S.registrarFicha` en `src/fichas.js` acepta una ficha con esta estructura y la rechaza si falta alguna fuente:

```js
S.registrarFicha({
  id: "marca_modelo_anios_motor",
  marca: "…", modelo: "…", anios: "…", motor: "…", transmision: "…",
  sistema_electrico: "12 V, negativo a tierra", protocolo: "…",
  coincide({ marca, modelo, anio, vin }) { /* cuándo aplica */ },
  advertencias: ["…"],
  fuentes: [{ id: "manual_x", tipo: "oem" | "reproduccion_oem" | "secundaria", nombre: "…", url: "…", uso: "…" }],
  variantes: [{
    id: "mercado_version", nombre: "…", mercado: "…",
    cajas: [{ id: "interior", nombre: "…", ubicacion: "…", tipo_fusible: "…", columnas: 6,
      fusibles: [{ id: "INT-1", numero: 1, amperaje: 10, nombre: "…", circuito: "…", componentes: [], sintomas: [],
                   fuentes: ["manual_x"], verificacion: "oem" }],
      reles: [{ id: "R1", nombre: "…", posicion: null, fuentes: ["manual_x"], verificacion: "oem" }] }],
    diagramas: [{ id: "…", titulo: "…", tipo: "Carga", fuente: "manual_x" }],
    valores_referencia: [{ id: "…", prueba: "resistencia_componente", componente: "ect", min: …, max: …, unidad: "Ω", condicion: "a 20 °C", fuente: "manual_x" }],
  }],
});
```

Reglas: una variante por mercado/versión (no mezclar), sin posiciones ni valores sin fuente, y cada dato con su nivel de verificación.

## Información que falta para completar el CR-V 2000

1. **Fotos de las etiquetas** de la tapa de la caja interior y de la caja del motor de TU carro (por dentro). Con eso se confirma la variante y se resuelven las posiciones 4 y 5.
2. **Equipamiento**: ¿tiene ABS (hay una tercera caja junto al motor)? ¿Versión LX, EX o SE? ¿Transmisión automática confirmada?
3. **Mercado**: ¿vino de EE. UU.? (el odómetro en millas y una etiqueta de emisiones en inglés en el capó lo indican).
4. **Manual de servicio Honda** (no el del propietario) para diagramas, resistencias de sensores, valores de carga y ubicación del relé PGM-FI.
