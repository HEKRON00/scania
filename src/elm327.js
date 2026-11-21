/* ScanIA · conexión con el adaptador ELM327 desde el navegador
 *
 *  TransporteSerial -> Bluetooth clásico (el ELM327 azul/negro común) y USB, con Web Serial.
 *                      Android: Chrome 138 o más nuevo. Laptop: Chrome o Edge.
 *  TransporteBLE    -> adaptadores Bluetooth 4.0 / BLE, con Web Bluetooth.
 *  ELM327           -> habla el protocolo del adaptador y del OBD2 (modos 01, 02, 03, 04, 06, 07, 09, 0A).
 *  Nunca hay dos comandos en vuelo: todo pasa por una cola (el ELM327 no acepta comandos simultáneos).
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});
  const SPP = "00001101-0000-1000-8000-00805f9b34fb";
  const SERVICIOS_BLE = [0xfff0, 0xffe0, 0x18f0, "e7810a71-73ae-499d-8c15-faa9aef0c3f2"];
  const enc = new TextEncoder();
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");
  const redondear = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

  class ErrorTiempo extends Error { constructor(cmd) { super("Sin respuesta a " + cmd); this.name = "ErrorTiempo"; } }

  // ======================================================================= transportes
  class TransporteSerial {
    constructor(puerto, baud = 38400) {
      this.puerto = puerto; this.baud = baud;
      this.alRecibir = () => {}; this.alCerrar = () => {};
      this._activo = false; this._dec = new TextDecoder();
    }
    static disponible() { return typeof navigator !== "undefined" && "serial" in navigator; }
    static async elegir(baud) {
      if (!TransporteSerial.disponible()) {
        throw new S.ErrorConexion("Este navegador no puede conectarse por Bluetooth clásico. Abrí ScanIA en Google Chrome actualizado (en Android: versión 138 o más nueva).");
      }
      let puerto;
      try {
        puerto = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
      } catch (e) {
        if (e && e.name === "NotFoundError") {
          throw new S.ErrorConexion("No elegiste ningún adaptador. Si no aparece en la lista, primero emparejalo en los ajustes de Bluetooth (PIN 1234 o 0000) y volvé a intentar.");
        }
        throw new S.ErrorConexion("No se pudo abrir la lista de dispositivos: " + (e && e.message));
      }
      return new TransporteSerial(puerto, baud);
    }
    /** Puertos que ya autorizaste antes: permiten conectar sin volver a elegir de la lista. */
    static async recordados() {
      if (!TransporteSerial.disponible() || !navigator.serial.getPorts) return [];
      try { return await navigator.serial.getPorts(); } catch (e) { return []; }
    }
    get nombre() {
      const i = (this.puerto.getInfo && this.puerto.getInfo()) || {};
      return i.bluetoothServiceClassId ? "Bluetooth" : i.usbVendorId ? "USB" : "Serial";
    }
    async abrir() {
      try {
        await this.puerto.open({ baudRate: this.baud });
      } catch (e) {
        if (!(e && e.name === "InvalidStateError")) {
          throw new S.ErrorConexion("No se pudo abrir la conexión con el adaptador. Revisá que esté conectado al carro (con su luz encendida), cerca del celular, y que ninguna otra app lo esté usando (Torque, Car Scanner…).");
        }
      }
      this._activo = true;
      // Chrome avisa cuando el dispositivo Bluetooth/USB desaparece
      if (navigator.serial && navigator.serial.addEventListener && !this._oyente) {
        this._oyente = (e) => { if (e.target === this.puerto && this._activo) { this._activo = false; this.alCerrar(new Error("dispositivo desconectado")); } };
        navigator.serial.addEventListener("disconnect", this._oyente);
      }
      this._bucle();
    }
    async _bucle() {
      let terminado = false;
      while (this._activo && this.puerto.readable && !terminado) {
        this._lector = this.puerto.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this._lector.read();
            if (done) { terminado = true; break; }   // el flujo se cerró: no se vuelve a leer en bucle
            if (value) this.alRecibir(this._dec.decode(value, { stream: true }));
          }
        } catch (e) {
          // Errores no fatales (por ejemplo, desborde del búfer) dejan un flujo nuevo en puerto.readable: se sigue leyendo
          if (this._activo && !this.puerto.readable) { this._activo = false; this.alCerrar(e); }
        } finally {
          try { this._lector.releaseLock(); } catch (e) { /* nada */ }
        }
      }
      // El flujo terminó sin error (por ejemplo, el adaptador se apagó): también es una desconexión
      if (this._activo) { this._activo = false; this.alCerrar(new Error("el adaptador cerró la conexión")); }
    }
    async escribir(texto) {
      const w = this.puerto.writable.getWriter();
      try { await w.write(enc.encode(texto)); } finally { w.releaseLock(); }
    }
    async cerrar() {
      this._activo = false;
      if (this._oyente && navigator.serial) { navigator.serial.removeEventListener("disconnect", this._oyente); this._oyente = null; }
      try { if (this._lector) await this._lector.cancel(); } catch (e) { /* nada */ }
      try { await this.puerto.close(); } catch (e) { /* nada */ }
    }
    /** Datos técnicos del puerto para el diagnóstico de conexión. */
    detalle() {
      const i = (this.puerto.getInfo && this.puerto.getInfo()) || {};
      return { tipo: "Web Serial", bluetoothServiceClassId: i.bluetoothServiceClassId || null, usbVendorId: i.usbVendorId ?? null, usbProductId: i.usbProductId ?? null,
        conectado_segun_chrome: typeof this.puerto.connected === "boolean" ? this.puerto.connected : "no informado (Chrome < 130 o no aplica)", baud: this.baud };
    }
    /** Hace que Chrome olvide el permiso de un adaptador recordado (si el navegador lo permite). */
    static async olvidar(puerto) { if (puerto && puerto.forget) { await puerto.forget(); return true; } return false; }
  }

  class TransporteBLE {
    constructor(dispositivo) {
      this.dispositivo = dispositivo; this.alRecibir = () => {}; this.alCerrar = () => {};
      this._activo = false; this._dec = new TextDecoder();
    }
    static disponible() { return typeof navigator !== "undefined" && "bluetooth" in navigator; }
    static async elegir() {
      if (!TransporteBLE.disponible()) throw new S.ErrorConexion("Este navegador no soporta Bluetooth BLE. Usá Google Chrome.");
      try {
        const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BLE });
        return new TransporteBLE(d);
      } catch (e) {
        if (e && e.name === "NotFoundError") throw new S.ErrorConexion("No elegiste ningún adaptador.");
        throw new S.ErrorConexion("No se pudo buscar dispositivos Bluetooth: " + (e && e.message));
      }
    }
    get nombre() { return "Bluetooth BLE" + (this.dispositivo.name ? ` (${this.dispositivo.name})` : ""); }
    detalle() { return { tipo: "Web Bluetooth (BLE)", nombre: this.dispositivo.name || null, servicio: this.rx ? this.rx.service.uuid : null }; }
    async abrir() {
      let servidor;
      try { servidor = await this.dispositivo.gatt.connect(); }
      catch (e) { throw new S.ErrorConexion("No se pudo conectar al adaptador BLE. Acercalo y volvé a intentar."); }
      for (const uuid of SERVICIOS_BLE) {
        let srv;
        try { srv = await servidor.getPrimaryService(uuid); } catch (e) { continue; }
        const cars = await srv.getCharacteristics();
        const rx = cars.find((c) => c.properties.notify || c.properties.indicate);
        const tx = cars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (rx && tx) { this.rx = rx; this.tx = tx; break; }
      }
      if (!this.rx) throw new S.ErrorConexion("Ese dispositivo no parece un adaptador OBD2 BLE. Si tu adaptador es Bluetooth clásico, usá el otro botón.");
      await this.rx.startNotifications();
      this.rx.addEventListener("characteristicvaluechanged", (e) => this.alRecibir(this._dec.decode(e.target.value, { stream: true })));
      if (!this._oyente) {
        this._oyente = () => { if (this._activo) { this._activo = false; this.alCerrar(new Error("desconectado")); } };
        this.dispositivo.addEventListener("gattserverdisconnected", this._oyente);
      }
      this._activo = true;
    }
    async escribir(texto) {
      const b = enc.encode(texto);
      for (let i = 0; i < b.length; i += 20) {
        const parte = b.slice(i, i + 20);
        if (this.tx.properties.writeWithoutResponse) await this.tx.writeValueWithoutResponse(parte);
        else await this.tx.writeValueWithResponse(parte);
      }
    }
    async cerrar() {
      this._activo = false;
      try { this.dispositivo.gatt.disconnect(); } catch (e) { /* nada */ }
    }
  }

  // ======================================================================= respuestas
  // Mensajes del ELM327 que no son datos (hoja de datos del ELM327)
  const MENSAJES_ELM = [
    [/^NO\s*DATA/i, "sin_datos"], [/UNABLE\s*TO\s*CONNECT/i, "sin_carro"], [/BUS\s*INIT.*ERROR/i, "init"],
    [/BUFFER\s*FULL/i, "cortada"], [/DATA\s*ERROR/i, "cortada"], [/^STOPPED/i, "cortada"],
    [/CAN\s*ERROR/i, "bus"], [/BUS\s*ERROR/i, "bus"], [/BUS\s*BUSY/i, "bus"], [/FB\s*ERROR/i, "bus"], [/^ERR\d+/i, "bus"],
    [/^\?$/, "no_entiende"], [/LV\s*RESET/i, "reinicio"], [/ACT\s*ALERT/i, "reinicio"], [/^ELM327/i, "reinicio"],
  ];
  /**
   * Separa una respuesta en líneas de datos y mensajes del adaptador.
   * cortada = la respuesta llegó incompleta o con error de transmisión (conviene repetir la consulta).
   */
  S.clasificarLineas = function (lineas) {
    const r = { datos: [], errores: [], reinicio: false, sinDatos: false, cortada: false, sinCarro: false };
    for (const l of lineas || []) {
      const t = String(l).trim();
      if (!t) continue;
      if (/^BUS\s*INIT/i.test(t) && !/ERROR/i.test(t)) continue;          // "BUS INIT: ...OK" (ISO 9141 / KWP)
      const m = MENSAJES_ELM.find(([re]) => re.test(t));
      if (!m) { r.datos.push(t); continue; }
      r.errores.push({ tipo: m[1], texto: t });
      if (m[1] === "reinicio") r.reinicio = true;
      if (m[1] === "sin_datos") r.sinDatos = true;
      if (m[1] === "sin_carro") r.sinCarro = true;
      if (m[1] === "cortada" || m[1] === "bus") r.cortada = true;
    }
    return r;
  };
  /** Respuestas negativas (7F SID código) dentro de los mensajes. */
  S.negativasDe = (msgs) => (msgs || []).filter((m) => m.datos[0] === 0x7f && m.datos.length >= 3)
    .map((m) => ({ ecu: m.ecu, servicio: m.datos[1], codigo: m.datos[2], texto: (S.RESPUESTAS_NEGATIVAS || {})[m.datos[2]] || `código ${m.datos[2].toString(16).toUpperCase()}` }));

  const aBytes = (s) => { const out = []; for (let i = 0; i + 1 < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16)); return out; };

  /**
   * Respuestas SIN encabezados (ATH0): una lista de mensajes {ecu: null, datos}.
   * Soporta respuestas CAN de varias tramas: "014" / "0: 49 02 01 ..." / "1: ...".
   */
  S.mensajesELM = function (lineas) {
    const msgs = [];
    let multi = null;
    for (const l of lineas) {
      const s = String(l).replace(/\s+/g, "").toUpperCase();
      if (/^[0-9A-F]{3}$/.test(s)) { multi = []; msgs.push(multi); continue; }
      const m = s.match(/^([0-9A-F]):([0-9A-F]+)$/);
      if (m) { if (!multi) { multi = []; msgs.push(multi); } multi.push(...aBytes(m[2])); continue; }
      if (/^([0-9A-F]{2})+$/.test(s)) { msgs.push(aBytes(s)); multi = null; }
    }
    return msgs.filter((m) => m.length).map((datos) => ({ ecu: null, datos }));
  };

  /**
   * Respuestas CAN CON encabezados (ATH1): arma los mensajes ISO-TP de cada computadora.
   *   "7E8064100BE3FA813"            -> trama única (PCI 0x06 = 6 bytes)
   *   "7E81014490201..." + "7E821..." -> trama inicial (largo 0x014) + tramas consecutivas
   * largoCab: 3 (CAN 11 bits, ej. 7E8) u 8 (CAN 29 bits, ej. 18DAF110).
   */
  S.mensajesCAN = function (lineas, largoCab) {
    const listos = [], enCurso = {};
    for (const l of lineas) {
      const s = String(l).replace(/\s+/g, "").toUpperCase();
      if (s.length < largoCab + 2 || !/^[0-9A-F]+$/.test(s)) continue;
      const ecu = s.slice(0, largoCab);
      const b = aBytes(s.slice(largoCab));
      const tipo = b[0] >> 4;
      if (tipo === 0) {
        const n = b[0] & 0x0f;
        if (n > 0) listos.push({ ecu, datos: b.slice(1, 1 + n), incompleto: b.length - 1 < n });
      } else if (tipo === 1) {
        const n = ((b[0] & 0x0f) << 8) | b[1];
        enCurso[ecu] = { ecu, largo: n, datos: b.slice(2) };
      } else if (tipo === 2 && enCurso[ecu]) {
        const m = enCurso[ecu];
        m.datos.push(...b.slice(1));
        if (m.datos.length >= m.largo) { listos.push({ ecu, datos: m.datos.slice(0, m.largo) }); delete enCurso[ecu]; }
      }
    }
    // mensajes que no terminaron de llegar: se entregan con lo que hay
    for (const m of Object.values(enCurso)) if (m.datos.length) listos.push({ ecu: m.ecu, datos: m.datos, incompleto: true });
    return listos;
  };

  /** Códigos de falla de una respuesta de modo 03 / 07 / 0A: [{codigo, ecu}] */
  S.codigosDeMensajes = function (msgs, byteRespuesta, esCAN) {
    const out = [];
    for (const { ecu, datos } of msgs || []) {
      if (datos[0] !== byteRespuesta) continue;
      const d = esCAN ? datos.slice(2) : datos.slice(1);   // en CAN el 2º byte es la cantidad de códigos
      for (let i = 0; i + 1 < d.length; i += 2) {
        const codigo = S.bytesACodigo(d[i], d[i + 1]);
        if (codigo && !out.some((x) => x.codigo === codigo && x.ecu === ecu)) out.push({ codigo, ecu });
      }
    }
    return out;
  };

  /** Texto ASCII dentro de bytes (VIN, calibración, nombre de la computadora). */
  S.asciiDe = (bytes) => String.fromCharCode(...bytes.map((b) => (b >= 0x20 && b < 0x7f ? b : 0x7c))).split("|").map((x) => x.trim()).filter(Boolean);

  /** VIN (17 caracteres) de la respuesta del modo 09 PID 02. */
  S.vinDeMensajes = function (msgs) {
    const bytes = [];
    for (const { datos } of msgs || []) if (datos[0] === 0x49 && datos[1] === 0x02) bytes.push(...datos.slice(3));
    const texto = String.fromCharCode(...bytes.filter((b) => b >= 0x30 && b <= 0x5a)).replace(/[^A-HJ-NPR-Z0-9]/g, "");
    return texto.length >= 11 ? texto.slice(-17) : null;
  };

  /** Separa una respuesta de varios PIDs: 41 0C 1A F8 0D 00 05 7B -> {0x0C:[1A,F8], 0x0D:[00], 0x05:[7B]} */
  S.separarMultiPID = function (datos) {
    const out = {};
    if (!datos || datos[0] !== 0x41) return out;
    let i = 1;
    while (i < datos.length) {
      const pid = datos[i], n = S.LARGO_PID[pid];
      if (n == null || i + 1 + n > datos.length) break;
      out[pid] = datos.slice(i + 1, i + 1 + n);
      i += 1 + n;
    }
    return out;
  };

  // ======================================================================= ELM327
  class ELM327 {
    constructor(transporte) {
      this.tipo = "real";
      this.t = transporte;
      this._rx = "";
      this._pendiente = null;
      this._cola = Promise.resolve();
      this._abierto = false;
      this._sucio = false;
      this._fallos = 0;
      this.registro = [];
      this.soportados = new Set();
      this.disponibles = [];
      this._ultimos = {};
      this._ciclo = 0;
      this.esCAN = true;
      this.cabeceras = false;
      this.largoCab = 3;
      this.multi = false;
      this.version = "";
      this.protocolo = "";
      this.vin = null;
      this.calibracion = null;
      this.nombreEcu = null;
      this.usaATRV = false;
      this.error = null;
      this._tiempos = {};
      this.avisos = [];
      this.negativas = [];
      this.mapaO2 = null;            // "13" | "1D" | null
      this.sensoresO2 = null;        // índices presentes (0–7)
      this.ultimoBorrado = null;
      this.tiempoBusqueda = null;
      this._sinEco = false;
      this.stats = { comandos: 0, ms_total: 0, tiempos_agotados: 0, cortadas: 0, reintentos: 0, negativas: 0, reinicios: 0, errores: {} };
      this.esSimulador = !!transporte.esSimulador;
      this.alProgreso = () => {};       // la app muestra en qué etapa va la conexión
    }

    /** De dónde sale cada dato y cuándo se leyó por última vez. */
    metaDato(clave) {
      const p = this.disponibles.find((x) => x.clave === clave);
      const fuente = p ? `PID ${p.pid.toString(16).toUpperCase().padStart(2, "0")} (modo 01)` : clave === "voltaje" && this.usaATRV ? "ATRV (medido por el adaptador)" : "";
      return { fuente, t: this._tiempos[clave] || null };
    }
    simularEvento(tipo) { if (this.t.simularEvento) this.t.simularEvento(tipo); }

    _log(tipo, texto) {
      this.registro.push({ t: Date.now(), tipo, texto: String(texto).replace(/\r/g, "⏎") });
      if (this.registro.length > 800) this.registro.splice(0, this.registro.length - 800);
    }

    _recibir(texto) {
      this._rx += texto;
      const i = this._rx.indexOf(">");
      if (this._pendiente && i !== -1) {
        const resp = this._rx.slice(0, i);
        this._rx = this._rx.slice(i + 1);
        const p = this._pendiente; this._pendiente = null;
        clearTimeout(p.timer); p.resolve(resp);
      }
    }

    _esperarPrompt(ms, cmd) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this._pendiente = null; reject(new ErrorTiempo(cmd)); }, ms);
        this._pendiente = { resolve, reject, timer };
        // Si el ">" ya había llegado, se resuelve de una vez
        if (this._rx.includes(">")) this._recibir("");
      });
    }

    /** Manda un comando y devuelve las líneas de respuesta (en orden, uno a la vez). */
    comando(cmd, timeout = 3000) {
      const tarea = this._cola.then(() => this._enviar(cmd, timeout));
      this._cola = tarea.catch(() => {});
      return tarea;
    }

    async _enviar(cmd, timeout) {
      if (!this._abierto) throw new S.ErrorConexion(this.error || "No hay conexión con el adaptador.");
      if (this._sucio) {
        // La respuesta anterior llegó tarde (o nunca): se limpia el canal antes de seguir
        this._log("info", "resincronizando después de una respuesta tardía");
        // Se usa ATI (inofensivo) y no un Enter solo, porque el ELM327 repite el último comando al recibir solo Enter.
        this._rx = "";
        try { await this.t.escribir("ATI\r"); await this._esperarPrompt(1500, "resync"); } catch (e) { /* nada */ }
        // Se espera a que el canal quede en silencio: los restos de la respuesta tardía se descartan
        for (let i = 0; i < 6; i++) { const antes = this._rx.length; await esperar(80); if (this._rx.length === antes) break; }
        this._rx = "";
        this._sucio = false;
      }
      this._rx = "";
      const t0 = Date.now();
      const promesa = this._esperarPrompt(timeout, cmd);
      this._log("tx", cmd);
      try { await this.t.escribir(cmd + "\r"); }
      catch (e) {
        const p = this._pendiente; this._pendiente = null;
        if (p) clearTimeout(p.timer);
        promesa.catch(() => {});
        this._log("error", "no se pudo enviar: " + (e && e.message));
        throw new S.ErrorConexion("No se pudo enviar al adaptador. ¿Se desconectó?");
      }
      let crudo;
      try { crudo = await promesa; }
      catch (e) {
        if (e instanceof ErrorTiempo) { this._sucio = true; this.stats.tiempos_agotados++; this._log("error", `sin respuesta a ${cmd} en ${timeout} ms`); }
        throw e;
      }
      this.stats.comandos++; this.stats.ms_total += Date.now() - t0;
      this._log("rx", crudo.trim() || "(vacío)");
      const eco = cmd.replace(/\s/g, "").toUpperCase();
      const todas = crudo.split(/[\r\n]+/).map((l) => l.replace(/\0/g, "").trim()).filter(Boolean);
      // Si ya se había apagado el eco (ATE0) y vuelve a aparecer, el adaptador se reinició solo
      if (this._sinEco && !/^AT/i.test(cmd) && todas.some((l) => l.replace(/\s/g, "").toUpperCase() === eco)) this._reinicioDetectado = true;
      return todas.filter((l) => l.replace(/\s/g, "").toUpperCase() !== eco && !/^SEARCHING/i.test(l));
    }

    /** Vuelve a configurar el adaptador después de un reinicio (bajo voltaje al dar arranque, clon inestable). */
    async _reconfigurar() {
      this._reinicioDetectado = false;
      this.stats.reinicios++;
      this._log("info", "el adaptador se reinició solo; se vuelve a configurar");
      this.avisos.push("El adaptador se reinició solo (pasa con voltaje bajo al dar arranque o con algunos clones). Se volvió a configurar.");
      for (const c of ["ATE0", "ATL0", "ATS0", this.cabeceras ? "ATH1" : "ATH0", "ATAT1"]) await this._seguro(c);
      if (this.numProtocolo) await this._seguro("ATSPA" + this.numProtocolo);   // protocolo conocido, con búsqueda automática de respaldo
    }

    async _seguro(cmd, timeout = 2000) {
      try { return await this.comando(cmd, timeout); }
      catch (e) { if (e instanceof S.ErrorConexion) throw e; return null; }
    }

    _parsear(lineas) {
      if (this.cabeceras) {
        const m = S.mensajesCAN(lineas, this.largoCab);
        if (m.length) return m;
      }
      return S.mensajesELM(lineas);
    }

    /** Consulta OBD: devuelve [{ecu, datos}] o null si no hubo datos. */
    async _consulta(cmd, timeout = 3000) {
      let lineas;
      try {
        lineas = await this.comando(cmd, timeout);
      } catch (e) {
        if (e instanceof S.ErrorConexion) throw e;
        if (++this._fallos >= 8) {
          this.error = "El adaptador dejó de responder. Revisá que siga conectado y con la llave en ON.";
          throw new S.ErrorConexion(this.error);
        }
        return null;
      }
      this._fallos = 0;
      const c = S.clasificarLineas(lineas);
      this.ultimaRespuesta = c;
      for (const e of c.errores) this.stats.errores[e.tipo] = (this.stats.errores[e.tipo] || 0) + 1;
      if (c.sinCarro) throw new S.ErrorConexion("La computadora del carro dejó de responder. ¿Apagaste el carro? Poné la llave en ON y volvé a conectar.");
      if (c.reinicio || this._reinicioDetectado) {
        await this._reconfigurar();
        this.ultimaRespuesta = { ...c, cortada: true };
        return null;
      }
      const todos = this._parsear(c.datos);
      const neg = S.negativasDe(todos);
      if (neg.length) {
        this.stats.negativas += neg.length;
        for (const n of neg) { this._log("info", `respuesta negativa a ${cmd}: ${n.texto}`); this.negativas.push({ cmd, ...n }); }
        if (this.negativas.length > 50) this.negativas.splice(0, this.negativas.length - 50);
      }
      const msgs = todos.filter((m) => m.datos[0] !== 0x7f);
      if (c.cortada) { this.stats.cortadas++; for (const m of msgs) m.incompleto = true; }
      return msgs.length ? msgs : null;
    }

    /**
     * Consulta que se repite si la respuesta llegó cortada o no trae lo esperado.
     * prueba(datos) dice si un mensaje sirve. Devuelve los mensajes, o null.
     */
    async _consultaValida(cmd, prueba, timeout = 3000, intentos = 3) {
      let msgs = null;
      for (let i = 0; i < intentos; i++) {
        this.ultimaRespuesta = null;
        msgs = await this._consulta(cmd, timeout);
        const c = this.ultimaRespuesta;
        const utiles = (msgs || []).filter((m) => prueba(m.datos));
        if (utiles.length && !utiles.some((m) => m.incompleto)) return msgs;
        if (msgs && !utiles.length && !msgs.some((m) => m.incompleto)) return msgs;   // respuesta completa pero sin ese dato
        // "NO DATA" o respuesta negativa: el carro contestó que no tiene ese dato; repetir no sirve
        if (!msgs && c && !c.cortada && (c.sinDatos || (c.datos.length && !c.errores.length))) return null;
        this.stats.reintentos++;
        this._log("info", `respuesta incompleta o con error a ${cmd}; reintento ${i + 1}`);
      }
      if (msgs) this.avisos.push(`La respuesta a ${cmd} llegó incompleta varias veces; ese dato puede faltar.`);
      return msgs && msgs.filter((m) => !m.incompleto).length ? msgs.filter((m) => !m.incompleto) : null;
    }

    /** De varias computadoras, prefiere la del motor. */
    _delMotor(msgs, prueba) {
      const ok = (msgs || []).filter((m) => prueba(m.datos));
      return ok.find((m) => S.esECUMotor(m.ecu)) || ok[0] || null;
    }

    async _pid01(pid) {
      const m = this._delMotor(await this._consulta("01" + hex2(pid)), (d) => d[0] === 0x41 && d[1] === pid);
      return m ? m.datos.slice(2) : null;
    }

    static _aplicar(p, d) {
      if (!d || d.length < p.f.length) return null;
      const v = p.f(...d);
      return Number.isFinite(v) ? redondear(v) : null;
    }

    // ------------------------------------------------------------------ conexión
    async conectar() {
      this.t.alRecibir = (x) => this._recibir(x);
      this.t.alCerrar = () => {
        this._abierto = false;
        this.error = "Se perdió la conexión con el adaptador.";
        this._log("error", this.error);
        const p = this._pendiente; this._pendiente = null;
        if (p) { clearTimeout(p.timer); p.reject(new S.ErrorConexion(this.error)); }
      };
      this._log("info", "abriendo conexión: " + this.t.nombre);
      await this.t.abrir();
      this._abierto = true;
      try {
        await this._iniciar();
        this._log("info", `listo: ${this.protocolo}, CAN=${this.esCAN}, encabezados=${this.cabeceras}, multi=${this.multi}, sensores=${this.pidsDisponibles().length}`);
      } catch (e) {
        this._log("error", e.message);
        await this.desconectar();
        throw e;
      }
    }

    async _iniciar() {
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) {
        try { await this.comando(i === 0 ? "ATZ" : "ATWS", 5000); ok = true; }
        catch (e) { if (e instanceof S.ErrorConexion) throw e; await this.t.escribir("\r").catch(() => {}); await esperar(600); }
      }
      if (!ok) throw new S.ErrorConexion("El adaptador no responde. Revisá que esté bien metido en el puerto OBD2 (con su luz encendida) y que sea un ELM327.");
      this.alProgreso("adaptador");
      for (const c of ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await this._seguro(c);
      this._sinEco = true;
      this.version = ((await this._seguro("ATI")) || []).join(" ").trim();

      // La primera consulta hace que el adaptador busque el protocolo del carro (puede tardar)
      this.alProgreso("buscando");
      let base = null;
      const tb = Date.now();
      for (let i = 0; i < 2 && !base; i++) {
        const l = await this._seguro("0100", 20000);
        const msgs = l ? S.mensajesELM(S.clasificarLineas(l).datos).filter((m) => m.datos[0] === 0x41 && m.datos[1] === 0x00) : [];
        if (msgs.length) base = msgs;
      }
      this.tiempoBusqueda = (Date.now() - tb) / 1000;
      if (!base) throw new S.ErrorConexion("El adaptador funciona, pero la computadora del carro no responde. Poné la llave en ON (o encendé el motor) y volvé a intentar.");

      const dpn = (((await this._seguro("ATDPN")) || [""])[0] || "").toUpperCase().replace(/\s/g, "");
      const num = dpn.length === 2 && dpn[0] === "A" ? dpn[1] : dpn.slice(-1);
      this.numProtocolo = /^[1-9A-C]$/.test(num) ? num : null;
      this.esCAN = ["6", "7", "8", "9"].includes(num);
      this.largoCab = num === "7" || num === "9" ? 8 : 3;
      this.protocolo = (((await this._seguro("ATDP")) || [""])[0] || "").replace(/^AUTO,\s*/i, "") || "OBD2";

      // En CAN se activan los encabezados para saber qué computadora responde cada cosa
      if (this.esCAN) {
        await this._seguro("ATH1");
        const l = await this._seguro("0100", 4000);
        const msgs = l ? S.mensajesCAN(l, this.largoCab).filter((m) => m.datos[0] === 0x41 && m.datos[1] === 0x00) : [];
        if (msgs.length) { this.cabeceras = true; base = msgs; }
        else { await this._seguro("ATH0"); this._log("info", "el adaptador no maneja bien los encabezados; se usan sin encabezado"); }
      }

      this.alProgreso("carro");
      await this._leerSoportados(base);
      await this._leerMapaO2();
      // Sensores disponibles (si hay dos formas de leer un dato, se usa la primera que el carro soporta)
      const claves = new Set();
      this.disponibles = [];
      for (const p of [...S.PIDS, ...S.entradasO2(this.mapaO2, this.sensoresO2)]) {
        if (!this.soportados.has(p.pid) || claves.has(p.clave)) continue;
        this.disponibles.push(p); claves.add(p.clave);
      }
      this.usaATRV = !this.soportados.has(0x42);
      await this._probarMulti();
      await this._leerInfoECU();
    }

    async _leerSoportados(base) {
      const agregar = (msgs, inicio) => {
        let siguiente = false;
        const m = this._delMotor(msgs, (d) => d[0] === 0x41 && d[1] === inicio && d.length >= 6);
        const lista = this.cabeceras && m ? [m] : (msgs || []).filter((x) => x.datos[0] === 0x41 && x.datos[1] === inicio && x.datos.length >= 6);
        for (const { datos } of lista) {
          for (let i = 0; i < 32; i++) {
            if (datos[2 + (i >> 3)] & (0x80 >> (i & 7))) { this.soportados.add(inicio + i + 1); if (i === 31) siguiente = true; }
          }
        }
        return siguiente;
      };
      let sigue = agregar(base, 0x00);
      for (let inicio = 0x20; sigue && inicio <= 0xc0; inicio += 0x20) {
        sigue = agregar(await this._consultaValida("01" + hex2(inicio), (d) => d[0] === 0x41 && d[1] === inicio && d.length >= 6), inicio);
      }
    }

    /** PID 13 o 1D: qué sensores de oxígeno tiene el carro y dónde están. */
    async _leerMapaO2() {
      for (const [pid, mapa] of [[0x13, "13"], [0x1d, "1D"]]) {
        if (!this.soportados.has(pid)) continue;
        const d = await this._pid01(pid);
        if (d && d.length >= 1) { this.mapaO2 = mapa; this.sensoresO2 = S.sensoresPresentes(d[0]); return; }
      }
      this.mapaO2 = null; this.sensoresO2 = null;   // sin mapa: se supone el del PID 13 y se usan los PIDs que el carro diga soportar
    }

    async _probarMulti() {
      this.multi = false;
      if (!this.esCAN) return;
      const prueba = [0x0c, 0x0d, 0x05, 0x04].filter((p) => this.soportados.has(p)).slice(0, 3);
      if (prueba.length < 2) return;
      const m = this._delMotor(await this._consulta("01" + prueba.map(hex2).join("")), (d) => d[0] === 0x41);
      const sep = m ? S.separarMultiPID(m.datos) : {};
      this.multi = prueba.every((p) => sep[p] && sep[p].length === S.LARGO_PID[p]);
    }

    async _leerInfoECU() {
      try {
        this.vin = S.vinDeMensajes(await this._consultaValida("0902", (d) => d[0] === 0x49 && d[1] === 0x02, 6000));
        const cal = this._delMotor(await this._consulta("0904", 6000), (d) => d[0] === 0x49 && d[1] === 0x04);
        if (cal) this.calibracion = S.asciiDe(cal.datos.slice(this.esCAN ? 3 : 3)).join(", ") || null;
        const nom = this._delMotor(await this._consulta("090A", 6000), (d) => d[0] === 0x49 && d[1] === 0x0a);
        if (nom) this.nombreEcu = S.asciiDe(nom.datos.slice(3)).join(" ") || null;
      } catch (e) { if (e instanceof S.ErrorConexion) throw e; }
    }

    async desconectar() {
      this._abierto = false;
      const p = this._pendiente; this._pendiente = null;
      if (p) { clearTimeout(p.timer); p.reject(new S.ErrorConexion("Desconectado")); }
      try { await this.t.cerrar(); } catch (e) { /* nada */ }
    }
    conectado() { return this._abierto; }
    pidsDisponibles() {
      const l = [];
      for (const p of this.disponibles) if (!l.includes(p.clave)) l.push(p.clave);
      if (this.usaATRV && !l.includes("voltaje")) l.splice(Math.max(0, l.length - 2), 0, "voltaje");
      return l;
    }
    info() {
      const i = { tipo: this.esSimulador ? "simulador" : "real", puerto: this.t.nombre, protocolo: this.protocolo, elm: this.version, vin: this.vin,
        calibracion: this.calibracion, computadora: this.nombreEcu, lectura_rapida: this.multi, encabezados: this.cabeceras, pids: this.pidsDisponibles(),
        es_can: this.esCAN, num_protocolo: this.numProtocolo, mapa_o2: this.mapaO2, sensores_o2: this.sensoresO2 ? this.sensoresO2.length : null,
        medicion_aire: this.soportados.has(0x10) ? "MAF" : this.soportados.has(0x0b) ? "MAP" : "desconocida",
        pids_soportados: [...this.soportados].filter((p) => p % 0x20 !== 0).sort((a, b) => a - b).map((p) => p.toString(16).toUpperCase().padStart(2, "0")) };
      if (this.esSimulador) { i.escenario = this.t.escenario; i.escenario_nombre = this.t.config.nombre; i.perfil_sim = this.t.perfil;
        i.cilindrada = (S.PERFILES_SIM[this.t.perfil] || S.PERFILES_SIM.moderno).cilindrada; i.perfil_nombre = (S.PERFILES_SIM[this.t.perfil] || {}).nombre; }
      return i;
    }

    // ------------------------------------------------------------------ datos en vivo
    async muestra() {
      if (!this._abierto) throw new S.ErrorConexion(this.error || "Se perdió la conexión.");
      this._ciclo++;
      const toca = (p) => p.rapido || this._ciclo % 5 === 1 || this._ultimos[p.clave] == null;
      const pids = [...new Set(this.disponibles.filter(toca).map((p) => p.pid))];
      const datosPorPid = {};
      if (this.multi) {
        for (let i = 0; i < pids.length; i += 6) {
          const grupo = pids.slice(i, i + 6);
          const m = this._delMotor(await this._consulta("01" + grupo.map(hex2).join("")), (d) => d[0] === 0x41);
          Object.assign(datosPorPid, m ? S.separarMultiPID(m.datos) : {});
        }
      } else {
        for (const pid of pids) datosPorPid[pid] = await this._pid01(pid);
      }
      const ahora = Date.now() / 1000;
      for (const p of this.disponibles) {
        const v = ELM327._aplicar(p, datosPorPid[p.pid]);
        if (v != null) { this._ultimos[p.clave] = v; this._tiempos[p.clave] = ahora; }
      }
      if (this.usaATRV && (this._ciclo % 5 === 1 || this._ultimos.voltaje == null)) {
        const v = await this.voltajeRapido();
        if (v != null) { this._ultimos.voltaje = v; this._tiempos.voltaje = Date.now() / 1000; }
      }
      // Solo datos frescos: los rápidos leídos en esta vuelta y los lentos de hace menos de 20 s.
      // Un sensor que dejó de responder NO se repite como si fuera una lectura nueva.
      const m = { t: Date.now() / 1000 };
      for (const [k, v] of Object.entries(this._ultimos)) {
        const p = this.disponibles.find((x) => x.clave === k);
        const tk = this._tiempos[k] || 0;
        if ((p && p.rapido) ? tk >= ahora : m.t - tk <= 20) m[k] = v;
      }
      return m;
    }
    /** Últimos valores conocidos (con su hora en metaDato) para mostrarlos en pantalla, aunque sean viejos. */
    ultimos() { return { ...this._ultimos }; }

    /** Voltaje medido por el adaptador en el conector (rápido; sirve para la prueba de arranque). */
    async voltajeRapido() {
      const l = await this._seguro("ATRV", 1500);
      const v = l && parseFloat(String(l[0]).replace(/[^0-9.]/g, ""));
      return Number.isFinite(v) ? v : null;
    }

    /** Lee un solo dato lo más rápido posible (para pruebas guiadas). */
    async leerPid(clave) {
      const p = this.disponibles.find((x) => x.clave === clave);
      if (!p) return null;
      return ELM327._aplicar(p, await this._pid01(p.pid));
    }

    // ------------------------------------------------------------------ diagnóstico
    async leerEstado() {
      const ok = (d) => d[0] === 0x41 && d[1] === 0x01 && d.length >= 6;
      const msgs = ((await this._consultaValida("0101", ok)) || []).filter((m) => ok(m.datos));
      if (!msgs.length) return { mil: null, num_dtc: null, encendido: null, monitores: [] };
      const m = this._delMotor(msgs, () => true);
      const e = S.decodificarEstado(m.datos[2], m.datos[3], m.datos[4], m.datos[5]);
      if (msgs.length > 1) {
        e.mil = msgs.some((x) => x.datos[2] & 0x80);
        e.num_dtc = msgs.reduce((a, x) => a + (x.datos[2] & 0x7f), 0);
        e.computadoras = msgs.map((x) => S.nombreECU(x.ecu)).filter(Boolean);
      }
      return e;
    }

    async _dtcs(modo) {
      const resp = 0x40 + parseInt(modo, 16);
      const msgs = await this._consultaValida(modo, (d) => d[0] === resp && (!this.esCAN || d.length >= 2 + 2 * (d[1] || 0)), 5000);
      return S.codigosDeMensajes(msgs, resp, this.esCAN);
    }

    async leerCodigos() {
      return S.unirCodigos(await this._dtcs("03"), await this._dtcs("07"), await this._dtcs("0A"));
    }

    /** PIDs guardados en el freeze frame según su propio mapa (02 00 00, 02 20 00…). null si el carro no lo reporta. */
    async _mapaFreezeFrame() {
      const pids = new Set();
      let inicio = 0x00, sigue = true, alguno = false;
      while (sigue && inicio <= 0xc0) {
        const ok = (d) => d[0] === 0x42 && d[1] === inicio && d.length >= 7;
        const m = this._delMotor(await this._consultaValida("02" + hex2(inicio) + "00", ok), ok);
        sigue = false;
        if (m) {
          alguno = true;
          for (let i = 0; i < 32; i++) if (m.datos[3 + (i >> 3)] & (0x80 >> (i & 7))) { if (i === 31) sigue = true; else pids.add(inicio + i + 1); }
        }
        inicio += 0x20;
      }
      return alguno ? pids : null;
    }

    async leerFreezeFrame() {
      const okFF = (d) => d[0] === 0x42 && d[1] === 0x02 && d.length >= 5;
      const m = this._delMotor(await this._consultaValida("020200", okFF), okFF);
      const codigo = m ? S.bytesACodigo(m.datos[3], m.datos[4]) : null;
      if (!codigo) return null;
      const mapa = await this._mapaFreezeFrame();
      // Con mapa: todo lo que el freeze frame guardó y la app sabe interpretar. Sin mapa: una lista básica de lo que el carro soporta.
      const todos = [...S.PIDS, ...S.entradasO2(this.mapaO2, this.sensoresO2)];
      const candidatos = mapa ? todos.filter((p) => mapa.has(p.pid) && p.pid !== 0x02)
        : S.PIDS_FREEZE_FRAME.map((c) => this.disponibles.find((x) => x.clave === c)).filter(Boolean);
      const porPid = {}, datos = {};
      for (const p of candidatos) {
        if (!(p.pid in porPid)) {
          const okP = (d) => d[0] === 0x42 && d[1] === p.pid && d.length >= 3 + p.n;
          const r = this._delMotor(await this._consultaValida("02" + hex2(p.pid) + "00", okP), okP);
          porPid[p.pid] = r ? r.datos.slice(3) : null;
        }
        if (datos[p.clave] != null) continue;
        const v = ELM327._aplicar(p, porPid[p.pid]);
        if (v != null) datos[p.clave] = redondear(v, 3);
      }
      return { codigo, datos, con_mapa: !!mapa };
    }

    async leerExtras() {
      const extras = {};
      for (const p of S.PIDS_EXTRAS) {
        if (!this.soportados.has(p.pid)) continue;
        const d = await this._pid01(p.pid);
        if (d && d.length >= p.f.length) extras[p.clave] = p.f(...d);
      }
      return extras;
    }

    /** Modo 06: resultados de las pruebas internas de la computadora (contadores de misfire, catalizador...). */
    async leerPruebas06() {
      if (!this.esCAN) return this._pruebas06NoCAN();
      const mids = [];
      let inicio = 0x00, sigue = true;
      while (sigue && inicio <= 0xe0) {
        // Respuesta normal: 46 MID b1 b2 b3 b4. Algunos adaptadores omiten el MID: 46 b1 b2 b3 b4
        const ok06 = (d) => d[0] === 0x46 && ((d.length >= 6 && d[1] === inicio) || d.length === 5);
        const m = this._delMotor(await this._consultaValida("06" + hex2(inicio), ok06), ok06);
        sigue = false;
        if (m) {
          const bits = m.datos.length >= 6 && m.datos[1] === inicio ? m.datos.slice(2, 6) : m.datos.slice(1, 5);
          for (let i = 0; i < 32; i++) {
            if (bits[i >> 3] & (0x80 >> (i & 7))) {
              const mid = inicio + i + 1;
              if (i === 31) sigue = true; else mids.push(mid);
            }
          }
        }
        inicio += 0x20;
      }
      if (!mids.length) return { disponible: false, motivo: "La computadora de tu carro no reporta pruebas internas (modo 06)." };
      const pruebas = [];
      for (const mid of mids) {
        const okMid = (d) => d[0] === 0x46 && d[1] === mid && (d.length - 1) % 9 === 0;
        const m = this._delMotor(await this._consultaValida("06" + hex2(mid), okMid, 4000), okMid);
        if (m) pruebas.push(...S.pruebasDeMensaje06(m.datos));
      }
      return { ...S.resumirPruebas06(pruebas), formato: "can" };
    }

    /**
     * Modo 06 en ISO 9141-2, ISO 14230-4 y J1850 (SAE J1979): 06 00 → 46 00 relleno A B C D (TIDs soportados);
     * 06 TID → uno o varios 46 TID TLTCID valor límite. Los TID/CID los define el fabricante: se muestran los números originales.
     */
    async _pruebas06NoCAN() {
      const tids = [];
      let inicio = 0x00, sigue = true;
      while (sigue && inicio <= 0xe0) {
        const ok = (d) => d[0] === 0x46 && d[1] === inicio && d.length >= 7;
        const m = this._delMotor(await this._consultaValida("06" + hex2(inicio), ok, 5000), ok);
        sigue = false;
        if (m) for (let i = 0; i < 32; i++) if (m.datos[3 + (i >> 3)] & (0x80 >> (i & 7))) { if (i === 31) sigue = true; else tids.push(inicio + i + 1); }
        inicio += 0x20;
      }
      if (!tids.length) return { disponible: false, formato: "no_can", motivo: "La computadora de tu carro no reporta resultados de monitoreo (modo 06), o no respondió a esa consulta." };
      const pruebas = [];
      for (const tid of tids) {
        const ok = (d) => d[0] === 0x46 && d[1] === tid && d.length >= 7;
        const msgs = await this._consultaValida("06" + hex2(tid), ok, 5000);
        for (const m of msgs || []) {
          if (!ok(m.datos)) continue;
          const pr = S.pruebaNoCAN06(m.datos);
          if (pr && !pruebas.some((x) => x.tid === pr.tid && x.cid === pr.cid)) pruebas.push(pr);
        }
      }
      return { ...S.resumirPruebas06(pruebas), formato: "no_can",
        nota: "Formato no CAN: los números de prueba (TID) y componente (CID) los define el fabricante y el valor no tiene unidades estándar. " +
          "Se muestran tal cual; el resultado 'pasó/falló' sí es el que calcula la computadora con su propio límite." };
    }

    /**
     * Diagnóstico técnico de la conexión (para investigar problemas con un adaptador o un carro).
     * Usa la conexión actual; no manda comandos que cambien nada en el carro.
     */
    async diagnosticoConexion({ lecturas = 15 } = {}) {
      const r = { fecha: new Date().toISOString(), transporte: this.t.detalle ? this.t.detalle() : { tipo: this.t.nombre }, simulador: this.esSimulador, pasos: [] };
      const paso = (nombre, ok, detalle) => r.pasos.push({ nombre, ok, detalle });
      paso("Conexión con el adaptador", this._abierto, this.t.nombre);
      const ati = ((await this._seguro("ATI")) || []).join(" ").trim();
      const desc = ((await this._seguro("AT@1")) || []).join(" ").trim();
      paso("Versión del adaptador (ATI)", !!ati, ati || "no respondió");
      paso("Descripción (AT@1)", !!desc && desc !== "?", desc || "no respondió");
      if (/v2\.1/i.test(ati)) r.nota_adaptador = "Muchos adaptadores que dicen v2.1 son clones recortados; si hay fallas, un v1.5 suele funcionar mejor.";
      const v = await this.voltajeRapido();
      paso("Voltaje en el conector (ATRV)", v != null, v != null ? `${v} V` : "el adaptador no lo reporta");
      paso("Protocolo del carro", !!this.protocolo, `${this.protocolo || "?"} (ATDPN ${this.numProtocolo || "?"}) · CAN: ${this.esCAN ? "sí" : "no"} · búsqueda: ${this.tiempoBusqueda != null ? this.tiempoBusqueda.toFixed(1) + " s" : "?"}`);
      paso("Encabezados (para saber qué computadora responde)", this.cabeceras || !this.esCAN, this.esCAN ? (this.cabeceras ? "activados" : "el adaptador no los maneja bien; se usa sin encabezados") : "no se usan en protocolos no CAN");
      paso("Varios datos por consulta", this.multi || !this.esCAN, this.multi ? "sí" : this.esCAN ? "no (el adaptador o el carro no lo aceptan)" : "no aplica en este protocolo");
      paso("Sensores disponibles", this.disponibles.length > 0, `${this.pidsDisponibles().length} datos en vivo; PIDs: ${this.info().pids_soportados.join(" ")}`);
      paso("Sensores de oxígeno", true, this.mapaO2 ? `mapa PID ${this.mapaO2}: ${this.sensoresO2.length} sensor(es)` : "el carro no reporta el mapa (se usan los PIDs que soporte)");
      paso("VIN", !!this.vin, this.vin ? this.vin.slice(0, 3) + "…" + this.vin.slice(-6) + " (tapado)" : "no disponible (común antes de ~2005)");
      // Velocidad real de lectura
      const t0 = performance.now(); let buenas = 0, fallas = 0;
      for (let i = 0; i < lecturas; i++) {
        try { const m = await this.muestra(); if (Object.keys(m).length > 1) buenas++; else fallas++; } catch (e) { if (e instanceof S.ErrorConexion) throw e; fallas++; }
      }
      const seg = (performance.now() - t0) / 1000;
      r.velocidad = { vueltas: lecturas, buenas, fallas, segundos: Math.round(seg * 10) / 10, vueltas_por_segundo: Math.round((lecturas / seg) * 10) / 10,
        ms_promedio_por_comando: this.stats.comandos ? Math.round(this.stats.ms_total / this.stats.comandos) : null };
      paso("Velocidad de lectura", buenas > 0, `${r.velocidad.vueltas_por_segundo} vueltas por segundo (${buenas}/${lecturas} completas), ${r.velocidad.ms_promedio_por_comando} ms por comando`);
      r.estadisticas = { ...this.stats, errores: { ...this.stats.errores } };
      r.avisos = this.avisos.slice(-10);
      r.negativas = this.negativas.slice(-10).map((n) => `${n.cmd}: ${n.texto}`);
      return r;
    }

    async leerTodo() {
      const l = {
        fecha: Date.now() / 1000,
        estado: await this.leerEstado(),
        codigos: await this.leerCodigos(),
        freeze_frame: await this.leerFreezeFrame(),
        extras: await this.leerExtras(),
        avisos: [],
      };
      // La computadora dice cuántos códigos confirmados tiene (PID 01): se compara con los que entregó
      const conf = l.codigos.filter((c) => c.tipo === "almacenado").length;
      if (l.estado.num_dtc != null && l.estado.num_dtc !== conf) {
        l.avisos.push(`La computadora dice tener ${l.estado.num_dtc} código(s) confirmado(s), pero entregó ${conf}. ` +
          (l.estado.num_dtc > conf ? "Puede que algún código no se haya podido leer (repetí la lectura) o que sea de un módulo que no responde por OBD genérico." : "Algunos códigos pueden venir de otro módulo."));
      }
      const neg = this.negativas.filter((n) => n.servicio === 0x03 || n.servicio === 0x07 || n.servicio === 0x0a);
      if (neg.length) l.avisos.push(`La computadora respondió negativamente al pedir códigos: ${neg.map((n) => n.texto).join("; ")}.`);
      return l;
    }

    async borrarCodigos() {
      const l = await this.comando("04", 6000).catch((e) => { if (e instanceof S.ErrorConexion) throw e; return []; });
      const c = S.clasificarLineas(l);
      const msgs = this._parsear(c.datos);
      const ok = msgs.some((m) => m.datos[0] === 0x44);
      const neg = S.negativasDe(msgs);
      this.ultimoBorrado = { ok, motivo: ok ? "" : neg.length ? `La computadora rechazó el borrado: ${neg[0].texto}.` : c.sinDatos ? "La computadora no respondió al borrado." : "El carro no confirmó el borrado." };
      this._log("info", ok ? "códigos borrados" : this.ultimoBorrado.motivo);
      return ok;
    }
  }

  /** Ordena los resultados del modo 06 y saca el resumen de misfire por cilindro. */
  S.resumirPruebas06 = function (pruebas) {
    const cil = {};
    for (const p of pruebas) {
      if (p.mid >= 0xa2 && p.mid <= 0xad) {
        const n = p.mid - 0xa1;
        cil[n] = cil[n] || { cilindro: n, promedio: null, actual: null };
        if (p.tid === 0x0b) cil[n].promedio = p.valor;
        if (p.tid === 0x0c) cil[n].actual = p.valor;
      }
    }
    return {
      disponible: true,
      fecha: Date.now() / 1000,
      pruebas,
      fallidas: pruebas.filter((p) => !p.ok),
      misfire: Object.values(cil).sort((a, b) => a.cilindro - b.cilindro),
    };
  };

  S.ELM327 = ELM327;
  S.TransporteSerial = TransporteSerial;
  S.TransporteBLE = TransporteBLE;
})(typeof window !== "undefined" ? window : globalThis);
