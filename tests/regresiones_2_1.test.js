/* Pruebas de regresión de la auditoría 2.0 → 2.1. Cada prueba lleva el identificador del hallazgo (A-xx)
 * de docs/AUDITORIA_INDEPENDIENTE_2_0.md. Todo es con datos simulados o un adaptador falso: NINGUNA de estas
 * pruebas demuestra que algo funciona en un carro real.
 *   node --test tests/ */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("./cargar");

/** Adaptador falso mínimo con tabla de respuestas por comando (texto tal como lo mandaría un ELM327). */
class Falso {
  constructor(tabla, { protocolo = "6", espacios = true } = {}) {
    Object.assign(this, { tabla, protocolo, espacios });
    this.enviados = []; this.alRecibir = () => {}; this.alCerrar = () => {}; this.eco = true; this.extra = {};
  }
  get nombre() { return "falso"; }
  async abrir() {}
  async cerrar() {}
  async escribir(t) {
    const cmd = t.replace(/\r/g, "").trim().toUpperCase();
    this.enviados.push(cmd);
    let r;
    if (this.extra[cmd]) r = typeof this.extra[cmd] === "function" ? this.extra[cmd]() : this.extra[cmd];
    else if (cmd.startsWith("AT")) {
      const c = cmd.slice(2);
      if (c === "Z" || c === "WS") { this.eco = true; r = ["ELM327 v1.5"]; }
      else if (c === "E0") { this.eco = false; r = ["OK"]; }
      else if (c === "DPN") r = ["A" + this.protocolo];
      else if (c === "DP") r = ["AUTO, " + { 6: "ISO 15765-4 (CAN 11/500)", 3: "ISO 9141-2" }[this.protocolo]];
      else if (c === "RV") r = ["12.4V"];
      else if (c === "I") r = ["ELM327 v1.5"];
      else r = ["OK"];
    } else r = this.tabla[cmd] || ["NO DATA"];
    const eco = this.eco ? cmd + "\r" : "";
    setTimeout(() => this.alRecibir(eco + [].concat(r).join("\r") + "\r\r>"), 1);
  }
}
const BASE = { "0100": ["41 00 98 3B 80 11"], "0120": ["41 20 00 00 00 00"], "0101": ["41 01 00 07 65 00"] };
// 0100: 98 3B 80 11 -> PIDs 01, 04, 05, 0B, 0C, 0D, 0F, 10, 11, 1C, 20(no)…
const conectar = async (tabla, op) => { const t = new Falso({ ...BASE, ...tabla }, op); const e = new S.ELM327(t); await e.conectar(); return { t, e }; };

test("A-01 · un sensor que deja de responder NO se repite como lectura nueva", async () => {
  const { t, e } = await conectar({ "010C": ["41 0C 1A F8"], "0105": ["41 05 7B"], "010D": ["41 0D 00"], "010B": ["41 0B 20"], "0104": ["41 04 40"], "010F": ["41 0F 4A"], "0111": ["41 11 26"], "0110": ["41 10 01 90"] });
  const m1 = await e.muestra();
  assert.equal(m1.rpm, 1726);
  t.tabla["010C"] = ["NO DATA"];                     // el sensor de RPM deja de responder
  const m2 = await e.muestra();
  assert.equal(m2.rpm, undefined, "la muestra nueva no trae un valor viejo de RPM");
  assert.equal(e.ultimos().rpm, 1726, "la pantalla puede seguir mostrando el último valor, marcado como viejo");
  assert.ok(e.metaDato("rpm").t < m2.t);
});

test("A-02 · sensor de temperatura en corto (215 °C) no se diagnostica como sobrecalentamiento", () => {
  const h = Array.from({ length: 60 }, (_, i) => ({ t: i, rpm: 780, temp_motor: 215, stft1: 1, ltft1: 2, sistema_comb: 2, voltaje: 14.1 }));
  const r = S.analizar(h, { codigos: S.unirCodigos(["P0118"]) }, {});
  const ids = r.hallazgos.map((x) => x.id);
  assert.ok(!ids.includes("sobrecalentamiento") && !ids.includes("temperatura_alta"), ids.join(","));
  const ect = r.hallazgos.find((x) => x.id === "ect_imposible");
  assert.ok(ect, "se reporta como dato imposible del sensor");
  assert.match(ect.detalle, /corto/);
  assert.equal(r.resumen.general.temp_motor, undefined, "el valor imposible no entra en las estadísticas");
  // Saltos imposibles (contacto flojo)
  const s = Array.from({ length: 40 }, (_, i) => ({ t: i, rpm: 800, temp_motor: i % 2 ? 88 : 60 }));
  assert.ok(S.analizar(s, null, {}).hallazgos.some((x) => x.id === "ect_intermitente"));
});

