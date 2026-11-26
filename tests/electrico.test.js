// Pruebas del módulo de diagnóstico eléctrico (ScanIA 3.0)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("./cargar");

const FICHA = S.FICHAS_TECNICAS.find((f) => f.id === "honda_crv_2000_b20z");
const V = FICHA.variantes[0];
const doc = (id) => S.fusiblesDe(V).find((f) => f.id === id);

test("ficha: cada dato tiene fuente y nivel de verificación; no se aceptan datos sin fuente", () => {
  for (const f of S.fusiblesDe(V)) {
    assert.ok(f.fuentes && f.fuentes.length, `${f.id} sin fuente`);
    assert.ok(S.VERIFICACION[f.verificacion], `${f.id} sin verificación`);
    for (const id of f.fuentes) assert.ok(FICHA.fuentes.some((x) => x.id === id), `${f.id}: fuente ${id} no declarada`);
  }
  for (const r of S.relesDe(V)) assert.ok(r.fuentes.length && S.VERIFICACION[r.verificacion], r.id);
  // Las posiciones donde las fuentes no coinciden quedan "en conflicto", no se elige una a escondidas
  assert.equal(doc("MOT-4").verificacion, "conflicto");
  assert.equal(doc("MOT-5").verificacion, "conflicto");
  // Ningún relé tiene posición inventada
  for (const r of S.relesDe(V)) assert.equal(r.posicion, null, `${r.id} no debería tener posición sin fuente`);
  // Sin diagramas ni valores de referencia inventados
  assert.equal(V.diagramas.length, 0);
  assert.equal(V.valores_referencia.length, 0);
  assert.throws(() => S.registrarFicha({ id: "x", marca: "X", modelo: "Y", coincide: () => false, fuentes: [{ id: "a" }], variantes: [{ id: "v", mercado: "m", cajas: [{ id: "c", fusibles: [{ id: "F1", amperaje: 10, verificacion: "una_fuente", fuentes: [] }] }] }] }), /fuente/);
  assert.throws(() => S.registrarFicha({ id: "x2", marca: "X", modelo: "Y", coincide: () => false, fuentes: [] }), /fuentes/);
  assert.equal(S.fichaDe({ marca: "Honda", modelo: "CR-V", anio: 2000 }).id, "honda_crv_2000_b20z");
  assert.equal(S.fichaDe({ marca: "Honda", modelo: "CR-V", anio: 2005 }), null, "no se aplica a otra generación");
  assert.equal(S.fichaDe({ marca: "Toyota", modelo: "Corolla", anio: 2000 }), null);
});

test("fusibles: visual = probable; con multímetro = confirmado", () => {
  assert.equal(S.evaluarFusible(doc("INT-26"), { estado: "quemado", metodo: "visual" }).estado, "quemado_probable");
  assert.equal(S.evaluarFusible(doc("INT-26"), { estado: "quemado", metodo: "foto_ia" }).estado, "quemado_probable");
  assert.equal(S.evaluarFusible(doc("INT-26"), { estado: "quemado", metodo: "continuidad" }).estado, "quemado");
  assert.equal(S.evaluarFusible(doc("INT-26"), { estado: "quemado", metodo: "voltaje" }).estado, "quemado");
  assert.equal(S.evaluarFusible(doc("INT-26"), {}).estado, "pendiente");
  assert.equal(S.evaluarFusible(doc("INT-19"), { estado: "ausente" }).estado, "ausente");
  assert.equal(S.evaluarFusible(doc("INT-1"), {}).estado, "libre");
  assert.equal(S.evaluarFusible(doc("INT-1"), { estado: "bien" }).estado, "desconocida", "fusible en una posición 'no usada'");
});

