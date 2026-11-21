/* Pruebas del controlador ELM327 con un adaptador falso que se comporta como uno real
 * (eco, espacios, encabezados, tramas ISO-TP, protocolos viejos, respuestas tardías y cortadas),
 * y pruebas de integración con el adaptador virtual del simulador.
 *   node --test tests/ */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("./cargar");

const hex = (h) => h.replace(/\s/g, "").toUpperCase();
const bytes = (h) => hex(h).match(/../g);

/**
 * Adaptador falso. `ecus` = { "7E8": { "0100": "41 00 BE 3F A8 13", ... } } (bytes de datos por computadora).
 * protocolo: número ATDPN (6 = CAN 11/500, 7 = CAN 29/500, 3 = ISO 9141-2, 5 = KWP rápido, 1 = J1850 PWM).
 */
class ELMFalso {
  constructor({ protocolo = "6", ecus = {}, extra = {}, sinCarro = false, mudo = false, malosEncabezados = false } = {}) {
    Object.assign(this, { protocolo, ecus, extra, sinCarro, mudo, malosEncabezados });
    this.h = false; this.espacios = true; this.eco = true; this.enviados = []; this.buscado = false;
    this.tardio = null; this.cortar = new Set(); this.alRecibir = () => {}; this.alCerrar = () => {};
  }
  get nombre() { return "ELM falso"; }
  get can() { return ["6", "7", "8", "9"].includes(this.protocolo); }
  async abrir() {}
  async cerrar() {}
  _sal(lineas, cmd, demora = 2) {
    const txt = (this.eco ? cmd + "\r" : "") + lineas.join("\r") + "\r\r>";
    setTimeout(() => this.alRecibir(txt), demora);
  }
  _fmt(datos) { return this.espacios ? datos.join(" ") : datos.join(""); }
  _canLineas(ecu, d) {
    const cab = this.h ? (this.protocolo === "7" ? ecu : ecu) + (this.espacios ? " " : "") : "";
    if (d.length <= 7) return [cab + this._fmt(this.h ? [d.length.toString(16).padStart(2, "0").toUpperCase(), ...d] : d)];
    const L = [];
    const largo = d.length.toString(16).toUpperCase().padStart(3, "0");
    if (this.h) {
      L.push(cab + this._fmt(["1" + largo[0], largo.slice(1), ...d.slice(0, 6)]));
      for (let i = 6, n = 1; i < d.length; i += 7, n++) L.push(cab + this._fmt([(0x20 + (n % 16)).toString(16).toUpperCase(), ...d.slice(i, i + 7).concat(Array(7).fill("00")).slice(0, 7)]));
    } else {
      L.push(largo);
      L.push("0:" + this._fmt(d.slice(0, 6)));
      for (let i = 6, n = 1; i < d.length; i += 7, n++) L.push(`${n % 16}:` + this._fmt(d.slice(i, i + 7).concat(Array(7).fill("00")).slice(0, 7)));
    }
    return L;
  }
  async escribir(t) {
    if (this.mudo) return;
    const cmd = t.replace(/\r/g, "").trim().toUpperCase();
    this.enviados.push(cmd);
    if (!cmd) return this._sal([], "");
    if (cmd.startsWith("AT")) {
      const c = cmd.slice(2);
      if (c === "Z" || c === "WS") { this.h = false; this.espacios = true; this.eco = true; return this._sal(["", "ELM327 v1.5"], cmd); }
      if (c === "E0") { this.eco = false; return this._sal(["OK"], cmd); }
      if (c === "S0") { this.espacios = false; return this._sal(["OK"], cmd); }
      if (c === "H1") { this.h = !this.malosEncabezados; return this._sal(["OK"], cmd); }
      if (c === "H0") { this.h = false; return this._sal(["OK"], cmd); }
      if (c === "I") return this._sal(["ELM327 v1.5"], cmd);
      if (c === "DPN") return this._sal(["A" + this.protocolo], cmd);
      if (c === "DP") return this._sal(["AUTO, " + ({ 6: "ISO 15765-4 (CAN 11/500)", 7: "ISO 15765-4 (CAN 29/500)", 3: "ISO 9141-2", 5: "ISO 14230-4 (KWP FAST)", 1: "SAE J1850 PWM" }[this.protocolo])], cmd);
      if (c === "RV") return this._sal(["12.6V"], cmd);
      return this._sal(["OK"], cmd);
    }
    if (this.sinCarro) return this._sal(["SEARCHING...", "UNABLE TO CONNECT"], cmd, 5);
    if (this.extra[cmd]) return this._sal(this.extra[cmd], cmd);
    if (this.tardio === cmd) { this.tardio = null; const r = this._respuesta(cmd); return this._sal(r, cmd, 450); }
    const r = this._respuesta(cmd);
    if (this.cortar.has(cmd)) { this.cortar.delete(cmd); r.splice(r.length - 1, 1); }   // se pierde la última trama
    const pre = !this.buscado ? ["SEARCHING..."] : [];
    this.buscado = true;
    this._sal([...pre, ...r], cmd);
  }
  _respuesta(cmd) {
    const out = [];
    for (const [ecu, tabla] of Object.entries(this.ecus)) {
      const d = this._datos(tabla, cmd);
      if (!d) continue;
      if (this.can) out.push(...this._canLineas(this.protocolo === "7" ? { "7E8": "18DAF110", "7E9": "18DAF118" }[ecu] : ecu, bytes(d)));
      else for (const l of [].concat(d)) out.push(this._fmt(bytes(l)));
    }
    return out.length ? out : ["NO DATA"];
  }
  _datos(tabla, cmd) {
    if (tabla[cmd]) return tabla[cmd];
    // Varios PIDs en una consulta (solo CAN): se arma con las respuestas individuales
    if (this.can && /^01([0-9A-F]{2}){2,6}$/.test(cmd)) {
      const pids = cmd.slice(2).match(/../g);
      const partes = pids.map((p) => tabla["01" + p]).filter(Boolean).map((x) => hex(x).slice(2));
      return partes.length ? "41" + partes.join("") : null;
    }
    return null;
  }
}

