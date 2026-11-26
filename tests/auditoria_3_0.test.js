// Regresiones de la auditoría independiente de ScanIA 3.0 (docs/AUDITORIA_INDEPENDIENTE_3_0.md).
// Cada prueba reproduce la sonda adversarial que encontró el problema.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("./cargar");

const FICHA = S.FICHAS_TECNICAS.find((f) => f.id === "honda_crv_2000_b20z");
const V = FICHA.variantes[0];
const doc = (id) => S.fusiblesDe(V).find((f) => f.id === id);

test("C-01 · mediciones imposibles o en la condición equivocada no se interpretan", () => {
  const inv = (m) => S.evaluarMedicion(m, null);
  for (const m of [
    { prueba: "voltaje_bornes", condicion: "reposo", valor: 45 },
    { prueba: "voltaje_bornes", condicion: "reposo", valor: 14.2 },
    { prueba: "voltaje_bornes", condicion: "ralenti", valor: 1.2 },
    { prueba: "resistencia_componente", valor: -50 },
    { prueba: "rele_bobina", valor: -1 },
    { prueba: "caida_tierra", circuito: "arranque", valor: -0.8 },
    { prueba: "caida_positivo", circuito: "arranque", valor: 14, bateria: 12.5 },
    { prueba: "consumo_parasito", valor: 25, unidad_consumo: "A" },
    { prueba: "fusible_voltaje", entrada: 12.4, salida: 30, bateria: 12.6 },
    { prueba: "fusible_continuidad", valor: "si", ohm: 50000 },
  ]) {
    const r = inv(m);
    assert.equal(r.veredicto, "invalida", `${JSON.stringify(m)} → ${r.veredicto}: ${r.texto}`);
    assert.equal(r.nivel, "no_verificable");
  }
  assert.match(inv({ prueba: "voltaje_bornes", condicion: "reposo", valor: 14.2 }).texto, /no es un voltaje de reposo/);
  // Mediciones válidas siguen funcionando
  assert.equal(inv({ prueba: "voltaje_bornes", condicion: "reposo", valor: 12.1 }).veredicto, "orientativo_alto");
  assert.equal(inv({ prueba: "consumo_parasito", valor: 0.05, unidad_consumo: "A" }).veredicto, "sin_referencia", "0.05 A = 50 mA: válido, sin especificación");
  assert.equal(S.evaluarMedicion({ prueba: "consumo_parasito", valor: 0.05, unidad_consumo: "A" }, { max: 30, fuente: "manual" }).veredicto, "fuera", "se convierte a mA antes de comparar");
  assert.equal(inv({ prueba: "resistencia_componente", valor: "OL" }).veredicto, "fuera", "OL = abierto");
  // Las mediciones inválidas no alimentan la evaluación de batería y carga
  const d = S.diagnosticoElectrico({ variante: V, mediciones: [{ prueba: "voltaje_bornes", condicion: "reposo", valor: 14.2 }] });
  assert.ok(d.no_determina.some((x) => x.id.startsWith("medicion_invalida") && x.nivel === "no_verificable"));
  assert.ok(!d.sabe.some((x) => /carga_hecho/.test(x.id)));
});

test("C-02 · un corto a tierra solo se confirma con TODAS las cargas del fusible desconectadas", () => {
  const p = S.evaluarMedicion({ prueba: "corto_tierra", componente: "INT-32", valor: "si", ohm: 1.8 });
  assert.equal(p.veredicto, "probable");
  assert.match(p.texto, /bombillo o un motor/);
  const d = S.diagnosticoElectrico({ variante: V, mediciones: [{ prueba: "corto_tierra", componente: "INT-32", valor: "si", ohm: 1.8 }] });
  assert.ok(!d.sabe.some((x) => /corto/.test(x.id)), "no va a 'lo que se sabe'");
  assert.ok(d.sospecha.some((x) => x.nivel === "probable"));
  assert.ok(d.no_determina.some((x) => /cargas comparte/.test(x.texto)));
  const c = S.evaluarMedicion({ prueba: "corto_tierra", valor: "si", cargas_desconectadas: true });
  assert.equal(c.veredicto, "fuera");
  assert.ok(S.pruebaCircuito("corto_tierra").aislar.some((x) => /TODAS las cargas/.test(x)));
});