test("fusibles: NUNCA se recomienda un fusible de más amperaje", () => {
  const f = doc("MOT-11");   // 20 A documentado
  for (const obs of [5, 10, 15, 25, 30, 40, 60]) {
    for (const estado of ["bien", "quemado", undefined]) {
      const e = S.evaluarFusible(f, { estado, metodo: "continuidad", amperaje_obs: obs, veces_quemado: 3 });
      for (const a of e.acciones) {
        const m = a.match(/Pon[eé] uno de (\d+(?:\.\d+)?) A/);
        if (m) assert.equal(Number(m[1]), 20, `recomendó ${m[1]} A en vez de 20 A`);
        assert.ok(!/(pon[eé]|us[aá]|coloc[aá]|cambialo por) (uno|un fusible) (m[aá]s grande|de m[aá]s amperaje|mayor)/i.test(a), a);
      }
      if (obs > 20) assert.ok(e.mensajes.some((x) => /MÁS grande/.test(x)), "avisa el riesgo de un fusible más grande");
    }
  }
  // En el código fuente, toda mención de "más amperaje/más grande" en una recomendación va negada
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "electrico.js"), "utf8");
  for (const m of src.matchAll(/(m[aá]s amperaje|mayor amperaje)/g)) {
    const antes = src.slice(Math.max(0, m.index - 60), m.index).toLowerCase();
    assert.ok(/nunca|ni |no /.test(antes), `mención sin negar: …${antes}${m[0]}`);
  }
});

test("fusibles: con fuentes en conflicto o sin documentación no se juzga el amperaje", () => {
  const e = S.evaluarFusible(doc("MOT-4"), { estado: "bien", metodo: "visual", amperaje_obs: 30 });
  assert.equal(e.estado, "desconocida");
  assert.ok(e.mensajes.some((x) => x.includes(S.PENDIENTE_FUSIBLE)));
  const n = S.evaluarFusible(null, { estado: "bien", amperaje_obs: 15 });
  assert.equal(n.estado, "desconocida");
  assert.ok(n.mensajes[0].includes(S.PENDIENTE_FUSIBLE));
  // Confirmado con la tapa: el dato pasa a ser del dueño
  const c = S.evaluarFusible(doc("MOT-4"), { estado: "bien", metodo: "visual", amperaje_obs: 30, confirmado_tapa: true });
  assert.equal(c.verificacion, "dueno");
  assert.equal(c.estado, "amperaje");
});

test("fusibles: principal, falso contacto, se vuelve a quemar e intercambios", () => {
  const p = S.evaluarFusible(doc("MOT-1"), { estado: "quemado", metodo: "voltaje" });
  assert.ok(p.mensajes.some((x) => /PRINCIPAL/.test(x)));
  assert.equal(S.evaluarFusible(doc("INT-9"), { estado: "bien", metodo: "voltaje", falso_contacto: true }).estado, "contacto");
  const q = S.evaluarFusible(doc("INT-7"), { estado: "quemado", metodo: "continuidad", veces_quemado: 3 });
  assert.equal(q.se_quema, true);
  assert.ok(q.acciones.some((x) => /Corto a tierra/.test(x)));
  const inter = S.detectarIntercambios(V, { "INT-9": { amperaje_obs: 20 }, "INT-11": { amperaje_obs: 15 } });
  assert.equal(inter.length, 1);
  assert.match(inter[0].texto, /Posible intercambio/);
});

test("voltaje en ambos lados del fusible", () => {
  assert.equal(S.evaluarVoltajeFusible({ entrada: 12.4, salida: 12.4, bateria: 12.6 }).resultado, "bien");
  assert.equal(S.evaluarVoltajeFusible({ entrada: 12.4, salida: 0, bateria: 12.6 }).resultado, "abierto");
  assert.equal(S.evaluarVoltajeFusible({ entrada: 0, salida: 0, bateria: 12.6 }).resultado, "sin_alimentacion");
  assert.equal(S.evaluarVoltajeFusible({ entrada: 12.4, salida: 6, bateria: 12.6 }).resultado, "dudoso");
});

