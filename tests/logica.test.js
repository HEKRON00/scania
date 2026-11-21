/* Pruebas unitarias: códigos, decodificadores, unidades, VIN, informes, pruebas guiadas y almacenamiento.
 *   node --test tests/ */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("./cargar");

test("base de códigos: descripciones en español, sin inventar", () => {
  assert.ok(Object.keys(S.CODIGOS).length >= 400, "más de 400 códigos");
  assert.match(S.describir("P0171").descripcion, /pobre/i);
  assert.match(S.describir("P0304").descripcion, /cilindro 4/i);
  assert.match(S.describir("P0263").descripcion, /cilindro 1.*balance/i);   // SAE: P0261-P0263 = cilindro 1
  assert.match(S.describir("P0264").descripcion, /cilindro 2/i);
  assert.equal(S.describir("P0300").gravedad, "alta");
  const fab = S.describir("P1456");
  assert.ok(fab.de_fabricante && !fab.conocido && /fabricante/.test(fab.descripcion), "un código de fabricante no se inventa");
  assert.ok(!S.describir("P0999").conocido || S.CODIGOS.P0999, "códigos desconocidos se marcan como tales");
  assert.equal(S.describir("X1234").descripcion, "Código con formato no reconocido");
  for (const [c, [d, g]] of Object.entries(S.CODIGOS)) {
    assert.ok(S.esCodigoValido(c), c);
    assert.ok(d && d.length > 5, c);
    assert.ok(["alta", "media", "baja", "info"].includes(g), `${c}: ${g}`);
  }
  assert.ok(S.describir("P0301").nota, "misfire avisa de luz parpadeando");
});

test("decodificación de bytes de códigos y estado", () => {
  assert.equal(S.bytesACodigo(0x01, 0x71), "P0171");
  assert.equal(S.bytesACodigo(0xc1, 0x00), "U0100");
  assert.equal(S.bytesACodigo(0x41, 0x23), "C0123");
  assert.equal(S.bytesACodigo(0x80, 0x01), "B0001");
  assert.equal(S.bytesACodigo(0, 0), null);
  const e = S.decodificarEstado(0x81, 0x07, 0x65, 0x04);
  assert.equal(e.mil, true);
  assert.equal(e.num_dtc, 1);
  assert.equal(e.monitores.find((m) => m.nombre === "EVAPORATIVE_SYSTEM_MONITORING").completo, false);
  assert.equal(S.decodificarEstado(0, 0x08, 0, 0).encendido, "compresión (diésel)");
});

test("PIDs: fórmulas SAE y metadatos", () => {
  const P = Object.fromEntries([...S.PIDS, ...S.entradasO2("13")].map((p) => [p.clave, p]));
  assert.equal(P.rpm.f(0x1a, 0xf8), 1726);
  assert.equal(P.temp_motor.f(0x7b), 83);
  assert.equal(Math.round(P.ltft1.f(0x95) * 100) / 100, 16.41);
  assert.equal(P.maf.f(0x01, 0x90), 4);
  assert.equal(Math.round(P.o2_b1s1.f(0x5a) * 1000) / 1000, 0.45);
  assert.ok(Number.isNaN(P.o2_b1s1_trim.f(0x5a, 0xff)), "B = FF: el sensor no se usa para el ajuste (no es 0%)");
  assert.equal(P.o2_b1s1_trim.f(0x5a, 0x80), 0);
  assert.equal(P.voltaje.f(0x37, 0x80), 14.208);
  assert.equal(Math.round(P.lambda_b1s1.f(0x80, 0x00, 0x80, 0x00) * 1000) / 1000, 1, "λ = 1 con 0x8000");
  assert.equal(P.af_ma_b1s1.f(0x80, 0, 0x80, 0x00), 0, "corriente 0 mA con 0x8000");
  assert.equal(Math.round(P.af_v_b1s1.f(0x80, 0, 0x40, 0x00) * 1000) / 1000, 2, "voltaje A/F: 8/65536·(256C+D)");
  assert.equal(P.egr_error.f(0x80), 0);
  assert.equal(P.evap_presion.f(0xff, 0xfc), -1, "presión EVAP con signo");
  for (const p of [...S.PIDS, ...S.entradasO2("13"), ...S.entradasO2("1D")]) {
    assert.ok(p.nombre && typeof p.f === "function", p.clave);
    assert.ok(S.META[p.clave], `metadatos de ${p.clave}`);
    assert.equal(S.LARGO_PID[p.pid], p.n, `largo de ${p.clave}`);
  }
  assert.ok(S.lazoCerrado(2) && !S.lazoCerrado(1) && !S.lazoCerrado(4));
  assert.match(S.textoSistemaComb(2), /cerrado/i);
});