test("A-03 · si el almacenamiento falla, se avisa (no se pierde en silencio)", () => {
  const original = globalThis.localStorage;
  let aviso = null;
  globalThis.localStorage = { getItem: () => null, setItem: () => { const e = new Error("lleno"); e.name = "QuotaExceededError"; throw e; }, key: () => null, length: 0 };
  try {
    S.almacen.alFallar = (i) => { aviso = i; };
    S.almacen.guardarEscaneo({ carroId: null, lectura: { codigos: [] } });
    assert.ok(aviso && /lleno/.test(aviso.mensaje));
    assert.equal(S.almacen.ultimoError.clave, "scania-escaneos");
  } finally { globalThis.localStorage = original; S.almacen.alFallar = null; }
});

test("A-04 · sensores de oxígeno de todos los bancos con su ubicación real (PID 13 y PID 1D)", async () => {
  // PID 1D (4 bancos × 2): bits 0–3 = B1S1, B1S2, B2S1, B2S2 -> PIDs 14, 15, 16, 17
  const t1d = { "0100": ["41 00 80 00 7F 18"], "0120": ["41 20 00 00 00 00"], "011D": ["41 1D 0F"],
    "0114": ["41 14 5A 80"], "0115": ["41 15 B4 FF"], "0116": ["41 16 28 80"], "0117": ["41 17 A0 FF"] };
  const { e } = await conectar(t1d);
  assert.equal(e.mapaO2, "1D");
  const m = await e.muestra();
  assert.equal(m.o2_b2s1, 0.2, "PID 16 con mapa 1D es banco 2 sensor 1 (no B1S3)");
  assert.equal(m.o2_b2s2, 0.8);
  assert.equal(m.o2_b1s1_trim, 0);
  assert.equal(m.o2_b1s2_trim, undefined, "B = FF: sensor no usado en el ajuste, sin valor inventado");
  // PID 13 (2 bancos × 4): bits 0,1 = B1S1, B1S2; bits 4,5 = B2S1, B2S2 -> PIDs 14, 15, 18, 19
  const t13 = { "0100": ["41 00 80 00 7F 81"], "0120": ["41 20 00 00 00 00"], "0113": ["41 13 33"], "0118": ["41 18 28 80"], "0114": ["41 14 5A 80"] };
  const r13 = await conectar(t13);
  assert.equal(r13.e.mapaO2, "13");
  assert.ok(r13.e.pidsDisponibles().includes("o2_b2s1"));
  assert.equal((await r13.e.muestra()).o2_b2s1, 0.2, "PID 18 con mapa 13 es banco 2 sensor 1");
});

test("A-06 · la certeza es de la condición; el código y su propio monitor no cuentan como dos fuentes", () => {
  const p6 = S.resumirPruebas06([0xa2, 0xa3, 0xa4, 0xa5].flatMap((mid, i) => [{ mid, tid: 0x0b, valor: i === 1 ? 30 : 0 }, { mid, tid: 0x0c, valor: i === 1 ? 40 : 0 }]));
  // Sin ralenti inestable: P0302 + contadores (mismo monitor) = una sola fuente -> no "confirmada"
  const r = S.analizar([], { codigos: S.unirCodigos(["P0302"]) }, { pruebas06: p6 });
  const h = r.hallazgos.find((x) => x.id === "misfire_cilindro");
  assert.equal(h.certeza, "sospecha");
  assert.match(h.distinguir, /no QUÉ pieza|no qué pieza/i);
  // Los títulos describen la condición medida, no afirman la causa
  for (const x of S.analizar(Array.from({ length: 80 }, (_, i) => ({ t: i, rpm: i % 2 ? 780 : 2500, velocidad: 0, carga: i % 2 ? 22 : 40, stft1: i % 2 ? 12 : 1, ltft1: i % 2 ? 10 : 1, sistema_comb: 2, temp_motor: 90, maf: 3 })), null, {}).hallazgos)
    assert.ok(!/fuga de vacío/i.test(x.titulo), `título que afirma la causa: ${x.titulo}`);
});