const MOTOR = {
  "0100": "41 00 BE 3F A8 13", "0120": "41 20 80 01 80 01", "0140": "41 40 40 00 00 00",
  "0101": "41 01 82 07 65 04", "0103": "41 03 02 00", "0104": "41 04 40", "0105": "41 05 7B", "0106": "41 06 95", "0107": "41 07 94",
  "010C": "41 0C 1A F8", "010D": "41 0D 00", "010E": "41 0E 90", "010F": "41 0F 4A", "0110": "41 10 01 90", "0111": "41 11 26",
  "0113": "41 13 03", "0114": "41 14 5A 80", "0115": "41 15 B4 FF", "011C": "41 1C 06", "011F": "41 1F 00 20", "0121": "41 21 00 86",
  "0130": "41 30 2D", "0131": "41 31 0B 22", "0142": "41 42 37 80",
  "03": "43 02 01 71 03 02", "07": "47 01 03 00", "0A": "4A 00",
  "020200": "42 02 00 01 71", "020C00": "42 0C 00 0C 58", "020500": "42 05 00 81", "020700": "42 07 00 95", "020400": "42 04 00 40",
  "0902": "49 02 01 31 48 47 43 4D 38 32 36 33 33 41 30 30 34 33 35 32", "0904": "49 04 01 53 43 41 4E 49 41 2D 43 41 4C 30 30 31 00 00",
  "0600": "46 00 80 00 00 01", "0620": "46 20 80 00 00 01", "0640": "46 40 00 00 00 01", "0660": "46 60 00 00 00 01",
  "0680": "46 80 00 00 00 01", "06A0": "46 A0 78 00 00 00",
  "0601": "46 01 07 0A 00 30 00 00 00 80", "0621": "46 21 80 01 00 E0 00 00 00 C8",
  "06A2": "46 A2 0B 24 00 01 00 00 FF FF A2 0C 24 00 02 00 00 FF FF", "06A3": "46 A3 0B 24 00 1B 00 00 FF FF A3 0C 24 00 29 00 00 FF FF",
  "06A4": "46 A4 0B 24 00 00 00 00 FF FF A4 0C 24 00 00 00 00 FF FF", "06A5": "46 A5 0B 24 00 01 00 00 FF FF A5 0C 24 00 00 00 00 FF FF",
  "04": "44",
};
const TRANS = { "0100": "41 00 98 58 00 01", "0101": "41 01 81 00 00 00", "03": "43 01 07 00", "07": "47 00", "0A": "4A 00", "04": "44" };