test("C-03 · datos contradictorios del mismo fusible quedan como 'no verificable'", () => {
  const d = S.diagnosticoElectrico({ variante: V,
    inspeccion: { fusibles: { "INT-26": { estado: "bien", metodo: "continuidad" } } },
    mediciones: [{ prueba: "fusible_continuidad", componente: "INT-26", valor: "no" }] });
  assert.equal(d.contradicciones.length, 1);
  assert.ok(d.no_determina.some((x) => x.id === "contradiccion:INT-26" && x.nivel === "no_verificable"));
  assert.ok(!d.sabe.some((x) => x.id.includes("INT-26")), "no se concluye nada sobre INT-26");
  assert.ok(d.pruebas.some((x) => x.id === "repetir:INT-26"));
  // Voltaje "bien" + inspección "quemado" con multímetro: también contradicción
  const d2 = S.diagnosticoElectrico({ variante: V, inspeccion: { fusibles: { "INT-9": { estado: "quemado", metodo: "continuidad" } } },
    mediciones: [{ prueba: "fusible_voltaje", componente: "INT-9", entrada: 12.4, salida: 12.4, bateria: 12.6 }] });
  assert.ok(d2.contradicciones.some((c) => c.id === "INT-9"));
});

test("A-01 · voltaje en ambos lados del fusible no depende del orden", () => {
  assert.equal(S.evaluarVoltajeFusible({ entrada: 0, salida: 12.4, bateria: 12.6 }).resultado, "abierto");
  assert.equal(S.evaluarVoltajeFusible({ entrada: 12.4, salida: 0, bateria: 12.6 }).resultado, "abierto");
  assert.equal(S.evaluarVoltajeFusible({ entrada: "12.4", salida: "12.3", bateria: 12.6 }).resultado, "bien");
});

test("A-02 · la ficha refleja la etiqueta S10-A0/S10-E0 sin ocultar las diferencias", () => {
  const f1 = doc("INT-1");
  assert.equal(f1.amperaje, 20); assert.ok(f1.opcional); assert.equal(f1.verificacion, "etiqueta_foto");
  assert.match(f1.nota, /no usada/);
  const f20 = doc("INT-20");
  assert.equal(f20.verificacion, "conflicto"); assert.deepEqual(f20.amperajes_posibles, [7.5, 10]);
  const e = S.evaluarFusible(f20, { estado: "bien", metodo: "continuidad", amperaje_obs: 10 });
  assert.equal(e.estado, "desconocida");
  assert.ok(!e.acciones.some((a) => /Pon[eé] uno de 7\.5/.test(a)), "no recomienda cambiar un 10 A que coincide con la etiqueta");
  assert.match(doc("INT-24").nombre, /techo corredizo/);
  assert.match(doc("MOT-10").nombre, /techo corredizo/);
  assert.equal(doc("MOT-4").verificacion, "secundaria_coincidente");
  // Opcionales marcados según los paréntesis de la etiqueta
  for (const n of [1, 14, 16, 18, 20, 23, 27, 33]) assert.ok(doc(`INT-${n}`).opcional, `INT-${n} opcional`);
});

test("A-03 · no quedan afirmaciones sin fuente registrada en la ficha", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "fichas.js"), "utf8");
  assert.ok(!/falla conocida en esta generación/.test(src));
  assert.ok(!/un vendedor de cajas usadas/.test(src));
  assert.ok(!/lo vio ScanIA en la primera prueba real/.test(src));
  const pg = S.relesDe(V).find((r) => r.id === "R-PGMFI");
  assert.ok(pg.fuentes.includes("itstillruns_crv"), "la ubicación mencionada tiene su fuente");
  assert.match(pg.ubicacion, /No confirmada/);
  // Los relés interiores ya no aparecen DENTRO de la caja interior
  assert.equal(V.cajas.find((c) => c.id === "interior").reles.length, 0);
  // Toda fuente usada existe y toda afirmación general sin fuente lo dice
  assert.match(FICHA.transmision, /sin fuente registrada/);
  assert.match(FICHA.protocolo, /sin confirmar/);
  assert.throws(() => S.registrarFicha({ id: "t1", marca: "X", modelo: "Y", coincide: () => false, fuentes: [{ id: "a" }], variantes: [{ id: "v", mercado: "m", cajas: [], reles_sueltos: [{ id: "R", nombre: "x", fuentes: [], verificacion: "una_fuente" }] }] }), /fuente/);
  assert.throws(() => S.registrarFicha({ id: "t2", marca: "X", modelo: "Y", coincide: () => false, fuentes: [{ id: "a" }], variantes: [{ id: "v", mercado: "m", cajas: [{ id: "c", fusibles: [], disposicion: { filas: 1 } }] }] }), /disposición/);
});