test("A-07 · motor con MAP (sin MAF): las causas cambian y se revisa el vacío", () => {
  const h = [];
  for (let i = 0; i < 120; i++) h.push({ t: i, rpm: 900 + (i % 3) * 40 - 40, velocidad: 0, carga: 25, map: 50, stft1: 2, ltft1: 3, sistema_comb: 2, temp_motor: 90, baro: 90 });
  const r = S.analizar(h, null, {});
  assert.equal(r.resumen.medicion, "MAP");
  const v = r.hallazgos.find((x) => x.id === "vacio_bajo");
  assert.ok(v, "poco vacío en ralentí (MAP 50 de 90 kPa)");
  assert.match(v.distinguir, /vacuómetro/);
  // Patrón pobre en ralentí en motor MAP: primero fuga de escape / sensor MAP, no "manguera de vacío"
  const g = [];
  for (let i = 0; i < 80; i++) g.push({ t: i, rpm: i % 2 ? 780 : 2500, velocidad: 0, carga: i % 2 ? 22 : 40, map: i % 2 ? 32 : 45, stft1: i % 2 ? 12 : 1, ltft1: i % 2 ? 10 : 1, sistema_comb: 2, temp_motor: 90 });
  const f = S.analizar(g, null, {}).hallazgos.find((x) => x.id === "fuga_vacio_b1");
  assert.match(f.causas[0].causa, /escape/);
});

test("A-08 · voltaje con motor encendido y apagado se evalúan por separado", () => {
  const h = [];
  for (let i = 0; i < 60; i++) h.push({ t: i, rpm: 800, voltaje: 14.2 });      // encendido: carga bien
  for (let i = 60; i < 80; i++) h.push({ t: i, rpm: 0, voltaje: 11.9 });        // apagado: batería baja
  const r = S.analizar(h, null, {});
  const ids = r.hallazgos.map((x) => x.id);
  assert.ok(ids.includes("bateria_baja"), "batería baja con el motor apagado");
  assert.ok(!ids.includes("alternador"), "el alternador está bien con el motor encendido");
  assert.equal(Math.round(r.resumen.voltaje_encendido.prom * 10) / 10, 14.2);
});

test("A-09 · ninguna prueba guiada pide manejar ni acelerar a fondo en marcha", () => {
  assert.ok(!S.PRUEBAS_GUIADAS.some((p) => p.id === "eficiencia"));
  for (const p of S.PRUEBAS_GUIADAS) for (const paso of p.pasos) assert.ok(!/a fondo.*marcha|en marcha|2da o 3ra/i.test(paso.texto), p.id);
});

test("A-11 · si el adaptador se reinicia solo, se vuelve a configurar y sigue leyendo", async () => {
  const { t, e } = await conectar({ "010C": ["41 0C 1A F8"], "0105": ["41 05 7B"] });
  let reinicio = true;
  t.extra["010C"] = () => (reinicio ? ((reinicio = false), (t.eco = true), ["LV RESET"]) : ["41 0C 1A F8"]);
  const v = await e.leerPid("rpm");
  assert.equal(v, null, "esa lectura se pierde (no se inventa)");
  assert.ok(e.stats.reinicios >= 1);
  assert.ok(t.enviados.filter((c) => c === "ATE0").length >= 2, "se volvió a apagar el eco");
  assert.equal(await e.leerPid("rpm"), 1726, "después del reinicio sigue leyendo bien");
  assert.ok(e.avisos.some((a) => /reinició/.test(a)));
});

test("A-12 · errores del ELM327 (BUFFER FULL, DATA ERROR, BUS BUSY) se reintentan y se registran", async () => {
  const { t, e } = await conectar({});
  let n = 0;
  t.extra["03"] = () => (++n === 1 ? ["43 02 01 71 03", "BUFFER FULL"] : ["43 02 01 71 03 02"]);
  const c = await e.leerCodigos();
  assert.deepEqual(c.map((x) => x.codigo).sort(), ["P0171", "P0302"]);
  assert.ok(e.stats.errores.cortada >= 1 && e.stats.reintentos >= 1);
  const k = S.clasificarLineas(["41 0C 1A F8 <DATA ERROR", "BUS BUSY", "BUS INIT: ...OK", "NO DATA", "7E8 03 41 0D 00"]);
  assert.equal(k.cortada, true);
  assert.equal(k.sinDatos, true);
  assert.deepEqual(k.datos, ["7E8 03 41 0D 00"]);
});

