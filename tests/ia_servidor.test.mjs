/* Pruebas de la IA (lado de la app) y del servidor protegido (Cloudflare Worker).
 * Nunca se llama a Anthropic: fetch se reemplaza por respuestas falsas.
 *   node --test tests/ */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import worker, { validarCuerpo } from "../servidor/worker.js";
const S = createRequire(import.meta.url)("./cargar.js");

const CONEXION = { servidor: "https://ia.ejemplo.dev", codigo: "codigo-familiar-123" };
const responder = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
async function conFetch(falso, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = falso;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

// ------------------------------------------------------------------ app → IA
test("contexto para la IA: privacidad del VIN, simulador y datos relacionados", () => {
  let t = 1000;
  const sim = new S.Simulador("misfire_cil2", { reloj: () => t, semilla: 3 });
  sim._conectado = true; sim.inicio = t;
  const h = []; for (let i = 0; i < 120; i++) { t += 1; h.push(sim.muestraSync()); }
  const lectura = sim.leerTodoSync(), p6 = sim.pruebas06Sync();
  const a = S.analizar(h, lectura, { pruebas06: p6, cilindrada: 1.8 });
  const base = { sintomas: "tiembla en ralentí", info: { tipo: "simulador", vin: "1HGCM82633A004352", protocolo: "CAN" }, lectura, resumenTexto: S.resumenTexto(a.resumen),
    hallazgos: a.hallazgos, pruebas06: p6, guiadas: [{ titulo: "Batería", veredicto: "ok", resumen: "bien", valores: ["12.6 V"] }] };
  const sinVIN = S.construirContexto({ ...base, vehiculo: { marca: "Toyota", vin: "1HGCM82633A004352", _compartirVIN: false } });
  assert.ok(!sinVIN.includes("1HGCM82633A004352"), "sin permiso, el VIN no sale del teléfono");
  const conVIN = S.construirContexto({ ...base, vehiculo: { marca: "Toyota", vin: "1HGCM82633A004352", _compartirVIN: true } });
  assert.ok(conVIN.includes("1HGCM82633A004352"));
  for (const x of ["Toyota", "P0302", "SIMULADOR", "tiembla", "cil 2", "Batería", "Freeze frame"]) assert.ok(sinVIN.includes(x), x);
  assert.match(S.PROMPT_SISTEMA, /NO uses porcentajes/);
  assert.match(S.PROMPT_SISTEMA, /confirmado|sospecha|posibilidad/);
});

test("lectura de la respuesta de la IA (formato nuevo y viejo)", () => {
  const d = S.interpretarJson("```json\n" + JSON.stringify({
    resumen: "r", datos_suficientes: false, que_falta: "datos con motor caliente", urgencia: { nivel: "PRONTO", puede_manejar: true },
    problemas: [{ problema: "Misfire cil 2", estado: "Confirmado", evidencias: "P0302", causas: [{ causa: "Bobina", confianza: "ALTA" }, "Bujía"],
      prueba: "Intercambiar bobinas", no_reemplazar: "Catalizador" }],
  }) + "\n```");
  assert.equal(d.urgencia.nivel, "pronto");
  assert.equal(d.datos_suficientes, false);
  const p = d.problemas[0];
  assert.equal(p.estado, "confirmado");
  assert.deepEqual(p.evidencias, ["P0302"]);
  assert.deepEqual([p.causas[0].causa, p.causas[0].confianza, p.causas[1].causa], ["Bobina", "alta", "Bujía"]);
  assert.ok(["alta", "media", "baja"].includes(p.causas[1].confianza), "sin confianza declarada se usa un nivel, nunca un porcentaje");
  assert.equal(p.prueba.descripcion, "Intercambiar bobinas");
  // Diagnósticos guardados con la versión vieja (porcentajes) se muestran como niveles, no como porcentajes
  const viejo = S.interpretarJson('{"resumen":"x","causas_probables":[{"causa":"a","probabilidad":60},{"causa":"b","probabilidad":10}]}');
  assert.deepEqual(viejo.problemas[0].causas.map((c) => c.confianza), ["alta", "baja"]);
  assert.ok(S.interpretarJson("texto libre").formato_libre);
});

test("la app habla solo con el servidor propio (nunca con la clave de Anthropic)", async () => {
  let pedido;
  await conFetch(async (url, op) => { pedido = { url, op, cuerpo: JSON.parse(op.body) }; return responder(200, { content: [{ type: "text", text: '{"resumen":"ok"}' }], stop_reason: "end_turn" }); }, async () => {
    const r = await S.diagnosticar({ conexion: CONEXION, modelo: "claude-sonnet-5-5", contexto: "datos", imagenes: ["QUJD"], buscar: false });
    assert.equal(r.diagnostico.resumen, "ok");
  });
  assert.equal(pedido.url, "https://ia.ejemplo.dev/v1/mensajes");
  assert.equal(pedido.op.headers["x-codigo-familiar"], "codigo-familiar-123");
  assert.ok(!("x-api-key" in pedido.op.headers) && !("anthropic-dangerous-direct-browser-access" in pedido.op.headers));
  assert.equal(pedido.cuerpo.messages[0].content[1].type, "image");
  assert.equal(pedido.cuerpo.tools, undefined);
  assert.deepEqual(S.sinFotos([{ role: "user", content: [{ type: "text", text: "a" }, { type: "image", source: {} }] }]), [{ role: "user", content: "a\n[foto adjunta]" }]);
});

test("búsqueda web: pausa larga, fuentes y reintento sin la herramienta", async () => {
  const respuestas = [
    responder(200, { stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "1", name: "web_search" }, { type: "web_search_tool_result", content: [{ url: "https://foro.ejemplo/a", title: "Foro" }] }] }),
    responder(200, { stop_reason: "end_turn", content: [{ type: "text", text: "Respuesta final", citations: [{ url: "https://tsb.ejemplo/b", title: "Boletín" }] }] }),
  ];
  const cuerpos = [];
  await conFetch(async (url, op) => { cuerpos.push(JSON.parse(op.body)); return respuestas.shift(); }, async () => {
    const r = await S.seguimiento({ conexion: CONEXION, modelo: "claude-sonnet-5-5", mensajes: [{ role: "user", content: "x" }, { role: "assistant", content: "y" }], pregunta: "¿y?", buscar: true });
    assert.equal(r.respuesta, "Respuesta final");
    assert.deepEqual(r.fuentes, [{ titulo: "Boletín", url: "https://tsb.ejemplo/b" }]);
  });
  assert.equal(cuerpos[0].tools[0].type, "web_search_20250305");
  assert.equal(cuerpos[1].messages.at(-1).role, "assistant", "después de la pausa se continúa");
  const intentos = [];
  await conFetch(async (url, op) => {
    const c = JSON.parse(op.body); intentos.push(!!c.tools);
    return c.tools ? responder(400, { error: { message: "web_search tool not available" } }) : responder(200, { content: [{ type: "text", text: "sin búsqueda" }] });
  }, async () => {
    const r = await S.consultarCodigo({ conexion: CONEXION, modelo: "claude-sonnet-5-5", codigo: "P0171", vehiculo: {}, buscar: true });
    assert.equal(r.respuesta, "sin búsqueda");
  });
  assert.deepEqual(intentos, [true, false]);
});