test("parseo de respuestas sin encabezados (ELM327 por defecto)", () => {
  const m = S.mensajesELM(["014", "0: 49 02 01 31 48 47", "1: 43 4D 38 32 36 33 33", "2: 41 30 30 34 33 35 32"]);
  assert.equal(m.length, 1);
  assert.equal(S.vinDeMensajes(m), "1HGCM82633A004352");
  const viejo = S.mensajesELM(["49 02 01 00 00 00 31", "49 02 02 48 47 43 4D", "49 02 03 38 32 36 33", "49 02 04 33 41 30 30", "49 02 05 34 33 35 32"]);
  assert.equal(S.vinDeMensajes(viejo), "1HGCM82633A004352", "VIN en protocolos viejos");
  const cods = (lineas, can) => S.codigosDeMensajes(S.mensajesELM(lineas), 0x43, can).map((c) => c.codigo);
  assert.deepEqual(cods(["43 02 01 71 03 02"], true), ["P0171", "P0302"]);
  assert.deepEqual(cods(["43 01 71 03 02 00 00", "43 04 20 00 00 00 00"], false), ["P0171", "P0302", "P0420"]);
  assert.deepEqual(S.mensajesELM(["NO DATA"]), []);
  assert.deepEqual(S.mensajesELM(["CAN ERROR"]), []);
});

test("parseo con encabezados CAN (11 y 29 bits) e ISO-TP", () => {
  const m = S.mensajesCAN(["7E8 06 41 00 BE 3F A8 13", "7E9 06 41 00 98 18 00 01"], 3);
  assert.deepEqual(m.map((x) => x.ecu), ["7E8", "7E9"]);
  assert.equal(S.nombreECU("7E8"), "Motor");
  assert.equal(S.nombreECU("7E9"), "Transmisión");
  const vin = S.mensajesCAN(["7E8 10 14 49 02 01 31 48 47", "7E8 21 43 4D 38 32 36 33 33", "7E8 22 41 30 30 34 33 35 32"], 3);
  assert.equal(S.vinDeMensajes(vin), "1HGCM82633A004352");
  const cortado = S.mensajesCAN(["7E8 10 14 49 02 01 31 48 47", "7E8 21 43 4D 38 32 36 33 33"], 3);
  assert.equal(cortado[0].incompleto, true, "una trama perdida se marca como incompleta");
  assert.equal(S.mensajesCAN(["18DAF110 03 43 01 71"], 8)[0].ecu, "18DAF110");
  const c = S.codigosDeMensajes(S.mensajesCAN(["7E8 06 43 02 01 71 03 02", "7E9 04 43 01 07 00"], 3), 0x43, true);
  assert.deepEqual(c, [{ codigo: "P0171", ecu: "7E8" }, { codigo: "P0302", ecu: "7E8" }, { codigo: "P0700", ecu: "7E9" }]);
});

test("respuestas de varios PIDs a la vez", () => {
  assert.deepEqual(S.separarMultiPID([0x41, 0x0c, 0x1a, 0xf8, 0x05, 0x7b, 0x0d, 0x20]), { 5: [0x7b], 12: [0x1a, 0xf8], 13: [0x20] });
  // Respuesta cortada: no se inventan bytes
  const r = S.separarMultiPID([0x41, 0x0c, 0x1a, 0xf8, 0x10, 0x01]);
  assert.deepEqual(Object.keys(r), ["12"]);
});

test("unión de códigos almacenados, pendientes y permanentes", () => {
  const u = S.unirCodigos([{ codigo: "P0171", ecu: "7E8" }], ["P0171", { codigo: "P0700", ecu: "7E9" }], ["P0420"]);
  const p171 = u.find((c) => c.codigo === "P0171");
  assert.equal(p171.tipo, "almacenado");
  assert.deepEqual(p171.tambien, ["pendiente"]);
  assert.deepEqual(u.find((c) => c.codigo === "P0700").modulos, ["Transmisión"]);
  assert.equal(u.find((c) => c.codigo === "P0420").tipo, "permanente");
});