test("A-12 · NO DATA no se repite tres veces (el carro ya dijo que no tiene ese dato)", async () => {
  const { t, e } = await conectar({});
  const antes = t.enviados.length;
  assert.deepEqual(await e._dtcs("0A"), []);
  assert.equal(t.enviados.slice(antes).filter((c) => c === "0A").length, 1);
});

test("A-15 · freeze frame según su propio mapa (02 00 00)", async () => {
  const { e } = await conectar({
    "020200": ["42 02 00 01 71"], "020000": ["42 00 00 40 08 00 00"],        // FF guarda PIDs 02 y 0D
    "020D00": ["42 0D 00 37"], "020C00": ["42 0C 00 0C 58"],
  });
  const ff = await e.leerFreezeFrame();
  assert.equal(ff.codigo, "P0171");
  assert.equal(ff.con_mapa, true);
  assert.deepEqual(ff.datos, { velocidad: 55 }, "solo lo que el freeze frame guardó (no la RPM, aunque responda)");
});

test("A-16 · borrado rechazado por la computadora (7F 04 22) se explica", async () => {
  const { e } = await conectar({ "04": ["7F 04 22"] });
  assert.equal(await e.borrarCodigos(), false);
  assert.match(e.ultimoBorrado.motivo, /condiciones incorrectas/);
});

test("A-17 · la computadora dice 2 códigos y entrega 1: se avisa", async () => {
  const { e } = await conectar({ "0101": ["41 01 82 07 65 00"], "03": ["43 01 01 71"] });
  const l = await e.leerTodo();
  assert.ok(l.avisos.some((a) => /dice tener 2/.test(a)), l.avisos.join(" | "));
  assert.ok(S.analizar([], l, {}).hallazgos.some((h) => h.id === "aviso_lectura"));
});

test("A-18 · si el flujo del puerto termina sin error, se avisa la desconexión", async () => {
  let cerrado = false;
  const lector = { read: async () => ({ done: true }), releaseLock() {}, cancel: async () => {} };
  const puerto = { readable: { getReader: () => lector }, writable: null, open: async () => {}, close: async () => {}, getInfo: () => ({}) };
  const nav = globalThis.navigator;
  try {
    const tr = new S.TransporteSerial(puerto, 38400);
    tr.alCerrar = () => { cerrado = true; };
    await tr.abrir();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(cerrado);
  } finally { if (nav) globalThis.navigator = nav; }
});

test("A-22 · síntomas: se relacionan con los datos o se dice que el OBD no los explica", () => {
  const p6 = S.resumirPruebas06([]);
  const r = S.analizar([], { codigos: [] }, { pruebas06: p6, sintomas: ["humo_azul", "check_parpadea"] });
  const azul = r.hallazgos.find((h) => h.id === "sintoma_humo_azul");
  assert.match(azul.detalle, /no se ve por OBD|No se ve por OBD/i);
  const parp = r.hallazgos.find((h) => h.id === "sintoma_check_parpadea");
  assert.equal(parp.urgencia.nivel, "detener");
});

test("A-23 · un código pendiente no es una fuente completa", () => {
  const h = Array.from({ length: 60 }, (_, i) => ({ t: i, rpm: 800, velocidad: 0, carga: 22, stft1: 14, ltft1: 6, sistema_comb: 2, temp_motor: 90 }));
  const conf = S.analizar(h, { codigos: S.unirCodigos(["P0171"]) }, {}).hallazgos.find((x) => /pobre/.test(x.id));
  const pend = S.analizar(h, { codigos: S.unirCodigos([], ["P0171"]) }, {}).hallazgos.find((x) => /pobre/.test(x.id));
  assert.equal(conf.certeza, "confirmada");
  assert.equal(pend.certeza, "sospecha");
  assert.ok(pend.evidencia.some((e) => /pendiente/.test(e)));
});

test("A-26 · la respuesta de la IA se revisa contra los códigos leídos", () => {
  const diag = S.interpretarJson(JSON.stringify({ resumen: "El P0420 indica catalizador", problemas: [{ problema: "Mezcla pobre", evidencias: ["P0171", "P0420"] }], fallas_conocidas: ["P0300 común en este modelo"] }));
  const av = S.verificarRespuestaIA(diag, { codigos: ["P0171"], pids: ["rpm"] });
  assert.ok(av.some((a) => /P0420/.test(a)), "P0420 no se leyó");
  assert.ok(!av.some((a) => /P0300/.test(a)), "las fallas conocidas del modelo son conocimiento general, no se marcan");
  assert.deepEqual(S.verificarRespuestaIA(S.interpretarJson('{"resumen":"P0171 confirmado","problemas":[]}'), { codigos: ["P0171"] }), []);
});