test("mediciones: sin especificación no hay veredicto inventado", () => {
  const r = S.evaluarMedicion({ prueba: "resistencia_componente", valor: 2500 }, null);
  assert.equal(r.veredicto, "sin_referencia");
  assert.ok(r.texto.includes(S.SIN_REFERENCIA));
  assert.equal(S.evaluarMedicion({ prueba: "resistencia_componente", valor: 2500 }, { min: 2000, max: 3000, fuente: "manual" }).veredicto, "dentro");
  assert.equal(S.evaluarMedicion({ prueba: "resistencia_componente", valor: 9000 }, { min: 2000, max: 3000, fuente: "manual" }).veredicto, "fuera");
  assert.equal(S.evaluarMedicion({ prueba: "consumo_parasito", valor: 300 }, null).veredicto, "sin_referencia");
  assert.equal(S.evaluarMedicion({ prueba: "rele_bobina", valor: 80 }, null).veredicto, "sin_referencia");
  // Criterios físicos (no dependen del fabricante)
  assert.equal(S.evaluarMedicion({ prueba: "alimentacion_componente", valor: 0.0 }, null).veredicto, "fuera");
  assert.equal(S.evaluarMedicion({ prueba: "alimentacion_componente", valor: 4.9 }, null).veredicto, "sin_referencia", "5 V no se da por bueno sin el manual");
  assert.equal(S.evaluarMedicion({ prueba: "fusible_continuidad", valor: "no" }).veredicto, "fuera");
  assert.equal(S.evaluarMedicion({ prueba: "corto_tierra", valor: "si" }).veredicto, "fuera");
  assert.equal(S.evaluarMedicion({ prueba: "corto_tierra", valor: "no" }).veredicto, "dentro");
  assert.equal(S.evaluarMedicion({ prueba: "rele_bobina", valor: 1e9 }, null).veredicto, "fuera");
  // Guía general: queda marcada como orientativa
  const g = S.evaluarMedicion({ prueba: "caida_tierra", circuito: "arranque", valor: 0.9 }, null);
  assert.equal(g.veredicto, "orientativo_alto");
  assert.match(g.texto, /no es del fabricante/);
  assert.equal(S.evaluarMedicion({ prueba: "caida_tierra", circuito: "otro", valor: 0.9 }, null).veredicto, "sin_referencia");
  // El valor del manual anotado por el dueño manda sobre la guía
  const carro = { especificaciones_electricas: [{ prueba: "caida_tierra", min: 0, max: 0.2, fuente: "Manual (anotado por vos)" }] };
  const spec = S.especificacionPara({ carro, prueba: "caida_tierra" });
  assert.equal(S.evaluarMedicion({ prueba: "caida_tierra", circuito: "arranque", valor: 0.25 }, spec).veredicto, "fuera");
});

test("seguridad: resistencia y continuidad siempre sin energía; SRS excluido", () => {
  for (const p of S.PRUEBAS_CIRCUITO) {
    if (p.entrada === "continuidad" || p.unidad === "Ω") {
      assert.equal(p.energizado, false, `${p.id} no puede ser energizada`);
      assert.ok(p.aislar.some((x) => /sac[aá]|desconect/i.test(x)), `${p.id} debe decir cómo aislar`);
    }
    if (p.energizado) assert.ok(["V", "mA"].includes(p.unidad) || ["voltaje_fusible", "conector"].includes(p.entrada), `${p.id} energizada pero no es voltaje/corriente`);
    for (const k of ["herramienta", "donde", "referencia_texto", "siguiente_ok", "siguiente_mal"]) assert.ok(p[k], `${p.id}.${k}`);
  }
  const seg = S.SEGURIDAD_ELECTRICA.join(" ");
  assert.match(seg, /SRS/); assert.match(seg, /Nunca midas resistencia/); assert.match(seg, /Nunca pongas un fusible de más amperaje/);
});