test("modo 06: escalas estándar, misfire y pruebas del fabricante", () => {
  assert.deepEqual(S.escalarUAS(0x24, 41), { valor: 41, unidad: "fallos", crudo: 41 });
  const p = S.pruebasDeMensaje06([0x46, 0xa3, 0x0c, 0x24, 0, 41, 0, 0, 0xff, 0xff, 0x21, 0x80, 0x01, 0x01, 0x00, 0, 0, 0x00, 0xc8]);
  assert.equal(p.length, 2);
  assert.equal(p[0].nombre, "Misfire cilindro 2");
  assert.equal(p[0].valor, 41);
  assert.equal(p[1].estandar, false, "TID 80+ es del fabricante");
  assert.equal(p[1].ok, false, "256 > 200: fuera de límite");
  const r = S.resumirPruebas06(p);
  assert.deepEqual(r.misfire, [{ cilindro: 2, promedio: null, actual: 41 }]);
  assert.equal(r.fallidas.length, 1);
  assert.match(S.nombreMID(0x21), /Catalizador/);
  assert.match(S.nombreMID(0x01), /oxígeno/);
});

test("unidades configurables", () => {
  const F = { temperatura: "F", distancia: "mi", presion: "psi", consumo: "galh" };
  assert.deepEqual(S.convertir(100, "°C", F), { valor: 212, unidad: "°F" });
  assert.equal(Math.round(S.convertir(100, "km/h", F).valor), 62);
  assert.equal(Math.round(S.convertir(100, "kPa", F).valor * 10) / 10, 14.5);
  assert.deepEqual(S.convertir(5, "%", F), { valor: 5, unidad: "%" });
  assert.equal(S.convertirTexto("Temperatura 85–100 °C a 50 km/h", F), "Temperatura 185–212 °F a 31.1 mph");
  assert.equal(S.convertirTexto("faltan 1,500 km", F), "faltan 932 mi");
  assert.equal(S.convertirTexto("90 °C", S.UNIDADES_POR_DEFECTO), "90 °C");
});

test("VIN: validación, dígito verificador y decodificación local", () => {
  assert.ok(S.vinValido("1HGCM82633A004352"));
  assert.ok(!S.vinValido("1HGCM82633A00435O"), "sin O");
  const v = S.verificarVIN("1HGCM82633A004352");
  assert.ok(v.valido && v.digito_ok && v.norteamerica);
  const malo = S.verificarVIN("1HGCM82643A004352");
  assert.ok(malo.valido && !malo.digito_ok && /alterado|mal copiado/.test(malo.nota));
  const jp = S.verificarVIN("JTDBR32E720012345");
  assert.ok(!jp.norteamerica, "Japón no siempre usa el dígito verificador");
  const d = S.decodificarVINLocal("JTDBR32E720012345");
  assert.match(d.fabricante, /Toyota/);
  assert.equal(d.anio, "2002");
});

test("fabricantes: detección y capacidades honestas", () => {
  assert.equal(S.detectarFabricante({ vin: "JTDBR32E720012345" }), "toyota");
  assert.equal(S.detectarFabricante({ marca: "Acura" }), "honda");
  assert.equal(S.detectarFabricante({ marca: "Kia" }), "kia");
  const cap = S.capacidades("toyota");
  assert.equal(cap.find((m) => m.id === "motor").estado, "disponible");
  for (const id of ["abs", "srs", "eps", "bcm"]) {
    const m = cap.find((x) => x.id === id);
    assert.equal(m.estado, "no_disponible", `${id} no se promete`);
    assert.ok(m.requiere.length > 20, `${id} explica qué se necesita`);
  }
  assert.throws(() => S.registrarExtension({ marca: "toyota", modulo: "abs", nombre: "x" }), /inválida/);
  const leer = async () => null;
  assert.throws(() => S.registrarExtension({ marca: "toyota", modulo: "abs", id: "a", nombre: "x", leer, validado: true }), /fuente/);
  assert.throws(() => S.registrarExtension({ marca: "toyota", modulo: "abs", id: "b", nombre: "x", leer, actuador: true }), /solo pueden leer/);
  S.registrarExtension({ marca: "toyota", modulo: "abs", id: "c", nombre: "Sin validar", leer });
  assert.equal(S.extensiones("toyota").length, 0, "lo no validado no se muestra");
  S.registrarExtension({ marca: "toyota", modulo: "abs", id: "d", nombre: "Códigos ABS", leer, validado: true, fuente: "manual de servicio" });
  assert.equal(S.capacidades("toyota").find((m) => m.id === "abs").estado, "disponible");
});