test("A-04 · disposición física solo con fuente, y coherente con la etiqueta", () => {
  const int = V.cajas.find((c) => c.id === "interior"), mot = V.cajas.find((c) => c.id === "motor");
  assert.equal(int.disposicion.fuente, "foto_tapa_s10_a0");
  assert.match(int.disposicion.aviso, /no se sabe si es de tu carro/);
  // Filas de 11: 1–11, 12–22, 23–33; nada se superpone
  const ocupadas = new Set();
  for (const f of int.fusibles.filter((x) => x.fisica)) { const k = `${f.fisica.fila}-${f.fisica.col}`; assert.ok(!ocupadas.has(k), k); ocupadas.add(k); }
  assert.deepEqual(doc("INT-1").fisica, { fila: 3, col: 2 }); assert.deepEqual(doc("INT-11").fisica, { fila: 3, col: 12 });
  assert.deepEqual(doc("INT-12").fisica, { fila: 2, col: 2 }); assert.deepEqual(doc("INT-33").fisica, { fila: 1, col: 12 });
  assert.equal(doc("INT-34").fisica, null, "los repuestos no tienen posición asignada (la etiqueta no dice cuál es cuál)");
  assert.equal(mot.disposicion.fuente, "foto_tapa_s10_e0");
  assert.equal(mot.fusibles.filter((f) => f.fisica).length, 15);
});

test("A-05 · modelo de circuitos: exige fuente y nodos válidos; el CR-V no trae circuitos inventados", () => {
  assert.deepEqual(V.circuitos, []);
  const ok = { id: "c1", nombre: "Ventilador del radiador", fuente: "Manual de servicio, pág. 10-20 (anotado por vos)", tramos: [
    { desde: { tipo: "fusible", ref: "MOT-11" }, hasta: { tipo: "rele", ref: "MOT-R-VENT", terminal: "1" }, color: "BLU/RED" },
    { desde: { tipo: "rele", ref: "MOT-R-VENT", terminal: "2" }, hasta: { tipo: "componente", ref: "Motor del ventilador" }, color: "BLU" }] };
  assert.deepEqual(S.validarCircuito(ok), []);
  assert.ok(S.validarCircuito({ ...ok, fuente: "" }).some((e) => /fuente/.test(e)));
  assert.ok(S.validarCircuito({ ...ok, tramos: [{ desde: { tipo: "inventado", ref: "x" }, hasta: { tipo: "tierra", ref: "G1" } }] }).length);
  assert.match(S.textoCircuito(ok), /Fusible MOT-11 → \[BLU\/RED\] Relé MOT-R-VENT \(terminal 1\)/);
  assert.ok(S.buscarElectrico({ variante: V, consulta: "BLU/RED", circuitos: [ok] }).some((x) => x.tipo === "circuito"));
  const d = S.diagnosticoElectrico({ variante: V });
  assert.ok(d.no_determina.some((x) => x.id === "sin_circuitos"), "dice que no conoce el cableado");
});