test("sensores: no se recomienda cambiar el componente antes de verificar alimentación, tierra y señal", () => {
  const sinAlim = S.diferenciarFalla("map", { alimentacion: 0 });
  assert.equal(sinAlim.id, "sin_alimentacion");
  assert.match(sinAlim.no_cambiar, /componente/i);
  const r1 = S.diferenciarFalla("ect", { resistencia: 90000, resistencia_spec: { min: 2000, max: 3000, fuente: "x" } });
  assert.equal(r1.id, "componente");
  assert.equal(r1.certeza, "sospecha", "sin tierra verificada no es confirmado");
  assert.match(r1.no_cambiar, /Todavía no/);
  const r2 = S.diferenciarFalla("ect", { tierra: 0.05, continuidad_senal: "si", resistencia: 90000, resistencia_spec: { min: 2000, max: 3000, fuente: "x" } });
  assert.equal(r2.certeza, "confirmada");
  assert.equal(S.diferenciarFalla("ect", { continuidad_senal: "no" }).id, "cable_abierto");
  assert.equal(S.diferenciarFalla("ect", { tierra: 12.3, bateria: 12.6 }).id, "tierra_abierta");
  assert.equal(S.diferenciarFalla("ect", { corto_tierra: "si", tierra: 0.05, continuidad_senal: "si" }).id, "corto");
  assert.equal(S.diferenciarFalla("ect", { conector: "mal" }).id, "conector");
  const p = S.diferenciarFalla("tps", {});
  assert.equal(p.id, "pendiente");
  assert.ok(p.pendiente.length >= 3);
  // La computadora es lo último
  const ecu = S.diferenciarFalla("ect", { tierra: 0.05, continuidad_senal: "si", corto_tierra: "no", resistencia: 2500, resistencia_spec: { min: 2000, max: 3000, fuente: "x" }, senal_ok: false });
  assert.equal(ecu.id, "computadora");
  assert.equal(ecu.certeza, "sospecha");
});

test("códigos: clasificación eléctrica y fusibles relacionados (relación posible, no confirmada)", () => {
  assert.equal(S.clasificarCodigoElectrico("P0118").falla, "alto");
  assert.equal(S.clasificarCodigoElectrico("P0117").falla, "bajo");
  assert.equal(S.clasificarCodigoElectrico("P0135").falla, "calentador");
  assert.equal(S.clasificarCodigoElectrico("P0300").electrico, false);
  assert.equal(S.clasificarCodigoElectrico("P0730").electrico, false);
  assert.equal(S.clasificarCodigoElectrico("P0116").electrico, false, "rango/desempeño no se trata como eléctrico");
  assert.ok(S.fusiblesParaCodigo(V, "P0500").some((f) => f.id === "INT-15"));
  assert.equal(S.fusiblesParaCodigo(V, "P0135").length, 0, "la tabla no dice qué fusible alimenta el calentador");
  const d = S.diagnosticoElectrico({ variante: V, obd: { codigos: [{ codigo: "P0135", tipo: "almacenado" }] } });
  assert.ok(d.no_determina.some((x) => x.id === "fusible_codigo:P0135"));
});

test("causa común: varios circuitos a la vez → hipótesis comunes; un solo código no dispara", () => {
  const dos = S.analizar([], { codigos: [{ codigo: "P0107", tipo: "almacenado" }, { codigo: "P0122", tipo: "almacenado" }] }, {});
  const h = dos.hallazgos.find((x) => x.id === "causa_comun_electrica");
  assert.ok(h);
  assert.ok(h.causas.some((c) => /5 V/.test(c.causa)));
  assert.notEqual(h.certeza, "confirmada");
  // Los códigos reales del CR-V de la primera prueba física no deben disparar la causa común
  const real = S.analizar([], { codigos: ["P0300", "P0301", "P0303", "P0304", "P0730", "P0135"].map((c) => ({ codigo: c, tipo: "almacenado" })) }, {});
  assert.ok(!real.hallazgos.some((x) => x.id === "causa_comun_electrica"));
  const uno = S.analizar([], { codigos: [{ codigo: "P0562", tipo: "almacenado" }] }, {});
  assert.ok(!uno.hallazgos.some((x) => x.id === "causa_comun_electrica"));
  // Pérdida de comunicación + un código de circuito sí
  const per = S.analizar([], { codigos: [{ codigo: "P0118", tipo: "almacenado" }] }, { conexion: { perdidas: 2 } });
  assert.ok(per.hallazgos.some((x) => x.id === "causa_comun_electrica"));
});