test("A-27 · la IA recibe qué sensores NO reporta el carro y no recibe el apodo (A-33)", () => {
  const ctx = S.construirContexto({ vehiculo: { apodo: "El de mamá Rosa", marca: "Honda", modelo: "CR-V", anio: "2000" },
    info: { tipo: "real", protocolo: "ISO 9141-2", es_can: false, medicion_aire: "MAP", pids: ["rpm", "map", "o2_b1s1"] },
    perfil: S.perfilVehiculo({ marca: "Honda", modelo: "CR-V", anio: 2000 }), calidad: ["0.7 lecturas por segundo"], sintomasMarcados: ["Tiembla en ralentí"] });
  assert.ok(!ctx.includes("Rosa"));
  assert.match(ctx, /NO reporta.*maf/);
  assert.match(ctx, /sensor MAP \(sin MAF\)/);
  assert.match(ctx, /Perfil del vehículo: Honda CR-V/);
  assert.match(ctx, /Tiembla en ralentí/);
  assert.match(S.PROMPT_SISTEMA, /NO son independientes|NO son independientes|no son independientes|NO son\s+independientes/i);
});

test("A-29 · kilometraje en millas no se confunde con manipulación", () => {
  const l = { codigos: [], estado: { monitores: [] }, extras: { odometro_ecu_km: 160934 } };
  const enMillas = S.revisionUsado({ lectura: l, declarado: { km: 100000, unidad: "mi" } });
  assert.equal(enMillas.puntos.find((p) => p.tema === "Kilometraje").estado, "ok");
  const sinUnidad = S.revisionUsado({ lectura: l, declarado: { km: 100000 } });
  assert.equal(sinUnidad.puntos.find((p) => p.tema === "Kilometraje").estado, "mal");
});

test("A-30 · Honda 2000 simulado (ISO 9141-2, MAP) pasa por el controlador real", async () => {
  const elm = new S.ELM327(new S.TransporteVirtual("misfire_cil2", { demora: 0, perfil: "honda2000" }));
  await elm.conectar();
  const i = elm.info();
  assert.equal(i.tipo, "simulador");
  assert.equal(i.es_can, false);
  assert.equal(i.medicion_aire, "MAP");
  assert.equal(i.vin, null, "sin VIN por OBD: no se inventa");
  assert.ok(!i.pids.includes("maf"));
  const l = await elm.leerTodo();
  assert.deepEqual(l.codigos.map((c) => c.codigo).sort(), ["P0300", "P0302"]);
  const p6 = await elm.leerPruebas06();
  assert.equal(p6.formato, "no_can");
  assert.equal(p6.misfire.length, 0, "en no CAN no hay contadores estándar por cilindro");
  const hall = S.analizar([], l, { pruebas06: p6, perfil: { encendido: "distribuidor" } }).hallazgos.find((h) => h.id === "misfire_codigo");
  assert.match(hall.distinguir, /distribuidor/);
  assert.ok(!hall.causas.some((c) => /Bobina/.test(c.causa)), "con distribuidor, un cilindro no apunta a la bobina");
  const d = await elm.diagnosticoConexion({ lecturas: 3 });
  assert.ok(d.pasos.length >= 10 && d.velocidad.vueltas === 3);
  assert.ok(!JSON.stringify(d).includes("9SCANA0SMVL000001"));
  await elm.desconectar();
});

test("Perfil Honda CR-V: se reconoce por datos o por VIN, y separa genérico / marca / físico", () => {
  const p = S.perfilVehiculo({ marca: "Honda", modelo: "CR-V", anio: "2000" });
  assert.equal(p.id, "honda_crv_1g");
  assert.equal(S.perfilVehiculo({ vin: "JHLRD1866YC012345" }).id, "honda_crv_1g");
  assert.equal(S.perfilVehiculo({ marca: "Honda", modelo: "CR-V", anio: "2008" }), null);
  assert.ok(p.A.length && p.B.length && p.C.length);
  assert.equal(p.validado, false, "no se presenta como información de fábrica");
  assert.deepEqual(S.contrastarPerfil(p, { medicion_aire: "MAF", es_can: true }).length, 2);
  assert.throws(() => S.registrarPerfil({ id: "x", nombre: "x", coincide: () => false }), /fuente/);
});

