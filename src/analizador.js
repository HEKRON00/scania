/* ScanIA · motor de diagnóstico local (funciona sin internet y sin IA)
 *
 * Cada hallazgo trae:
 *   id, gravedad (alta|media|baja|info|ok) = urgencia
 *   certeza: "confirmada" (varias fuentes independientes coinciden), "sospecha" (un patrón claro o un código),
 *            "posibilidad" (indicio débil o cerca del límite)
 *   titulo, detalle, evidencia [textos con los datos observados]
 *   causas [{causa, por_que}] ordenadas, alternativas [textos]
 *   prueba (cómo confirmarlo), esperado (qué resultado confirma o descarta), no_cambiar, donde (casa | mecánico | ambos)
 * No se inventan porcentajes: la certeza sale de cuántas evidencias independientes coinciden.
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  const MIN = 8;            // mínimo de muestras para opinar
  const CALIENTE = 60;      // °C (solo si el carro no reporta el PID 03)
  const ORDEN = { alta: 0, media: 1, baja: 2, ok: 3, info: 4 };
  S.CERTEZAS = { confirmada: "Confirmada", sospecha: "Sospecha", posibilidad: "Posibilidad" };

  function stats(valores) {
    const v = valores.filter((x) => x != null && !Number.isNaN(x));
    if (!v.length) return null;
    const o = [...v].sort((a, b) => a - b), n = o.length;
    const prom = v.reduce((a, b) => a + b, 0) / n;
    const desv = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - prom) ** 2, 0) / n) : 0;
    const p = (q) => o[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
    return { n, actual: v[n - 1], min: o[0], max: o[n - 1], prom, desv, p5: p(0.05), p95: p(0.95) };
  }

  const encendido = (m) => (m.rpm || 0) > 400;
  // "caliente" = la computadora ya está controlando la mezcla. Si el carro reporta el PID 03 se usa ese dato.
  const caliente = (m) => (m.sistema_comb != null ? S.lazoCerrado(m.sistema_comb) : (m.temp_motor || 0) >= CALIENTE);
  const enRalenti = (m) => encendido(m) && caliente(m) && (m.velocidad || 0) < 3 && (m.rpm || 0) < 1500 && (m.carga || 0) < 35;
  const enRpmAltas = (m) => encendido(m) && caliente(m) && (m.rpm || 0) >= 1800 && (m.rpm || 0) <= 3500 && (m.carga || 0) >= 20;
  const trimTotal = (m, b) => (m["stft" + b] == null || m["ltft" + b] == null ? null : m["stft" + b] + m["ltft" + b]);

  /** Eficiencia volumétrica con la densidad del aire en el múltiple (sirve en cualquier condición). */
  S.vePorMAP = function (m, disp) {
    if (!disp || !m.maf || !m.rpm || m.map == null || m.temp_admision == null || m.rpm < 500) return null;
    const densidad = (m.map * 1000) / (287.05 * (m.temp_admision + 273.15));
    const teorico = disp * (m.rpm / 120) * densidad;
    return teorico > 0 ? (m.maf / teorico) * 100 : null;
  };

  function segmento(muestras, disp) {
    const d = {};
    for (const c of ["rpm", "stft1", "ltft1", "stft2", "ltft2", "map", "maf", "o2_b1s1", "o2_b1s2", "lambda_b1s1", "voltaje", "carga"]) {
      const s = stats(muestras.map((m) => m[c])); if (s) d[c] = s;
    }
    for (const b of [1, 2]) { const s = stats(muestras.map((m) => trimTotal(m, b))); if (s) d["trim_total" + b] = s; }
    if (disp) { const s = stats(muestras.map((m) => S.vePorMAP(m, disp))); if (s) d.ve = s; }
    return d;
  }

  S.resumir = function (h, opciones = {}) {
    const disp = Number(opciones.cilindrada) || null;
    if (!h || !h.length) return { muestras: 0, duracion_s: 0, general: {}, caliente: {}, ralenti: {}, rpm_altas: {}, temp_reciente: null, motor_encendido: false };
    const claves = new Set(); h.forEach((m) => Object.keys(m).forEach((k) => k !== "t" && claves.add(k)));
    const general = {};
    for (const c of claves) { const s = stats(h.map((m) => m[c])); if (s) general[c] = s; }
    const ultimo = h[h.length - 1].t;
    return {
      muestras: h.length,
      duracion_s: Math.round((ultimo - h[0].t) * 10) / 10,
      motor_encendido: encendido(h[h.length - 1]),
      temp_reciente: stats(h.filter((m) => m.t >= ultimo - 120).map((m) => m.temp_motor)),
      cilindrada: disp,
      general,
      caliente: segmento(h.filter((m) => encendido(m) && caliente(m)), disp),
      ralenti: segmento(h.filter(enRalenti), disp),
      rpm_altas: segmento(h.filter(enRpmAltas), disp),
    };
  };

  /** Crea un hallazgo. extra = {certeza, causas, alternativas, prueba, esperado, no_cambiar, donde} */
  const H = (id, gravedad, titulo, detalle, evidencia = [], extra = {}) => ({
    id, gravedad, titulo, detalle, evidencia,
    certeza: extra.certeza || (gravedad === "info" || gravedad === "ok" ? null : "sospecha"),
    causas: (extra.causas || []).map((c) => (typeof c === "string" ? { causa: c, por_que: "" } : c)),
    alternativas: extra.alternativas || [], prueba: extra.prueba || "", esperado: extra.esperado || "",
    no_cambiar: extra.no_cambiar || "", donde: extra.donde || "",
  });
  const f = (v, d = 1) => (v == null ? "?" : (v >= 0 ? "+" : "") + v.toFixed(d));
  const r0 = (v) => Math.round(v);
  /** Certeza según evidencias independientes: 2 o más = confirmada; 1 clara = sospecha; débil = posibilidad. */
  const certeza = (independientes, debil = false) => (independientes >= 2 ? "confirmada" : debil ? "posibilidad" : "sospecha");

  // ------------------------------------------------------------------ mezcla y MAF
  function reglaMezcla(r, cod, out) {
    for (const b of [1, 2]) {
      const k = "trim_total" + b, ral = r.ralenti[k], alt = r.rpm_altas[k], cal = r.caliente[k];
      if (!cal || cal.n < MIN) continue;
      const banco = "banco " + b;
      const pobres = b === 1 ? ["P0171", "P2187", "P2177"] : ["P0174", "P2189", "P2179"];
      const ricos = b === 1 ? ["P0172", "P2188", "P2178"] : ["P0175", "P2190", "P2180"];
      const ap = pobres.filter((c) => cod.has(c)), ar = ricos.filter((c) => cod.has(c));
      const seg = ral && alt && ral.n >= MIN && alt.n >= MIN;
      const ev = [];
      if (ral) ev.push(`Ajuste total en ralentí: ${f(ral.prom)}%`);
      if (alt) ev.push(`Ajuste total a 1,800–3,500 rpm: ${f(alt.prom)}%`);
      ev.push(`Ajuste total promedio (motor caliente): ${f(cal.prom)}%`);
      if (ap.length) ev.push(`Código ${ap.join(", ")}`);
      if (ar.length) ev.push(`Código ${ar.join(", ")}`);
      const veAlt = r.rpm_altas.ve;
      if (veAlt) ev.push(`Eficiencia volumétrica a más RPM: ${r0(veAlt.prom)}%`);

      if (seg && ral.prom > 10 && alt.prom < ral.prom - 8) {
        out.push(H("fuga_vacio_b" + b, "media", `Mezcla pobre en ralentí que mejora al acelerar: patrón de fuga de vacío (${banco})`,
          `La computadora agrega ${f(ral.prom, 0)}% de gasolina en ralentí, pero solo ${f(alt.prom, 0)}% a más RPM. Una entrada de aire fija pesa mucho cuando ` +
          "entra poco aire (ralentí) y casi nada cuando entra mucho: por eso la mezcla mejora al acelerar.", ev, {
            certeza: certeza(1 + (ap.length ? 1 : 0), ral.prom < 13),
            causas: [{ causa: "Manguera de vacío rajada o suelta", por_que: "Es lo más común y lo más barato" }, { causa: "Válvula PCV o su manguera", por_que: "Mete aire directo al múltiple" },
              { causa: "Empaque del múltiple de admisión o del cuerpo de aceleración", por_que: "Se endurece con el calor" }, { causa: "Booster (servofreno) con fuga", por_que: "Usa vacío del motor" }],
            alternativas: ["Sensor MAF sucio (si también estuviera pobre a más RPM)", "Fuga de escape antes del sensor de oxígeno (mete aire y engaña la lectura)"],
            prueba: "Motor en ralentí: rociá agua jabonosa o pasá humo de incienso por las mangueras de vacío, la unión del cuerpo de aceleración, el múltiple y la manguera del booster. Escuchá si hay silbidos.",
            esperado: "Si las RPM cambian o el humo se mete en un punto, ahí está la fuga. Al repararla, el ajuste total en ralentí debe bajar a menos de ±10% después de unos minutos.",
            no_cambiar: "El sensor de oxígeno ni el MAF: solo están reportando la mezcla pobre.", donde: "casa" }));
      } else if (seg && alt.prom > 10 && alt.prom > ral.prom + 5) {
        const mafSosp = veAlt && veAlt.n >= MIN && veAlt.prom < 58;
        const causas = mafSosp
          ? [{ causa: "Sensor MAF sucio o dañado", por_que: `La eficiencia calculada con el MAF es baja (${r0(veAlt.prom)}%): el MAF mide menos aire del que entra` },
             { causa: "Falta de combustible (bomba, filtro, regulador)", por_que: "Da el mismo patrón de mezcla" }]
          : [{ causa: "Bomba de gasolina débil o filtro de gasolina tapado", por_que: veAlt ? `El MAF mide un flujo coherente (eficiencia ${r0(veAlt.prom)}%), así que falta gasolina, no sobra aire` : "La mezcla empeora cuando se pide más gasolina" },
             { causa: "Regulador de presión de combustible", por_que: "Baja la presión con carga" }, { causa: "Inyectores sucios", por_que: "Entregan menos de lo que la computadora pide" },
             { causa: "Sensor MAF sucio", por_que: veAlt ? "Menos probable: su lectura parece coherente" : "Sin la cilindrada no se puede comprobar el MAF" }];
        out.push(H("pobre_carga_b" + b, "media", `Mezcla pobre cuando el motor tiene carga (${banco})`,
          "La mezcla está bien en ralentí pero se empobrece cuando el motor pide más. O falta gasolina, o el MAF está midiendo menos aire del real.", ev, {
            certeza: certeza(1 + (ap.length ? 1 : 0) + (mafSosp ? 1 : 0), alt.prom < 13), causas,
            alternativas: ["Fuga de escape antes del sensor de oxígeno", "Gasolina de mala calidad o con agua"],
            prueba: mafSosp ? "Limpiá el sensor MAF con limpiador especial para MAF (no lo toqués con nada). Volvé a medir la mezcla a 2,500 rpm."
              : "Que un mecánico mida la presión de combustible con manómetro en ralentí y acelerando (y el caudal de la bomba). Revisá cuándo se cambió el filtro de gasolina.",
            esperado: mafSosp ? "Si después de limpiarlo el ajuste a más RPM baja a menos de ±10%, era el MAF. Si no cambia, medí la presión de combustible."
              : "Presión dentro de lo que pide el fabricante y que no caiga al acelerar. Si cae, es bomba, filtro o regulador.",
            no_cambiar: "La bomba de gasolina sin medir la presión primero, ni el MAF sin limpiarlo antes.", donde: mafSosp ? "casa" : "mecánico" }));
      } else if (cal.prom > 10) {
        out.push(H("pobre_b" + b, "media", `Mezcla pobre (${banco})`,
          "La computadora está agregando bastante gasolina extra en todas las condiciones.", ev, {
            certeza: certeza(1 + (ap.length ? 1 : 0), cal.prom < 13),
            causas: ["Sensor MAF sucio", "Fuga de vacío grande", "Presión de combustible baja", "Fuga de escape antes del sensor de oxígeno"],
            alternativas: ["Sensor de oxígeno sesgado (marcando pobre sin estarlo)"],
            prueba: "Primero buscá fugas de vacío con humo o agua jabonosa (gratis). Después limpiá el MAF. Si sigue igual, medí la presión de combustible.",
            esperado: "La reparación correcta devuelve el ajuste total a menos de ±10%.", no_cambiar: "El sensor de oxígeno.", donde: "casa" }));
      } else if (cal.prom < -10) {
        out.push(H("rica_b" + b, "media", `Mezcla rica: sobra gasolina (${banco})`,
          `La computadora está quitando ${f(-cal.prom, 0)}% de gasolina porque le sobra.`, ev, {
            certeza: certeza(1 + (ar.length ? 1 : 0), cal.prom > -13),
            causas: ["Inyector goteando o pegado", "Presión de combustible demasiado alta (regulador)", "Válvula de purga EVAP pegada abierta",
              "Sensor de temperatura del motor marcando frío", "Filtro de aire muy tapado"],
            alternativas: ["Aceite contaminado con gasolina (olé la varilla del aceite)", "Sensor de oxígeno sesgado (marcando rico sin estarlo)"],
            prueba: "Revisá el filtro de aire y olé la varilla del aceite. Con el motor apagado, quitá la manguera de la válvula de purga EVAP del lado del múltiple y tapá la toma: si al encender cambia la mezcla, la válvula estaba pegada. La presión y los inyectores los revisa un mecánico.",
            esperado: "Si la mezcla vuelve a menos de ±10% al corregir algo, esa era la causa. Gasolina en el aceite confirma un inyector goteando.",
            no_cambiar: "El sensor de oxígeno ni el catalizador.", donde: "ambos" }));
      }
    }
    const t1 = r.caliente.trim_total1, t2 = r.caliente.trim_total2;
    if (t1 && t2 && t1.n >= MIN && Math.abs(t1.prom - t2.prom) > 10) {
      out.push(H("diferencia_bancos", "media", "Un lado del motor trabaja diferente al otro",
        "Los ajustes de combustible de los dos bancos son muy diferentes. Eso descarta causas que afectan a todo el motor (bomba, MAF).",
        [`Banco 1: ${f(t1.prom)}%`, `Banco 2: ${f(t2.prom)}%`], {
          causas: ["Fuga de vacío en ese lado del múltiple", "Inyectores de ese banco", "Fuga de escape de ese lado", "Sensor de oxígeno de ese banco"],
          prueba: "Buscá fugas del lado con el ajuste más alto; intercambiá inyectores entre bancos si es posible.",
          esperado: "Si el problema cambia de banco con la pieza, esa pieza es la mala.", no_cambiar: "La bomba de gasolina ni el MAF.", donde: "mecánico" }));
    }
  }

  function reglaMAF(r, cod, out) {
    const a = r.ralenti.ve, b = r.rpm_altas.ve;
    if (!a || !b || a.n < MIN || b.n < MIN) return;
    const apoyo = ["P0100", "P0101", "P0102", "P0103"].filter((c) => cod.has(c));
    const ev = [`Eficiencia calculada en ralentí: ${r0(a.prom)}%`, `A más RPM: ${r0(b.prom)}%`, `Cilindrada usada: ${r.cilindrada} L`, ...apoyo.map((c) => `Código ${c}`)];
    if (a.prom < 60 && b.prom < 58 && !out.some((h) => h.id.startsWith("fuga_vacio"))) {
      out.push(H("maf_bajo", "media", "El sensor MAF parece medir menos aire del real",
        "Con la presión del múltiple, la temperatura y las RPM se puede calcular cuánto aire debería entrar. El MAF reporta bastante menos en todas las condiciones.", ev, {
          certeza: certeza(1 + (apoyo.length ? 1 : 0) + (out.some((h) => h.id.startsWith("pobre")) ? 1 : 0), true),
          causas: ["Sensor MAF sucio (aceite del filtro, polvo)", "Sensor MAF dañado", "Fuga de aire entre el MAF y el cuerpo de aceleración"],
          alternativas: ["Cilindrada mal configurada en Mis carros", "Sensor MAP o de temperatura de admisión dando datos falsos"],
          prueba: "Revisá que la cilindrada del carro esté bien. Limpiá el MAF con limpiador especial y revisá la manguera entre el MAF y la mariposa.",
          esperado: "Después de limpiarlo, la eficiencia debe subir a 65–90% y la mezcla volver a ±10%.", no_cambiar: "El MAF sin limpiarlo primero (muchas veces revive).", donde: "casa" }));
    } else if (a.prom > 120 && b.prom > 120) {
      out.push(H("maf_alto", "baja", "El sensor MAF parece medir más aire del normal",
        "La eficiencia calculada sale por encima de lo posible en un motor sin turbo.", ev, {
          certeza: "posibilidad", causas: ["Cilindrada mal configurada", "Motor turbo/supercargado (normal)", "Sensor MAF descalibrado"],
          prueba: "Confirmá la cilindrada y si el motor es turbo.", esperado: "Con la cilindrada correcta, un motor sin turbo da 65–95%.", donde: "casa" }));
    }
  }

  // ------------------------------------------------------------------ temperatura
  function reglaTemperatura(r, cod, out) {
    const t = r.general.temp_motor;
    if (!t || t.max <= -30) return;            // dato imposible: lo revisa la regla de datos contradictorios
    if (t.max >= 108) {
      out.push(H("sobrecalentamiento", "alta", `Motor SOBRECALENTADO (${r0(t.max)} °C)`,
        "Apagá el motor lo antes posible. NO abras el tapón del radiador en caliente. Manejar así puede torcer la culata.",
        [`Temperatura máxima: ${r0(t.max)} °C (normal: 85–100 °C)`, `Temperatura actual: ${r0(t.actual)} °C`, ...(cod.has("P0217") ? ["Código P0217"] : [])], {
          certeza: cod.has("P0217") ? "confirmada" : "sospecha",
          causas: ["Falta de refrigerante (fuga)", "Electroventilador que no enciende", "Termostato pegado cerrado", "Bomba de agua", "Radiador tapado", "Empaque de culata"],
          alternativas: ["Sensor de temperatura marcando de más (comparalo con el reloj del tablero)"],
          prueba: "Con el motor FRÍO revisá el nivel del depósito y del radiador. Encendé el motor y fijate si el electroventilador arranca al llegar a ~95–100 °C. Buscá fugas debajo del carro.",
          esperado: "Si falta refrigerante, hay una fuga que encontrar. Si el ventilador no arranca, revisá fusible, relé y motor del ventilador.",
          no_cambiar: "El empaque de culata sin una prueba de compresión o de gases en el refrigerante.", donde: "mecánico" }));
      return;
    }
    if (t.max >= 104) {
      out.push(H("temperatura_alta", "media", `Temperatura del motor alta (${r0(t.max)} °C)`,
        "Está por encima de lo normal, todavía sin llegar a sobrecalentamiento.", [`Temperatura máxima: ${r0(t.max)} °C`], {
          certeza: "posibilidad", causas: ["Nivel de refrigerante bajo", "Electroventilador débil", "Radiador sucio por fuera o tapado"],
          prueba: "Revisá el nivel con el motor frío y que el electroventilador encienda.", esperado: "Con el sistema en orden, la temperatura se estabiliza en 85–100 °C.", donde: "casa" }));
    }
    const tm = r.general.tiempo_motor;
    const minutos = tm ? tm.actual / 60 : r.motor_encendido ? r.duracion_s / 60 : 0;
    const rec = r.temp_reciente || t;
    if (minutos >= 10 && rec.max < 76 && rec.max > -30 && r.motor_encendido && rec.n >= MIN) {
      out.push(H("termostato", "baja", "El motor no llega a su temperatura normal",
        `El motor lleva unos ${r0(minutos)} minutos encendido y no pasa de ${r0(rec.max)} °C. Lo normal es 85–100 °C. Un motor frío gasta más gasolina y se desgasta más.`,
        [`Temperatura máxima (últimos 2 min): ${r0(rec.max)} °C`, `Minutos con motor encendido: ${r0(minutos)}`, ...(cod.has("P0128") ? ["Código P0128"] : [])], {
          certeza: cod.has("P0128") ? "confirmada" : "sospecha",
          causas: ["Termostato pegado abierto", "Le quitaron el termostato", "Sensor de temperatura marcando bajo"],
          alternativas: ["Electroventilador encendido todo el tiempo (relé pegado)"],
          prueba: "Hacé la prueba guiada 'Termostato' con el motor frío. Con el motor tibio, tocá con cuidado la manguera de arriba del radiador: no debería calentarse hasta que el motor llegue a temperatura.",
          esperado: "Si la manguera se calienta desde el principio, el termostato está abierto.", no_cambiar: "El sensor de temperatura antes de probar el termostato.", donde: "ambos" }));
    }
  }

  function reglaTemperaturasExtra(r, out) {
    const ac = r.general.temp_aceite, cat = r.general.temp_cat;
    if (ac && ac.max >= 130) out.push(H("aceite_caliente", "alta", `Aceite del motor demasiado caliente (${r0(ac.max)} °C)`,
      "Por encima de 130 °C el aceite pierde protección.", [`Máxima: ${r0(ac.max)} °C`], {
        causas: ["Nivel de aceite bajo", "Sistema de enfriamiento fallando", "Motor exigido con mucha carga"], prueba: "Revisá el nivel y el estado del aceite con el motor frío.",
        esperado: "Con aceite correcto y enfriamiento bien, debe quedar en 90–115 °C.", donde: "casa" }));
    else if (ac && ac.max >= 120) out.push(H("aceite_tibio", "media", `Aceite del motor caliente (${r0(ac.max)} °C)`,
      "Está más caliente de lo normal (90–115 °C).", [`Máxima: ${r0(ac.max)} °C`], {
        certeza: "posibilidad", causas: ["Nivel de aceite bajo", "Temperatura del motor alta"], prueba: "Revisá el nivel de aceite.", esperado: "Debe estabilizarse por debajo de 115 °C.", donde: "casa" }));
    if (cat && cat.max >= 900) out.push(H("catalizador_caliente", "alta", `Catalizador sobrecalentado (${r0(cat.max)} °C)`,
      "La gasolina sin quemar se está quemando dentro del catalizador y lo puede derretir.", [`Máxima: ${r0(cat.max)} °C`], {
        causas: ["Fallos de encendido (misfire)", "Mezcla muy rica"], prueba: "Revisá los contadores de misfire (prueba guiada) y la mezcla.",
        esperado: "Al corregir el misfire o la mezcla, la temperatura baja.", no_cambiar: "El catalizador antes de corregir la causa (se volvería a dañar).", donde: "mecánico" }));
  }

  // ------------------------------------------------------------------ eléctrico
  function reglaVoltaje(r, out) {
    const v = r.caliente.voltaje || r.general.voltaje;
    if (!v) return;
    if (r.motor_encendido) {
      const g = v.prom < 12.4 ? "alta" : v.prom < 13.0 ? "media" : null;
      if (g) {
        out.push(H("alternador", g, `El alternador no está cargando bien (${v.prom.toFixed(1)} V)`,
          "Con el motor encendido el voltaje debería estar entre 13.5 y 14.7 V. Con este voltaje la batería se descarga y el carro se puede apagar.",
          [`Voltaje promedio con motor encendido: ${v.prom.toFixed(2)} V`, `Mínimo: ${v.min.toFixed(2)} V`], {
            certeza: g === "alta" ? "sospecha" : "posibilidad",
            causas: ["Faja del alternador floja o patinando", "Terminales de batería sulfatados o flojos", "Cable grueso del alternador o tierra en mal estado", "Alternador gastado (escobillas, regulador, diodos)"],
            alternativas: ["Carros con 'carga inteligente' bajan el voltaje a propósito (12.8–13.2 V puede ser normal en ellos)"],
            prueba: "Hacé la prueba guiada 'Alternador con carga'. Revisá tensión de la faja y limpiá los bornes de la batería. Un taller de baterías puede probar el alternador.",
            esperado: "Un alternador sano da 13.5–14.7 V sin carga y no baja de 13.0 V con todo encendido.", no_cambiar: "La batería sin probar el alternador (una batería nueva se volvería a descargar).", donde: "ambos" }));
      } else if (v.prom > 15.0) {
        out.push(H("sobrevoltaje", "media", `Voltaje demasiado alto (${v.prom.toFixed(1)} V)`, "Más de 15 V con el motor encendido puede dañar la batería y la electrónica.",
          [`Voltaje promedio: ${v.prom.toFixed(2)} V`], { causas: ["Regulador de voltaje del alternador"], prueba: "Medí el voltaje en los bornes de la batería con un multímetro.",
            esperado: "Si el multímetro también marca más de 15 V, el regulador está malo.", donde: "mecánico" }));
      }
    } else if (v.prom < 12.2) {
      out.push(H("bateria_baja", "baja", `Batería baja (${v.prom.toFixed(1)} V con motor apagado)`, "Con el motor apagado una batería cargada marca 12.4–12.7 V.",
        [`Voltaje: ${v.prom.toFixed(2)} V`], { certeza: "posibilidad", causas: ["Batería descargada", "Batería vieja", "Algo consumiendo con el carro apagado"],
          prueba: "Cargá la batería y hacé la prueba guiada 'Batería y arranque'.", esperado: "Una batería sana mantiene 12.4 V o más y no baja de 10 V al arrancar.", donde: "casa" }));
    }
  }

  // ------------------------------------------------------------------ sensores de oxígeno y catalizador
  function reglaOxigeno(r, cod, out) {
    const combinado = (c) => {
      const l = [r.ralenti[c], r.rpm_altas[c]].filter(Boolean);
      if (!l.length) return null;
      const n = l.reduce((a, s) => a + s.n, 0);
      return { n, p5: Math.min(...l.map((s) => s.p5)), p95: Math.max(...l.map((s) => s.p95)), prom: l.reduce((a, s) => a + s.prom * s.n, 0) / n };
    };
    const a = combinado("o2_b1s1"), d = combinado("o2_b1s2"), lam = combinado("lambda_b1s1");
    const catExtra = () => ({
      certeza: certeza(1 + (cod.has("P0420") ? 1 : 0)),
      causas: ["Catalizador gastado", "Fuga de escape cerca del sensor de después", "Sensor de después del catalizador malo"],
      alternativas: ["Misfire o mezcla rica que lo están dañando (corregir primero)"],
      prueba: "Revisá fugas de escape entre el motor y el sensor trasero (con el motor frío, escuchá soplidos al encender). Corregí cualquier misfire o mezcla rica. Después manejá unos días.",
      esperado: "Si con todo corregido el sensor de después sigue copiando al de antes, el catalizador está gastado.",
      no_cambiar: "El catalizador (es caro) sin descartar fugas de escape y sin corregir misfire o mezcla rica.", donde: "mecánico",
    });
    if ((!a || a.n < 15) && lam && lam.n >= 15 && d && d.n >= 15 && d.p95 - d.p5 > 0.45) {
      out.push(H("catalizador", "baja", "El catalizador parece no estar trabajando", "El sensor de después del catalizador sube y baja mucho; en un catalizador sano se queda estable.",
        [`Sensor después: ${d.p5.toFixed(2)}–${d.p95.toFixed(2)} V (sano: estable entre 0.6 y 0.8 V)`, `Sensor A/F antes: λ ${lam.p5.toFixed(3)}–${lam.p95.toFixed(3)}`,
          ...(cod.has("P0420") ? ["Código P0420"] : [])], catExtra()));
      return;
    }
    if (!a || a.n < 15) return;
    const rango = a.p95 - a.p5;
    if (rango < 0.3) {
      const estado = a.prom < 0.3 ? " y además está pegado marcando pobre" : a.prom > 0.65 ? " y además está pegado marcando rico" : "";
      const ap = ["P0133", "P0134", "P0131", "P0132", "P2195", "P2196"].filter((c) => cod.has(c)).sort();
      out.push(H("o2_lento", "media", "Sensor de oxígeno (antes del catalizador) casi sin actividad",
        `Un sensor sano oscila rápido entre 0.1 y 0.9 V. Este se mueve muy poco${estado}.`,
        [`Rango de voltaje: ${a.p5.toFixed(2)}–${a.p95.toFixed(2)} V (sano: ~0.1–0.9 V)`, ...ap.map((c) => `Código ${c}`)], {
          certeza: certeza(1 + (ap.length ? 1 : 0)),
          causas: ["Sensor viejo o lento", "Sensor contaminado (aceite o anticongelante)", "Calentador del sensor dañado"],
          alternativas: ["Fuga de escape antes del sensor (mete aire)", "Conector o cable dañado"],
          prueba: "Hacé la prueba guiada 'Sensor de oxígeno' a 2,500 rpm. Revisá fugas de escape antes del sensor y el conector.",
          esperado: "Un sensor sano cambia 8 o más veces en 10 segundos. Si después de descartar fugas sigue lento, cambiá el sensor.",
          no_cambiar: "El catalizador.", donde: "casa" }));
    } else if (d && d.n >= 15 && rango > 0.4 && d.p95 - d.p5 > 0.45) {
      out.push(H("catalizador", "baja", "El catalizador parece no estar trabajando",
        "El sensor de después del catalizador oscila casi igual que el de antes. En un catalizador sano el de después se queda estable (0.6–0.8 V).",
        [`Sensor antes: ${a.p5.toFixed(2)}–${a.p95.toFixed(2)} V`, `Sensor después: ${d.p5.toFixed(2)}–${d.p95.toFixed(2)} V (sano: estable entre 0.6 y 0.8 V)`, ...(cod.has("P0420") ? ["Código P0420"] : [])],
        catExtra()));
    }
  }

  // ------------------------------------------------------------------ ralentí
  function reglaRalenti(r, cod, out, p6) {
    const rpm = r.ralenti.rpm;
    if (!rpm || rpm.n < MIN) return;
    const misfire = [...cod].filter((c) => /^P03(0\d|1[0-2])$/.test(c)).sort();
    if (rpm.desv > 30) {
      const cil = (p6 && p6.misfire) || [];
      const conFallos = cil.filter((c) => Math.max(c.actual || 0, c.promedio || 0) >= 5).map((c) => c.cilindro);
      out.push(H("ralenti_inestable", "media", "Ralentí inestable (el motor tiembla)",
        "Las RPM en ralentí suben y bajan más de lo normal.",
        [`Variación en ralentí: ±${r0(rpm.desv)} rpm (normal: menos de ±20)`, `Rango: ${r0(rpm.min)}–${r0(rpm.max)} rpm`, ...misfire.map((c) => `Código ${c}`),
          ...(conFallos.length ? [`Contadores internos con fallos en cilindro(s) ${conFallos.join(", ")}`] : [])], {
          certeza: certeza(1 + (misfire.length ? 1 : 0) + (conFallos.length ? 1 : 0)),
          causas: misfire.length || conFallos.length
            ? ["Fallo de encendido: bujía, bobina o inyector del cilindro afectado", "Compresión baja en ese cilindro"]
            : ["Fallo de encendido", "Fuga de vacío", "Cuerpo de aceleración sucio"],
          alternativas: ["Gasolina contaminada", "EGR pegada abierta", "Soportes de motor rotos (se siente vibración, pero no cambian las RPM)"],
          prueba: "Leé los contadores de misfire por cilindro (prueba guiada). Si un cilindro concentra los fallos, intercambiá su bobina con la de otro cilindro y volvé a medir.",
          esperado: "Si los fallos se mudan con la bobina, es la bobina. Si se quedan, revisá bujía, inyector y compresión de ese cilindro.",
          no_cambiar: "Todas las bobinas o todas las bujías sin saber cuál cilindro falla.", donde: "casa" }));
    }
    if (rpm.prom > 1100) {
      out.push(H("ralenti_alto", "baja", `Ralentí alto (${r0(rpm.prom)} rpm)`, "Con el motor caliente el ralentí normal es de 650–900 rpm.",
        [`RPM promedio en ralentí: ${r0(rpm.prom)}`], { certeza: "posibilidad", causas: ["Entrada de aire falsa", "Válvula de ralentí o cuerpo de aceleración", "Aire acondicionado encendido (normal que suba un poco)"],
          prueba: "Apagá el aire acondicionado y buscá fugas de vacío.", esperado: "Sin cargas y sin fugas, el ralentí baja a 650–900 rpm.", donde: "casa" }));
    } else if (rpm.prom < 550) {
      out.push(H("ralenti_bajo", "baja", `Ralentí bajo (${r0(rpm.prom)} rpm)`, "Un ralentí muy bajo puede hacer que el motor se apague.",
        [`RPM promedio en ralentí: ${r0(rpm.prom)}`], { certeza: "posibilidad", causas: ["Cuerpo de aceleración sucio", "Válvula de ralentí"], prueba: "Limpiá el cuerpo de aceleración.",
          esperado: "El ralentí vuelve a 650–900 rpm.", donde: "casa" }));
    }
  }

  // ------------------------------------------------------------------ control de mezcla (PID 03)
  function reglaLazo(h, out) {
    const calientes = h.filter((m) => encendido(m) && (m.temp_motor || 0) >= 70 && m.sistema_comb != null);
    if (calientes.length < MIN * 2) return;
    const frac = (fn) => calientes.filter(fn).length / calientes.length;
    const falla = frac((m) => m.sistema_comb & 8), conFalla = frac((m) => m.sistema_comb & 16);
    const cerrado = frac((m) => S.lazoCerrado(m.sistema_comb)), carga = frac((m) => m.sistema_comb & 4);
    const comun = { causas: ["Sensor de oxígeno o su calentador", "Sensor de temperatura del motor", "Sensor MAF"],
      prueba: "Leé los códigos y revisá el sensor de oxígeno de adelante (conector, calentador).", esperado: "Al reparar, la computadora vuelve a 'lazo cerrado' con el motor caliente.", donde: "mecánico" };
    if (falla >= 0.3) {
      out.push(H("lazo_abierto_falla", "media", "La computadora ignora el sensor de oxígeno por una falla",
        "Con el motor caliente, la computadora está controlando la mezcla 'a ciegas' (lazo abierto por falla). El carro gasta más y contamina.",
        [`Tiempo en lazo abierto por falla: ${r0(falla * 100)}% con el motor caliente`], { ...comun, certeza: "confirmada" }));
    } else if (conFalla >= 0.3) {
      out.push(H("lazo_con_falla", "baja", "Lazo cerrado, pero con un sensor de oxígeno fallando",
        "La computadora controla la mezcla, pero reporta una falla en uno de los sensores de oxígeno.", [`Tiempo así: ${r0(conFalla * 100)}%`], { ...comun, certeza: "confirmada" }));
    } else if (cerrado < 0.1 && carga < 0.6) {
      out.push(H("nunca_lazo_cerrado", "media", "La computadora no logra controlar la mezcla (nunca entra en lazo cerrado)",
        "Con el motor caliente debería pasar a 'lazo cerrado' y usar el sensor de oxígeno.", [`Tiempo en lazo cerrado: ${r0(cerrado * 100)}%`], { ...comun, certeza: "sospecha" }));
    }
  }

  // ------------------------------------------------------------------ datos imposibles o contradictorios
  function reglaContradicciones(r, h, cod, out) {
    const t = r.general.temp_motor, tm = r.general.tiempo_motor;
    if (t && t.max <= -35 && r.motor_encendido && (!tm || tm.actual > 300)) {
      const ap = ["P0115", "P0117", "P0118", "P0119"].filter((c) => cod.has(c));
      out.push(H("ect_imposible", "media", "El sensor de temperatura del motor da un dato imposible",
        `Marca ${r0(t.max)} °C con el motor encendido${tm ? ` hace ${r0(tm.actual / 60)} minutos` : ""}. Ese valor es el que se lee cuando el sensor está desconectado o el cable está roto.`,
        [`Temperatura reportada: ${r0(t.max)} °C`, ...ap.map((c) => `Código ${c}`)], {
          certeza: certeza(1 + (ap.length ? 1 : 0)),
          causas: ["Conector del sensor de temperatura suelto o sulfatado", "Cable roto", "Sensor dañado"],
          prueba: "Con el motor apagado, revisá el conector del sensor de temperatura del refrigerante (cerca del termostato). Con multímetro, medí la resistencia del sensor.",
          esperado: "Un sensor sano marca varios miles de ohmios en frío y unos cientos en caliente. Si el conector estaba suelto, al conectarlo vuelve a una lectura normal.",
          no_cambiar: "El termostato ni la computadora.", donde: "casa" }));
    }
    const mov = h.filter((m) => (m.velocidad || 0) > 20 && m.rpm != null && m.rpm < 300);
    if (mov.length >= MIN) {
      out.push(H("rpm_vs_velocidad", "baja", "Datos contradictorios: hay velocidad pero el motor marca 0 rpm",
        "Puede ser normal en un híbrido (motor apagado en marcha). En un carro normal indica un sensor de cigüeñal o de velocidad dando datos falsos.",
        [`Lecturas así: ${mov.length}`], { certeza: "posibilidad", causas: ["Carro híbrido (normal)", "Sensor de posición del cigüeñal", "Sensor de velocidad"],
          prueba: "Compará con el tacómetro del tablero.", esperado: "Si el tablero sí marca RPM, el dato del sensor está mal.", donde: "mecánico" }));
    }
    const mafCero = h.filter((m) => encendido(m) && m.maf != null && m.maf < 0.3);
    if (mafCero.length >= MIN) {
      out.push(H("maf_sin_senal", "media", "El sensor MAF no da señal con el motor encendido",
        "Con el motor encendido siempre entra aire; un MAF en cero indica sensor desconectado o dañado.", [`Lecturas en cero con motor encendido: ${mafCero.length}`], {
          certeza: certeza(1 + (["P0100", "P0102"].some((c) => cod.has(c)) ? 1 : 0)), causas: ["Conector del MAF suelto", "Sensor MAF dañado", "Fusible o alimentación del MAF"],
          prueba: "Revisá el conector del MAF y su alimentación.", esperado: "Con el MAF bien conectado, en ralentí marca algunos g/s.", donde: "casa" }));
    }
  }

  // ------------------------------------------------------------------ códigos de comunicación
  function reglaComunicacion(l, r, out) {
    const us = ((l && l.codigos) || []).filter((c) => c.codigo[0] === "U");
    if (!us.length) return;
    const v = r.general.voltaje;
    out.push(H("comunicacion", "media", "Fallas de comunicación entre computadoras",
      "Una o varias computadoras dejaron de 'hablarse' por la red del carro. Muchas veces la causa es eléctrica y no la computadora.",
      [`Códigos: ${us.map((c) => c.codigo).join(", ")}`, ...(v ? [`Voltaje medido: ${v.min.toFixed(1)}–${v.max.toFixed(1)} V`] : [])], {
        certeza: "confirmada",
        causas: ["Batería baja o con picos de voltaje (al arrancar)", "Conector suelto o sulfatado del módulo mencionado", "Tierras (cables a chasis) en mal estado", "Cableado de la red CAN dañado", "Módulo dañado (menos común)"],
        alternativas: ["Si el código es viejo y no vuelve, pudo ser una batería descargada en algún momento"],
        prueba: "Primero hacé la prueba de batería. Limpiá bornes y tierras. Borrá códigos y mirá si vuelven.",
        esperado: "Si no vuelven después de arreglar la parte eléctrica, era eso. Si vuelven, revisá conector y cableado del módulo indicado.",
        no_cambiar: "Ninguna computadora sin revisar antes batería, tierras y conectores.", donde: "ambos" }));
  }

  // ------------------------------------------------------------------ modo 06
  function reglaPruebas06(p6, cod, out) {
    if (!p6 || !p6.disponible) return;
    const fallidas = (p6.fallidas || []).filter((p) => !(p.mid >= 0xa1 && p.mid <= 0xad));
    const porMonitor = {};
    for (const p of fallidas) (porMonitor[p.nombre] = porMonitor[p.nombre] || []).push(p);
    for (const [nombre, lista] of Object.entries(porMonitor)) {
      const sinTabla = lista.some((p) => p.tid >= 0x80);
      out.push(H("m06_" + lista[0].mid, "media", `Prueba interna fallida: ${nombre}`,
        "La misma computadora del carro hizo esta prueba y el resultado quedó fuera de su límite. Muchas veces esto aparece ANTES de que se encienda la luz." +
        (sinTabla ? " Es una prueba propia del fabricante: el número viene escalado según el estándar, pero no hay una tabla validada que diga exactamente qué mide." : ""),
        lista.map((p) => `${p.prueba}: ${p.valor} ${p.unidad} (límite ${p.min}–${p.max})`), {
          certeza: "sospecha", causas: [`Componente del monitor "${nombre}"`],
          prueba: "Leé esta prueba otra vez después de manejar 20–30 minutos (ciudad y carretera).", esperado: "Si vuelve a fallar, esa parte del sistema tiene un problema real aunque todavía no haya código.",
          no_cambiar: "Piezas solo por una prueba interna sin confirmarla con otra medición.", donde: "mecánico" }));
    }
    const cil = (p6.misfire || []).map((c) => ({ n: c.cilindro, v: Math.max(c.actual || 0, c.promedio || 0) }));
    if (!cil.length) return;
    const orden = [...cil].sort((a, b) => b.v - a.v);
    const total = cil.reduce((a, c) => a + c.v, 0);
    const ev = [cil.map((c) => `cil ${c.n}: ${c.v}`).join(" · ")];
    if (orden[0].v >= 5 && orden[0].v >= 2 * Math.max(1, orden[1] ? orden[1].v : 0)) {
      const n = orden[0].n, codCil = `P03${String(n).padStart(2, "0")}`;
      out.push(H("misfire_cilindro", "media", `Fallos de encendido en el cilindro ${n}`,
        `La computadora contó ${orden[0].v} fallos en el cilindro ${n}, mucho más que en los demás.`, [...ev, ...(cod.has(codCil) ? [`Código ${codCil}`] : [])], {
          certeza: certeza(1 + (cod.has(codCil) ? 1 : 0)),
          causas: [`Bobina del cilindro ${n}`, `Bujía del cilindro ${n}`, `Inyector del cilindro ${n}`, `Compresión baja en el cilindro ${n}`],
          alternativas: ["Cable o conector de la bobina", "Fuga de vacío cerca de ese cilindro"],
          prueba: `Intercambiá la bobina del cilindro ${n} con la de otro cilindro, manejá unos minutos y repetí la prueba guiada de misfire.`,
          esperado: "Si los fallos se mudan al otro cilindro, es la bobina. Si se quedan, revisá la bujía (color, desgaste), luego el inyector y por último la compresión.",
          no_cambiar: "Todas las bobinas o todas las bujías a la vez sin confirmar.", donde: "casa" }));
    } else if (total >= 10) {
      out.push(H("misfire_varios", "media", "Fallos de encendido repartidos en varios cilindros",
        "Cuando fallan varios cilindros a la vez suele ser algo común a todos.", ev, {
          certeza: "sospecha", causas: ["Fuga de vacío", "Presión de combustible baja", "Bujías gastadas", "EGR pegada abierta", "Gasolina contaminada"],
          prueba: "Revisá la mezcla (prueba guiada 'Fuga de vacío / mezcla') y el estado de las bujías.", esperado: "Si la mezcla está pobre, corregir eso suele quitar los fallos.",
          no_cambiar: "Las bobinas (rara vez fallan todas juntas).", donde: "ambos" }));
    } else if (total > 0) {
      out.push(H("misfire_pocos", "info", "La computadora registró pocos fallos de encendido", "Unos pocos fallos son normales en muchos motores.", ev));
    } else {
      out.push(H("misfire_cero", "info", "Cero fallos de encendido por cilindro", "Ningún cilindro registra fallos en los contadores internos de la computadora.", ev));
    }
  }

  // ------------------------------------------------------------------ lectura (monitores, freeze frame, permanentes)
  function reglaLectura(l, out) {
    if (!l) return;
    const estado = l.estado || {}, codigos = l.codigos || [], extras = l.extras || {};
    const inc = (estado.monitores || []).filter((m) => !m.completo).map((m) => m.nombre_es);
    if (inc.length) {
      const ev = [`Sin completar: ${inc.join(", ")}`];
      if (extras.km_desde_borrado != null) ev.push(`Km desde que se borraron los códigos: ${r0(extras.km_desde_borrado)}`);
      if (extras.calentamientos_desde_borrado != null) ev.push(`Calentamientos desde el borrado: ${extras.calentamientos_desde_borrado}`);
      out.push(H("monitores_incompletos", "info", `${inc.length} monitor(es) de autodiagnóstico sin completar`,
        "Esto pasa cuando se borran los códigos, se desconecta la batería o el carro casi no se ha manejado. El carro necesita varios días de manejo (ciudad y carretera) para completarlos. " +
        "Si estás comprando el carro, preguntá por qué: borrar códigos antes de vender es un truco conocido (aunque también hay razones normales).", ev));
    } else if (extras.km_desde_borrado != null && extras.km_desde_borrado < 50 && !codigos.length) {
      out.push(H("borrado_reciente", "info", "Los códigos se borraron hace muy poco", "Si estás revisando un carro para comprarlo, preguntá por qué.",
        [`Km desde el borrado: ${r0(extras.km_desde_borrado)}`]));
    }
    if (estado.mil && !codigos.length) {
      out.push(H("mil_sin_codigos", "info", "Check engine encendido pero sin códigos leídos",
        "Puede que la falla esté en otra computadora (transmisión, ABS) que el OBD2 genérico no lee, o que el adaptador no pudo leer los códigos. Intentá otra vez con el motor apagado y la llave en ON."));
    }
    const perm = codigos.filter((c) => c.tipo === "permanente" || (c.tambien || []).includes("permanente")).map((c) => c.codigo);
    if (perm.length) out.push(H("codigos_permanentes", "info", "Hay códigos permanentes",
      "No se borran con el escáner. Se borran solos cuando el carro comprueba varias veces que la falla ya se reparó.", [perm.join(", ")]));
    const ff = l.freeze_frame;
    if (ff && ff.datos) {
      const d = ff.datos, partes = [], momento = [];
      if (d.rpm != null) partes.push(`${r0(d.rpm)} rpm`);
      if (d.velocidad != null) partes.push(`${r0(d.velocidad)} km/h`);
      if (d.temp_motor != null) partes.push(`motor a ${r0(d.temp_motor)} °C`);
      if (d.carga != null) partes.push(`carga ${r0(d.carga)}%`);
      if (d.stft1 != null && d.ltft1 != null) partes.push(`ajuste de combustible total ${f(d.stft1 + d.ltft1, 0)}%`);
      if ((d.velocidad ?? 1) === 0 && (d.rpm ?? 9999) < 1100) momento.push("en ralentí (carro detenido)");
      else if ((d.velocidad ?? 0) > 0) momento.push("manejando");
      if ((d.temp_motor ?? 90) < CALIENTE && (d.temp_motor ?? 90) > -30) momento.push("con el motor frío");
      out.push(H("freeze_frame", "info", `Cómo estaba el carro cuando saltó ${ff.codigo}`,
        "El freeze frame es una 'foto' de los sensores en el momento exacto de la falla. " + (momento.length ? `La falla ocurrió ${momento.join(" y ")}. ` : "") +
        "Reproducir esas condiciones sirve para confirmar la reparación.", partes.length ? [partes.join(", ")] : []));
    }
  }

  function reglaPocosDatos(r, out) {
    const cal = r.caliente.rpm;
    if (!r.muestras) out.push(H("sin_datos", "info", "Todavía no hay datos en vivo", "Conectate al carro y esperá unos segundos para que se acumulen datos."));
    else if (!r.motor_encendido) out.push(H("motor_apagado", "info", "El motor está apagado", "Con la llave en ON se pueden leer y borrar códigos, pero para analizar los datos en vivo hay que encender el motor."));
    else if (!cal || cal.n < MIN) out.push(H("pocos_datos", "info", "Faltan datos con el motor caliente", "Dejá el motor encendido hasta que esté caliente. Si podés, mantenelo unos 20 segundos a 2,000–2,500 rpm para comparar con el ralentí."));
  }

  /**
   * Corre todas las reglas.
   * extra: { pruebas06, cilindrada }
   */
  S.analizar = function (historial, lectura, extra = {}) {
    const r = S.resumir(historial || [], { cilindrada: extra.cilindrada });
    const cod = new Set(((lectura && lectura.codigos) || []).map((c) => c.codigo));
    const out = [];
    if (r.muestras) {
      reglaContradicciones(r, historial, cod, out);
      reglaTemperatura(r, cod, out);
      reglaTemperaturasExtra(r, out);
      reglaLazo(historial, out);
      reglaMezcla(r, cod, out);
      reglaMAF(r, cod, out);
      reglaVoltaje(r, out);
      reglaOxigeno(r, cod, out);
      reglaRalenti(r, cod, out, extra.pruebas06);
    }
    reglaComunicacion(lectura, r, out);
    reglaPruebas06(extra.pruebas06, cod, out);
    reglaLectura(lectura, out);
    reglaPocosDatos(r, out);
    const problemas = out.filter((h) => ["alta", "media", "baja"].includes(h.gravedad));
    const s06 = out.find((h) => h.id === "misfire_cero");
    if (s06 && problemas.length) out.splice(out.indexOf(s06), 1);
    const cal = r.muestras ? r.caliente.rpm : null;
    if (!problemas.length && !cod.size && cal && cal.n >= MIN * 3) {
      out.push(H("todo_bien", "ok", "Los datos en vivo se ven normales",
        "Mezcla, temperatura, voltaje, sensores de oxígeno y ralentí están dentro de lo normal. Si el carro tiene un síntoma (ruido, vibración, frenos), puede ser algo que el OBD2 no mide: describilo en los síntomas para la IA."));
    }
    const ordenCerteza = { confirmada: 0, sospecha: 1, posibilidad: 2 };
    out.sort((a, b) => (ORDEN[a.gravedad] ?? 9) - (ORDEN[b.gravedad] ?? 9) || (ordenCerteza[a.certeza] ?? 3) - (ordenCerteza[b.certeza] ?? 3));
    return { resumen: r, hallazgos: out };
  };

  /** Curvas de los datos principales (muestreadas) para que la IA vea patrones en el tiempo. */
  S.seriesTexto = function (historial, minutos = 10, puntos = 60) {
    if (!historial || historial.length < 5) return "";
    const fin = historial[historial.length - 1].t;
    const h = historial.filter((m) => m.t >= fin - minutos * 60);
    const claves = ["rpm", "velocidad", "carga", "temp_motor", "sistema_comb", "stft1", "ltft1", "maf", "map", "o2_b1s1", "o2_b1s2", "lambda_b1s1", "voltaje"]
      .filter((c) => h.some((m) => m[c] != null));
    const paso = Math.max(1, Math.ceil(h.length / puntos));
    const filas = [["seg", ...claves].join(",")];
    for (let i = 0; i < h.length; i += paso) {
      const m = h[i];
      filas.push([Math.round(m.t - h[0].t), ...claves.map((c) => (m[c] == null ? "" : Math.round(m[c] * 1000) / 1000))].join(","));
    }
    return filas.join("\n");
  };

  S.resumenTexto = function (r) {
    if (!r || !r.muestras) return "Sin datos en vivo.";
    const L = [`Muestras: ${r.muestras} en ${r0(r.duracion_s)} s. Motor ${r.motor_encendido ? "encendido" : "apagado"}.`, "Dato | actual | mín | prom | máx"];
    for (const [c, s] of Object.entries(r.general)) {
      const m = S.META[c] || { nombre: c, unidad: "" };
      L.push(`${m.nombre} (${m.unidad}) | ${s.actual.toFixed(2)} | ${s.min.toFixed(2)} | ${s.prom.toFixed(2)} | ${s.max.toFixed(2)}`);
    }
    for (const [seg, titulo] of [["ralenti", "En ralentí (lazo cerrado, detenido)"], ["rpm_altas", "A 1800-3500 rpm con carga (lazo cerrado)"]]) {
      const d = r[seg] || {}, partes = [];
      for (const c of ["rpm", "trim_total1", "trim_total2", "stft1", "ltft1", "map", "maf", "ve", "o2_b1s1", "o2_b1s2", "lambda_b1s1", "voltaje"]) {
        const s = d[c];
        if (s) partes.push(`${c}: prom ${s.prom.toFixed(2)}, desv ${s.desv.toFixed(2)}, p5-p95 ${s.p5.toFixed(2)}–${s.p95.toFixed(2)} (n=${s.n})`);
      }
      if (partes.length) L.push(`${titulo}: ${partes.join("; ")}`);
    }
    if (r.cilindrada) L.push(`(ve = eficiencia volumétrica calculada con MAF, MAP, temperatura de admisión y cilindrada ${r.cilindrada} L)`);
    return L.join("\n");
  };
})(typeof window !== "undefined" ? window : globalThis);