test("errores del servidor de IA en español, y la app sigue sin IA", async () => {
  const casos = [[401, "Código familiar incorrecto.", /código familiar no coincide/], [401, "invalid x-api-key", /ANTHROPIC_API_KEY/], [403, "no está autorizado", /ORIGENES/],
    [429, "Demasiadas consultas seguidas. Esperá un minuto.", /Demasiadas/], [400, "Your credit balance is too low", /saldo/], [529, "", /ocupada/], [413, "", /menos fotos/]];
  for (const [status, msg, patron] of casos) {
    await conFetch(async () => responder(status, { error: { message: msg } }), () =>
      assert.rejects(S.diagnosticar({ conexion: CONEXION, modelo: "m", contexto: "c" }), patron));
  }
  await conFetch(async () => { throw new TypeError("Failed to fetch"); }, () =>
    assert.rejects(S.probarServidor(CONEXION), /siguen funcionando sin internet/));
  await assert.rejects(S.probarServidor({ servidor: "", codigo: "x" }), /servidor de IA/);
  await assert.rejects(S.probarServidor({ servidor: "http://inseguro.com", codigo: "x" }), /https/);
  await assert.rejects(S.probarServidor({ servidor: "https://ia.ejemplo.dev", codigo: "" }), /código familiar/);
});

