/* Pruebas del motor de diagnóstico local: cada falla simulada se detecta con su evidencia y nivel de certeza,
 * sin falsos positivos en el carro sano, y sin porcentajes inventados.
 *   node --test tests/ */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("./cargar");

function correr(esc, semilla, segundos = 200) {
  let t = 1000;
  const sim = new S.Simulador(esc, { reloj: () => t, semilla });
  sim._conectado = true; sim.inicio = t;
  const h = [];
  for (let i = 0; i < segundos; i++) { t += 1; h.push(sim.muestraSync()); }
  return { sim, h, r: S.analizar(h, sim.leerTodoSync(), { pruebas06: sim.pruebas06Sync(), cilindrada: 1.8 }) };
}

// Hallazgo principal esperado para cada falla (y con qué certeza mínima)
const ESPERADO = {
  normal: ["todo_bien"], fuga_vacio: ["fuga_vacio_b1", "confirmada"], misfire_cil2: ["misfire_cilindro", "confirmada"], termostato: ["termostato", "confirmada"],
  catalizador: ["catalizador", "confirmada"], alternador: ["alternador", "sospecha"], sensor_o2: ["o2_lento", "confirmada"],
  sobrecalentamiento: ["sobrecalentamiento", "confirmada"], mezcla_rica: ["rica_b1", "confirmada"], maf_sucio: ["maf_bajo", "confirmada"],
  bomba_debil: ["pobre_carga_b1", "confirmada"], datos_contradictorios: ["ect_imposible", "confirmada"],
};
const ORDEN = { confirmada: 3, sospecha: 2, posibilidad: 1 };

test("cada falla del carro simulado se detecta (3 semillas)", () => {
  const vehiculo = Object.keys(S.ESCENARIOS).filter((e) => S.ESCENARIOS[e].grupo === "vehiculo");
  assert.deepEqual(vehiculo.sort(), Object.keys(ESPERADO).sort(), "hay una expectativa por escenario");
  for (const [esc, [id, certeza]] of Object.entries(ESPERADO)) {
    for (const semilla of [1, 2, 3]) {
      const { r } = correr(esc, semilla);
      const h = r.hallazgos.find((x) => x.id === id);
      assert.ok(h, `${esc}/${semilla}: esperaba ${id}, salió ${r.hallazgos.map((x) => x.id)}`);
      if (certeza) assert.ok(ORDEN[h.certeza] >= ORDEN[certeza], `${esc}: certeza ${h.certeza} < ${certeza}`);
    }
  }
});

test("carro sano: ningún problema inventado", () => {
  for (const semilla of [1, 2, 3, 4, 5]) {
    const { r } = correr("normal", semilla);
    const problemas = r.hallazgos.filter((x) => ["alta", "media", "baja"].includes(x.gravedad));
    assert.deepEqual(problemas.map((x) => x.id), [], `semilla ${semilla}`);
  }
});

test("MAF sucio, bomba débil y fuga de vacío se distinguen", () => {
  const primero = (esc) => correr(esc, 2).r.hallazgos.find((h) => /pobre|fuga|maf/.test(h.id));
  assert.match(primero("fuga_vacio").id, /fuga_vacio/);
  const maf = correr("maf_sucio", 2).r.hallazgos;
  assert.ok(maf.some((h) => h.id === "maf_bajo"), "MAF: la eficiencia volumétrica baja lo delata");
  assert.match(maf.find((h) => h.id === "pobre_carga_b1").causas[0].causa, /MAF/);
  const bomba = correr("bomba_debil", 2).r.hallazgos;
  assert.ok(!bomba.some((h) => h.id === "maf_bajo"), "con la bomba débil el MAF mide bien");
  assert.match(bomba.find((h) => h.id === "pobre_carga_b1").causas[0].causa, /bomba|combustible|filtro/i);
});

test("cada hallazgo trae evidencia, causas ordenadas, prueba, resultado esperado y dónde hacerla", () => {
  for (const esc of Object.keys(ESPERADO).filter((e) => e !== "normal")) {
    const { r } = correr(esc, 1);
    for (const h of r.hallazgos.filter((x) => ["alta", "media", "baja"].includes(x.gravedad))) {
      assert.ok(h.certeza && S.CERTEZAS[h.certeza], `${esc}/${h.id}: certeza`);
      assert.ok((h.evidencia || []).length >= 1, `${esc}/${h.id}: evidencia`);
      assert.ok((h.causas || []).length >= 1, `${esc}/${h.id}: causas`);
      assert.ok(h.prueba && h.esperado, `${esc}/${h.id}: prueba y resultado esperado`);
      assert.ok(["casa", "mecánico", "ambos"].includes(h.donde), `${esc}/${h.id}: dónde (${h.donde})`);
      const texto = JSON.stringify(h);
      assert.ok(!/\b\d{1,3}\s?% de probabilidad|probabilidad de \d/.test(texto), `${esc}/${h.id}: sin porcentajes inventados`);
    }
    // Ordenados: primero lo más grave
    const g = { alta: 0, media: 1, baja: 2, info: 3, ok: 4 };
    const orden = r.hallazgos.map((h) => g[h.gravedad]);
    assert.deepEqual(orden, [...orden].sort((a, b) => a - b), `${esc}: orden por gravedad`);
  }
});

test("certeza: una sola evidencia no es 'confirmada'", () => {
  // Solo el código P0171 sin datos en vivo
  const r = S.analizar([], { codigos: S.unirCodigos(["P0171"]), estado: { mil: true } }, {});
  assert.ok(!r.hallazgos.some((h) => h.certeza === "confirmada"), r.hallazgos.map((h) => `${h.id}:${h.certeza}`).join(","));
  assert.ok(r.hallazgos.some((h) => h.id === "pocos_datos" || /datos/.test(h.titulo)), "reconoce que faltan datos");
});

test("datos contradictorios: se avisa en vez de diagnosticar con un sensor malo", () => {
  const { r } = correr("datos_contradictorios", 1);
  assert.ok(!r.hallazgos.some((h) => h.id === "termostato"), "no culpa al termostato por un sensor que marca -40");
  assert.ok(r.hallazgos.some((h) => h.id === "ect_imposible"));
});

test("resumen y series para la IA", () => {
  const { h, r } = correr("fuga_vacio", 1, 120);
  const txt = S.resumenTexto(r.resumen);
  assert.match(txt, /Muestras: 120/);
  assert.match(txt, /stft1|Ajuste/);
  const series = S.seriesTexto(h);
  assert.ok(series.split("\n").length > 10 && series.split("\n").length <= 62, "series muestreadas");
  assert.equal(S.resumenTexto(null), "Sin datos en vivo.");
});
