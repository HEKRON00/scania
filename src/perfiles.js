/* ScanIA · perfiles de vehículo (ampliables)
 *
 * Un perfil NO agrega comandos propietarios ni valores de fábrica inventados. Dice:
 *   A. qué se puede ver con OBD-II genérico en ese modelo (lo que la app intentará leer),
 *   B. qué requiere el escáner o la información de servicio de la marca,
 *   C. qué requiere pruebas físicas (multímetro, manómetro, vacuómetro, compresímetro),
 * y qué datos del manual conviene anotar para comparar (la app los usa si el dueño los escribe).
 * Para ampliarlo con información de fábrica validada: S.registrarPerfil({...}) con su fuente.
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  // Datos del manual que el dueño puede anotar por carro (la app no los inventa)
  S.CAMPOS_MANUAL = [
    { clave: "ralenti_rpm", nombre: "Ralentí caliente (rpm)", ayuda: "Del manual o la etiqueta del capó" },
    { clave: "termostato_c", nombre: "Temperatura a la que abre el termostato (°C)", ayuda: "Viene en el manual o grabada en el termostato" },
    { clave: "ventilador_c", nombre: "Temperatura a la que enciende el ventilador (°C)", ayuda: "Del manual de servicio" },
    { clave: "compresion_min", nombre: "Compresión mínima por cilindro", ayuda: "Del manual de servicio (psi o kPa)" },
    { clave: "presion_comb", nombre: "Presión de combustible", ayuda: "Del manual de servicio (psi o kPa) y en qué condición" },
    { clave: "carga_v", nombre: "Voltaje de carga del alternador (V)", ayuda: "Del manual de servicio" },
  ];

  const HONDA_CRV_1G = {
    id: "honda_crv_1g",
    nombre: "Honda CR-V 1ra generación (1997–2001), motor B20 (B20B / B20Z)",
    validado: false,
    fuente: "Conocimiento general de esa generación y del estándar OBD-II; sin acceso a la información de servicio de Honda. Verificá todo en el manual de tu carro.",
    coincide({ marca, modelo, anio, vin, codigo_motor }) {
      const m = String(marca || "").toLowerCase(), mo = String(modelo || "").toLowerCase().replace(/[\s-]/g, "");
      const a = Number(anio);
      const porDatos = /honda/.test(m) && /crv/.test(mo) && (!a || (a >= 1997 && a <= 2001));
      const v = String(vin || "").toUpperCase();
      // Honda usa "RD1" en las posiciones 4–6 del VIN para esta generación del CR-V (JHL… Japón, SHS… Inglaterra)
      const porVIN = v.length === 17 && /^(JHL|SHS)/.test(v) && v.slice(3, 6) === "RD1" && "VWXY1".includes(v[9]);
      const porMotor = /^B20/i.test(String(codigo_motor || ""));
      return porDatos || porVIN || (porMotor && /honda/.test(m));
    },
    // Lo que la app espera encontrar (se confirma en la conexión, no se supone)
    esperado: {
      protocolo: "ISO 9141-2 (lo más común en Honda OBD-II de esa época); la app detecta el protocolo real al conectar",
      medicion_aire: "MAP (sensor de presión del múltiple, sin MAF)",
      voltaje: "Probablemente sin PID 42: la app usa el voltaje que mide el adaptador (ATRV)",
      vin: "Probablemente no disponible por OBD (el modo 09 se volvió común después de ~2005)",
      modo06: "Formato no CAN: números de prueba definidos por Honda, sin tabla validada en la app",
    },
    encendido: "distribuidor",
    avisos: [
      "Antes de conectar: buscá el conector OBD-II de 16 pines. En los CR-V de EE. UU. de esta generación, según guías de ubicación, está debajo del tablero junto a la consola central, del lado del pasajero (a la altura de su rodilla izquierda). Si en vez de eso solo encontrás un conector Honda de 3 pines, el carro es de otro mercado y NO es OBD-II: un ELM327 no le va a poder leer nada.",
      "Si el tablero marca millas (carro importado de EE. UU.), indicalo en los datos del carro para que el kilometraje y los mantenimientos cuadren.",
      "El motor B20 de esa generación usa distribuidor (una sola bobina): un fallo de encendido en UN cilindro casi nunca es la bobina; lo común es bujía, cable de bujía, inyector o compresión.",
      "La tracción 4x4 'Real Time' es mecánica/hidráulica: el OBD no la ve.",
      "La transmisión automática la controla la computadora del motor (PCM). Si la luz D4 parpadea, hay una falla de transmisión guardada aunque el escáner genérico muestre pocos detalles.",
    ],
    A: [
      "Códigos de falla del motor (confirmados y pendientes) y los de transmisión que el PCM reporte como códigos P.",
      "Luz check engine, monitores de emisiones y freeze frame (foto de los sensores al momento de la falla).",
      "Datos en vivo típicos de esa época: RPM, velocidad, temperatura del motor y del aire, MAP, posición del acelerador, carga, avance de encendido, ajustes de combustible corto y largo, estado del lazo y sensores de oxígeno de antes y después del catalizador. La app solo muestra los que el carro diga soportar.",
      "Voltaje en el conector OBD (lo mide el adaptador).",
      "Resultados de monitoreo (modo 06) en formato no CAN, si el PCM los entrega: valores originales sin interpretación por componente.",
      "Análisis de vacío en ralentí con el MAP y comparación de sensores con el motor frío.",
    ],
    B: [
      "Detalle de las fallas de transmisión (lo que indica la luz D4) más allá de los códigos P genéricos.",
      "ABS, bolsas de aire (SRS) y otros módulos: no responden por OBD-II genérico.",
      "Datos propios del PCM de Honda (por ejemplo: válvula de ralentí, detector de carga eléctrica ELD, solenoides), que no son PIDs estándar.",
      "Significado de los números de prueba del modo 06 (TID/CID) definidos por Honda.",
      "Códigos por destellos con el conector de servicio y procedimientos de reaprendizaje (por ejemplo, ralentí después de desconectar la batería), según el manual de servicio.",
    ],
    C: [
      "Compresión de cada cilindro (compresímetro, en el taller) y, si sale baja, prueba de fuga de cilindros.",
      "Presión de combustible con manómetro (taller: el sistema está presurizado).",
      "Vacío del múltiple con vacuómetro (confirma fugas, tiempo de encendido, escape tapado).",
      "Chispa con un probador de chispa; estado de tapa, rotor y cables del distribuidor.",
      "Resistencia de los sensores de temperatura (tabla del manual) y del inyector con multímetro.",
      "Voltaje de carga y caída de voltaje en cables con multímetro en los bornes.",
      "Nivel y estado del aceite de transmisión (ATF) según el procedimiento del manual.",
      "Ajuste de válvulas (muchos motores Honda de esa época lo llevan como mantenimiento periódico: revisá el manual).",
      "Prueba de presión del sistema de enfriamiento y del tapón del radiador.",
    ],
    campos_manual: ["ralenti_rpm", "termostato_c", "ventilador_c", "compresion_min", "presion_comb"],
  };

  const perfiles = [HONDA_CRV_1G];
  S.PERFILES_VEHICULO = perfiles;

  /** Perfil que aplica a un carro (o null). info = info del adaptador (para usar el VIN leído). */
  S.perfilVehiculo = function (carro, info) {
    const datos = { ...(carro || {}), vin: (carro && carro.vin) || (info && info.vin) || "" };
    return perfiles.find((p) => { try { return p.coincide(datos); } catch (e) { return false; } }) || null;
  };

  /** Agrega un perfil. Debe decir su fuente; si es información de fábrica validada, validado: true. */
  S.registrarPerfil = function (p) {
    if (!p || !p.id || typeof p.coincide !== "function" || !p.nombre) throw new Error("Perfil inválido");
    if (!String(p.fuente || "").trim()) throw new Error("Un perfil debe indicar su fuente");
    if (perfiles.some((x) => x.id === p.id)) throw new Error("Ya existe un perfil con ese id");
    perfiles.unshift(p);
  };

  /** Compara lo que se esperaba del perfil con lo que realmente respondió el carro. */
  S.contrastarPerfil = function (perfil, info) {
    if (!perfil || !info) return [];
    const out = [];
    if (/MAP/.test(perfil.esperado.medicion_aire) && info.medicion_aire === "MAF") out.push("El perfil esperaba un motor con MAP, pero el carro reporta un sensor MAF: revisá que el modelo/año del carro estén bien.");
    if (/ISO 9141/.test(perfil.esperado.protocolo) && info.es_can) out.push("El carro respondió por CAN, no por ISO 9141-2 como se esperaba para esa generación: puede ser otro año o mercado.");
    return out;
  };
})(typeof window !== "undefined" ? window : globalThis);