test("comparación de escaneos y revisión de carro usado", () => {
  const a = { fecha: 0, km: 100000, lectura: { codigos: [{ codigo: "P0171" }, { codigo: "P0420" }], estado: { monitores: [{ nombre_es: "Catalizador", completo: true }] } },
    pruebas06: { misfire: [{ cilindro: 2, actual: 3, promedio: 1 }] }, resumen: { trim_ralenti: 14 }, hallazgos: [{ titulo: "Fuga", certeza: "confirmada" }] };
  const b = { fecha: 86400 * 10, km: 100800, lectura: { codigos: [{ codigo: "P0420" }, { codigo: "P0302" }], estado: { monitores: [{ nombre_es: "Catalizador", completo: false }] } },
    pruebas06: { misfire: [{ cilindro: 2, actual: 30, promedio: 12 }] }, resumen: { trim_ralenti: 3 }, hallazgos: [] };
  const x = S.compararEscaneos(a, b);
  assert.deepEqual([x.nuevos, x.resueltos, x.siguen], [["P0302"], ["P0171"], ["P0420"]]);
  assert.equal(x.dias, 10);
  assert.equal(x.km, 800);
  assert.deepEqual(x.monitores, [{ monitor: "Catalizador", antes: true, ahora: false }]);
  assert.deepEqual(x.misfire, [{ cilindro: 2, antes: 3, ahora: 30 }]);
  assert.deepEqual(x.hallazgos_resueltos, ["Fuga"]);

  // Señales de códigos borrados hace poco: monitores pendientes y contadores en cero
  const lectura = { codigos: [{ codigo: "P0420", tipo: "permanente" }], estado: { mil: false, monitores: [{ nombre_es: "Catalizador", completo: false }, { nombre_es: "EVAP", completo: false }] },
    extras: { km_desde_borrado: 12, calentamientos_desde_borrado: 2, odometro_ecu_km: 150000 } };
  const r = S.revisionUsado({ lectura, info: { vin: "1HGCM82633A004352" }, declarado: { vin: "1HGCM82633A004353", km: 90000 } });
  assert.equal(r.veredicto, "mal");
  const temas = Object.fromEntries(r.puntos.map((p) => [p.tema, p]));
  assert.ok(Object.values(temas).some((p) => /borr/i.test(p.texto) && p.estado !== "ok"), "señala borrado reciente");
  assert.ok(r.puntos.some((p) => /VIN/.test(p.tema) && p.estado === "mal"), "VIN no coincide");
  assert.equal(temas.Kilometraje.estado, "mal");
  assert.match(r.limites, /mecánico/);
  assert.ok(!r.puntos.some((p) => /seguro|garantiz/i.test(p.texto) && /borr/.test(p.texto)), "no promete detectar el borrado con certeza");
});