test("batería y carga: solo OBD nunca da conclusión; los hechos medidos sí", () => {
  const obd = S.evaluarSistemaCarga({ resumen: { voltaje_encendido: { n: 30, prom: 12.4 } } });
  const alt = obd.hipotesis.find((x) => x.id === "alternador");
  assert.equal(alt.certeza, "posibilidad");
  assert.match(alt.nota, /no se puede concluir/);
  assert.equal(obd.hechos.length, 0);
  for (const h of obd.hipotesis) assert.notEqual(h.certeza, "confirmada");
  const med = S.evaluarSistemaCarga({ mediciones: [{ prueba: "voltaje_bornes", condicion: "2000_cargas", valor: 12.3 }] });
  assert.ok(med.hechos.some((x) => x.id === "no_carga"));
  for (const h of med.hipotesis) assert.notEqual(h.certeza, "confirmada", "la pieza exacta no se confirma solo con voltajes");
});

test("12 casos simulados: qué sabe, qué sospecha, qué no puede determinar y qué prueba necesita", () => {
  const ids = Object.keys(S.CASOS_ELECTRICOS);
  assert.equal(ids.length, 12);
  for (const id of ids) {
    const r = S.correrCasoElectrico(id), e = S.CASOS_ELECTRICOS[id].espera;
    for (const k of ["sabe", "sospecha", "no_determina", "pruebas"]) for (const x of e[k]) assert.ok(r[k].some((y) => y.id === x), `${id}: falta ${k} ${x}`);
    assert.ok(r.sabe.length + r.sospecha.length > 0, `${id}: no identifica nada`);
    assert.ok(r.no_determina.length > 0, `${id}: debe decir qué no puede determinar`);
    assert.ok(r.pruebas.length > 0, `${id}: debe proponer una prueba`);
    assert.ok(r.no_determina.some((x) => x.id === "limite_obd"), `${id}: debe recordar el límite del ELM327`);
  }
});

test("fotos: la IA nunca confirma un fusible quemado solo con la foto", () => {
  const r = S.interpretarFotoElectrica(JSON.stringify({ que_se_ve: "caja", elementos: [
    { posicion: "26", tipo: "fusible", amperaje_visto: 20, estado_visual: "filamento_cortado_visible", certeza: "confirmada" },
    { posicion: "11", tipo: "fusible", amperaje_visto: 30, estado_visual: "sin_dano_visible", certeza: "probable" },
    { posicion: "9", tipo: "fusible", estado_visual: "no_se_ve", certeza: "inventada" }] }));
  assert.equal(r.elementos[0].certeza, "requiere_fisica");
  assert.equal(r.elementos[2].certeza, "insuficiente");
  const sug = S.sugerenciasDeFoto(r, V, "interior");
  const q = sug.find((s) => s.id === "INT-26");
  assert.equal(q.cambios.metodo, "foto_ia");
  assert.equal(S.evaluarFusible(doc("INT-26"), q.cambios).estado, "quemado_probable");
  assert.ok(!sug.some((s) => s.id === "INT-9"), "lo que no se ve no se anota");
  assert.ok(S.interpretarFotoElectrica("no es json").error);
  assert.match(S.PROMPT_FOTO_ELECTRICA, /Nunca digas que un fusible está quemado solo por la foto/);
  assert.match(S.PROMPT_FOTO_ELECTRICA, /Nunca recomiendes un fusible de mayor amperaje/);
  const ctx = S.contextoFotoElectrica({ ficha: FICHA, variante: V, caja: "interior", que: "Caja interior" });
  assert.match(ctx, /NO está confirmada con la tapa/);
});

test("búsqueda por componente, circuito, fusible o código", () => {
  const b = (q) => S.buscarElectrico({ variante: V, consulta: q, ficha: FICHA, diagramas: [{ id: "d1", titulo: "Circuito de carga", tipo: "Carga", fuente: "Manual", etiquetas: ["alternador"] }] });
  assert.ok(b("P0500").some((x) => x.id === "INT-15"));
  assert.ok(b("ventilador").some((x) => x.id === "MOT-11"));
  assert.ok(b("13").some((x) => x.id === "INT-13") && b("13").some((x) => x.id === "MOT-13"));
  assert.ok(b("alternador").some((x) => x.tipo === "diagrama"));
  assert.ok(b("pgm-fi").some((x) => x.id === "R-PGMFI"));
  assert.equal(b("").length, 0);
});