test("CAN 11 bits: encabezados, varias computadoras, multi-PID, freeze frame, VIN, modo 06", async () => {
  const t = new ELMFalso({ ecus: { "7E8": MOTOR, "7E9": TRANS } });
  const elm = new S.ELM327(t);
  const etapas = [];
  elm.alProgreso = (e) => etapas.push(e);
  await elm.conectar();
  assert.deepEqual(etapas, ["adaptador", "buscando", "carro"], "el carro se declara después del adaptador");
  assert.ok(elm.esCAN && elm.cabeceras, "usa encabezados para separar computadoras");
  assert.equal(elm.protocolo, "ISO 15765-4 (CAN 11/500)");
  assert.equal(elm.vin, "1HGCM82633A004352");
  assert.equal(elm.calibracion, "SCANIA-CAL001");
  assert.ok(elm.soportados.has(0x0c) && elm.soportados.has(0x42) && !elm.soportados.has(0x02), "PIDs del motor");
  assert.ok(!elm.soportados.has(0x0a), "lo que solo soporta la transmisión no se mezcla con el motor");
  assert.equal(elm.multi, true);
  assert.ok(elm.pidsDisponibles().includes("voltaje"));

  const m = await elm.muestra();
  assert.equal(m.rpm, 1726);
  assert.equal(m.temp_motor, 83);
  assert.equal(m.voltaje, 14.208);
  assert.equal(m.sistema_comb, 2);
  assert.match(elm.metaDato("rpm").fuente, /PID 0C/);
  assert.ok(elm.metaDato("rpm").t > 0, "cada dato tiene su hora de lectura");
  assert.ok(t.enviados.some((c) => /^01([0-9A-F]{2}){3,6}$/.test(c)), "pide varios PIDs por consulta");

  const l = await elm.leerTodo();
  assert.equal(l.estado.mil, true);
  assert.deepEqual(l.estado.computadoras, ["Motor", "Transmisión"]);
  const cods = Object.fromEntries(l.codigos.map((c) => [c.codigo, c]));
  assert.deepEqual(Object.keys(cods).sort(), ["P0171", "P0300", "P0302", "P0700"]);
  assert.deepEqual(cods.P0700.modulos, ["Transmisión"]);
  assert.equal(cods.P0300.tipo, "pendiente");
  assert.equal(l.freeze_frame.codigo, "P0171");
  assert.equal(l.freeze_frame.datos.rpm, 790);
  assert.equal(l.freeze_frame.datos.temp_motor, 89);

  const p6 = await elm.leerPruebas06();
  assert.ok(p6.disponible);
  assert.deepEqual(p6.misfire.find((c) => c.cilindro === 2), { cilindro: 2, promedio: 27, actual: 41 });
  assert.equal(p6.fallidas.length, 1, "catalizador fuera de límite");
  assert.match(p6.fallidas[0].nombre, /Catalizador/);

  assert.equal(await elm.borrarCodigos(), true);
  assert.ok(t.enviados.includes("04"));
  await elm.desconectar();
  await assert.rejects(elm.muestra(), (e) => e.name === "ErrorConexion");
});

test("CAN 29 bits", async () => {
  const elm = new S.ELM327(new ELMFalso({ protocolo: "7", ecus: { "7E8": MOTOR } }));
  await elm.conectar();
  assert.ok(elm.esCAN && elm.cabeceras);
  assert.equal(elm.largoCab, 8);
  assert.equal(elm.vin, "1HGCM82633A004352");
  const l = await elm.leerTodo();
  assert.deepEqual(l.codigos.map((c) => c.codigo).sort(), ["P0171", "P0300", "P0302"]);
});

test("clon que no maneja encabezados: sigue funcionando sin ellos", async () => {
  const elm = new S.ELM327(new ELMFalso({ ecus: { "7E8": MOTOR }, malosEncabezados: true, extra: {} }));
  // Con ATH1 el clon responde basura a 0100
  elm.t.extra = {};
  const t = elm.t;
  const original = t._respuesta.bind(t);
  t._respuesta = (cmd) => (t.enviados[t.enviados.length - 2] === "ATH1" && cmd === "0100" ? ["?"] : original(cmd));
  await elm.conectar();
  assert.equal(elm.cabeceras, false);
  assert.ok(elm.registro.some((r) => /encabezado/.test(r.texto)), "queda registrado en el log técnico");
  assert.equal((await elm.muestra()).rpm, 1726);
});