test("A-06 · síntomas: relé principal, alimentación general, corto, olor a quemado, intermitencia y modificaciones", () => {
  const ids = (ctx) => S.diagnosticoElectrico({ variante: V, ...ctx }).sospecha.map((x) => x.id);
  assert.ok(ids({ sintomas: ["arranca_no_enciende"] }).includes("hip_rele_principal"));
  const rp = S.diagnosticoElectrico({ variante: V, sintomas: ["arranca_no_enciende", "se_apaga_marcha"] });
  assert.ok(rp.pruebas.some((x) => x.id === "hip_rele_principal_prueba" && /INT-13|MOT-13/.test(x.texto)), "nombra los fusibles de la bomba y la computadora");
  assert.ok(rp.no_determina.some((x) => /Terminales y prueba del Relé principal/.test(x.texto)));
  assert.ok(ids({ sintomas: ["varios_sistemas", "no_da_arranque"] }).includes("hip_alimentacion_general"));
  assert.ok(ids({ sintomas: ["fusible_se_quema"] }).includes("hip_corto"));
  const olor = S.diagnosticoElectrico({ variante: V, sintomas: ["olor_quemado"] }).sospecha.find((x) => x.id === "hip_sobrecalentamiento");
  assert.equal(olor.urgencia, "detener");
  assert.ok(ids({ sintomas: ["falla_intermitente"] }).includes("hip_falso_contacto"));
  assert.ok(ids({ inspeccion: { fusibles: { "INT-2": { estado: "bien", metodo: "visual" } } }, sintomas: ["bateria_se_descarga"] }).includes("hip_modificacion"));
  assert.ok(ids({ inspeccion: { fusibles: { "MOT-11": { estado: "bien", metodo: "visual", amperaje_obs: 30 } } } }).includes("hip_modificacion"));
  // Ninguna hipótesis de síntomas queda "confirmada"
  for (const s of ["arranca_no_enciende", "varios_sistemas", "fusible_se_quema", "olor_quemado", "falla_intermitente"]) {
    const d = S.diagnosticoElectrico({ variante: V, sintomas: [s] });
    assert.ok(!d.sabe.some((x) => x.id.startsWith("hip_")), s);
  }
  // Todos los síntomas eléctricos se usan en alguna regla
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "electrico.js"), "utf8");
  for (const s of S.SINTOMAS_ELECTRICOS) assert.ok(new RegExp(`has\\("${s.id}"\\)`).test(src), `síntoma sin usar: ${s.id}`);
});

test("A-07 · el amperaje leído en una foto queda como 'probable' y no genera recomendaciones", () => {
  const foto = S.interpretarFotoElectrica(JSON.stringify({ elementos: [{ posicion: "26", tipo: "fusible", amperaje_visto: 15, estado_visual: "sin_dano_visible", certeza: "probable" }] }));
  const s = S.sugerenciasDeFoto(foto, V, "interior")[0];
  assert.equal(s.cambios.amperaje_obs, undefined);
  assert.equal(s.cambios.amperaje_foto, 15);
  const e = S.evaluarFusible(doc("INT-26"), s.cambios);
  assert.ok(!e.acciones.some((a) => /Pon[eé] uno/.test(a)));
  assert.ok(e.mensajes.some((m) => /La foto sugiere 15 A/.test(m)));
  const d = S.diagnosticoElectrico({ variante: V, inspeccion: { fusibles: { "INT-26": s.cambios } } });
  assert.ok(d.sospecha.some((x) => x.id === "foto_amperaje:INT-26" && x.nivel === "probable"));
});

test("A-08 · escala única: cada conclusión lleva uno de los seis niveles", () => {
  const niveles = Object.keys(S.NIVELES_EVIDENCIA);
  assert.deepEqual(niveles, ["confirmado", "probable", "sospechoso", "no_verificable", "requiere_medicion", "requiere_documentacion"]);
  for (const id of Object.keys(S.CASOS_ELECTRICOS)) {
    const r = S.correrCasoElectrico(id);
    for (const k of ["sabe", "sospecha", "no_determina", "pruebas"]) for (const x of r[k]) assert.ok(niveles.includes(x.nivel), `${id}/${k}/${x.id}: nivel ${x.nivel}`);
    for (const x of r.sabe) assert.equal(x.nivel, "confirmado", `${id}: en 'lo que se sabe' solo va lo confirmado (${x.id})`);
  }
  for (const [insp, nivel] of [[{ estado: "quemado", metodo: "visual" }, "probable"], [{ estado: "quemado", metodo: "continuidad" }, "confirmado"], [{}, "requiere_medicion"]]) assert.equal(S.evaluarFusible(doc("INT-26"), insp).nivel, nivel);
  assert.equal(S.evaluarFusible(null, { estado: "bien" }).nivel, "requiere_documentacion");
  assert.equal(S.evaluarMedicion({ prueba: "resistencia_componente", valor: 10 }).nivel, "requiere_documentacion");
});