// ------------------------------------------------------------------ servidor (Cloudflare Worker)
const ENV = { ANTHROPIC_API_KEY: "sk-ant-prueba", CODIGO_FAMILIAR: "codigo-familiar-123", ORIGENES: "https://hekron00.github.io", LIMITE_POR_MINUTO: "3" };
let ipN = 0;
function pedido(ruta, { metodo = "POST", origen = "https://hekron00.github.io", codigo = "codigo-familiar-123", cuerpo = {}, ip } = {}) {
  const h = { "content-type": "application/json", "CF-Connecting-IP": ip || `10.0.0.${++ipN}` };
  if (origen) h.Origin = origen;
  if (codigo) h["x-codigo-familiar"] = codigo;
  return new Request("https://scania-ia.ejemplo.workers.dev" + ruta, { method: metodo, headers: h, body: metodo === "POST" ? JSON.stringify(cuerpo) : undefined });
}
const CUERPO = { model: "claude-sonnet-5-5", max_tokens: 50000, system: "s", messages: [{ role: "user", content: "hola" }],
  tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 50 }, { type: "bash_20250124", name: "bash" }] };

test("servidor: CORS solo para los sitios permitidos", async () => {
  const ok = await worker.fetch(pedido("/v1/probar", { metodo: "OPTIONS" }), ENV);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://hekron00.github.io");
  const malo = await worker.fetch(pedido("/v1/probar", { origen: "https://sitio-malo.com" }), ENV);
  assert.equal(malo.status, 403);
  assert.equal(malo.headers.get("access-control-allow-origin"), null);
  assert.equal((await worker.fetch(pedido("/v1/otra"), ENV)).status, 404);
  assert.equal((await worker.fetch(pedido("/v1/probar", { metodo: "GET" }), ENV)).status, 404);
});

test("servidor: código familiar y configuración", async () => {
  assert.equal((await worker.fetch(pedido("/v1/probar"), ENV)).status, 200);
  const sin = await worker.fetch(pedido("/v1/probar", { codigo: "otro-codigo" }), ENV);
  assert.equal(sin.status, 401);
  assert.match((await sin.json()).error.message, /Código familiar/);
  assert.equal((await worker.fetch(pedido("/v1/probar", { codigo: null }), ENV)).status, 401);
  const malConfig = await worker.fetch(pedido("/v1/probar"), { ...ENV, CODIGO_FAMILIAR: "corto" });
  assert.equal(malConfig.status, 500);
  assert.ok(!JSON.stringify(await malConfig.json()).includes("sk-ant"), "nunca devuelve la clave");
});

test("servidor: valida y limpia la consulta antes de reenviarla", () => {
  const c = validarCuerpo(CUERPO, {});
  assert.equal(c.max_tokens, 8000, "tope de tokens");
  assert.deepEqual(c.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }], "solo búsqueda web y con tope");
  assert.throws(() => validarCuerpo({ ...CUERPO, model: "otro-modelo" }, {}), /no permitido/);
  assert.throws(() => validarCuerpo({ ...CUERPO, messages: [] }, {}), /Mensajes/);
  assert.throws(() => validarCuerpo({ ...CUERPO, messages: [{ role: "system", content: "x" }] }, {}), /Rol/);
  assert.throws(() => validarCuerpo({ ...CUERPO, system: "x".repeat(40000) }, {}), /Instrucciones/);
  assert.throws(() => validarCuerpo({ ...CUERPO, messages: Array(41).fill({ role: "user", content: "x" }) }, {}), /Mensajes/);
});