test("pruebas guiadas: las 8 partes, sin pruebas manejando y evaluación coherente", () => {
  const ctx = { cilindrada: 1.8, medicion: "MAF", fuente: { usaATRV: true } };
  for (const p of S.PRUEBAS_GUIADAS) {
    for (const k of ["titulo", "descripcion", "preparacion", "herramientas", "condiciones", "referencia", "interpretacion", "dificultad", "riesgo"]) assert.ok(p[k], `${p.id}.${k}`);
    assert.ok(p.siguiente.ok && p.siguiente.regular && p.siguiente.mal, `${p.id}: próxima prueba`);
    assert.ok(p.pasos.length >= 1 && S.GRUPOS_PRUEBAS[p.grupo], p.id);
    if (p.riesgo !== "bajo") assert.ok(p.advertencia, `${p.id}: advertencia de riesgo`);
    const texto = JSON.stringify(p.pasos.map((x) => x.texto)) + p.preparacion + p.condiciones;
    assert.ok(!/\b(en marcha|2da|3ra|manej(á|a) (a fondo|y)|mientras manej)/i.test(texto), `${p.id}: ninguna prueba se hace manejando`);
    assert.ok(["error", "no_concluyente"].includes(p.evaluar({}, ctx).veredicto), `${p.id}: sin datos no inventa un resultado`);
  }
  const P = Object.fromEntries(S.PRUEBAS_GUIADAS.map((p) => [p.id, p]));
  assert.equal(P.bateria.evaluar({ reposo: [12.6, 12.6, 12.61] }, ctx).veredicto, "ok");
  assert.equal(P.bateria.evaluar({ reposo: [12.1, 12.1] }, ctx).veredicto, "mal");
  assert.equal(P.bateria.evaluar({ reposo: [14.1, 14.1] }, ctx).veredicto, "no_concluyente", "motor encendido: no es reposo");
  // 5 lecturas por segundo durante 10 s: 1 s antes, ~1.6 s de arranque, después cargando
  const arr = (min) => [...Array(5).fill(12.5), min, min + 0.1, min + 0.2, min + 0.3, min + 0.3, min + 0.4, min + 0.5, min + 0.7, 12.0, 13.5, ...Array(35).fill(14.1)];
  assert.equal(P.arranque.evaluar({ antes: [12.6, 12.6], arranque: arr(10.2) }, ctx).veredicto, "ok");
  assert.equal(P.arranque.evaluar({ antes: [12.1, 12.1], arranque: arr(8.9) }, ctx).veredicto, "mal");
  const m = (v) => ({ voltaje: v, rpm: 800 });
  assert.equal(P.alternador.evaluar({ sin_carga: [m(14.1)], con_carga: [m(13.6)], carga_rpm: [m(13.9)] }).veredicto, "ok");
  assert.equal(P.alternador.evaluar({ sin_carga: [m(12.6)], con_carga: [m(12.1)], carga_rpm: [m(12.3)] }).veredicto, "mal");
  assert.equal(P.alternador.evaluar({ sin_carga: [m(15.4)], con_carga: [m(15.2)], carga_rpm: [m(15.3)] }).veredicto, "mal", "sobrecarga");
  assert.equal(P.caida_voltaje.evaluar({ positivo: 0.3, tierra: 0.1 }).veredicto, "ok");
  assert.equal(P.caida_voltaje.evaluar({ positivo: 1.2, tierra: 0.1 }).veredicto, "mal");
  const t = (s, l) => ({ stft1: s, ltft1: l, sistema_comb: 2 });
  assert.match(P.mezcla.evaluar({ ralenti: [t(10, 8)], alto: [t(0, 2)] }, { medicion: "MAF" }).resumen, /aire falsa/);
  assert.match(P.mezcla.evaluar({ ralenti: [t(10, 8)], alto: [t(0, 2)] }, { medicion: "MAP" }).resumen, /escape/, "motor con MAP: primero escape y sensor MAP");
  assert.match(P.mezcla.evaluar({ ralenti: [t(1, 2)], alto: [t(10, 6)] }, ctx).resumen, /combustible/i);
  assert.equal(P.mezcla.evaluar({ ralenti: [t(1, 2)], alto: [t(0, 2)] }, ctx).veredicto, "ok");
  // O2: sano y rápido = ok; con pocas lecturas por segundo = no concluyente (A-10)
  const o2 = (n, amp, hz) => Array.from({ length: Math.round(10 * hz) }, (_, i) => ({ t: i / hz, v: 0.45 + amp * Math.sin((i / hz) * 2 * Math.PI * n / 10) }));
  assert.equal(P.o2.evaluar({ o2: o2(6, 0.4, 8) }).veredicto, "ok");
  assert.equal(P.o2.evaluar({ o2: o2(0.5, 0.05, 8) }).veredicto, "mal");
  assert.equal(P.o2.evaluar({ o2: o2(6, 0.4, 2) }).veredicto, "no_concluyente", "2 lecturas/s no alcanzan para contar cambios");
  const ve = S.eficienciaVolumetrica({ maf: 56, rpm: 4000, temp_admision: 34, map: 95 }, 1.8);
  assert.ok(ve > 80 && ve < 90, `VE ${ve}`);
  assert.match(P.maf_map.requiere({ pidsDisponibles: () => ["map", "rpm", "temp_admision"] }, { cilindrada: 2 }), /MAF/, "motor sin MAF: no aplica");
  const ral = (rpm, map) => Array.from({ length: 30 }, (_, i) => ({ rpm: rpm + (i % 2 ? 10 : -10), map }));
  assert.equal(P.ralenti.evaluar({ ralenti: ral(780, 32) }, { baro: 90 }).veredicto, "ok");
  assert.equal(P.ralenti.evaluar({ ralenti: ral(780, 52) }, { baro: 90 }).veredicto, "mal", "poco vacío");
  // Termostato por la forma de la curva (A-24)
  const curva = (f) => Array.from({ length: 41 }, (_, i) => ({ t: i * 30, temp_motor: f(i * 30) }));
  assert.equal(P.calentamiento.evaluar({ temp: curva((s) => 30 + s * 0.08) }).veredicto, "ok");
  assert.equal(P.calentamiento.evaluar({ temp: curva((s) => Math.min(66, 30 + s * 0.08)) }).veredicto, "mal", "meseta baja");
  assert.equal(P.calentamiento.evaluar({ temp: curva((s) => 30 + s * 0.035).slice(0, 25) }).veredicto, "no_concluyente", "sube lento: no se condena");
  const marca = { muestras: Array.from({ length: 40 }, (_, i) => ({ t: i * 10, temp_motor: i < 20 ? 90 + i * 0.5 : 100 - (i - 20) * 0.3 })), marcas: [195] };
  assert.equal(P.refrigeracion.evaluar({ vent: marca }).veredicto, "ok");
  assert.equal(P.sensores.evaluar({ koeo: [{ rpm: 0, temp_motor: 27, temp_admision: 26, map: 90, baro: 90 }] }, {}).veredicto, "ok");
  assert.equal(P.sensores.evaluar({ koeo: [{ rpm: 0, temp_motor: 27, temp_admision: 45, map: 90, baro: 90 }] }, {}).veredicto, "mal");
  assert.equal(P.compresion.evaluar({ c1: 180, c2: 175, c3: 178, c4: 120 }).veredicto, "mal");
  assert.equal(P.presion_combustible.evaluar({ medida: 40 }).veredicto, "no_concluyente", "sin el valor del manual no se inventa uno");
  assert.equal(P.presion_combustible.evaluar({ medida: 40, espec: 42 }).veredicto, "ok");
});