test("A-09 · no se condena el componente ni la computadora sin revisar el conector", () => {
  const spec = { min: 2000, max: 3000, fuente: "manual" };
  const r = S.diferenciarFalla("ect", { tierra: 0.05, resistencia: 90000, resistencia_spec: spec });
  assert.equal(r.certeza, "sospecha");
  assert.match(r.no_cambiar, /conector/);
  const ok = S.diferenciarFalla("ect", { tierra: 0.05, conector: "bien", resistencia: 90000, resistencia_spec: spec });
  assert.equal(ok.certeza, "confirmada");
  assert.doesNotMatch(ok.siguiente, /alimentación/, "un sensor de 2 cables no tiene alimentación propia que verificar (M-10)");
  const ecu = S.diferenciarFalla("ect", { tierra: 0.05, continuidad_senal: "si", resistencia: 2500, resistencia_spec: spec, senal_ok: false });
  assert.notEqual(ecu.id, "computadora", "sin conector ni corto revisados no se sospecha de la computadora");
});

test("A-10 · relés: se dice exactamente qué falta para diagnosticarlos con multímetro", () => {
  const ac = S.relesDe(V).find((r) => r.id === "MOT-R-AC");
  const falta = S.faltaParaRele(ac, null);
  assert.ok(falta.some((x) => /terminales/.test(x)) && falta.some((x) => /bobina/.test(x)) && falta.some((x) => /diodo/.test(x)));
  assert.ok(!falta.some((x) => /ubicación/.test(x)), "la ubicación sí está (por la foto)");
  const pg = S.relesDe(V).find((r) => r.id === "R-PGMFI");
  assert.ok(S.faltaParaRele(pg).some((x) => /ubicación/.test(x)));
  const dueno = { terminales: [{ numero: "1", funcion: "bobina+" }], bobina_spec: { min: 60, max: 90, fuente: "manual" }, alimentacion: "1: batería con llave en ON", control: "2: tierra desde la computadora", diodo: false };
  assert.deepEqual(S.faltaParaRele(ac, dueno), []);
  assert.match(S.pruebaCircuito("rele_bobina").siguiente_ok, /diodo/);
});

test("M-01..M-08 · instrucciones técnicas", () => {
  assert.equal(S.evaluarMedicion({ prueba: "tierra_componente", valor: 4.9, voltaje_circuito: 5 }).veredicto, "fuera", "tierra de sensor abierta (circuito de ~5 V)");
  assert.ok(S.pruebaCircuito("alimentacion_componente").aislar.some((x) => /CONECTADO/.test(x)));
  assert.ok(S.pruebaCircuito("alimentacion_componente").aislar.some((x) => /unos segundos/.test(x)));
  assert.ok(S.pruebaCircuito("consumo_parasito").aislar.some((x) => /código/.test(x)));
  assert.deepEqual(S.pruebaCircuito("consumo_parasito").unidades, ["mA", "A"]);
  assert.match(S.pruebaCircuito("continuidad_cable").referencia_texto, /Criterio general/);
  const av = S.compararDiagrama({ titulo: "Carga", mercado: "Europa", anio: "1997-1998", motor: "B20B" }, { anio: 2000, motor: "B20Z" }, V);
  assert.equal(av.length, 3, av.join(" | "));
  assert.equal(S.compararDiagrama({ mercado: "EE. UU.", anio: "1999-2001", motor: "B20Z" }, { anio: 2000, motor: "B20Z" }, V).length, 0);
  const b = S.buscarElectrico({ variante: V, consulta: "carga", carro: { anio: 2000, motor: "B20Z" }, diagramas: [{ id: "d", titulo: "Carga", tipo: "Carga", fuente: "x", mercado: "Europa", anio: "1998" }] });
  assert.ok(b.some((x) => x.tipo === "diagrama" && /⚠/.test(x.detalle)));
});

test("Informe: niveles, contradicciones, circuitos y estado de la variante", () => {
  const inf = S.informeElectrico({ carro: { marca: "Honda", modelo: "CR-V", anio: 2000 }, ficha: FICHA, variante: V,
    inspeccion: { fusibles: { "INT-26": { estado: "bien", metodo: "continuidad" } } }, mediciones: [{ prueba: "fusible_continuidad", componente: "INT-26", valor: "no" }] });
  assert.equal(inf.contradicciones.length, 1);
  assert.equal(inf.variante_confirmada, false);
  assert.ok(inf.limitaciones.some((x) => /SIN confirmar/.test(x)));
  assert.ok(inf.fuentes_tecnicas.some((x) => /S10-A0/.test(x.nombre)));
});