test("servidor: reenvía a Anthropic con la clave del entorno y limita las consultas", async () => {
  const enviados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, op) => { enviados.push({ url, op }); return new Response('{"content":[{"type":"text","text":"ok"}]}', { status: 200 }); };
  try {
    const r = await worker.fetch(pedido("/v1/mensajes", { cuerpo: CUERPO, ip: "1.1.1.1" }), ENV);
    assert.equal(r.status, 200);
    assert.equal(enviados[0].url, "https://api.anthropic.com/v1/messages");
    assert.equal(enviados[0].op.headers["x-api-key"], "sk-ant-prueba");
    const reenviado = JSON.parse(enviados[0].op.body);
    assert.equal(reenviado.max_tokens, 8000);
    assert.equal(reenviado.tools.length, 1);
    // Límite por minuto (3 en esta prueba)
    await worker.fetch(pedido("/v1/mensajes", { cuerpo: CUERPO, ip: "1.1.1.1" }), ENV);
    await worker.fetch(pedido("/v1/mensajes", { cuerpo: CUERPO, ip: "1.1.1.1" }), ENV);
    const cuarto = await worker.fetch(pedido("/v1/mensajes", { cuerpo: CUERPO, ip: "1.1.1.1" }), ENV);
    assert.equal(cuarto.status, 429);
    assert.equal(enviados.length, 3, "la cuarta no llega a Anthropic");
    // Límite diario con KV
    const kv = new Map();
    const LIMITES = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) };
    const env2 = { ...ENV, LIMITE_POR_DIA: "1", LIMITES };
    assert.equal((await worker.fetch(pedido("/v1/mensajes", { cuerpo: CUERPO }), env2)).status, 200);
    assert.equal((await worker.fetch(pedido("/v1/mensajes", { cuerpo: CUERPO }), env2)).status, 429);
    // Cuerpo inválido
    assert.equal((await worker.fetch(pedido("/v1/mensajes", { cuerpo: { model: "x" } }), ENV)).status, 400);
  } finally { globalThis.fetch = original; }
});

// ------------------------------------------------------------------ regresiones 2.1
test("A-25 · respuesta cortada por límite de tokens se marca como incompleta", async () => {
  await conFetch(async () => responder(200, { content: [{ type: "text", text: '{"resumen":"Hay fallos en el cil' }], stop_reason: "max_tokens" }), async () => {
    const { diagnostico } = await S.diagnosticar({ conexion: CONEXION, modelo: "claude-sonnet-5-5", contexto: "datos" });
    assert.equal(diagnostico.incompleta, true);
    assert.ok(S.verificarRespuestaIA(diagnostico, {}).some((x) => /cortada/.test(x)));
  });
});

test("A-35 · solo se aceptan fuentes http(s) (nunca javascript:)", async () => {
  const bloques = [{ type: "text", text: '{"resumen":"ok"}', citations: [{ url: "javascript:alert(1)", title: "malo" }, { url: "https://honda.com/x", title: "bueno" }] }];
  await conFetch(async () => responder(200, { content: bloques, stop_reason: "end_turn" }), async () => {
    const { diagnostico } = await S.diagnosticar({ conexion: CONEXION, modelo: "claude-sonnet-5-5", contexto: "datos" });
    assert.deepEqual(diagnostico.fuentes.map((f) => f.url), ["https://honda.com/x"]);
  });
});

test("A-28 · el servidor bloquea una dirección después de varios códigos equivocados", async () => {
  const ip = "203.0.113.77";
  for (let i = 0; i < 6; i++) assert.equal((await worker.fetch(pedido("/v1/probar", { codigo: "adivinando-" + i, ip }), ENV)).status, 401);
  const bloqueo = await worker.fetch(pedido("/v1/probar", { ip }), ENV);
  assert.equal(bloqueo.status, 429, "aun con el código correcto, la IP queda bloqueada un rato");
  assert.match((await bloqueo.json()).error.message, /Demasiados intentos/);
  assert.equal((await worker.fetch(pedido("/v1/probar", { ip: "203.0.113.78" }), ENV)).status, 200, "otras direcciones siguen funcionando");
});

test("A-36 · máximo 6 fotos por consulta", () => {
  const foto = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } };
  const con = (n) => ({ ...CUERPO, tools: undefined, messages: [{ role: "user", content: [{ type: "text", text: "x" }, ...Array(n).fill(foto)] }] });
  assert.doesNotThrow(() => validarCuerpo(con(6), {}));
  assert.throws(() => validarCuerpo(con(7), {}), /Demasiadas fotos/);
});