test("informe eléctrico: secciones pedidas y fuentes", () => {
  const inf = S.informeElectrico({ carro: { marca: "Honda", modelo: "CR-V", anio: 2000 }, ficha: FICHA, variante: V,
    inspeccion: { fusibles: { "INT-26": { estado: "quemado", metodo: "continuidad" }, "MOT-11": { estado: "bien", metodo: "visual", amperaje_obs: 30, confirmado_tapa: true } }, reles: { "MOT-R-AC": { resultado: "mejora" } } },
    mediciones: [{ prueba: "voltaje_bornes", condicion: "reposo", valor: 12.5 }], diagramas: [{ titulo: "Carga", tipo: "Carga", fuente: "Manual" }] });
  for (const k of ["estado_general", "fusibles_revisados", "fusibles_pendientes", "fusibles_incorrectos_confirmados", "reles_revisados", "mediciones", "componentes_afectados", "diagramas_consultados", "fallas_confirmadas", "sospechas", "pruebas_recomendadas", "fuentes_tecnicas"]) assert.ok(k in inf, k);
  assert.equal(inf.estado_general, "Hay fallas eléctricas confirmadas");
  assert.deepEqual(inf.fusibles_incorrectos_confirmados, ["MOT-11"]);
  assert.ok(inf.fuentes_tecnicas.length >= 5);
  assert.ok(inf.fusibles_pendientes.length > 30);
});

test("almacenamiento: inspección por carro, respaldo y restauración con ids nuevos", () => {
  const A = S.almacen;
  A.guardarElectrico(7, { fusibles: { "INT-9": { estado: "bien" } }, mediciones: [{ prueba: "voltaje_bornes", valor: 12.6, fecha: 1 }] });
  assert.equal(A.electrico(7).fusibles["INT-9"].estado, "bien");
  assert.deepEqual(A.electrico(99).fusibles, {}, "otro carro empieza vacío");
  const d = A.exportar(false);
  assert.ok(d.electrico && d.electrico["7"]);
  // Restaurar en "otro teléfono": el carro 7 del respaldo recibe otro id
  const otro = { app: "ScanIA", carros: [{ id: 7, marca: "Honda", modelo: "CR-V", creado: 123 }], electrico: { 7: { fusibles: { "INT-11": { estado: "quemado" } }, mediciones: [] } } };
  A.importar(otro);
  const nuevo = A.carros().find((c) => c.creado === 123);
  assert.ok(nuevo);
  assert.equal(A.electrico(nuevo.id).fusibles["INT-11"].estado, "quemado");
});

test("simulador: fallas eléctricas visibles por OBD", () => {
  const correr = (esc) => {
    let t = 1000; const sim = new S.Simulador(esc, { reloj: () => t, semilla: 3 }); sim._conectado = true; sim.inicio = t;
    const h = []; sim.motorApagado = true; for (let i = 0; i < 10; i++) { t += 1; h.push(sim.muestraSync()); }
    sim.motorApagado = false; for (let i = 0; i < 240; i++) { t += 1; h.push(sim.muestraSync()); }
    return S.analizar(h, sim.leerTodoSync(), {}).hallazgos.map((x) => x.id);
  };
  assert.ok(correr("bateria_baja").includes("bateria_baja"));
  assert.ok(correr("sensor_sin_alimentacion").includes("causa_comun_electrica"));
  assert.ok(correr("tierra_deficiente").includes("causa_comun_electrica"));
  assert.ok(correr("cortocircuito").includes("ect_imposible"));
  assert.ok(correr("cable_interrumpido").includes("ect_imposible"));
  assert.ok(correr("conector_defectuoso").includes("ect_intermitente"));
  for (const id of ["bateria_baja", "tierra_deficiente", "sensor_sin_alimentacion", "cortocircuito", "cable_interrumpido", "conector_defectuoso"]) assert.equal(S.ESCENARIOS[id].grupo, "electrico");
});
