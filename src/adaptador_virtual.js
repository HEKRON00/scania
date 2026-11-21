/* ScanIA · adaptador ELM327 virtual
 *
 * Se comporta como un ELM327 real conectado a un carro simulado: recibe comandos de texto (ATZ, 010C, 03...)
 * y responde con el mismo formato (eco, espacios, encabezados CAN, tramas múltiples ISO-TP, "NO DATA", ">").
 * Así el simulador usa EXACTAMENTE el mismo driver que un carro real, y se pueden simular fallas del
 * adaptador: respuestas incompletas, respuestas tardías, desconexión y "carro que no responde".
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});
  const hex2 = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
  const lim = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
  const u16 = (v) => { const x = lim(v, 0, 65535); return [x >> 8, x & 0xff]; };
  const pct = (v) => [lim((v * 255) / 100, 0, 255)];

  // Convierte un valor real a los bytes que mandaría la computadora (inverso de los decodificadores de datos.js)
  const CODIFICAR = {
    0x03: (v) => [lim(v, 0, 255), 0], 0x04: pct, 0x05: (v) => [lim(v + 40, 0, 255)], 0x06: (v) => [lim((v * 128) / 100 + 128, 0, 255)],
    0x07: (v) => [lim((v * 128) / 100 + 128, 0, 255)], 0x0b: (v) => [lim(v, 0, 255)], 0x0c: (v) => u16(v * 4), 0x0d: (v) => [lim(v, 0, 255)],
    0x0e: (v) => [lim((v + 64) * 2, 0, 255)], 0x0f: (v) => [lim(v + 40, 0, 255)], 0x10: (v) => u16(v * 100), 0x11: pct,
    0x14: (v) => [lim(v * 200, 0, 255), 0xff], 0x15: (v) => [lim(v * 200, 0, 255), 0xff], 0x1f: (v) => u16(v), 0x2f: pct,
    0x33: (v) => [lim(v, 0, 255)], 0x42: (v) => u16(v * 1000), 0x46: (v) => [lim(v + 40, 0, 255)], 0x5c: (v) => [lim(v + 40, 0, 255)],
    0x5e: (v) => u16(v * 20),
  };
  const CLAVE_PID = {
    0x03: "sistema_comb", 0x04: "carga", 0x05: "temp_motor", 0x06: "stft1", 0x07: "ltft1", 0x0b: "map", 0x0c: "rpm", 0x0d: "velocidad",
    0x0e: "avance", 0x0f: "temp_admision", 0x10: "maf", 0x11: "acelerador", 0x14: "o2_b1s1", 0x15: "o2_b1s2", 0x1f: "tiempo_motor",
    0x2f: "combustible", 0x33: "baro", 0x42: "voltaje", 0x46: "temp_ambiente", 0x5c: "temp_aceite", 0x5e: "consumo",
  };
  const EXTRAS = { 0x21: "km_con_check_engine", 0x30: "calentamientos_desde_borrado", 0x31: "km_desde_borrado", 0x4d: "minutos_con_check_engine",
    0x4e: "minutos_desde_borrado", 0xa6: "odometro_ecu_km" };
  const COD_EXTRA = { 0x30: (v) => [lim(v, 0, 255)], 0xa6: (v) => { const x = Math.round(v * 10); return [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]; } };

  const PIDS_MOTOR = new Set([0x01, 0x02, ...Object.keys(CODIFICAR).map(Number), ...Object.keys(EXTRAS).map(Number)]);
  const UNIDAD_UAS = { V: [0x0b, 1000], "": [0x04, 1000], fallos: [0x24, 1], kPa: [0x17, 100], A: [0x0e, 1000], s: [0x10, 1000] };

  function mascara(soportados, inicio) {
    const b = [0, 0, 0, 0];
    for (let i = 0; i < 32; i++) {
      const pid = inicio + i + 1;
      const hay = i === 31 ? [...soportados].some((p) => p > pid) : soportados.has(pid);
      if (hay) b[i >> 3] |= 0x80 >> (i & 7);
    }
    return b;
  }

  class TransporteVirtual {
    constructor(escenario = "normal", opciones = {}) {
      this.escenario = escenario;
      this.config = S.ESCENARIOS[escenario];
      if (!this.config) throw new S.ErrorConexion("Escenario desconocido: " + escenario);
      this.falla = this.config.falla || null;
      this.modelo = opciones.modelo || new S.Simulador(escenario, opciones);
      this.alRecibir = () => {}; this.alCerrar = () => {};
      this.esSimulador = true;
      this.demora = opciones.demora ?? 8;
      this.azar = opciones.azar || Math.random;
      this._entrada = "";
      this._abierto = false;
      this.cfg = { eco: true, espacios: true, encabezados: false, protocolo: 0 };
    }
    get nombre() { return "Simulador (adaptador virtual)"; }
    async abrir() {
      await this.modelo.conectar();
      this._abierto = true;
      this._inicio = Date.now();
      if (this.falla === "desconexion") {
        this._corte = setTimeout(() => { if (this._abierto) { this._abierto = false; this.alCerrar(new Error("Bluetooth perdido")); } }, this.config.segundosCorte || 25000);
      }
    }
    async cerrar() { this._abierto = false; clearTimeout(this._corte); await this.modelo.desconectar(); }
    simularEvento(tipo) { if (this.modelo.simularEvento) this.modelo.simularEvento(tipo); }

    async escribir(texto) {
      if (!this._abierto) throw new Error("puerto cerrado");
      this._entrada += texto;
      let i;
      while ((i = this._entrada.indexOf("\r")) !== -1) {
        const cmd = this._entrada.slice(0, i).trim().toUpperCase().replace(/\s+/g, "");
        this._entrada = this._entrada.slice(i + 1);
        this._procesar(cmd);
      }
    }

    _enviar(texto, demora) {
      setTimeout(() => { if (this._abierto) this.alRecibir(texto); }, demora ?? this.demora);
    }

    _procesar(cmd) {
      const eco = this.cfg.eco ? cmd + "\r" : "";
      if (!cmd) { this._enviar("\r>"); return; }
      let resp;
      try { resp = cmd.startsWith("AT") ? this._at(cmd) : this._obd(cmd); }
      catch (e) { resp = ["?"]; }
      let demora = this.demora;
      if (this.falla === "tardias" && !cmd.startsWith("AT") && this.azar() < 0.08) demora = 3600;   // llega después del tiempo de espera
      this._enviar(eco + resp.join("\r") + "\r\r>", demora);
    }

    _at(cmd) {
      const c = cmd.slice(2);
      if (c === "Z" || c === "WS") { this.cfg = { eco: true, espacios: true, encabezados: false, protocolo: 0 }; return ["", "ELM327 v1.5"]; }
      if (c === "I") return ["ELM327 v1.5"];
      if (/^E[01]$/.test(c)) { this.cfg.eco = c[1] === "1"; return ["OK"]; }
      if (/^S[01]$/.test(c)) { this.cfg.espacios = c[1] === "1"; return ["OK"]; }
      if (/^H[01]$/.test(c)) { this.cfg.encabezados = c[1] === "1"; return ["OK"]; }
      if (/^(L[01]|AT[012]|SP[0-9A-C]|ST[0-9A-F]{2}|SH[0-9A-F]+|CAF[01])$/.test(c)) return ["OK"];
      if (c === "DPN") return [this.cfg.protocolo ? "A6" : "A0"];
      if (c === "DP") return [this.cfg.protocolo ? "AUTO, ISO 15765-4 (CAN 11/500)" : "AUTO"];
      if (c === "RV") return [`${(this.modelo.muestraSync().voltaje - 0.2).toFixed(1)}V`];
      return ["?"];
    }

    /** Arma la respuesta de una computadora con o sin encabezados y en tramas ISO-TP si hace falta. */
    _formato(ecu, datos) {
      const h = (b) => b.map(hex2).join(this.cfg.espacios ? " " : "");
      const sep = this.cfg.espacios ? " " : "";
      if (datos.length <= 7) {
        if (!this.cfg.encabezados) return [h(datos)];
        const pad = [...datos]; while (pad.length < 7) pad.push(0x00);
        return [ecu + sep + h([datos.length, ...pad])];
      }
      const lineas = [];
      if (this.cfg.encabezados) {
        lineas.push(ecu + sep + h([0x10 | (datos.length >> 8), datos.length & 0xff, ...datos.slice(0, 6)]));
        for (let i = 6, sec = 1; i < datos.length; i += 7, sec++) {
          const parte = datos.slice(i, i + 7); while (parte.length < 7) parte.push(0x00);
          lineas.push(ecu + sep + h([0x20 | (sec & 0x0f), ...parte]));
        }
      } else {
        lineas.push(datos.length.toString(16).toUpperCase().padStart(3, "0"));
        lineas.push(`0:${sep}` + h(datos.slice(0, 6)));
        for (let i = 6, sec = 1; i < datos.length; i += 7, sec++) lineas.push(`${(sec & 0x0f).toString(16).toUpperCase()}:${sep}` + h(datos.slice(i, i + 7)));
      }
      return lineas;
    }

    _obd(cmd) {
      if (!/^[0-9A-F]+$/.test(cmd) || cmd.length % 2) return ["?"];
      const b = []; for (let i = 0; i < cmd.length; i += 2) b.push(parseInt(cmd.slice(i, i + 2), 16));
      if (!this.cfg.protocolo) {
        // Primera consulta: el adaptador busca el protocolo
        if (this.falla === "sin_carro") return ["SEARCHING...", "UNABLE TO CONNECT"];
        this.cfg.protocolo = 6;
      }
      const motor = this._motor(b);
      const tcm = this._transmision(b);
      if (!motor && !tcm) return ["NO DATA"];
      let lineas = [];
      if (motor) lineas.push(...this._formato("7E8", motor));
      if (tcm) lineas.push(...this._formato("7E9", tcm));
      if (this.falla === "incompletas" && this.azar() < 0.15) {
        // se pierde una trama o se corta la línea
        if (lineas.length > 1) lineas = lineas.slice(0, -1);
        else lineas = [lineas[0].slice(0, Math.max(4, Math.floor(lineas[0].length / 2)))];
      }
      return lineas;
    }

    _soportados() {
      const m = this.modelo;
      const set = new Set([0x01, 0x02]);
      const claves = new Set(m.pidsDisponibles());
      for (const [pid, clave] of Object.entries(CLAVE_PID)) if (claves.has(clave)) set.add(Number(pid));
      for (const pid of Object.keys(EXTRAS)) set.add(Number(pid));
      return set;
    }

    /** Respuesta de la computadora del motor (7E8), o null si no responde. */
    _motor(b) {
      const m = this.modelo, modo = b[0];
      if (modo === 0x01) {
        const sop = this._soportados();
        const out = [0x41];
        const muestra = m.muestraSync();
        const todo = m.leerTodoSync();
        for (const pid of b.slice(1, 7)) {
          if (pid % 0x20 === 0) { out.push(pid, ...mascara(sop, pid)); continue; }
          if (!sop.has(pid)) continue;
          if (pid === 0x01) {
            const e = todo.estado, A = (e.mil ? 0x80 : 0) | (e.num_dtc & 0x7f);
            let C = 0, D = 0;
            const bits = { CATALYST_MONITORING: 0, EVAPORATIVE_SYSTEM_MONITORING: 2, OXYGEN_SENSOR_MONITORING: 5, OXYGEN_SENSOR_HEATER_MONITORING: 6, EGR_VVT_SYSTEM_MONITORING: 7 };
            for (const mo of e.monitores) if (bits[mo.nombre] != null) { C |= 1 << bits[mo.nombre]; if (!mo.completo) D |= 1 << bits[mo.nombre]; }
            out.push(pid, A, 0x07, C, D);
          } else if (EXTRAS[pid]) {
            const v = todo.extras[EXTRAS[pid]] ?? 0;
            out.push(pid, ...(COD_EXTRA[pid] ? COD_EXTRA[pid](v) : u16(v)));
          } else if (CODIFICAR[pid]) {
            const v = muestra[CLAVE_PID[pid]];
            if (v == null) continue;
            out.push(pid, ...CODIFICAR[pid](v));
          }
        }
        return out.length > 1 ? out : null;
      }
      if (modo === 0x03 || modo === 0x07 || modo === 0x0a) {
        const todo = m.leerTodoSync();
        const tipo = { 3: "almacenado", 7: "pendiente", 10: "permanente" }[modo];
        const cods = todo.codigos.filter((c) => c.tipo === tipo || (c.tambien || []).includes(tipo)).map((c) => c.codigo);
        const out = [0x40 + modo, cods.length];
        for (const c of cods) {
          const a = ("PCBU".indexOf(c[0]) << 6) | (parseInt(c[1], 16) << 4) | parseInt(c[2], 16);
          out.push(a, parseInt(c.slice(3), 16));
        }
        return out;
      }
      if (modo === 0x02) {
        const pid = b[1], todo = m.leerTodoSync(), ff = todo.freeze_frame;
        if (pid === 0x02) {
          if (!ff) return [0x42, 0x02, 0x00, 0x00, 0x00];
          const c = ff.codigo, a = ("PCBU".indexOf(c[0]) << 6) | (parseInt(c[1], 16) << 4) | parseInt(c[2], 16);
          return [0x42, 0x02, 0x00, a, parseInt(c.slice(3), 16)];
        }
        const clave = CLAVE_PID[pid];
        if (!ff || !clave || ff.datos[clave] == null) return null;
        return [0x42, pid, 0x00, ...CODIFICAR[pid](ff.datos[clave])];
      }
      if (modo === 0x04) { m.borrarCodigos(); return [0x44]; }
      if (modo === 0x06) return this._modo06(b[1]);
      if (modo === 0x09) {
        const pid = b[1], ascii = (t) => [...t].map((c) => c.charCodeAt(0));
        if (pid === 0x02) return [0x49, 0x02, 0x01, ...ascii(m.info().vin)];
        if (pid === 0x04) { const t = ascii("SIMCAL-0001"); while (t.length < 16) t.push(0); return [0x49, 0x04, 0x01, ...t]; }
        if (pid === 0x0a) { const t = ascii("ECM\0-EngineControl"); while (t.length < 20) t.push(0); return [0x49, 0x0a, 0x01, ...t]; }
        return null;
      }
      return null;
    }

    /** La computadora de la transmisión (7E9) también contesta algunas consultas generales. */
    _transmision(b) {
      if (b[0] === 0x01 && b.length === 2 && b[1] === 0x00) return [0x41, 0x00, 0x80, 0x00, 0x00, 0x00];
      if (b[0] === 0x01 && b.length === 2 && b[1] === 0x01) return [0x41, 0x01, 0x00, 0x00, 0x00, 0x00];
      if (b[0] === 0x03 || b[0] === 0x07 || b[0] === 0x0a) return [0x40 + b[0], 0x00];
      return null;
    }

    _modo06(mid) {
      const r = this.modelo.pruebas06Sync();
      const pruebas = (r && r.pruebas) || [];
      const mids = new Set(pruebas.map((p) => p.mid));
      if (mid % 0x20 === 0) return [0x46, mid, ...mascara(mids, mid)];
      const out = [0x46];
      for (const p of pruebas.filter((x) => x.mid === mid)) {
        const [uas, f] = UNIDAD_UAS[p.unidad] || [0x01, 1];
        out.push(p.mid, p.tid, uas, ...u16(p.valor * f), ...u16(p.min * f), ...u16(p.max * f));
      }
      return out.length > 1 ? out : null;
    }
  }

  S.TransporteVirtual = TransporteVirtual;
})(typeof window !== "undefined" ? window : globalThis);