for (const [protocolo, nombre] of [["3", "ISO 9141-2"], ["5", "ISO 14230-4 KWP2000"], ["1", "SAE J1850 PWM"]]) {
  test(`protocolo viejo: ${nombre}`, async () => {
    const viejo = { ...MOTOR, "03": ["43 01 71 03 02 04 20"], "07": ["47 00 00 00 00 00 00"],
      "0902": ["49 02 01 00 00 00 31", "49 02 02 48 47 43 4D", "49 02 03 38 32 36 33", "49 02 04 33 41 30 30", "49 02 05 34 33 35 32"],
      // Modo 06 en formato no CAN (SAE J1979): 46 TID relleno + mapa; 46 TID TLTCID valor límite
      "0600": ["46 00 FF 60 00 00 00"], "0602": ["46 02 01 00 40 00 30", "46 02 82 00 20 00 30"], "0603": ["46 03 01 00 10 00 30"] };
    const t = new ELMFalso({ protocolo, ecus: { "7E8": viejo } });
    const elm = new S.ELM327(t);
    await elm.conectar();
    assert.equal(elm.esCAN, false);
    assert.equal(elm.multi, false, "en protocolos viejos se pide un PID a la vez");
    assert.equal(elm.vin, "1HGCM82633A004352");
    assert.deepEqual((await elm.leerCodigos()).map((c) => c.codigo).sort(), ["P0171", "P0302", "P0420"]);
    assert.equal((await elm.muestra()).rpm, 1726);
    const p6 = await elm.leerPruebas06();
    assert.equal(p6.disponible, true, "modo 06 también fuera de CAN (A-05)");
    assert.equal(p6.formato, "no_can");
    assert.deepEqual(p6.pruebas.map((x) => [x.tid, x.cid, x.tipo_limite, x.valor, x.limite, x.ok]),
      [[2, 1, "max", 64, 48, false], [2, 2, "min", 32, 48, false], [3, 1, "max", 16, 48, true]]);
    assert.equal(p6.fallidas.length, 2);
    assert.ok(p6.pruebas.every((x) => x.estandar === false && x.crudo), "se muestran los valores originales, sin inventar significado");
    assert.ok(!t.enviados.includes("ATH1"), "no se activan encabezados fuera de CAN");
  });
}

test("solo el adaptador, sin carro: nunca se declara conectado", async () => {
  const elm = new S.ELM327(new ELMFalso({ sinCarro: true }));
  const etapas = [];
  elm.alProgreso = (e) => etapas.push(e);
  await assert.rejects(elm.conectar(), /llave en ON/);
  assert.ok(!etapas.includes("carro"));
});

test("adaptador que no responde", { timeout: 40000 }, async () => {
  const elm = new S.ELM327(new ELMFalso({ mudo: true }));
  await assert.rejects(elm.conectar(), /no responde/);
});

test("respuesta tardía: no contamina la siguiente consulta", async () => {
  const t = new ELMFalso({ ecus: { "7E8": MOTOR } });
  const elm = new S.ELM327(t);
  await elm.conectar();
  t.tardio = "0105";
  await assert.rejects(elm.comando("0105", 200));         // llega a los 450 ms, después del tiempo límite
  const r = await elm.comando("010C", 2000);
  assert.ok(r.some((l) => hex(l).includes("410C1AF8")), `debe ser la respuesta de 010C, no la de 0105: ${r}`);
  assert.ok(!r.some((l) => hex(l).includes("41057B")));
  assert.ok(elm.registro.some((x) => /resincronizando/.test(x.texto)));
});

test("respuesta cortada (trama perdida): se repite la consulta y queda el aviso", async () => {
  const t = new ELMFalso({ ecus: { "7E8": MOTOR } });
  const elm = new S.ELM327(t);
  await elm.conectar();
  t.cortar.add("03");
  const cods = await elm.leerCodigos();
  assert.ok(cods.some((c) => c.codigo === "P0302"));
  t.cortar.add("0902");
  elm.vin = null;
  await elm._leerInfoECU();
  assert.equal(elm.vin, "1HGCM82633A004352", "el VIN no se arma con una respuesta incompleta");
});