test("almacenamiento local: carros, mantenimiento, escaneos, respaldo", () => {
  const A = S.almacen;
  const id = A.guardarCarro({ marca: "Honda", modelo: "Civic", anio: "2010", km: 150000, vin: "1HGCM82633A004352" });
  A.elegirCarro(id);
  assert.equal(A.carroActivo().modelo, "Civic");
  assert.equal(A.carroPorVIN("1hgcm82633a004352").id, id);
  A.registrarMantenimiento(id, { tipo: "Cambio de aceite y filtro", km: 152000, fecha: Date.now() / 1000 - 86400 * 200 });
  assert.equal(A.carro(id).km, 152000, "el km sube con el mantenimiento");
  const est = S.estadoMantenimiento(A.carro(id));
  assert.equal(est.find((m) => m.tipo === "Cambio de aceite y filtro").estado, "vencido", "6 meses vencidos");
  const e = A.guardarEscaneo({ carroId: id, lectura: { codigos: [{ codigo: "P0171" }] } });
  A.actualizarEscaneo(e, { revision_usado: { veredicto: "ok" } });
  assert.equal(A.escaneo(e).revision_usado.veredicto, "ok");
  A.guardarPrueba({ carroId: id, prueba: "bateria", veredicto: "ok" });
  const d = A.guardarDiagnostico({ carroId: id, diagnostico: { resumen: "r" } });
  A.guardarAjustes({ ...A.ajustes(), codigo: "secreto-familiar", clave: "sk-ant-vieja" });
  assert.equal(A.ajustes().clave, undefined, "una clave vieja se borra al leer los ajustes");

  const resp = A.exportar(false);
  assert.equal(resp.ajustes.codigo, undefined, "el respaldo no lleva el código salvo que se pida");
  assert.ok(!JSON.stringify(resp).includes("sk-ant"));
  assert.equal(A.exportar(true).ajustes.codigo, "secreto-familiar");

  // Restaurar en un "teléfono" con otro carro: los ids se reasignan y las referencias siguen apuntando bien
  A.borrarCarro(id); A.borrarEscaneo(e); A.borrarDiagnostico(d);
  for (const p of A.pruebas()) A.borrarPrueba(p.id);
  const otro = A.guardarCarro({ marca: "Kia" });
  const r = A.importar({ ...resp, ajustes: { ...resp.ajustes, clave: "sk-ant-x" } });
  assert.deepEqual([r.carros, r.escaneos, r.diagnosticos, r.pruebas], [1, 1, 1, 1]);
  const civic = A.carros().find((c) => c.modelo === "Civic");
  assert.notEqual(civic.id, otro);
  assert.equal(A.escaneos(civic.id).length, 1, "el escaneo quedó con el carro correcto");
  assert.equal(A.pruebas(civic.id).length, 1);
  assert.equal(A.ajustes().clave, undefined, "nunca se importa una clave");
  assert.throws(() => A.importar({ app: "otra" }), /respaldo/);
});
