/* ScanIA · simulador de carro con fallas (para probar sin carro) */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  const SEG_VUELVE_PENDIENTE = 40;
  const SEG_VUELVE_ALMACENADO = 120;
  const CICLO = 70;
  const PIDS_SIM = ["rpm", "velocidad", "temp_motor", "temp_admision", "carga", "acelerador", "sistema_comb", "stft1", "ltft1", "maf", "map",
    "o2_b1s1", "o2_b1s2", "avance", "voltaje", "temp_aceite", "temp_ambiente", "baro", "consumo", "combustible", "tiempo_motor"];

  const ff = (codigo, d) => ({ codigo, datos: d });
  S.ESCENARIOS = {
    normal: { nombre: "Carro sano", descripcion: "Todo funcionando bien. Sirve para ver cómo se ven los datos normales.", alm: [], pen: [], ff: null },
    fuga_vacio: { nombre: "Fuga de vacío (manguera rajada)", descripcion: "Entra aire sin medir. Mezcla pobre en ralentí que mejora al acelerar.", alm: ["P0171"], pen: [],
      ff: ff("P0171", { rpm: 790, velocidad: 0, temp_motor: 89, carga: 21, stft1: 12.5, ltft1: 16.4, map: 37, maf: 2.6, acelerador: 14, temp_admision: 35 }) },
    misfire_cil2: { nombre: "Falla de encendido en cilindro 2", descripcion: "Bobina o bujía del cilindro 2 fallando. El motor tiembla en ralentí.", alm: ["P0302"], pen: ["P0300"],
      ff: ff("P0302", { rpm: 742, velocidad: 0, temp_motor: 90, carga: 26, stft1: 6.3, ltft1: 3.9, map: 34, maf: 3.1, acelerador: 14, temp_admision: 36 }) },
    termostato: { nombre: "Termostato pegado abierto", descripcion: "El motor nunca llega a su temperatura normal (90 °C). Gasta más gasolina.", alm: ["P0128"], pen: [],
      ff: ff("P0128", { rpm: 2210, velocidad: 57, temp_motor: 68, carga: 37, stft1: 1.6, ltft1: 3.1, map: 49, maf: 13.8, acelerador: 21, temp_admision: 33 }) },
    catalizador: { nombre: "Catalizador gastado", descripcion: "El sensor después del catalizador copia al de antes: el catalizador ya no limpia.", alm: ["P0420"], pen: [],
      ff: ff("P0420", { rpm: 2350, velocidad: 63, temp_motor: 91, carga: 36, stft1: -0.8, ltft1: 2.3, map: 48, maf: 14.2, acelerador: 22, temp_admision: 34 }) },
    alternador: { nombre: "Alternador que no carga", descripcion: "El voltaje con el motor encendido está bajo: la batería se está descargando.", alm: ["P0562"], pen: [],
      ff: ff("P0562", { rpm: 780, velocidad: 0, temp_motor: 90, carga: 24, stft1: 0.8, ltft1: 2.3, map: 33, maf: 3.3, acelerador: 14, temp_admision: 35 }) },
    sensor_o2: { nombre: "Sensor de oxígeno lento", descripcion: "El sensor O2 de antes del catalizador está viejo y responde muy lento.", alm: ["P0133"], pen: [],
      ff: ff("P0133", { rpm: 2120, velocidad: 54, temp_motor: 90, carga: 35, stft1: 4.7, ltft1: 5.5, map: 47, maf: 12.9, acelerador: 20, temp_admision: 34 }) },
    sobrecalentamiento: { nombre: "Sobrecalentamiento", descripcion: "La temperatura del motor sube sin control. Caso urgente.", alm: ["P0217"], pen: [],
      ff: ff("P0217", { rpm: 810, velocidad: 0, temp_motor: 111, carga: 27, stft1: 1.2, ltft1: 2.3, map: 35, maf: 3.4, acelerador: 14, temp_admision: 44 }) },
    mezcla_rica: { nombre: "Mezcla rica (inyector goteando)", descripcion: "Sobra gasolina: la computadora la está quitando. Olor a gasolina y más consumo.", alm: ["P0172"], pen: [],
      ff: ff("P0172", { rpm: 770, velocidad: 0, temp_motor: 90, carga: 23, stft1: -7.8, ltft1: -12.5, map: 32, maf: 3.2, acelerador: 14, temp_admision: 35 }) },
    maf_sucio: { nombre: "Sensor MAF sucio", descripcion: "El sensor de flujo de aire mide menos aire del real: mezcla pobre, sobre todo al acelerar.", alm: ["P0171"], pen: ["P0101"],
      ff: ff("P0171", { rpm: 2380, velocidad: 61, temp_motor: 90, carga: 30, stft1: 11.7, ltft1: 7.8, map: 50, maf: 10.1, acelerador: 22, temp_admision: 34 }) },
    bomba_debil: { nombre: "Bomba de gasolina débil", descripcion: "Falta combustible cuando el motor pide más: mezcla pobre bajo carga, el MAF mide bien.", alm: ["P0171"], pen: [],
      ff: ff("P0171", { rpm: 2410, velocidad: 62, temp_motor: 90, carga: 38, stft1: 13.3, ltft1: 4.7, map: 50, maf: 14.1, acelerador: 22, temp_admision: 34 }) },
    datos_contradictorios: { nombre: "Sensor de temperatura desconectado", descripcion: "El sensor del refrigerante marca −40 °C con el motor caliente: un dato imposible.", alm: ["P0118"], pen: [],
      ff: ff("P0118", { rpm: 1020, velocidad: 0, temp_motor: -40, carga: 25, stft1: 0.8, ltft1: 2.3, map: 34, maf: 3.6, acelerador: 14, temp_admision: 35 }) },
    // ---- fallas del adaptador / protocolo (usan el carro sano o con misfire)
    respuestas_incompletas: { nombre: "Adaptador: respuestas incompletas", descripcion: "El adaptador a veces corta las respuestas. La app debe descartarlas sin inventar datos.", grupo: "protocolo", base: "misfire_cil2", falla: "incompletas" },
    timeout: { nombre: "Adaptador: respuestas tardías", descripcion: "El adaptador a veces contesta tarde. La app debe resincronizarse sin mezclar respuestas.", grupo: "protocolo", base: "normal", falla: "tardias" },
    desconexion: { nombre: "Adaptador: se desconecta", descripcion: "El Bluetooth se cae a los 25 segundos. La app debe avisar y permitir reconectar.", grupo: "protocolo", base: "normal", falla: "desconexion" },
    sin_carro: { nombre: "Adaptador sin carro", descripcion: "El adaptador responde, pero la computadora del carro no (llave apagada). No debe decir 'conectado'.", grupo: "protocolo", base: "normal", falla: "sin_carro" },
  };
  for (const [id, e] of Object.entries(S.ESCENARIOS)) {
    e.grupo = e.grupo || "vehiculo";
    if (e.base) { const b = S.ESCENARIOS[e.base]; e.alm = b.alm; e.pen = b.pen; e.ff = b.ff; }
    e.id = id;
  }

  // Generador aleatorio con semilla (para pruebas repetibles)
  function aleatorio(semilla) {
    let s = semilla == null ? Math.floor(Math.random() * 2 ** 31) : semilla >>> 0;
    const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return {
      u,
      gauss: (m, d) => m + d * Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()),
      uniforme: (a, b) => a + (b - a) * u(),
      elegir: (lista) => lista[Math.floor(u() * lista.length)],
    };
  }

  const interp = (a, b, x) => { x = Math.max(0, Math.min(1, x)); x = x * x * (3 - 2 * x); return a + (b - a) * x; };

  function fase(tc) {
    const ralenti = { rpm: 760, velocidad: 0, acelerador: 14, carga: 22, map: 32, maf: 3.2, avance: 12 };
    const crucero = { rpm: 2400, velocidad: 60, acelerador: 22, carga: 38, map: 50, maf: 14.0, avance: 30 };
    if (tc < 25) return ["ralenti", ralenti];
    if (tc < 32) { const x = (tc - 25) / 7; return ["acelerando", { rpm: interp(760, 2650, x), velocidad: interp(0, 58, x), acelerador: 36, carga: 56, map: 68, maf: interp(6, 20, x), avance: 22 }]; }
    if (tc < 55) return ["crucero", crucero];
    if (tc < 62) { const x = (tc - 55) / 7; return ["frenando", { rpm: interp(2400, 850, x), velocidad: interp(60, 8, x), acelerador: 14, carga: 14, map: 24, maf: interp(9, 4, x), avance: 18 }]; }
    return ["ralenti", ralenti];
  }

  class Simulador {
    constructor(escenario = "normal", { reloj = () => Date.now() / 1000, semilla = null } = {}) {
      if (!S.ESCENARIOS[escenario]) throw new Error("Escenario desconocido: " + escenario);
      this.tipo = "simulador";
      this.escenario = escenario;
      this.config = S.ESCENARIOS[escenario];
      this.comportamiento = this.config.base || escenario;   // los escenarios de protocolo usan un carro base
      this.reloj = reloj;
      this.r = aleatorio(semilla);
      this.inicio = null;
      this.borradoEn = null;
      this._conectado = false;
      this.combustible = 62;
    }
    async conectar() { this.inicio = this.reloj(); this._conectado = true; }
    async desconectar() { this._conectado = false; }
    conectado() { return this._conectado; }
    pidsDisponibles() { return PIDS_SIM.slice(); }
    info() {
      return { tipo: "simulador", puerto: "simulador", protocolo: "Simulado (ISO 15765-4 CAN 11/500)", elm: "Simulador ScanIA",
        vin: "9SCANA0SMVL000001", calibracion: "SIMCAL-0001", computadora: "ECM-Simulado", lectura_rapida: true,
        escenario: this.escenario, escenario_nombre: this.config.nombre, pids: this.pidsDisponibles() };
    }
    /** Eventos para las pruebas guiadas: apagar, arranque, cargas, cargas_off. */
    simularEvento(tipo) {
      const t = this._t();
      if (tipo === "apagar") this.motorApagado = true;
      else if (tipo === "arranque") { this.motorApagado = false; this.arranqueEn = t; }
      else if (tipo === "cargas") this.cargas = true;
      else if (tipo === "cargas_off") this.cargas = false;
      else if (tipo === "a_fondo") this.aFondoEn = t + 2;   // acelerador a fondo durante 10 s (prueba de respiración)
    }
    async voltajeRapido() { return this.muestraSync().voltaje; }
    async leerPid(clave) { return this.muestraSync()[clave] ?? null; }
    async leerPruebas06() { return this.pruebas06Sync(); }
    pruebas06Sync() {
      this._t();
      const esc = this.comportamiento;
      const cuentas = { misfire_cil2: [1, 41, 0, 2], fuga_vacio: [3, 4, 2, 3] }[esc] || [0, 0, 0, 0];
      const prom = { misfire_cil2: [0, 27, 0, 1], fuga_vacio: [2, 3, 2, 2] }[esc] || [0, 0, 0, 0];
      const P = (mid, tid, valor, min, max, unidad) => ({ mid, tid, nombre: S.nombreMID(mid), prueba: S.nombreTID(mid, tid), valor, min, max, unidad, ok: valor >= min && valor <= max, estandar: tid < 0x80, escala_conocida: true });
      const pruebas = [
        P(0x01, 0x07, 0.06, 0, 0.18, "V"), P(0x01, 0x08, 0.86, 0.6, 1.1, "V"),
        P(0x01, 0x85, esc === "sensor_o2" ? 0.42 : 0.11, 0, 0.3, "s"),
        P(0x21, 0x80, esc === "catalizador" ? 0.92 : 0.21, 0, 0.6, ""),
        P(0x3b, 0x80, 0.012, 0, 0.05, "kPa"), P(0x41, 0x81, 1.2, 0.8, 3.0, "A"),
      ];
      cuentas.forEach((c, i) => { pruebas.push(P(0xa2 + i, 0x0b, prom[i], 0, 65535, "fallos")); pruebas.push(P(0xa2 + i, 0x0c, c, 0, 65535, "fallos")); });
      return S.resumirPruebas06 ? S.resumirPruebas06(pruebas) : { disponible: true, pruebas };
    }
    _t() {
      if (!this._conectado) throw new S.ErrorConexion("El simulador no está conectado");
      return this.reloj() - this.inicio;
    }

    muestraSync() {
      const t = this._t(), r = this.r, esc = this.comportamiento;
      const voltBase = esc === "alternador" ? Math.max(11.7, 12.35 - t * 0.002) : 14.15;
      if (this.motorApagado || (this.arranqueEn != null && t - this.arranqueEn < 2.5)) {
        // Llave en ON con motor apagado, o dando arranque
        const dando = this.arranqueEn != null && t - this.arranqueEn < 2.5 && t - this.arranqueEn > 0.4;
        const v = dando ? 10.3 + r.gauss(0, 0.15) : 12.55 + r.gauss(0, 0.02);
        return { t: this.reloj(), rpm: dando ? 220 + r.gauss(0, 20) : 0, velocidad: 0, temp_motor: 88, temp_admision: 34, carga: 0, acelerador: 14,
          sistema_comb: 0, stft1: 0, ltft1: 2.3, maf: dando ? 1.2 : 0, map: dando ? 80 : 97, o2_b1s1: 0.45, o2_b1s2: 0.45, avance: 0,
          voltaje: Math.round(v * 1000) / 1000, temp_aceite: 92, temp_ambiente: 30, baro: 97, consumo: 0, combustible: Math.round(this.combustible),
          tiempo_motor: 0 };
      }
      const [nombreFase, b] = fase(t % CICLO);
      const ralenti = nombreFase === "ralenti";
      let rpm = b.rpm + r.gauss(0, 12);
      let velocidad = Math.max(0, b.velocidad + (b.velocidad > 5 ? r.gauss(0, 1.5) : 0));
      let carga = b.carga + r.gauss(0, 1.5);
      let map = b.map + r.gauss(0, 1);
      let maf = Math.max(0.5, b.maf + r.gauss(0, 0.3));
      const avance = b.avance + r.gauss(0, 1);
      let acelerador = b.acelerador + r.gauss(0, 0.4);
      const aFondo = this.aFondoEn != null && t >= this.aFondoEn && t - this.aFondoEn < 10;
      if (aFondo) {
        // Acelerador a fondo en 2da/3ra: el motor sano "respira" ~86% de su cilindrada
        const f = (t - this.aFondoEn) / 10;
        rpm = 2400 + 2600 * f + r.gauss(0, 15); velocidad = 45 + 45 * f; carga = 95 + r.gauss(0, 1); map = 95 + r.gauss(0, 0.5); acelerador = 93;
        const dens = (map * 1000) / (287.05 * (34 + 273.15));
        maf = 0.86 * 1.8 * (rpm / 120) * dens + r.gauss(0, 0.5);
      }

      const objetivo = esc === "termostato" ? 69 : 90;
      let temp = objetivo - 14 * Math.exp(-t / 25);
      if (esc === "sobrecalentamiento") temp = Math.min(115, 98 + t * 0.15);
      temp += r.gauss(0, 0.4);
      const tempAdm = 34 + (esc === "sobrecalentamiento" ? 8 : 0) + r.gauss(0, 0.5);

      let ltft = 2.3, stft = r.gauss(0, 2.2);
      if (esc === "fuga_vacio") {
        ltft = 15.6;
        stft = ralenti ? 11.5 + r.gauss(0, 1.8) : nombreFase === "crucero" ? -8.5 + r.gauss(0, 1.8) : 2 + r.gauss(0, 3);
        if (ralenti) { map += 6; maf -= 0.7; rpm += 40; }
      } else if (esc === "misfire_cil2") {
        ltft = 3.9; stft = 5.5 + r.gauss(0, 2.5);
        if (ralenti) rpm += r.elegir([0, 0, -45, -80, 30]) + r.gauss(0, 25);
      } else if (esc === "sensor_o2") {
        ltft = 5.5; stft = 4 * Math.sin(t / 6) + r.gauss(0, 1);
      } else if (esc === "mezcla_rica") {
        ltft = -12.5; stft = -6 + r.gauss(0, 2);
      } else if (esc === "maf_sucio") {
        ltft = 7.8; stft = (ralenti ? 1.5 : nombreFase === "crucero" ? 11.5 : 6) + r.gauss(0, 1.8);
        maf *= 0.72;
      } else if (esc === "bomba_debil") {
        ltft = 4.7; stft = (ralenti ? -0.5 : nombreFase === "crucero" ? 12.5 : 7) + r.gauss(0, 1.8);
      }

      let o2a = 0.45 + 0.38 * Math.sin((2 * Math.PI * t) / 1.7 + r.uniforme(-1.2, 1.2));
      let o2d = 0.68 + r.gauss(0, 0.025);
      if (esc === "catalizador") o2d = 0.45 + 0.33 * Math.sin((2 * Math.PI * t) / 1.7 + r.uniforme(-1.5, 1.5));
      else if (esc === "sensor_o2") o2a = 0.47 + 0.07 * Math.sin((2 * Math.PI * t) / 11) + r.gauss(0, 0.01);
      else if (esc === "mezcla_rica") o2a = 0.62 + 0.28 * Math.sin((2 * Math.PI * t) / 1.9 + r.uniforme(-1.2, 1.2));
      if (esc === "datos_contradictorios") temp = -40;

      let voltaje = voltBase + r.gauss(0, esc === "alternador" ? 0.04 : 0.05);
      if (this.cargas) voltaje -= esc === "alternador" ? 0.45 : 0.2;
      this.combustible = Math.max(5, this.combustible - 0.001);

      const lim = (v) => Math.min(0.95, Math.max(0.05, v));
      const d = { rpm, velocidad, temp_motor: temp, temp_admision: tempAdm, carga, acelerador,
        stft1: stft, ltft1: ltft, maf, map, o2_b1s1: lim(o2a), o2_b1s2: lim(o2d), avance, voltaje,
        combustible: this.combustible, tiempo_motor: 600 + t,
        sistema_comb: nombreFase === "frenando" ? 4 : esc === "datos_contradictorios" || temp >= 40 ? 2 : 1,
        temp_aceite: (esc === "datos_contradictorios" ? 96 : temp + 6) + r.gauss(0, 0.3), temp_ambiente: 30, baro: 97, consumo: (maf / 14.7) * 3600 / 740 };
      const out = { t: this.reloj() };
      for (const k in d) out[k] = Math.round(d[k] * 1000) / 1000;
      return out;
    }
    async muestra() { return this.muestraSync(); }

    _faseCodigos() {
      if (this.borradoEn == null) return "normal";
      const tr = this._t() - this.borradoEn;
      if (tr < SEG_VUELVE_PENDIENTE) return "borrado";
      if (tr < SEG_VUELVE_ALMACENADO) return "pendiente";
      return "normal";
    }
    _listas() {
      const f = this._faseCodigos();
      if (f === "borrado") return [[], []];
      if (f === "pendiente") return [[], [...this.config.alm, ...this.config.pen]];
      return [[...this.config.alm], [...this.config.pen]];
    }
    leerEstadoSync() {
      this._t();
      const [alm] = this._listas();
      const recien = this.borradoEn != null && this._faseCodigos() !== "normal";
      const nombres = ["MISFIRE_MONITORING", "FUEL_SYSTEM_MONITORING", "COMPONENT_MONITORING", "CATALYST_MONITORING",
        "EVAPORATIVE_SYSTEM_MONITORING", "OXYGEN_SENSOR_MONITORING", "OXYGEN_SENSOR_HEATER_MONITORING", "EGR_VVT_SYSTEM_MONITORING"];
      const monitores = nombres.map((n, i) => ({ nombre: n, nombre_es: S.MONITORES_ES[n], completo: i < 3 || !recien }));
      return { mil: alm.length > 0, num_dtc: alm.length, encendido: "chispa (gasolina)", monitores };
    }
    leerTodoSync() {
      this._t();
      const [alm, pen] = this._listas();
      let extras;
      if (this.borradoEn != null) {
        const min = (this._t() - this.borradoEn) / 60;
        extras = { km_con_check_engine: 0, km_desde_borrado: Math.round(min * 8) / 10, calentamientos_desde_borrado: 0,
          minutos_desde_borrado: Math.round(min * 10) / 10 };
      } else {
        extras = { km_con_check_engine: alm.length ? 134 : 0, km_desde_borrado: 2850, calentamientos_desde_borrado: 45, odometro_ecu_km: 87450 };
      }
      return {
        fecha: this.reloj(),
        estado: this.leerEstadoSync(),
        codigos: S.unirCodigos(alm.map((c) => ({ codigo: c, ecu: "7E8" })), pen.map((c) => ({ codigo: c, ecu: "7E8" }))),
        freeze_frame: alm.length && this.config.ff ? JSON.parse(JSON.stringify(this.config.ff)) : null,
        extras,
      };
    }
    async leerTodo() { return this.leerTodoSync(); }
    async leerCodigos() { return this.leerTodoSync().codigos; }
    async borrarCodigos() { this.borradoEn = this._t(); return true; }
  }

  S.Simulador = Simulador;
})(typeof window !== "undefined" ? window : globalThis);