test("A-19 · varios adaptadores recordados: se listan todos y se puede olvidar uno", async () => {
  const olvidados = [];
  const puertos = [{ id: "A", forget: async () => olvidados.push("A") }, { id: "B", forget: async () => olvidados.push("B") }];
  const antes = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", { value: { serial: { getPorts: async () => puertos } }, configurable: true });
  try {
    const r = await S.TransporteSerial.recordados();
    assert.deepEqual(r.map((p) => p.id), ["A", "B"], "no solo el primero");
    assert.equal(await S.TransporteSerial.olvidar(r[1]), true);
    assert.deepEqual(olvidados, ["B"]);
    assert.equal(await S.TransporteSerial.olvidar({}), false, "si el navegador no permite olvidar, se dice");
  } finally { Object.defineProperty(globalThis, "navigator", { value: antes, configurable: true }); }
});

test("A-20 · códigos de EGR, inyector, bobina, presión de combustible y transmisión tienen su regla", () => {
  const lectura = (codigos) => ({ estado: { mil: true, num_dtc: codigos.length, monitores: [] }, codigos: codigos.map((c) => ({ codigo: c, tipo: "almacenado" })), freeze_frame: null, extras: {} });
  const casos = { P0401: "egr", P0202: "inyector_circuito", P0352: "bobina_circuito", P0087: "presion_combustible", P0740: "transmision" };
  for (const [c, id] of Object.entries(casos)) {
    const h = S.analizar([], lectura([c])).hallazgos.find((x) => x.id === id);
    assert.ok(h, `${c} → ${id}`);
    assert.equal(h.certeza, "sospecha", "un código confirmado dice qué sistema, no qué pieza: no es 'confirmada'");
    assert.ok(h.distinguir && h.no_cambiar, `${id} explica qué no se puede distinguir y qué no cambiar`);
  }
  const pend = { estado: { mil: false, num_dtc: 0, monitores: [] }, codigos: [{ codigo: "P0401", tipo: "pendiente" }], freeze_frame: null, extras: {} };
  assert.equal(S.analizar([], pend).hallazgos.find((x) => x.id === "egr").certeza, "posibilidad", "pendiente = evidencia débil");
});

test("A-21 · cada diagnóstico trae urgencia; los de datos en vivo dicen en qué condiciones se midió", () => {
  let t = 1000;
  const sim = new S.Simulador("fuga_vacio", { reloj: () => t, semilla: 5 });
  sim._conectado = true; sim.inicio = t;
  const h = []; for (let i = 0; i < 240; i++) { t += 1; h.push(sim.muestraSync()); }
  const a = S.analizar(h, sim.leerTodoSync(), { cilindrada: 1.8 });
  for (const x of a.hallazgos) {
    // Los avisos informativos (freeze frame, "todo bien") no son diagnósticos y no llevan urgencia
    if (x.gravedad !== "info" && x.gravedad !== "ok") assert.ok(x.urgencia && S.URGENCIAS[x.urgencia.nivel], `${x.id} sin urgencia válida`);
    assert.ok(!/\d+\s?%\s*(de probabilidad|probable)/i.test(JSON.stringify(x)), `${x.id} no usa porcentajes de probabilidad`);
  }
  const pobre = a.hallazgos.find((x) => /^pobre|fuga_vacio/.test(x.id));
  assert.ok(pobre, a.hallazgos.map((x) => x.id).join(","));
  assert.ok(pobre.condiciones && pobre.condiciones.length, "dice en qué condiciones se midió");
});

test("Prueba física · los textos de las pruebas guiadas no quedan cortados a media frase", () => {
  const corte = /(?:^|\s)(de|del|la|las|el|los|y|o|en|con|por|para|que|un|una|al|a|se|sin|si|últimos|primeros|cada|entre|desde|hasta|como|más|menos)$/i;
  for (const p of S.PRUEBAS_GUIADAS) {
    for (const k of ["preparacion", "herramientas", "condiciones", "referencia", "interpretacion", "siguiente", "advertencia"]) {
      const t = p[k];
      if (typeof t !== "string" || !t) continue;
      assert.ok(!corte.test(t.trim()), `${p.id}.${k} termina cortado: «…${t.slice(-40)}»`);
    }
    for (const paso of p.pasos || []) if (typeof paso.texto === "string") assert.ok(!corte.test(paso.texto.trim()), `${p.id} paso cortado: «…${paso.texto.slice(-40)}»`);
  }
});