test("desconexión en plena lectura", async () => {
  const t = new ELMFalso({ ecus: { "7E8": MOTOR } });
  const elm = new S.ELM327(t);
  await elm.conectar();
  t.mudo = true;
  const p = elm.muestra();
  setTimeout(() => t.alCerrar(), 20);
  await assert.rejects(p, (e) => e.name === "ErrorConexion");
  assert.equal(elm.conectado(), false);
});

test("registro técnico exportable", async () => {
  const elm = new S.ELM327(new ELMFalso({ ecus: { "7E8": MOTOR } }));
  await elm.conectar();
  const tx = elm.registro.filter((r) => r.tipo === "tx").map((r) => r.texto);
  assert.ok(["ATZ", "ATE0", "ATSP0", "0100", "ATDPN"].every((c) => tx.includes(c)));
  assert.ok(elm.registro.some((r) => r.tipo === "rx"));
  assert.ok(!tx.some((c) => /^(2E|2F|31|3B|14)/.test(c) || c === "04"), "al conectar no se manda nada que escriba o accione");
});

// ------------------------------------------------------------------ integración con el adaptador virtual
test("adaptador virtual: todos los escenarios del carro pasan por el controlador real", async () => {
  for (const [id, e] of Object.entries(S.ESCENARIOS).filter(([, e]) => e.grupo === "vehiculo")) {
    const t = new S.TransporteVirtual(id, { demora: 0 });
    const elm = new S.ELM327(t);
    await elm.conectar();
    const info = elm.info();
    assert.equal(info.tipo, "simulador", "el simulador se identifica como simulador");
    assert.ok(elm.esCAN && elm.cabeceras && elm.multi, id);
    const m = await elm.muestra();
    assert.ok(m.rpm != null && m.temp_motor != null, `${id}: datos en vivo`);
    const l = await elm.leerTodo();
    const esperado = [...(t.config.alm || []), ...(t.config.pen || [])].sort();
    assert.deepEqual([...new Set(l.codigos.map((c) => c.codigo))].sort(), [...new Set(esperado)].sort(), `${id}: códigos`);
    const p6 = await elm.leerPruebas06();
    assert.ok(p6.disponible && p6.pruebas.length >= 10, `${id}: modo 06`);
    await elm.desconectar();
  }
});

test("adaptador virtual: fallas del adaptador", { timeout: 120000 }, async () => {
  // Respuestas incompletas: se reintenta y la lectura sale completa
  for (let i = 0; i < 3; i++) {
    const elm = new S.ELM327(new S.TransporteVirtual("respuestas_incompletas", { demora: 0 }));
    await elm.conectar();
    const l = await elm.leerTodo();
    assert.ok(l.codigos.length >= 1);
    for (let k = 0; k < 5; k++) await elm.muestra();
    await elm.desconectar();
  }
  // Tiempo agotado y respuestas tardías: se conecta y sigue leyendo
  const lento = new S.ELM327(new S.TransporteVirtual("timeout", { demora: 0 }));
  await lento.conectar();
  let buenas = 0;
  for (let k = 0; k < 6; k++) { try { const m = await lento.muestra(); if (m.rpm != null) buenas++; } catch (e) { assert.notEqual(e.name, "ErrorConexion"); } }
  assert.ok(buenas >= 3, `lecturas buenas: ${buenas}`);
  await lento.desconectar();
  // Sin carro
  await assert.rejects(new S.ELM327(new S.TransporteVirtual("sin_carro", { demora: 0 })).conectar(), /llave en ON/);
  // Desconexión
  const t = new S.TransporteVirtual("desconexion", { demora: 0 });
  t.config = { ...t.config, segundosCorte: 800 };
  const elm = new S.ELM327(t);
  await elm.conectar();
  let error = null;
  for (let k = 0; k < 40 && !error; k++) { try { await elm.muestra(); } catch (e) { error = e; } await new Promise((r) => setTimeout(r, 50)); }
  assert.equal(error && error.name, "ErrorConexion");
});
