/* ScanIA · datos: sensores (PIDs), monitores, computadoras, modo 06 y descripción de códigos */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  /** Error al conectar o cuando se pierde la conexión con el carro. */
  S.ErrorConexion = class ErrorConexion extends Error {
    constructor(m) { super(m); this.name = "ErrorConexion"; }
  };

  const w = (a, b) => a * 256 + b;
  // Sensores en vivo (modo 01). n = bytes de datos que manda el carro; f(A, B, ...) los convierte.
  // rapido: se lee en cada vuelta; los lentos cada 5 vueltas (el adaptador es lento).
  // Varias entradas pueden salir del mismo PID (ej. 0x34: lambda y corriente).
  S.PIDS = [
    { clave: "rpm", pid: 0x0c, n: 2, nombre: "RPM", unidad: "rpm", dec: 0, rapido: true, f: (a, b) => w(a, b) / 4 },
    { clave: "velocidad", pid: 0x0d, n: 1, nombre: "Velocidad", unidad: "km/h", dec: 0, rapido: true, f: (a) => a },
    { clave: "temp_motor", pid: 0x05, n: 1, nombre: "Temp. del motor", unidad: "°C", dec: 0, f: (a) => a - 40 },
    { clave: "temp_admision", pid: 0x0f, n: 1, nombre: "Temp. aire admisión", unidad: "°C", dec: 0, f: (a) => a - 40 },
    { clave: "carga", pid: 0x04, n: 1, nombre: "Carga del motor", unidad: "%", dec: 0, rapido: true, f: (a) => (a * 100) / 255 },
    { clave: "acelerador", pid: 0x11, n: 1, nombre: "Posición del acelerador", unidad: "%", dec: 0, rapido: true, f: (a) => (a * 100) / 255 },
    { clave: "sistema_comb", pid: 0x03, n: 2, nombre: "Control de mezcla", unidad: "", dec: 0, f: (a) => a, texto: (v) => S.textoSistemaComb(v) },
    { clave: "stft1", pid: 0x06, n: 1, nombre: "Ajuste corto B1 (STFT)", unidad: "%", dec: 1, rapido: true, f: (a) => ((a - 128) * 100) / 128 },
    { clave: "ltft1", pid: 0x07, n: 1, nombre: "Ajuste largo B1 (LTFT)", unidad: "%", dec: 1, f: (a) => ((a - 128) * 100) / 128 },
    { clave: "stft2", pid: 0x08, n: 1, nombre: "Ajuste corto B2 (STFT)", unidad: "%", dec: 1, rapido: true, f: (a) => ((a - 128) * 100) / 128 },
    { clave: "ltft2", pid: 0x09, n: 1, nombre: "Ajuste largo B2 (LTFT)", unidad: "%", dec: 1, f: (a) => ((a - 128) * 100) / 128 },
    { clave: "maf", pid: 0x10, n: 2, nombre: "Flujo de aire (MAF)", unidad: "g/s", dec: 1, rapido: true, f: (a, b) => w(a, b) / 100 },
    { clave: "map", pid: 0x0b, n: 1, nombre: "Presión de admisión (MAP)", unidad: "kPa", dec: 0, rapido: true, f: (a) => a },
    { clave: "o2_b1s1", pid: 0x14, n: 2, nombre: "Sensor O2 antes (B1S1)", unidad: "V", dec: 2, rapido: true, f: (a) => a / 200 },
    { clave: "o2_b1s2", pid: 0x15, n: 2, nombre: "Sensor O2 después (B1S2)", unidad: "V", dec: 2, rapido: true, f: (a) => a / 200 },
    { clave: "lambda_b1s1", pid: 0x34, n: 4, nombre: "Sensor A/F antes (λ)", unidad: "λ", dec: 3, rapido: true, f: (a, b) => (2 * w(a, b)) / 65536 },
    { clave: "af_corriente", pid: 0x34, n: 4, nombre: "Sensor A/F corriente", unidad: "mA", dec: 2, rapido: true, f: (a, b, c, d) => w(c, d) / 256 - 128 },
    { clave: "lambda_b1s1", pid: 0x24, n: 4, nombre: "Sensor A/F antes (λ)", unidad: "λ", dec: 3, rapido: true, alterno: true, f: (a, b) => (2 * w(a, b)) / 65536 },
    { clave: "lambda_comandado", pid: 0x44, n: 2, nombre: "Mezcla pedida (λ)", unidad: "λ", dec: 3, f: (a, b) => (2 * w(a, b)) / 65536 },
    { clave: "avance", pid: 0x0e, n: 1, nombre: "Avance de encendido", unidad: "°", dec: 1, rapido: true, f: (a) => a / 2 - 64 },
    { clave: "voltaje", pid: 0x42, n: 2, nombre: "Voltaje del sistema", unidad: "V", dec: 2, f: (a, b) => w(a, b) / 1000 },
    { clave: "temp_aceite", pid: 0x5c, n: 1, nombre: "Temp. del aceite", unidad: "°C", dec: 0, f: (a) => a - 40 },
    { clave: "temp_ambiente", pid: 0x46, n: 1, nombre: "Temp. ambiente", unidad: "°C", dec: 0, f: (a) => a - 40 },
    { clave: "temp_cat", pid: 0x3c, n: 2, nombre: "Temp. catalizador", unidad: "°C", dec: 0, f: (a, b) => w(a, b) / 10 - 40 },
    { clave: "carga_abs", pid: 0x43, n: 2, nombre: "Carga absoluta", unidad: "%", dec: 0, f: (a, b) => (w(a, b) * 100) / 255 },
    { clave: "pedal", pid: 0x49, n: 1, nombre: "Pedal del acelerador", unidad: "%", dec: 0, rapido: true, f: (a) => (a * 100) / 255 },
    { clave: "acel_comandado", pid: 0x4c, n: 1, nombre: "Mariposa pedida", unidad: "%", dec: 0, f: (a) => (a * 100) / 255 },
    { clave: "presion_comb", pid: 0x0a, n: 1, nombre: "Presión de combustible", unidad: "kPa", dec: 0, f: (a) => a * 3 },
    { clave: "presion_riel", pid: 0x23, n: 2, nombre: "Presión del riel", unidad: "kPa", dec: 0, f: (a, b) => w(a, b) * 10 },
    { clave: "baro", pid: 0x33, n: 1, nombre: "Presión barométrica", unidad: "kPa", dec: 0, f: (a) => a },
    { clave: "egr", pid: 0x2c, n: 1, nombre: "EGR pedida", unidad: "%", dec: 0, f: (a) => (a * 100) / 255 },
    { clave: "purga_evap", pid: 0x2e, n: 1, nombre: "Purga EVAP pedida", unidad: "%", dec: 0, f: (a) => (a * 100) / 255 },
    { clave: "consumo", pid: 0x5e, n: 2, nombre: "Consumo de combustible", unidad: "L/h", dec: 1, f: (a, b) => w(a, b) / 20 },
    { clave: "bateria_hibrida", pid: 0x5b, n: 1, nombre: "Batería híbrida", unidad: "%", dec: 0, f: (a) => (a * 100) / 255 },
    { clave: "combustible", pid: 0x2f, n: 1, nombre: "Nivel de combustible", unidad: "%", dec: 0, f: (a) => (a * 100) / 255 },
    { clave: "tiempo_motor", pid: 0x1f, n: 2, nombre: "Tiempo motor encendido", unidad: "s", dec: 0, f: (a, b) => w(a, b) },
  ];
  // Largo de datos por PID (para separar respuestas de varios PIDs a la vez)
  S.LARGO_PID = {};
  for (const p of S.PIDS) S.LARGO_PID[p.pid] = p.n;
  S.META = {};
  for (const p of S.PIDS) if (!S.META[p.clave]) S.META[p.clave] = p;

  // Datos que guarda el freeze frame (foto del momento de la falla)
  S.PIDS_FREEZE_FRAME = ["rpm", "velocidad", "temp_motor", "carga", "stft1", "ltft1", "stft2", "ltft2",
    "map", "maf", "acelerador", "temp_admision", "sistema_comb"];

  // Datos extra (modo 01)
  S.PIDS_EXTRAS = [
    { clave: "km_con_check_engine", pid: 0x21, n: 2, f: (a, b) => w(a, b) },
    { clave: "calentamientos_desde_borrado", pid: 0x30, n: 1, f: (a) => a },
    { clave: "km_desde_borrado", pid: 0x31, n: 2, f: (a, b) => w(a, b) },
    { clave: "minutos_con_check_engine", pid: 0x4d, n: 2, f: (a, b) => w(a, b) },
    { clave: "minutos_desde_borrado", pid: 0x4e, n: 2, f: (a, b) => w(a, b) },
    { clave: "odometro_ecu_km", pid: 0xa6, n: 4, f: (a, b, c, d) => (a * 16777216 + b * 65536 + c * 256 + d) / 10 },
  ];
  S.NOMBRES_EXTRAS = {
    km_con_check_engine: "Km manejados con la luz encendida", calentamientos_desde_borrado: "Calentamientos desde el borrado",
    km_desde_borrado: "Km desde que se borraron los códigos", minutos_con_check_engine: "Minutos con la luz encendida",
    minutos_desde_borrado: "Minutos desde el borrado", odometro_ecu_km: "Odómetro según la computadora",
  };

  /** PID 03: cómo está controlando la mezcla la computadora. */
  S.textoSistemaComb = function (v) {
    if (v == null) return "—";
    if (v & 2) return "Lazo cerrado";
    if (v & 16) return "Cerrado (falla O2)";
    if (v & 8) return "Abierto por FALLA";
    if (v & 4) return "Abierto (carga)";
    if (v & 1) return "Abierto (frío)";
    return "—";
  };
  S.lazoCerrado = (v) => v != null && (v & 0x12) !== 0;

  S.MONITORES_ES = {
    MISFIRE_MONITORING: "Fallo de encendido (misfire)",
    FUEL_SYSTEM_MONITORING: "Sistema de combustible",
    COMPONENT_MONITORING: "Componentes generales",
    CATALYST_MONITORING: "Catalizador",
    HEATED_CATALYST_MONITORING: "Catalizador calentado",
    EVAPORATIVE_SYSTEM_MONITORING: "Sistema EVAP (vapores de gasolina)",
    SECONDARY_AIR_SYSTEM_MONITORING: "Aire secundario",
    OXYGEN_SENSOR_MONITORING: "Sensores de oxígeno",
    OXYGEN_SENSOR_HEATER_MONITORING: "Calentador de sensores O2",
    EGR_VVT_SYSTEM_MONITORING: "EGR / distribución variable",
    NMHC_CATALYST_MONITORING: "Catalizador NMHC (diésel)",
    NOX_SCR_AFTERTREATMENT_MONITORING: "NOx / SCR (diésel)",
    BOOST_PRESSURE_MONITORING: "Presión del turbo",
    EXHAUST_GAS_SENSOR_MONITORING: "Sensor de gases de escape",
    PM_FILTER_MONITORING: "Filtro de partículas (diésel)",
  };

  /** Decodifica el estado (PID 01): luz check engine, cantidad de códigos y monitores. */
  S.decodificarEstado = function (A, B, C, D) {
    const diesel = (B & 0x08) !== 0;
    const monitores = [];
    ["MISFIRE_MONITORING", "FUEL_SYSTEM_MONITORING", "COMPONENT_MONITORING"].forEach((n, i) => {
      if (B & (1 << i)) monitores.push({ nombre: n, nombre_es: S.MONITORES_ES[n], completo: !(B & (1 << (i + 4))) });
    });
    const nombres = diesel
      ? ["NMHC_CATALYST_MONITORING", "NOX_SCR_AFTERTREATMENT_MONITORING", null, "BOOST_PRESSURE_MONITORING", null,
         "EXHAUST_GAS_SENSOR_MONITORING", "PM_FILTER_MONITORING", "EGR_VVT_SYSTEM_MONITORING"]
      : ["CATALYST_MONITORING", "HEATED_CATALYST_MONITORING", "EVAPORATIVE_SYSTEM_MONITORING",
         "SECONDARY_AIR_SYSTEM_MONITORING", null, "OXYGEN_SENSOR_MONITORING", "OXYGEN_SENSOR_HEATER_MONITORING",
         "EGR_VVT_SYSTEM_MONITORING"];
    nombres.forEach((n, i) => {
      if (n && C & (1 << i)) monitores.push({ nombre: n, nombre_es: S.MONITORES_ES[n], completo: !(D & (1 << i)) });
    });
    return { mil: (A & 0x80) !== 0, num_dtc: A & 0x7f, encendido: diesel ? "compresión (diésel)" : "chispa (gasolina)", monitores };
  };

  /** Convierte 2 bytes al código: 0x01 0x71 -> P0171 */
  S.bytesACodigo = function (a, b) {
    if ((a | b) === 0) return null;
    const h = (n) => n.toString(16).toUpperCase();
    return "PCBU"[a >> 6] + ((a >> 4) & 3) + h(a & 0xf) + h(b >> 4) + h(b & 0xf);
  };

  /** Nombre de la computadora según la dirección CAN que respondió. */
  S.nombreECU = function (ecu) {
    if (!ecu) return "";
    const e = String(ecu).toUpperCase();
    if (e.length === 3) {
      const id = parseInt(e, 16) - 0x7e8;
      if (id === 0) return "Motor";
      if (id === 1) return "Transmisión";
      if (id >= 2 && id <= 7) return `Módulo ${id + 1}`;
    } else if (e.length === 8) {
      const id = parseInt(e.slice(6), 16);
      const conocido = { 0x10: "Motor", 0x18: "Transmisión", 0x28: "Frenos ABS", 0x1e: "Híbrido" };
      if (conocido[id]) return conocido[id];
    }
    return `Módulo ${e}`;
  };
  S.esECUMotor = (ecu) => !ecu || /^7E8$/i.test(ecu) || /^18DAF110$/i.test(ecu);

  // ------------------------------------------------------------------ modo 06 (pruebas internas)
  S.nombreMID = function (mid) {
    const rango = (base, cant, nombre) => (mid >= base && mid < base + cant ? nombre(mid - base + 1) : null);
    const sensor = (i) => `banco ${Math.floor((i - 1) / 4) + 1}, sensor ${((i - 1) % 4) + 1}`;
    const evap = { 0x39: "EVAP: tapón suelto / fuga grande", 0x3a: "EVAP: fuga de 0.090\"", 0x3b: "EVAP: fuga de 0.040\"", 0x3c: "EVAP: fuga de 0.020\"", 0x3d: "EVAP: flujo de purga" };
    return (
      rango(0x01, 16, (i) => `Sensor de oxígeno (${sensor(i)})`) ||
      rango(0x21, 4, (i) => `Catalizador (banco ${i})`) ||
      rango(0x31, 4, (i) => `EGR (banco ${i})`) ||
      rango(0x35, 4, (i) => `Distribución variable VVT (banco ${i})`) ||
      evap[mid] ||
      rango(0x41, 16, (i) => `Calentador del sensor O2 (${sensor(i)})`) ||
      rango(0x61, 4, (i) => `Catalizador calentado (banco ${i})`) ||
      rango(0x71, 4, (i) => `Aire secundario ${i}`) ||
      rango(0x81, 4, (i) => `Sistema de combustible (banco ${i})`) ||
      rango(0x85, 4, (i) => `Presión del turbo (banco ${i})`) ||
      rango(0x90, 2, (i) => `Absorbedor de NOx (banco ${i})`) ||
      rango(0x98, 2, (i) => `Catalizador de NOx (banco ${i})`) ||
      (mid === 0xa1 ? "Misfire: datos generales" : null) ||
      rango(0xa2, 12, (i) => `Misfire cilindro ${i}`) ||
      rango(0xb0, 2, (i) => `Filtro de partículas (banco ${i})`) ||
      `Monitor ${mid.toString(16).toUpperCase().padStart(2, "0")}`
    );
  };
  S.nombreTID = function (mid, tid) {
    if (mid >= 0xa1 && mid <= 0xad) {
      if (tid === 0x0b) return "Promedio de fallos (últimos 10 ciclos)";
      if (tid === 0x0c) return "Fallos en el ciclo actual/último";
    }
    const o2 = { 1: "Umbral rico→pobre", 2: "Umbral pobre→rico", 3: "Voltaje bajo para tiempo de cambio", 4: "Voltaje alto para tiempo de cambio",
      5: "Tiempo de cambio rico→pobre", 6: "Tiempo de cambio pobre→rico", 7: "Voltaje mínimo", 8: "Voltaje máximo", 9: "Tiempo entre cambios", 0x0a: "Período del sensor" };
    if (mid >= 0x01 && mid <= 0x10 && o2[tid]) return o2[tid];
    const h = tid.toString(16).toUpperCase().padStart(2, "0");
    return tid >= 0x80 ? `Prueba del fabricante ${h}` : `Prueba ${h}`;
  };
  // Escalas estándar (SAE J1979): [con signo, factor, unidad, desplazamiento]
  const UAS = {
    0x01: [0, 1, ""], 0x02: [0, 0.1, ""], 0x03: [0, 0.01, ""], 0x04: [0, 0.001, ""], 0x05: [0, 0.0000305, ""], 0x06: [0, 0.000305, ""],
    0x07: [0, 0.25, "rpm"], 0x08: [0, 0.01, "km/h"], 0x09: [0, 1, "km/h"], 0x0a: [0, 0.122, "mV"], 0x0b: [0, 0.001, "V"], 0x0c: [0, 0.01, "V"],
    0x0d: [0, 0.00390625, "mA"], 0x0e: [0, 0.001, "A"], 0x0f: [0, 0.01, "A"], 0x10: [0, 1, "ms"], 0x11: [0, 100, "ms"], 0x12: [0, 1, "s"],
    0x13: [0, 1, "mΩ"], 0x14: [0, 1, "Ω"], 0x15: [0, 1, "kΩ"], 0x16: [0, 0.1, "°C", -40], 0x17: [0, 0.01, "kPa"], 0x18: [0, 0.0117, "kPa"],
    0x19: [0, 0.079, "kPa"], 0x1a: [0, 1, "kPa"], 0x1b: [0, 10, "kPa"], 0x1c: [0, 0.01, "°"], 0x1d: [0, 0.5, "°"], 0x1e: [0, 0.0000305, ""],
    0x1f: [0, 0.05, ""], 0x20: [0, 0.00390625, ""], 0x21: [0, 1, "mHz"], 0x22: [0, 1, "Hz"], 0x23: [0, 1, "kHz"], 0x24: [0, 1, "fallos"],
    0x25: [0, 1, "km"], 0x26: [0, 0.1, "mV/ms"], 0x27: [0, 0.01, "g/s"], 0x28: [0, 1, "g/s"], 0x29: [0, 0.25, "Pa/s"], 0x2a: [0, 0.001, "kg/h"],
    0x2b: [0, 1, "cambios"], 0x2c: [0, 0.01, "g"], 0x2d: [0, 0.01, "mg"], 0x2f: [0, 0.01, "%"], 0x30: [0, 0.001526, "%"], 0x31: [0, 0.001, "L"],
    0x32: [0, 0.0000305, "in"], 0x33: [0, 0.00024414, ""], 0x34: [0, 1, "min"], 0x35: [0, 10, "ms"], 0x36: [0, 0.01, "g"], 0x37: [0, 0.1, "g"],
    0x38: [0, 1, "g"], 0x39: [0, 0.01, "%", -327.68], 0x3a: [0, 0.001, "g"], 0x3b: [0, 0.0001, "g"], 0x3c: [0, 0.1, "µs"], 0x3d: [0, 0.01, "mA"],
    0x3f: [0, 0.01, "L"], 0x40: [0, 1, "ppm"], 0x41: [0, 0.01, "µA"],
    0x81: [1, 1, ""], 0x82: [1, 0.1, ""], 0x83: [1, 0.01, ""], 0x84: [1, 0.001, ""], 0x85: [1, 0.0000305, ""], 0x86: [1, 0.000305, ""], 0x87: [1, 1, "ppm"],
    0x8a: [1, 0.122, "mV"], 0x8b: [1, 0.001, "V"], 0x8c: [1, 0.01, "V"], 0x8d: [1, 0.00390625, "mA"], 0x8e: [1, 0.001, "A"], 0x90: [1, 1, "ms"],
    0x96: [1, 0.1, "°C"], 0x99: [1, 0.1, "kPa"], 0x9c: [1, 0.01, "°"], 0x9d: [1, 0.5, "°"], 0xa8: [1, 1, "g/s"], 0xa9: [1, 0.25, "Pa/s"],
    0xad: [1, 0.01, "mg"], 0xae: [1, 0.1, "mg"], 0xaf: [1, 0.01, "%"], 0xb0: [1, 0.003052, "%"], 0xb1: [1, 2, "mV/s"], 0xfc: [1, 0.01, "kPa"],
    0xfd: [1, 0.001, "kPa"], 0xfe: [1, 0.25, "Pa"],
  };
  S.escalarUAS = function (uasid, crudo) {
    const u = UAS[uasid] || [uasid >= 0x80 ? 1 : 0, 1, ""];
    const v = u[0] && crudo > 32767 ? crudo - 65536 : crudo;
    return { valor: Math.round((v * u[1] + (u[3] || 0)) * 10000) / 10000, unidad: u[2], crudo: v };
  };
  /** Separa una respuesta 46 de modo 06 (formato CAN: MID TID UAS valor mín máx) en pruebas. */
  S.pruebasDeMensaje06 = function (datos) {
    const out = [];
    if (!datos || datos[0] !== 0x46) return out;
    for (let i = 1; i + 8 < datos.length; i += 9) {
      const mid = datos[i], tid = datos[i + 1], uas = datos[i + 2];
      const v = S.escalarUAS(uas, w(datos[i + 3], datos[i + 4]));
      const mn = S.escalarUAS(uas, w(datos[i + 5], datos[i + 6]));
      const mx = S.escalarUAS(uas, w(datos[i + 7], datos[i + 8]));
      out.push({ mid, tid, uas, nombre: S.nombreMID(mid), prueba: S.nombreTID(mid, tid), valor: v.valor, min: mn.valor, max: mx.valor,
        unidad: v.unidad, ok: v.crudo >= mn.crudo && v.crudo <= mx.crudo,
        // TID 80–FF: el significado lo define cada fabricante. La escala (UAS) sí es estándar, pero qué mide no está validado.
        estandar: tid < 0x80, escala_conocida: !!UAS[uas], crudo: [v.crudo, mn.crudo, mx.crudo] });
    }
    return out;
  };

  // ------------------------------------------------------------------ códigos
  const SISTEMAS = {
    P: "Motor y transmisión (tren motriz)",
    C: "Chasis (frenos ABS, suspensión, dirección)",
    B: "Carrocería (bolsas de aire, aire acondicionado, luces, seguros)",
    U: "Red de comunicación entre computadoras",
  };
  const SUBSISTEMAS_P = {
    0: "Medición de aire/combustible y emisiones auxiliares", 1: "Medición de aire y combustible",
    2: "Medición de combustible (circuito de inyectores)", 3: "Sistema de encendido o fallos de encendido (misfire)",
    4: "Controles auxiliares de emisiones", 5: "Velocidad del vehículo, ralentí y entradas auxiliares",
    6: "Computadora y salidas auxiliares", 7: "Transmisión", 8: "Transmisión", 9: "Transmisión",
    A: "Sistema híbrido", B: "Sistema híbrido", C: "Sistema híbrido",
  };

  S.esCodigoValido = (c) => /^[PCBU][0-3][0-9A-F]{3}$/.test(String(c || "").trim().toUpperCase());
  S.esDeFabricante = function (c) {
    c = c.toUpperCase();
    if (c[1] === "1") return true;
    if (c[0] === "P" && c[1] === "3" && "0123".includes(c[2])) return true;
    if ("BCU".includes(c[0]) && "12".includes(c[1])) return true;
    return false;
  };

  S.describir = function (codigo) {
    codigo = String(codigo || "").trim().toUpperCase();
    const info = { codigo, descripcion: "", gravedad: "media", sistema: SISTEMAS[codigo[0]] || "Desconocido", subsistema: "", de_fabricante: false, conocido: false };
    if (!S.esCodigoValido(codigo)) { info.descripcion = "Código con formato no reconocido"; return info; }
    info.de_fabricante = S.esDeFabricante(codigo);
    if (codigo[0] === "P") info.subsistema = SUBSISTEMAS_P[codigo[2]] || "";
    const conocido = S.CODIGOS[codigo];
    if (conocido) { info.descripcion = conocido[0]; info.gravedad = conocido[1]; info.conocido = true; }
    else if (info.de_fabricante) info.descripcion = "Código específico del fabricante: su significado depende de la marca. La IA lo interpreta con la marca y modelo de tu carro.";
    else info.descripcion = `Código genérico de ${(info.subsistema || info.sistema).toLowerCase()} (sin descripción en la base local; la IA lo interpreta)`;
    if (/^P03(0\d|1[0-6])$/.test(codigo)) info.nota = "Si la luz de check engine PARPADEA, evitá manejar: la gasolina sin quemar puede dañar el catalizador.";
    return info;
  };

  /**
   * Junta códigos almacenados, pendientes y permanentes sin repetir.
   * Cada lista puede traer textos ("P0171") u objetos {codigo, ecu}.
   */
  S.unirCodigos = function (almacenados, pendientes, permanentes) {
    const res = new Map();
    for (const [tipo, lista] of [["almacenado", almacenados || []], ["pendiente", pendientes || []], ["permanente", permanentes || []]]) {
      for (const x of lista) {
        const c = typeof x === "string" ? x : x && x.codigo;
        if (!c || c === "P0000") continue;
        const modulo = x && typeof x === "object" && x.ecu ? S.nombreECU(x.ecu) : "";
        if (res.has(c)) {
          const e = res.get(c);
          if (e.tipo !== tipo && !e.tambien.includes(tipo)) e.tambien.push(tipo);
          if (modulo && !e.modulos.includes(modulo)) e.modulos.push(modulo);
        } else res.set(c, { ...S.describir(c), tipo, tambien: [], modulos: modulo ? [modulo] : [] });
      }
    }
    const orden = { alta: 0, media: 1, baja: 2 };
    return [...res.values()].sort((x, y) => (orden[x.gravedad] ?? 3) - (orden[y.gravedad] ?? 3) || x.codigo.localeCompare(y.codigo));
  };
})(typeof window !== "undefined" ? window : globalThis);
