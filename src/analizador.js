/* ScanIA · motor de diagnóstico local (funciona sin internet y sin IA) — versión 4
 *
 * Cada hallazgo trae:
 *   id, gravedad (alta|media|baja|info|ok), urgencia {nivel: detener|pronto|programar|vigilar, texto}
 *   certeza de la CONDICIÓN observada (no de la causa):
 *     "confirmada"  = la miden dos fuentes distintas (datos en vivo + diagnóstico propio de la computadora, o + prueba guiada)
 *     "sospecha"    = una fuente clara (solo datos en vivo, o solo un código)
 *     "posibilidad" = indicio débil, cerca del límite o con pocos datos
 *   titulo, detalle, evidencia [datos observados], condiciones (en qué estado se midió), referencia (valores aplicables y de qué dependen)
 *   causas [{causa, por_que}] ordenadas, alternativas, distinguir (qué NO se puede separar con OBD y qué prueba lo separa)
 *   prueba, esperado, no_cambiar, donde (casa | mecánico | ambos)
 * No se inventan porcentajes. Una causa nunca se da por confirmada solo con datos OBD: se confirma con la prueba indicada.
 * Los datos fuera de su rango físico (sensor desconectado o en corto) NO se usan para diagnosticar.
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  const MIN = 8;            // mínimo de muestras para opinar
  const CALIENTE = 60;      // °C (solo si el carro no reporta el PID 03)
  const ORDEN = { alta: 0, media: 1, baja: 2, ok: 3, info: 4 };
  S.CERTEZAS = { confirmada: "Confirmada", sospecha: "Sospecha", posibilidad: "Posibilidad" };
  S.URGENCIAS = { detener: "No manejar / detener", pronto: "Revisar pronto (días)", programar: "Programar revisión", vigilar: "Vigilar" };
  const ES_O2 = /^(o2|lambda)_b\d+s\d+$/;

  function stats(valores) {
    const v = valores.filter((x) => x != null && Number.isFinite(x));
    if (!v.length) return null;
    const o = [...v].sort((a, b) => a - b), n = o.length;
    const prom = v.reduce((a, b) => a + b, 0) / n;
    const desv = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - prom) ** 2, 0) / n) : 0;
    const p = (q) => o[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
    return { n, actual: v[n - 1], min: o[0], max: o[n - 1], prom, desv, p5: p(0.05), p95: p(0.95) };
  }

  const encendido = (m) => (m.rpm || 0) > 400;
  const apagadoLlaveOn = (m) => m.rpm != null && m.rpm < 50;
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

  /** Quita los valores físicamente imposibles y anota cuántos hubo por dato. */
  function limpiar(h) {
    const invalidos = {};
    const limpio = h.map((m) => {
      const c = { t: m.t };
      for (const [k, v] of Object.entries(m)) {
        if (k === "t") continue;
        if (S.valorPlausible(k, v)) c[k] = v;
        else if (v != null) { const x = (invalidos[k] = invalidos[k] || { n: 0, valores: [] }); x.n++; if (x.valores.length < 3 && !x.valores.includes(v)) x.valores.push(v); }
      }
      return c;
    });
    return { limpio, invalidos };
  }

  function segmento(muestras, disp) {
    const d = {};
    const claves = new Set(["rpm", "stft1", "ltft1", "stft2", "ltft2", "map", "maf", "voltaje", "carga", "temp_motor", "temp_admision", "egr_error"]);
    muestras.forEach((m) => Object.keys(m).forEach((k) => ES_O2.test(k) && claves.add(k)));
    for (const c of claves) { const s = stats(muestras.map((m) => m[c])); if (s) d[c] = s; }
    for (const b of [1, 2]) { const s = stats(muestras.map((m) => trimTotal(m, b))); if (s) d["trim_total" + b] = s; }
    if (disp) { const s = stats(muestras.map((m) => S.vePorMAP(m, disp))); if (s) d.ve = s; }
    return d;
  }

  S.resumir = function (h, opciones = {}) {
    const disp = Number(opciones.cilindrada) || null;
    const vacio = { muestras: 0, duracion_s: 0, general: {}, caliente: {}, ralenti: {}, rpm_altas: {}, apagado: {}, temp_reciente: null, motor_encendido: false, invalidos: {}, hz: null, medicion: null };
    if (!h || !h.length) return vacio;
    const { limpio, invalidos } = limpiar(h);
    const claves = new Set(); limpio.forEach((m) => Object.keys(m).forEach((k) => k !== "t" && claves.add(k)));
    const general = {};
    for (const c of claves) { const s = stats(limpio.map((m) => m[c])); if (s) general[c] = s; }
    const ultimo = limpio[limpio.length - 1].t, dur = ultimo - limpio[0].t;
    // Saltos imposibles en la temperatura del motor (cable flojo / conector sulfatado)
    let saltos = 0;
    for (let i = 1; i < h.length; i++) {
      const a = h[i - 1].temp_motor, b = h[i].temp_motor;
      if (a != null && b != null && h[i].t - h[i - 1].t <= 2 && Math.abs(b - a) > 15) saltos++;
    }
    const enc = limpio.filter(encendido), apa = limpio.filter(apagadoLlaveOn);
    return {
      muestras: h.length,
      duracion_s: Math.round(dur * 10) / 10,
      hz: dur > 0 ? Math.round(((h.length - 1) / dur) * 100) / 100 : null,
      motor_encendido: encendido(limpio[limpio.length - 1]),
      muestras_encendido: enc.length, muestras_apagado: apa.length,
      medicion: claves.has("maf") ? "MAF" : claves.has("map") ? "MAP" : null,
      temp_reciente: stats(limpio.filter((m) => m.t >= ultimo - 120).map((m) => m.temp_motor)),
      cilindrada: disp,
      invalidos, saltos_temp: saltos,
      general,
      voltaje_encendido: stats(enc.map((m) => m.voltaje)),
      voltaje_apagado: stats(apa.map((m) => m.voltaje)),
      map_apagado: stats(apa.map((m) => m.map)),
      caliente: segmento(limpio.filter((m) => encendido(m) && caliente(m)), disp),
      ralenti: segmento(limpio.filter(enRalenti), disp),
      rpm_altas: segmento(limpio.filter(enRpmAltas), disp),
    };
  };

  // ------------------------------------------------------------------ construcción de hallazgos
  const URG_DEF = { alta: "pronto", media: "programar", baja: "vigilar" };
  const URG_TXT = {
    detener: "Detené el carro en un lugar seguro y no lo manejés hasta revisarlo.",
    pronto: "Revisalo en los próximos días; manejar así puede empeorar el daño o dejarte botado.",
    programar: "Se puede manejar con normalidad, pero conviene revisarlo en la próxima oportunidad.",
    vigilar: "No es urgente: vigilalo en las próximas revisiones.",
  };
  /** Crea un hallazgo. extra = {certeza, causas, alternativas, distinguir, prueba, esperado, no_cambiar, donde, condiciones, referencia, urgencia} */
  const H = (id, gravedad, titulo, detalle, evidencia = [], extra = {}) => {
    const nivel = extra.urgencia || URG_DEF[gravedad] || null;
    return {
      id, gravedad, titulo, detalle, evidencia,
      certeza: extra.certeza || (gravedad === "info" || gravedad === "ok" ? null : "sospecha"),
      urgencia: nivel ? { nivel, texto: extra.urgencia_texto || URG_TXT[nivel] } : null,
      condiciones: extra.condiciones || "", referencia: extra.referencia || "",
      causas: (extra.causas || []).map((c) => (typeof c === "string" ? { causa: c, por_que: "" } : c)),
      alternativas: extra.alternativas || [], distinguir: extra.distinguir || "",
      prueba: extra.prueba || "", esperado: extra.esperado || "",
      no_cambiar: extra.no_cambiar || "", donde: extra.donde || "",
    };
  };
  const f = (v, d = 1) => (v == null ? "?" : (v >= 0 ? "+" : "") + v.toFixed(d));
  const r0 = (v) => Math.round(v);
  /**
   * Certeza de la condición según cuántas FUENTES distintas la muestran.
   * fuentes: "vivo" (datos en vivo), "computadora" (código confirmado o prueba interna fallida), "prueba" (prueba guiada).
   * Un código pendiente cuenta como indicio débil, no como fuente completa.
   */
  const certeza = (fuentes, debil = false) => {
    const n = new Set(fuentes.filter(Boolean)).size;
    return n >= 2 && !debil ? "confirmada" : n >= 1 && !debil ? "sospecha" : "posibilidad";
  };
  const condSeg = (s, nombre) => {
    if (!s || !s.rpm) return "";
    return `${nombre}: ~${r0(s.rpm.prom)} rpm${s.temp_motor ? `, motor a ~${r0(s.temp_motor.prom)} °C` : ""}, ${s.rpm.n} lecturas`;
  };

  /** Códigos presentes con su tipo (confirmado / pendiente / permanente). */
  function indiceCodigos(lectura) {
    const idx = new Map();
    for (const c of (lectura && lectura.codigos) || []) idx.set(c.codigo, [c.tipo, ...(c.tambien || [])]);
    return {
      tiene: (c) => idx.has(c),
      confirmado: (c) => (idx.get(c) || []).some((t) => t === "almacenado" || t === "permanente"),
      texto: (c) => `${c} (${(idx.get(c) || []).map((t) => (t === "almacenado" ? "confirmado" : t)).join(", ")})`,
      todos: () => [...idx.keys()],
      size: idx.size,
    };
  }
  /** De una lista de códigos: cuáles están, y si alguno está confirmado (fuente "computadora") o solo pendiente (indicio). */
  function apoyoCodigos(cod, lista) {
    const presentes = lista.filter((c) => cod.tiene(c));
    return { presentes, ev: presentes.map((c) => `Código ${cod.texto(c)}`), fuente: presentes.some((c) => cod.confirmado(c)) ? "computadora" : null, pendiente: presentes.length && !presentes.some((c) => cod.confirmado(c)) };
  }

  // ------------------------------------------------------------------ datos imposibles o contradictorios
  function reglaDatosImposibles(r, h, cod, out) {
    const NOM = { temp_motor: ["sensor de temperatura del motor (ECT)", ["P0115", "P0116", "P0117", "P0118", "P0119"]],
      temp_admision: ["sensor de temperatura del aire de admisión (IAT)", ["P0110", "P0111", "P0112", "P0113"]],
      maf: ["sensor de flujo de aire (MAF)", ["P0100", "P0101", "P0102", "P0103"]], map: ["sensor de presión del múltiple (MAP)", ["P0105", "P0106", "P0107", "P0108"]] };
    for (const [clave, inv] of Object.entries(r.invalidos)) {
      if (inv.n < 3) continue;
      const [nombre, codigos] = NOM[clave] || [(S.META[clave] || {}).nombre || clave, []];
      const ap = apoyoCodigos(cod, codigos);
      const ejemplo = inv.valores.map((v) => `${v}${(S.META[clave] || {}).unidad ? " " + S.META[clave].unidad : ""}`).join(", ");
      const bajo = inv.valores.some((v) => { const rg = S.rangoDe(clave); return rg && v < rg[0]; });
      out.push(H(clave === "temp_motor" ? "ect_imposible" : "dato_imposible_" + clave, "media", `El ${nombre} da un dato imposible`,
        `Reporta ${ejemplo}. Ese valor no es una medición real: es lo que se lee con el ${bajo ? "circuito abierto (sensor desconectado o cable roto)" : "circuito en corto o un sensor dañado"}. ` +
        "ScanIA no usa esos valores para diagnosticar (por eso no dice 'sobrecalentamiento' ni 'motor frío').",
        [`Lecturas fuera de rango: ${inv.n}`, ...ap.ev], {
          certeza: certeza(["vivo", ap.fuente]),
          referencia: `Rango físico posible: ${(S.rangoDe(clave) || []).join(" a ")} ${(S.META[clave] || {}).unidad || ""}`.trim(),
          causas: [{ causa: "Conector del sensor suelto o sulfatado", por_que: "Lo más común y lo primero que se revisa" }, { causa: bajo ? "Cable cortado" : "Cable pelado haciendo corto", por_que: "" }, { causa: "Sensor dañado", por_que: "" }],
          alternativas: ["Computadora (muy raro; descartá todo lo anterior)"],
          distinguir: "Con OBD no se puede saber si es el sensor o el cable. Se separa midiendo la resistencia del sensor y la continuidad del cable con multímetro.",
          prueba: "Con el motor apagado, revisá y limpiá el conector del sensor. Con multímetro, medí la resistencia del sensor y la continuidad de sus cables hasta la computadora.",
          esperado: "Si al reconectar la lectura vuelve a valores normales, era el conector. Si el sensor da una resistencia fuera de la tabla del manual, es el sensor.",
          no_cambiar: clave === "temp_motor" ? "El termostato ni la computadora." : "La computadora.", donde: "casa", urgencia: clave === "temp_motor" ? "pronto" : "programar",
          urgencia_texto: clave === "temp_motor" ? "Sin un sensor de temperatura confiable, la computadora y el tablero no avisan de un sobrecalentamiento real: vigilá el reloj del tablero." : null }));
    }
    if (r.saltos_temp >= 2) {
      out.push(H("ect_intermitente", "media", "La temperatura del motor salta de golpe",
        "La lectura cambia más de 15 °C en menos de 2 segundos, algo que el motor no puede hacer. Indica un contacto que falla.",
        [`Saltos detectados: ${r.saltos_temp}`], { certeza: "sospecha", causas: ["Conector del sensor de temperatura flojo o sulfatado", "Cable dañado que hace contacto a ratos"],
          prueba: "Con el motor encendido, mové suavemente el conector y el cable del sensor mientras mirás el dato en vivo.", esperado: "Si el dato salta al mover el cable, ahí está la falla.", donde: "casa" }));
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
      const ap = apoyoCodigos(cod, ["P0100", "P0102"]);
      out.push(H("maf_sin_senal", "media", "El sensor MAF no da señal con el motor encendido",
        "Con el motor encendido siempre entra aire; un MAF en cero indica sensor desconectado o dañado.", [`Lecturas en cero con motor encendido: ${mafCero.length}`, ...ap.ev], {
          certeza: certeza(["vivo", ap.fuente]), causas: ["Conector del MAF suelto", "Sensor MAF dañado", "Fusible o alimentación del MAF"],
          prueba: "Revisá el conector del MAF y su alimentación.", esperado: "Con el MAF bien conectado, en ralentí marca algunos g/s.", donde: "casa" }));
    }
  }

  // ------------------------------------------------------------------ mezcla
  function reglaMezcla(r, cod, out, ctx) {
    const mapEngine = r.medicion === "MAP";
    for (const b of [1, 2]) {
      const k = "trim_total" + b, ral = r.ralenti[k], alt = r.rpm_altas[k], cal = r.caliente[k];
      if (!cal || cal.n < MIN) continue;
      const banco = "banco " + b;
      const pobres = apoyoCodigos(cod, b === 1 ? ["P0171", "P2187", "P2177"] : ["P0174", "P2189", "P2179"]);
      const ricos = apoyoCodigos(cod, b === 1 ? ["P0172", "P2188", "P2178"] : ["P0175", "P2190", "P2180"]);
      const seg = ral && alt && ral.n >= MIN && alt.n >= MIN;
      const ev = [];
      if (ral) ev.push(`Ajuste total (corto + largo) en ralentí: ${f(ral.prom)}%`);
      if (alt) ev.push(`Ajuste total a 1,800–3,500 rpm con carga: ${f(alt.prom)}%`);
      ev.push(`Ajuste total promedio con motor caliente: ${f(cal.prom)}%`);
      const veAlt = r.rpm_altas.ve;
      if (veAlt) ev.push(`Eficiencia volumétrica calculada a más RPM: ${r0(veAlt.prom)}%`);
      const condiciones = ["Motor caliente con la computadora en lazo cerrado (usando el sensor de oxígeno)", condSeg(r.ralenti, "Ralentí"), condSeg(r.rpm_altas, "Más RPM")].filter(Boolean).join(". ");
      const referencia = "Ajuste total sano: entre −10% y +10% (cada fabricante pone sus propios límites; muchos encienden el código cerca de ±20–25%). Positivo = la computadora agrega gasolina (mezcla pobre); negativo = quita (rica).";
      const tipoTxt = mapEngine ? "Este motor calcula el aire con el sensor MAP (presión del múltiple), no con un MAF." : r.medicion === "MAF" ? "Este motor mide el aire con un sensor MAF." : "";

      if (seg && ral.prom > 10 && alt.prom < ral.prom - 8) {
        const causas = mapEngine
          ? [{ causa: "Fuga de escape antes del sensor de oxígeno", por_que: "Mete oxígeno que engaña al sensor; pesa más en ralentí" },
             { causa: "Sensor MAP leyendo bajo o su manguera de vacío dañada", por_que: "En un motor con MAP, la computadora calcula menos aire del real" },
             { causa: "Entrada de aire falsa (manguera, PCV, empaque)", por_que: "En motores con MAP afecta poco la mezcla porque el MAP ve ese aire; suele notarse más en el vacío y el ralentí" },
             { causa: "Inyectores sucios", por_que: "Entregan menos con pulsos cortos (ralentí)" }]
          : [{ causa: "Entrada de aire falsa: manguera de vacío rajada o suelta", por_que: "Con MAF, ese aire no se mide; pesa mucho en ralentí (poco aire) y casi nada a más RPM" },
             { causa: "Válvula PCV o su manguera", por_que: "Mete aire directo al múltiple" },
             { causa: "Empaque del múltiple o del cuerpo de aceleración", por_que: "Se endurece con el calor" },
             { causa: "Booster (servofreno) con fuga", por_que: "Usa vacío del motor" }];
        out.push(H("fuga_vacio_b" + b, "media", `Mezcla pobre en ralentí que mejora al acelerar (${banco})`,
          `La computadora agrega ${f(ral.prom, 0)}% de gasolina en ralentí, pero solo ${f(alt.prom, 0)}% a más RPM. ${tipoTxt} ` +
          (mapEngine ? "En este tipo de motor el patrón apunta primero a una fuga de escape o al sensor MAP." : "Es el patrón típico de una entrada de aire que no pasa por el MAF.") +
          " El patrón orienta, pero no prueba la causa.", [...ev, ...pobres.ev], {
            certeza: certeza(["vivo", pobres.fuente], ral.prom < 13), condiciones, referencia, causas,
            alternativas: mapEngine ? ["Presión de combustible baja en ralentí"] : ["Sensor MAF sucio (si también estuviera pobre a más RPM)", "Fuga de escape antes del sensor de oxígeno"],
            distinguir: "Los datos OBD no separan una entrada de aire de una fuga de escape antes del sensor: las dos se ven igual en los ajustes. Se separan con la prueba de humo (admisión) y escuchando/buscando hollín en las uniones del escape con el motor frío.",
            prueba: "Motor en ralentí: rociá agua jabonosa o pasá humo de incienso por las mangueras de vacío, la unión del cuerpo de aceleración, el múltiple y la manguera del booster. Con el motor frío, revisá las uniones del escape antes del sensor de oxígeno (soplidos, hollín).",
            esperado: "Si las RPM cambian o el humo se mete en un punto, ahí está la fuga. Al repararla, el ajuste total en ralentí debe volver a menos de ±10% después de unos minutos.",
            no_cambiar: "El sensor de oxígeno ni el sensor MAF/MAP sin probarlos: solo reportan la mezcla pobre.", donde: "casa" }));
      } else if (seg && alt.prom > 10 && alt.prom > ral.prom + 5) {
        const mafSosp = !mapEngine && veAlt && veAlt.n >= MIN && veAlt.prom < 58;
        const causas = mafSosp
          ? [{ causa: "Sensor MAF sucio o dañado", por_que: `La eficiencia calculada con el MAF es baja (${r0(veAlt.prom)}%): el MAF mide menos aire del que entra` },
             { causa: "Falta de combustible (bomba, filtro, regulador)", por_que: "Da el mismo patrón de mezcla" }]
          : [{ causa: "Bomba de gasolina débil o filtro de gasolina tapado", por_que: veAlt ? `El MAF mide un flujo coherente (eficiencia ${r0(veAlt.prom)}%), así que falta gasolina, no sobra aire` : "La mezcla empeora cuando se pide más gasolina" },
             { causa: "Regulador de presión de combustible", por_que: "Baja la presión con carga" }, { causa: "Inyectores sucios", por_que: "Entregan menos de lo que la computadora pide" },
             ...(mapEngine ? [] : [{ causa: "Sensor MAF sucio", por_que: veAlt ? "Menos probable: su lectura parece coherente" : "Sin la cilindrada no se puede comprobar el MAF" }])];
        out.push(H("pobre_carga_b" + b, "media", `Mezcla pobre cuando el motor tiene carga (${banco})`,
          "La mezcla está bien en ralentí pero se empobrece cuando el motor pide más. " + (mapEngine ? "En un motor con MAP, eso apunta sobre todo a la entrega de combustible." : "O falta gasolina, o el MAF está midiendo menos aire del real."),
          [...ev, ...pobres.ev], {
            certeza: certeza(["vivo", pobres.fuente, mafSosp ? "calculo" : null], alt.prom < 13), causas, condiciones, referencia,
            alternativas: ["Fuga de escape antes del sensor de oxígeno", "Gasolina de mala calidad o con agua"],
            distinguir: mafSosp ? "La eficiencia baja apunta al MAF, pero no descarta la falta de combustible: si después de limpiar el MAF la mezcla sigue pobre, se mide la presión." :
              "Con OBD no se puede separar bomba, filtro, regulador o inyectores: todos dan menos gasolina. Lo separa la medición de presión y caudal con manómetro.",
            prueba: mafSosp ? "Limpiá el sensor MAF con limpiador especial para MAF (no lo toqués con nada). Volvé a medir la mezcla a 2,500 rpm."
              : "Que un mecánico mida la presión de combustible con manómetro en ralentí y acelerando (y el caudal de la bomba). Revisá cuándo se cambió el filtro de gasolina.",
            esperado: mafSosp ? "Si después de limpiarlo el ajuste a más RPM baja a menos de ±10%, era el MAF. Si no cambia, medí la presión de combustible."
              : "Presión dentro de lo que pide el fabricante y que no caiga al acelerar. Si cae, es bomba, filtro o regulador.",
            no_cambiar: "La bomba de gasolina sin medir la presión primero" + (mapEngine ? "." : ", ni el MAF sin limpiarlo antes."), donde: mafSosp ? "casa" : "mecánico" }));
      } else if (cal.prom > 10) {
        out.push(H("pobre_b" + b, "media", `Mezcla pobre (${banco})`, "La computadora está agregando bastante gasolina extra en todas las condiciones.", [...ev, ...pobres.ev], {
          certeza: certeza(["vivo", pobres.fuente], cal.prom < 13), condiciones, referencia,
          causas: mapEngine ? ["Fuga de escape antes del sensor de oxígeno", "Presión de combustible baja", "Sensor MAP leyendo bajo", "Inyectores sucios"]
            : ["Sensor MAF sucio", "Fuga de vacío grande", "Presión de combustible baja", "Fuga de escape antes del sensor de oxígeno"],
          alternativas: ["Sensor de oxígeno sesgado (marcando pobre sin estarlo)"],
          distinguir: "Con estos datos no se puede saber cuál de esas causas es. Se separan en orden de costo: búsqueda de fugas (gratis), " + (mapEngine ? "revisión del MAP y su manguera" : "limpieza del MAF") + ", y medición de presión de combustible.",
          prueba: "Primero buscá fugas de vacío y de escape (gratis). " + (mapEngine ? "Revisá la manguera del sensor MAP." : "Después limpiá el MAF.") + " Si sigue igual, medí la presión de combustible.",
          esperado: "La reparación correcta devuelve el ajuste total a menos de ±10%.", no_cambiar: "El sensor de oxígeno.", donde: "casa" }));
      } else if (cal.prom < -10) {
        out.push(H("rica_b" + b, "media", `Mezcla rica: sobra gasolina (${banco})`, `La computadora está quitando ${f(-cal.prom, 0)}% de gasolina porque le sobra.`, [...ev, ...ricos.ev], {
          certeza: certeza(["vivo", ricos.fuente], cal.prom > -13), condiciones, referencia,
          causas: ["Inyector goteando o pegado", "Presión de combustible demasiado alta (regulador)", "Válvula de purga EVAP pegada abierta",
            "Sensor de temperatura del motor marcando frío", "Filtro de aire muy tapado", ...(mapEngine ? ["Sensor MAP leyendo alto o EGR pegada abierta"] : [])],
          alternativas: ["Aceite contaminado con gasolina (olé la varilla del aceite)", "Sensor de oxígeno sesgado (marcando rico sin estarlo)"],
          distinguir: "OBD no separa un inyector goteando de una presión alta o de la purga EVAP. Se separan con pruebas físicas sencillas (purga) y con manómetro (presión).",
          prueba: "Revisá el filtro de aire y olé la varilla del aceite. Con el motor apagado, quitá la manguera de la válvula de purga EVAP del lado del múltiple y tapá la toma: si al encender cambia la mezcla, la válvula estaba pegada. La presión y los inyectores los revisa un mecánico.",
          esperado: "Si la mezcla vuelve a menos de ±10% al corregir algo, esa era la causa. Gasolina en el aceite apunta a un inyector goteando.",
          no_cambiar: "El sensor de oxígeno ni el catalizador.", donde: "ambos" }));
      }
    }
    const t1 = r.caliente.trim_total1, t2 = r.caliente.trim_total2;
    if (t1 && t2 && t1.n >= MIN && Math.abs(t1.prom - t2.prom) > 10) {
      out.push(H("diferencia_bancos", "media", "Un lado del motor trabaja diferente al otro",
        "Los ajustes de combustible de los dos bancos son muy diferentes. Eso hace menos probable una causa común a todo el motor (bomba, MAF).",
        [`Banco 1: ${f(t1.prom)}%`, `Banco 2: ${f(t2.prom)}%`], {
          causas: ["Fuga de vacío en ese lado del múltiple", "Inyectores de ese banco", "Fuga de escape de ese lado", "Sensor de oxígeno de ese banco"],
          prueba: "Buscá fugas del lado con el ajuste más alto; intercambiá inyectores entre bancos si es posible.",
          esperado: "Si el problema cambia de banco con la pieza, esa pieza es la mala.", no_cambiar: "La bomba de gasolina ni el MAF.", donde: "mecánico" }));
    }
  }

  function reglaMAF(r, cod, out) {
    const a = r.ralenti.ve, b = r.rpm_altas.ve;
    if (!a || !b || a.n < MIN || b.n < MIN) return;
    const ap = apoyoCodigos(cod, ["P0100", "P0101", "P0102", "P0103"]);
    const ev = [`Eficiencia calculada en ralentí: ${r0(a.prom)}%`, `A más RPM: ${r0(b.prom)}%`, `Cilindrada usada: ${r.cilindrada} L`, ...ap.ev];
    const referencia = "Cálculo de ScanIA con MAF, MAP, temperatura de admisión y cilindrada. Referencia orientativa (no es un valor de fábrica): en motores sin turbo suele dar entre 60% y 95% según RPM y carga.";
    if (a.prom < 60 && b.prom < 58 && !out.some((h) => h.id.startsWith("fuga_vacio"))) {
      out.push(H("maf_bajo", "media", "El sensor MAF parece medir menos aire del real",
        "Con la presión del múltiple, la temperatura y las RPM se puede calcular cuánto aire debería entrar. El MAF reporta bastante menos en todas las condiciones.", ev, {
          certeza: certeza(["calculo", ap.fuente, out.some((h) => h.id.startsWith("pobre")) ? "vivo" : null], false), referencia,
          condiciones: [condSeg(r.ralenti, "Ralentí"), condSeg(r.rpm_altas, "Más RPM")].filter(Boolean).join(". "),
          causas: ["Sensor MAF sucio (aceite del filtro, polvo)", "Sensor MAF dañado", "Fuga de aire entre el MAF y el cuerpo de aceleración"],
          alternativas: ["Cilindrada mal configurada en Mis carros", "Sensor MAP o de temperatura de admisión dando datos falsos"],
          distinguir: "El cálculo depende de que la cilindrada y el sensor MAP estén bien: si alguno está mal, el resultado también.",
          prueba: "Revisá que la cilindrada del carro esté bien. Limpiá el MAF con limpiador especial y revisá la manguera entre el MAF y la mariposa.",
          esperado: "Después de limpiarlo, la eficiencia debe subir y la mezcla volver a ±10%.", no_cambiar: "El MAF sin limpiarlo primero (muchas veces revive).", donde: "casa" }));
    } else if (a.prom > 120 && b.prom > 120) {
      out.push(H("maf_alto", "baja", "El sensor MAF parece medir más aire del normal",
        "La eficiencia calculada sale por encima de lo posible en un motor sin turbo.", ev, {
          certeza: "posibilidad", referencia, causas: ["Cilindrada mal configurada", "Motor turbo/supercargado (normal)", "Sensor MAF descalibrado"],
          prueba: "Confirmá la cilindrada y si el motor es turbo.", esperado: "Con la cilindrada correcta, un motor sin turbo da valores por debajo de 100%.", donde: "casa" }));
    }
  }

  /** Vacío del motor y sensor MAP (sirve en motores con MAP como el Honda B20Z, y en cualquiera que reporte el MAP). */
  function reglaMAP(r, cod, out) {
    const baro = r.general.baro ? r.general.baro.prom : r.map_apagado && r.map_apagado.n >= 3 ? r.map_apagado.prom : null;
    const ap = apoyoCodigos(cod, ["P0105", "P0106", "P0107", "P0108", "P0109"]);
    // Llave en ON y motor apagado: el MAP debe marcar la presión del ambiente
    if (r.map_apagado && r.map_apagado.n >= 3) {
      const m = r.map_apagado.prom;
      const ref = r.general.baro ? r.general.baro.prom : null;
      const mal = ref ? Math.abs(m - ref) > 5 : m < 68 || m > 106;
      if (mal || ap.presentes.length) {
        out.push(H("map_sensor", "media", "El sensor MAP no marca la presión del ambiente con el motor apagado",
          `Con la llave en ON y el motor apagado, el MAP debería marcar la presión del aire (barométrica). Marca ${r0(m)} kPa${ref ? ` y la barométrica es ${r0(ref)} kPa` : ""}.`,
          [`MAP con motor apagado: ${r0(m)} kPa`, ...(ref ? [`Barométrica: ${r0(ref)} kPa`] : []), ...ap.ev], {
            certeza: certeza(["vivo", ap.fuente], !mal), condiciones: `Llave en ON, motor apagado (${r.map_apagado.n} lecturas)`,
            referencia: ref ? "Diferencia con la barométrica: menos de ±5 kPa." : "Sin la barométrica del carro: a nivel del mar ~101 kPa; a 1,000 m (Tegucigalpa) ~90 kPa; a 2,000 m ~80 kPa.",
            causas: ["Sensor MAP dañado", "Conector o cables del MAP", "Manguera del MAP tapada o rota (en motores donde el MAP va con manguera)"],
            prueba: "Revisá el conector y la manguera del sensor MAP. Con multímetro, el voltaje de señal debe cambiar al aplicar vacío con una bomba de mano.",
            esperado: "Un MAP sano marca la presión ambiente con el motor apagado y baja suavemente al aplicar vacío.", no_cambiar: "La computadora.", donde: "ambos" }));
      }
    }
    const ral = r.ralenti.map;
    if (!ral || ral.n < MIN) return;
    const ref = baro || null, frac = ref ? ral.prom / ref : null;
    const bajoVacio = ref ? frac > 0.52 : ral.prom > 48;
    if (!bajoVacio) return;
    const rpmR = r.ralenti.rpm;
    const inestable = rpmR && rpmR.desv > 30, alto = rpmR && rpmR.prom > 1000;
    out.push(H("vacio_bajo", "media", "Poco vacío en ralentí (presión del múltiple alta)",
      `En ralentí y con el motor caliente, el MAP marca ${r0(ral.prom)} kPa${ref ? ` (${r0(frac * 100)}% de la presión del ambiente)` : ""}. Un motor sano en ralentí sin cargas tiene más vacío (MAP más bajo).` +
      (inestable || alto ? ` Además el ralentí está ${[alto ? "alto" : null, inestable ? "inestable" : null].filter(Boolean).join(" e ")}.` : ""),
      [`MAP en ralentí: ${r0(ral.prom)} kPa (${ral.n} lecturas)`, ...(ref ? [`Presión ambiente usada: ${r0(ref)} kPa${r.general.baro ? " (PID 33)" : " (MAP con motor apagado)"}`] : []),
        ...(rpmR ? [`RPM en ralentí: ${r0(rpmR.prom)} ±${r0(rpmR.desv)}`] : []), ...ap.ev], {
        // El vacío lo mide solo el MAP: aunque el ralentí también esté inestable, la confirmación es con un vacuómetro.
        certeza: certeza(["vivo"], !ref && ral.prom < 55),
        condiciones: condSeg(r.ralenti, "Ralentí con motor caliente") + ". Aire acondicionado, luces y dirección hidráulica cargan el motor y suben el MAP: hacé la medición sin cargas.",
        referencia: "Orientativo para motores de gasolina sin turbo en ralentí caliente y sin cargas: MAP entre 25% y 45% de la presión ambiente (vacío de ~17–21 inHg a nivel del mar). Cada motor tiene su valor; un árbol de levas modificado da menos vacío.",
        causas: [{ causa: "Entrada de aire falsa (manguera de vacío, PCV, empaque del múltiple, booster)", por_que: "En motores con MAP, una fuga se ve sobre todo como vacío bajo y ralentí alto o inestable" },
          { causa: "Tiempo de encendido atrasado o distribución corrida (faja de tiempo)", por_que: "Baja el vacío en todo momento" },
          { causa: "Válvula EGR pegada abierta", por_que: "Mete gases al múltiple en ralentí" },
          { causa: "Escape tapado (catalizador)", por_que: "El motor no puede vaciar los cilindros" }, { causa: "Sensor MAP descalibrado", por_que: "Leería alto sin que el vacío sea bajo" }],
        distinguir: "OBD no separa estas causas. Un vacuómetro en el múltiple las separa: aguja estable pero baja (fuga o tiempo), aguja que oscila (válvulas, EGR), aguja que baja al sostener 2,500 rpm (escape tapado).",
        prueba: "Buscá fugas con humo o agua jabonosa. Un mecánico conecta un vacuómetro al múltiple y revisa el tiempo de encendido.",
        esperado: "Con la fuga reparada, el MAP en ralentí baja y el ralentí se estabiliza.", no_cambiar: "El sensor MAP sin compararlo con un vacuómetro.", donde: "ambos" }));
  }

  // ------------------------------------------------------------------ temperatura
  function reglaTemperatura(r, cod, out) {
    const t = r.general.temp_motor;
    if (!t) return;
    const p217 = apoyoCodigos(cod, ["P0217"]);
    const refT = "Normal con el motor caliente: 85–105 °C según el carro (el electroventilador suele encender entre 95 y 105 °C).";
    if (t.max >= 110) {
      out.push(H("sobrecalentamiento", "alta", `Motor SOBRECALENTADO (${r0(t.max)} °C)`,
        "Apagá el motor en un lugar seguro. NO abras el tapón del radiador en caliente. Manejar así puede torcer la culata.",
        [`Temperatura máxima: ${r0(t.max)} °C`, `Temperatura actual: ${r0(t.actual)} °C`, ...p217.ev], {
          certeza: certeza(["vivo", p217.fuente]), urgencia: "detener", referencia: refT,
          condiciones: `Lectura del sensor de temperatura del motor durante ${r0(r.duracion_s / 60)} min de sesión (valores dentro de rango físico).`,
          causas: ["Falta de refrigerante (fuga)", "Electroventilador que no enciende", "Termostato pegado cerrado", "Bomba de agua", "Radiador tapado", "Empaque de culata"],
          alternativas: ["Sensor de temperatura marcando de más (comparalo con el reloj del tablero)"],
          distinguir: "OBD no dice por qué se calienta. Se separa revisando nivel, ventilador, mangueras (calientes/frías) y con una prueba de gases en el refrigerante.",
          prueba: "Con el motor FRÍO revisá el nivel del depósito y del radiador. Encendé el motor y fijate si el electroventilador arranca. Buscá fugas debajo del carro.",
          esperado: "Si falta refrigerante, hay una fuga que encontrar. Si el ventilador no arranca, revisá fusible, relé y motor del ventilador.",
          no_cambiar: "El empaque de culata sin una prueba de compresión o de gases en el refrigerante.", donde: "mecánico" }));
      return;
    }
    if (t.max >= 105) {
      out.push(H("temperatura_alta", "media", `Temperatura del motor alta (${r0(t.max)} °C)`,
        "Está en el límite alto. Algunos carros trabajan así en tráfico, pero conviene revisar.", [`Temperatura máxima: ${r0(t.max)} °C`, ...p217.ev], {
          certeza: certeza(["vivo", p217.fuente], true), referencia: refT, causas: ["Nivel de refrigerante bajo", "Electroventilador débil", "Radiador sucio por fuera o tapado"],
          prueba: "Hacé la prueba guiada 'Refrigeración (electroventilador)' y revisá el nivel con el motor frío.", esperado: "Con el sistema en orden, la temperatura se estabiliza.", donde: "casa" }));
    }
    const tm = r.general.tiempo_motor;
    const minutos = tm ? tm.actual / 60 : r.motor_encendido ? r.duracion_s / 60 : 0;
    const rec = r.temp_reciente || t;
    const p128 = apoyoCodigos(cod, ["P0128"]);
    if (minutos >= 10 && rec.max < 76 && r.motor_encendido && rec.n >= MIN) {
      out.push(H("termostato", "baja", "El motor no llega a su temperatura normal",
        `El motor lleva unos ${r0(minutos)} minutos encendido y no pasa de ${r0(rec.max)} °C. Un motor frío gasta más gasolina y se desgasta más.`,
        [`Temperatura máxima (últimos 2 min): ${r0(rec.max)} °C`, `Minutos con motor encendido: ${r0(minutos)}${tm ? " (según la computadora)" : " (según esta sesión)"}`, ...p128.ev], {
          certeza: certeza(["vivo", p128.fuente]), referencia: refT + " Los termostatos empiezan a abrir entre 76 y 92 °C según el motor.",
          condiciones: "Motor encendido 10 minutos o más. En ralentí y con clima frío un motor sano tarda más en calentar.",
          causas: ["Termostato pegado abierto", "Le quitaron el termostato", "Sensor de temperatura marcando bajo"],
          alternativas: ["Electroventilador encendido todo el tiempo (relé pegado)"],
          distinguir: "Para separar el termostato del sensor: si el reloj del tablero también marca frío y la manguera de arriba del radiador se calienta desde el principio, es el termostato.",
          prueba: "Hacé la prueba guiada 'Termostato (calentamiento)' con el motor frío. Tocá con cuidado la manguera de arriba del radiador: no debería calentarse hasta que el motor llegue a temperatura.",
          esperado: "Si la manguera se calienta desde el principio, el termostato está abierto.", no_cambiar: "El sensor de temperatura antes de probar el termostato.", donde: "ambos" }));
    }
  }

  function reglaTemperaturasExtra(r, out) {
    const ac = r.general.temp_aceite, cat = r.general.temp_cat;
    if (ac && ac.max >= 130) out.push(H("aceite_caliente", "alta", `Aceite del motor demasiado caliente (${r0(ac.max)} °C)`,
      "Por encima de 130 °C el aceite pierde protección.", [`Máxima: ${r0(ac.max)} °C`], {
        urgencia: "pronto", causas: ["Nivel de aceite bajo", "Sistema de enfriamiento fallando", "Motor exigido con mucha carga"], prueba: "Revisá el nivel y el estado del aceite con el motor frío.",
        referencia: "Orientativo: 90–120 °C según el motor y el uso.", esperado: "Con aceite correcto y enfriamiento bien, debe bajar.", donde: "casa" }));
    else if (ac && ac.max >= 120) out.push(H("aceite_alto", "media", `Aceite del motor caliente (${r0(ac.max)} °C)`,
      "Está en el límite alto.", [`Máxima: ${r0(ac.max)} °C`], {
        certeza: "posibilidad", causas: ["Nivel de aceite bajo", "Temperatura del motor alta"], prueba: "Revisá el nivel de aceite.",
        referencia: "Orientativo: 90–120 °C según el motor y el uso.", esperado: "Debe estabilizarse más abajo.", donde: "casa" }));
    if (cat && cat.max >= 900) out.push(H("catalizador_caliente", "alta", `Catalizador sobrecalentado (${r0(cat.max)} °C)`,
      "La gasolina sin quemar se está quemando dentro del catalizador y lo puede derretir.", [`Máxima: ${r0(cat.max)} °C`], {
        urgencia: "pronto", causas: ["Fallos de encendido (misfire)", "Mezcla muy rica"], prueba: "Revisá los contadores de misfire (prueba guiada) y la mezcla.",
        esperado: "Al corregir el misfire o la mezcla, la temperatura baja.", no_cambiar: "El catalizador antes de corregir la causa (se volvería a dañar).", donde: "mecánico" }));
  }

  // ------------------------------------------------------------------ eléctrico
  function reglaVoltaje(r, out, ctx) {
    const fuenteV = ctx.fuenteVoltaje ? ` (${ctx.fuenteVoltaje})` : "";
    const nota = "Medido en el conector OBD, que suele leer 0.1–0.3 V menos que en los bornes de la batería. Confirmá con multímetro en los bornes.";
    const ve = r.voltaje_encendido, va = r.voltaje_apagado;
    if (ve && ve.n >= MIN) {
      const g = ve.prom < 12.4 ? "alta" : ve.prom < 13.0 ? "media" : null;
      if (g) {
        out.push(H("alternador", g, `El alternador no está cargando bien (${ve.prom.toFixed(1)} V con el motor encendido)`,
          "Con este voltaje la batería se descarga mientras manejás y el carro se puede apagar.",
          [`Voltaje promedio con motor encendido${fuenteV}: ${ve.prom.toFixed(2)} V`, `Mínimo: ${ve.min.toFixed(2)} V (${ve.n} lecturas)`], {
            certeza: certeza(["vivo"], g !== "alta"), urgencia: g === "alta" ? "pronto" : "programar",
            condiciones: `Solo lecturas con el motor encendido (más de 400 rpm). ${nota}`,
            referencia: "Típico con motor encendido: 13.5–14.7 V. Algunos carros con 'carga inteligente' (incluidos varios Honda con detector de carga eléctrica ELD) bajan a propósito a ~12.6–13.2 V con poco consumo: revisá el manual.",
            causas: ["Faja del alternador floja o patinando", "Terminales de batería sulfatados o flojos", "Cable grueso del alternador o tierra en mal estado", "Alternador gastado (escobillas, regulador, diodos)"],
            distinguir: "OBD no separa la faja, los cables y el alternador. Se separa con la prueba guiada 'Caída de voltaje' (multímetro) y revisando la faja.",
            prueba: "Hacé la prueba guiada 'Alternador con carga'. Revisá tensión de la faja y limpiá los bornes de la batería. Un taller de baterías puede probar el alternador.",
            esperado: "Un alternador sano no baja de ~13 V con todo encendido (salvo carga inteligente).", no_cambiar: "La batería sin probar el alternador (una batería nueva se volvería a descargar).", donde: "ambos" }));
      } else if (ve.prom > 15.0) {
        out.push(H("sobrevoltaje", "media", `Voltaje demasiado alto (${ve.prom.toFixed(1)} V)`, "Más de 15 V con el motor encendido puede dañar la batería y la electrónica.",
          [`Voltaje promedio con motor encendido${fuenteV}: ${ve.prom.toFixed(2)} V`], { urgencia: "pronto", condiciones: nota, causas: ["Regulador de voltaje del alternador"],
            referencia: "Típico: 13.5–14.7 V; algunos sistemas suben hasta ~15 V en frío.", prueba: "Medí el voltaje en los bornes de la batería con un multímetro.",
            esperado: "Si el multímetro también marca más de 15 V, el regulador está malo.", donde: "mecánico" }));
      }
    }
    if (va && va.n >= 3 && va.prom < 12.2) {
      out.push(H("bateria_baja", "baja", `Batería baja (${va.prom.toFixed(1)} V con motor apagado y llave en ON)`, "La batería no está bien cargada o está envejeciendo.",
        [`Voltaje con motor apagado${fuenteV}: ${va.prom.toFixed(2)} V (${va.n} lecturas)`], {
          certeza: "posibilidad", condiciones: `Llave en ON y motor apagado: la computadora, la bomba de gasolina y las luces del tablero consumen, así que la lectura es algo menor que en reposo total. ${nota}`,
          referencia: "Batería de plomo-ácido en reposo (sin consumo, 1 h o más sin uso, ~25 °C): ~12.6 V cargada, ~12.4 V media carga, menos de 12.2 V descargada. Las AGM marcan un poco más. El frío baja la lectura.",
          causas: ["Batería descargada (el carro se usa poco o el alternador no carga)", "Batería vieja", "Algo consumiendo con el carro apagado"],
          prueba: "Cargá la batería y hacé las pruebas guiadas 'Batería en reposo' y 'Arranque'.", esperado: "Una batería sana, cargada, se mantiene en reposo y no cae demasiado al arrancar.", donde: "casa" }));
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
    const condiciones = "Motor caliente en lazo cerrado, en ralentí y a 1,800–3,500 rpm. El análisis usa el RANGO de voltaje (no la velocidad de cambio), así que no depende de qué tan rápido lea el adaptador.";
    for (const b of [1, 2, 3, 4]) {
      const a = combinado(`o2_b${b}s1`), d = combinado(`o2_b${b}s2`), lam = combinado(`lambda_b${b}s1`);
      const p420 = apoyoCodigos(cod, b === 1 ? ["P0420", "P0421"] : b === 2 ? ["P0430", "P0431"] : []);
      const catExtra = (debil) => ({
        certeza: certeza(["vivo", p420.fuente], debil), condiciones,
        referencia: "Sensor después de un catalizador sano: casi estable (típico 0.5–0.8 V). Si sube y baja casi igual que el de antes, el catalizador guarda poco oxígeno.",
        causas: ["Catalizador gastado", "Fuga de escape cerca del sensor de después", "Sensor de después del catalizador malo"],
        alternativas: ["Misfire o mezcla rica que lo están dañando (corregir primero)"],
        distinguir: "OBD no separa un catalizador gastado de una fuga de escape cerca del sensor trasero. Se separa revisando fugas (motor frío) y, si hace falta, con un analizador de gases.",
        prueba: "Revisá fugas de escape entre el motor y el sensor trasero (con el motor frío, escuchá soplidos al encender). Corregí cualquier misfire o mezcla rica. Después manejá unos días y repetí.",
        esperado: "Si con todo corregido el sensor de después sigue copiando al de antes, el catalizador está gastado.",
        no_cambiar: "El catalizador (es caro) sin descartar fugas de escape y sin corregir misfire o mezcla rica.", donde: "mecánico", urgencia: "programar",
      });
      if ((!a || a.n < 15) && lam && lam.n >= 15 && d && d.n >= 15 && d.p95 - d.p5 > 0.45) {
        out.push(H(`catalizador${b === 1 ? "" : "_b" + b}`, "baja", `El catalizador parece no estar trabajando (banco ${b})`, "El sensor de después del catalizador sube y baja mucho; en un catalizador sano se queda casi estable.",
          [`Sensor B${b}S2: ${d.p5.toFixed(2)}–${d.p95.toFixed(2)} V`, `Sensor A/F B${b}S1: λ ${lam.p5.toFixed(3)}–${lam.p95.toFixed(3)}`, ...p420.ev], catExtra(false)));
        continue;
      }
      if (!a || a.n < 15) continue;
      const rango = a.p95 - a.p5;
      if (rango < 0.3) {
        const estado = a.prom < 0.3 ? " y además está pegado marcando pobre" : a.prom > 0.65 ? " y además está pegado marcando rico" : "";
        const ap = apoyoCodigos(cod, b === 1 ? ["P0130", "P0131", "P0132", "P0133", "P0134", "P2195", "P2196"] : ["P0150", "P0151", "P0152", "P0153", "P0154", "P2197", "P2198"]);
        out.push(H(b === 1 ? "o2_lento" : `o2_lento_b${b}`, "media", `Sensor de oxígeno B${b}S1 (antes del catalizador) casi sin actividad`,
          `Un sensor de voltaje (zirconio) sano en lazo cerrado oscila entre ~0.1 y ~0.9 V. Este se mueve muy poco${estado}.`,
          [`Rango de voltaje: ${a.p5.toFixed(2)}–${a.p95.toFixed(2)} V (${a.n} lecturas)`, ...ap.ev], {
            certeza: certeza(["vivo", ap.fuente]), condiciones, urgencia: "programar",
            referencia: "Sensor de voltaje sano en lazo cerrado: oscila de menos de 0.2 V a más de 0.7 V. (Los sensores de banda ancha A/F no oscilan: se juzgan por λ.)",
            causas: ["Sensor viejo o lento", "Sensor contaminado (aceite o anticongelante)", "Calentador del sensor dañado"],
            alternativas: ["Fuga de escape antes del sensor (mete aire)", "Conector o cable dañado", "Mezcla realmente pegada pobre o rica por otra falla"],
            distinguir: "Si el sensor está pegado en pobre, OBD no separa un sensor muerto de una mezcla realmente pobre o una fuga de escape. Se separa enriqueciendo un momento la mezcla (con ayuda de un mecánico) y viendo si el sensor reacciona.",
            prueba: `Hacé la prueba guiada 'Sensor de oxígeno' (B${b}S1) a 2,500 rpm. Revisá fugas de escape antes del sensor y el conector.`,
            esperado: "Un sensor sano cambia varias veces por segundo y cubre de menos de 0.2 a más de 0.7 V. Si después de descartar fugas sigue lento, cambiá el sensor.",
            no_cambiar: "El catalizador.", donde: "casa" }));
      } else if (d && d.n >= 15 && rango > 0.4 && d.p95 - d.p5 > 0.45) {
        out.push(H(`catalizador${b === 1 ? "" : "_b" + b}`, "baja", `El catalizador parece no estar trabajando (banco ${b})`,
          "El sensor de después del catalizador oscila casi igual que el de antes. En un catalizador sano el de después se queda casi estable.",
          [`Sensor B${b}S1: ${a.p5.toFixed(2)}–${a.p95.toFixed(2)} V`, `Sensor B${b}S2: ${d.p5.toFixed(2)}–${d.p95.toFixed(2)} V`, ...p420.ev], catExtra(false)));
      }
    }
  }

  // ------------------------------------------------------------------ ralentí y fallos de encendido
  function reglaRalenti(r, cod, out, p6, ctx) {
    const rpm = r.ralenti.rpm;
    if (!rpm || rpm.n < MIN) return;
    const misfire = cod.todos().filter((c) => /^P03(0\d|1[0-2])$/.test(c)).sort();
    const referencia = "Ralentí caliente típico: 650–900 rpm, variación menor a ±20–30 rpm (sin aire acondicionado). Revisá el valor exacto en el manual de tu carro.";
    if (rpm.desv > 30) {
      const cil = (p6 && p6.misfire) || [];
      const conFallos = cil.filter((c) => Math.max(c.actual || 0, c.promedio || 0) >= 5).map((c) => c.cilindro);
      out.push(H("ralenti_inestable", "media", "Ralentí inestable (el motor tiembla)", "Las RPM en ralentí suben y bajan más de lo normal.",
        [`Variación en ralentí: ±${r0(rpm.desv)} rpm`, `Rango: ${r0(rpm.min)}–${r0(rpm.max)} rpm`, ...misfire.map((c) => `Código ${cod.texto(c)}`),
          ...(conFallos.length ? [`Contadores internos con fallos en cilindro(s) ${conFallos.join(", ")}`] : [])], {
          certeza: certeza(["vivo", misfire.some((c) => cod.confirmado(c)) || conFallos.length ? "computadora" : null]), referencia,
          condiciones: condSeg(r.ralenti, "Ralentí con motor caliente, carro detenido"),
          causas: misfire.length || conFallos.length
            ? ["Fallo de encendido en el cilindro afectado (bujía, " + (ctx.encendido === "distribuidor" ? "cable de bujía" : "bobina") + " o inyector)", "Compresión baja en ese cilindro"]
            : ["Fallo de encendido", "Entrada de aire falsa", "Cuerpo de aceleración o válvula de ralentí sucios"],
          alternativas: ["Gasolina contaminada", "EGR pegada abierta", "Soportes de motor rotos (se siente vibración, pero no cambian las RPM)"],
          distinguir: "Con datos OBD no se sabe cuál pieza del cilindro falla. Se separa intercambiando piezas entre cilindros y viendo si el fallo se muda.",
          prueba: "Leé los contadores de misfire por cilindro (prueba guiada) si tu carro los reporta, y hacé la prueba guiada 'Ralentí'.",
          esperado: "Si un cilindro concentra los fallos, la prueba de intercambio dice qué pieza es.", no_cambiar: "Todas las bujías o bobinas sin saber cuál cilindro falla.", donde: "casa" }));
    }
    if (rpm.prom > 1100) {
      out.push(H("ralenti_alto", "baja", `Ralentí alto (${r0(rpm.prom)} rpm)`, "Con el motor caliente el ralentí está más alto de lo típico.",
        [`RPM promedio en ralentí: ${r0(rpm.prom)}`], { certeza: "posibilidad", referencia, condiciones: condSeg(r.ralenti, "Ralentí con motor caliente"),
          causas: ["Entrada de aire falsa", "Válvula de ralentí (IAC) o cuerpo de aceleración", "Aire acondicionado encendido (normal que suba un poco)"],
          prueba: "Apagá el aire acondicionado y buscá fugas de vacío.", esperado: "Sin cargas y sin fugas, el ralentí baja.", donde: "casa" }));
    } else if (rpm.prom < 550) {
      out.push(H("ralenti_bajo", "baja", `Ralentí bajo (${r0(rpm.prom)} rpm)`, "Un ralentí muy bajo puede hacer que el motor se apague.",
        [`RPM promedio en ralentí: ${r0(rpm.prom)}`], { certeza: "posibilidad", referencia, causas: ["Cuerpo de aceleración sucio", "Válvula de ralentí (IAC)"], prueba: "Limpiá el cuerpo de aceleración.",
          esperado: "El ralentí vuelve a lo normal.", donde: "casa" }));
    }
  }

  /** Fallos de encendido según los códigos (sirve también en carros sin contadores del modo 06). */
  function reglaMisfireCodigos(cod, out, ctx) {
    if (out.some((h) => h.id === "misfire_cilindro")) return;
    const cil = cod.todos().filter((c) => /^P030[1-9]$|^P031[0-2]$/.test(c)).sort();
    if (!cil.length && !cod.tiene("P0300")) return;
    const piezaEnc = ctx.encendido === "distribuidor" ? "cable de bujía" : "bobina";
    const dist = ctx.encendido === "distribuidor";
    if (cil.length === 1) {
      const n = Number(cil[0].slice(3));
      out.push(H("misfire_codigo", "media", `Fallos de encendido en el cilindro ${n} (según el código)`,
        `La computadora detectó fallos de encendido en el cilindro ${n}. Si la luz de check engine parpadea, no manejés: el catalizador se puede dañar.`,
        [`Código ${cod.texto(cil[0])}`, ...(cod.tiene("P0300") ? [`Código ${cod.texto("P0300")}`] : [])], {
          certeza: cod.confirmado(cil[0]) ? "sospecha" : "posibilidad",
          urgencia: "pronto",
          causas: [`Bujía del cilindro ${n}`, `${dist ? "Cable de bujía" : "Bobina"} del cilindro ${n}`, `Inyector del cilindro ${n}`, `Compresión baja en el cilindro ${n}`],
          distinguir: `OBD dice QUÉ cilindro falla, no QUÉ pieza. Se separa intercambiando la bujía y el ${piezaEnc} del cilindro ${n} con los de otro cilindro: si el código pasa al otro cilindro, era esa pieza. Si se queda, inyector (prueba de balance o intercambio) y después compresión.` +
            (dist ? " Este motor usa distribuidor (una sola bobina para todos los cilindros): un fallo en UN solo cilindro casi nunca es la bobina." : ""),
          prueba: `Revisá la bujía del cilindro ${n} (color, desgaste, aceite). Intercambiala con la de otro cilindro, borrá el código, manejá y volvé a leer.`,
          esperado: "Si el código cambia de cilindro, la pieza que moviste es la mala.", no_cambiar: `Todas las bujías y ${dist ? "cables" : "bobinas"} juntos sin la prueba de intercambio${dist ? ", ni la bobina o el distribuidor por un fallo de un solo cilindro" : ""}.`, donde: "casa" }));
    } else {
      out.push(H("misfire_varios_codigo", "media", "Fallos de encendido en varios cilindros (según los códigos)",
        "Cuando fallan varios cilindros a la vez suele ser algo común a todos.", [...cil, ...(cod.tiene("P0300") ? ["P0300"] : [])].map((c) => `Código ${cod.texto(c)}`), {
          certeza: "sospecha", urgencia: "pronto",
          causas: ["Entrada de aire falsa o mezcla pobre", "Presión de combustible baja", "Bujías gastadas", ...(dist ? ["Tapa o rotor del distribuidor, bobina o módulo de encendido (comunes a todos los cilindros)"] : []), "EGR pegada abierta", "Gasolina contaminada"],
          distinguir: "OBD no separa estas causas. Se separan revisando la mezcla (prueba guiada), el estado de las bujías y, " + (dist ? "en motores con distribuidor, la tapa, el rotor y la chispa con un probador." : "la presión de combustible."),
          prueba: "Hacé la prueba guiada 'Mezcla' y revisá el estado de las bujías.", esperado: "Si la mezcla está pobre, corregir eso suele quitar los fallos.",
          no_cambiar: dist ? "La computadora." : "Las bobinas (rara vez fallan todas juntas).", donde: "ambos" }));
    }
  }

  // ------------------------------------------------------------------ control de mezcla (PID 03)
  function reglaLazo(h, out) {
    const calientes = h.filter((m) => encendido(m) && (m.temp_motor || 0) >= 70 && S.valorPlausible("temp_motor", m.temp_motor) && m.sistema_comb != null);
    if (calientes.length < MIN * 2) return;
    const frac = (fn) => calientes.filter(fn).length / calientes.length;
    const falla = frac((m) => m.sistema_comb & 8), conFalla = frac((m) => m.sistema_comb & 16);
    const cerrado = frac((m) => S.lazoCerrado(m.sistema_comb)), carga = frac((m) => m.sistema_comb & 4);
    const comun = { causas: ["Sensor de oxígeno o su calentador", "Sensor de temperatura del motor", "Sensor de aire (MAF o MAP)"],
      prueba: "Leé los códigos y revisá el sensor de oxígeno de adelante (conector, calentador).", esperado: "Al reparar, la computadora vuelve a 'lazo cerrado' con el motor caliente.", donde: "mecánico",
      condiciones: `Motor caliente (70 °C o más), ${calientes.length} lecturas del PID 03`, referencia: "Con el motor caliente y a velocidad constante, la computadora debería estar casi siempre en lazo cerrado." };
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

  // ------------------------------------------------------------------ códigos por sistema
  function reglaCodigosSistema(r, cod, out) {
    const grupos = [
      { id: "egr", re: /^P040[0-9]$/, titulo: "Falla en el sistema EGR (recirculación de gases)", urg: "programar",
        causas: ["Conductos de la EGR tapados con carbón", "Válvula EGR pegada", "Solenoide o sensor de la EGR", "Manguera de vacío de la EGR"],
        distinguir: "El código dice que el flujo de EGR no es el esperado; no dice si es la válvula, el conducto o el control. Se separa revisando conductos y aplicando vacío a la válvula.",
        prueba: "Un mecánico revisa los conductos (carbón) y el movimiento de la válvula.", no_cambiar: "La válvula EGR sin limpiar los conductos primero (es lo más común)." },
      { id: "inyector_circuito", re: /^P02(0[1-9]|1[0-2])$/, titulo: "Falla en el circuito de un inyector", urg: "pronto",
        causas: ["Conector del inyector suelto o sulfatado", "Cable dañado", "Inyector con la bobina abierta o en corto"],
        distinguir: "El código es eléctrico: no dice si el inyector entrega bien la gasolina. Se mide la resistencia del inyector y la continuidad del cable.",
        prueba: "Revisá el conector del inyector indicado y medí su resistencia con multímetro (compará con los otros inyectores).", no_cambiar: "Todos los inyectores." },
      { id: "bobina_circuito", re: /^P03(5[1-9]|6[0-2])$/, titulo: "Falla en el circuito de una bobina de encendido", urg: "pronto",
        causas: ["Conector de la bobina", "Cable de control", "Bobina dañada"], distinguir: "Es una falla eléctrica del circuito; se separa con multímetro o intercambiando la bobina.",
        prueba: "Revisá el conector e intercambiá la bobina con la de otro cilindro.", no_cambiar: "Todas las bobinas." },
      { id: "presion_combustible", re: /^P0(087|088|19[0-3]|230)$/, titulo: "Falla relacionada con la presión o la bomba de combustible", urg: "pronto",
        causas: ["Bomba de combustible débil", "Filtro tapado", "Regulador de presión", "Sensor de presión (si tiene)", "Relé o cableado de la bomba"],
        distinguir: "Solo una medición con manómetro separa una presión realmente baja de un sensor o un circuito que falla.",
        prueba: "Que un mecánico mida la presión y el caudal de combustible con manómetro (el sistema está presurizado: no lo abrás sin herramienta).", no_cambiar: "La bomba sin medir la presión." },
      { id: "transmision", re: /^P07\d\d$|^P17\d\d$/, titulo: "Códigos de la transmisión", urg: "pronto",
        causas: ["Nivel o estado del aceite de transmisión (ATF)", "Solenoides de cambio o de lock-up", "Sensores de velocidad de la transmisión", "Cableado y conectores de la transmisión"],
        distinguir: "El OBD genérico da pocos detalles de la transmisión. En muchos carros (por ejemplo Honda de esa época) la computadora del motor también controla la transmisión y avisa haciendo parpadear la luz D/D4; la información completa requiere el escáner de la marca.",
        prueba: "Revisá el nivel y el color/olor del aceite de transmisión según el manual. Un taller de transmisiones con escáner de la marca puede leer los detalles.", no_cambiar: "La transmisión completa por un código de solenoide o sensor." },
    ];
    for (const g of grupos) {
      const cods = cod.todos().filter((c) => g.re.test(c)).sort();
      if (!cods.length) continue;
      const conf = cods.some((c) => cod.confirmado(c));
      const ev = cods.map((c) => `Código ${cod.texto(c)}`);
      if (g.id === "egr" && r.caliente.egr_error) ev.push(`Error de la EGR (PID 2D): ${f(r.caliente.egr_error.prom, 0)}% en promedio`);
      out.push(H(g.id, "media", g.titulo, "La computadora registró un código de este sistema. El código dice qué sistema detectó la falla, no qué pieza está mala.", ev, {
        certeza: conf ? "sospecha" : "posibilidad", urgencia: g.urg, causas: g.causas, distinguir: g.distinguir, prueba: g.prueba,
        esperado: "Al reparar la causa, el código no vuelve después de varios días de manejo.", no_cambiar: g.no_cambiar, donde: "mecánico" }));
    }
  }

  function reglaComunicacion(l, r, out) {
    const us = ((l && l.codigos) || []).filter((c) => c.codigo[0] === "U");
    if (!us.length) return;
    const v = r.general.voltaje;
    out.push(H("comunicacion", "media", "Fallas de comunicación entre computadoras",
      "Una o varias computadoras dejaron de 'hablarse' por la red del carro. Muchas veces la causa es eléctrica y no la computadora.",
      [`Códigos: ${us.map((c) => c.codigo).join(", ")}`, ...(v ? [`Voltaje medido: ${v.min.toFixed(1)}–${v.max.toFixed(1)} V`] : [])], {
        certeza: "sospecha",
        causas: ["Batería baja o con picos de voltaje (al arrancar)", "Conector suelto o sulfatado del módulo mencionado", "Tierras (cables a chasis) en mal estado", "Cableado de la red dañado", "Módulo dañado (menos común)"],
        alternativas: ["Si el código es viejo y no vuelve, pudo ser una batería descargada en algún momento"],
        distinguir: "El código dice que se perdió la comunicación, no por qué. Primero se descarta lo eléctrico (batería, tierras, conectores).",
        prueba: "Primero hacé la prueba de batería. Limpiá bornes y tierras. Borrá códigos y mirá si vuelven.",
        esperado: "Si no vuelven después de arreglar la parte eléctrica, era eso. Si vuelven, revisá conector y cableado del módulo indicado.",
        no_cambiar: "Ninguna computadora sin revisar antes batería, tierras y conectores.", donde: "ambos" }));
  }

  // ------------------------------------------------------------------ modo 06
  function reglaPruebas06(p6, cod, out, ctx) {
    if (!p6 || !p6.disponible) return;
    const fallidas = (p6.fallidas || []).filter((p) => !(p.mid >= 0xa1 && p.mid <= 0xad));
    if (p6.formato === "no_can" && fallidas.length) {
      out.push(H("m06_no_can", "media", `${fallidas.length} resultado(s) de monitoreo fuera de límite (modo 06)`,
        "La computadora del carro hizo estas pruebas y el resultado quedó fuera de su propio límite. En este protocolo cada fabricante define qué mide cada prueba: ScanIA muestra los números originales, pero no puede decir a qué componente corresponde sin la información de servicio del fabricante.",
        fallidas.map((p) => `${p.nombre}: valor ${p.valor}, ${p.prueba} (datos originales: ${p.crudo})`), {
          certeza: "sospecha", causas: ["El componente que esa prueba vigila (definido por el fabricante)"],
          distinguir: "Sin la tabla del fabricante no se sabe qué sistema es. La información de servicio de la marca (o un escáner de la marca) da el significado de cada TID/CID.",
          prueba: "Repetí la lectura después de manejar 20–30 minutos. Buscá en la información de servicio de tu carro el significado de ese número de prueba.",
          esperado: "Si sigue fallando, esa parte del sistema tiene un problema real aunque todavía no haya código.", no_cambiar: "Ninguna pieza solo por este resultado.", donde: "mecánico" }));
    } else {
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
    }
    const cil = (p6.misfire || []).map((c) => ({ n: c.cilindro, v: Math.max(c.actual || 0, c.promedio || 0) }));
    if (!cil.length) return;
    const orden = [...cil].sort((a, b) => b.v - a.v);
    const total = cil.reduce((a, c) => a + c.v, 0);
    const ev = [cil.map((c) => `cil ${c.n}: ${c.v}`).join(" · ")];
    const dist = ctx.encendido === "distribuidor";
    const referencia = "Contadores del modo 06 (TID 0B: promedio de 10 ciclos; 0C: último ciclo). Unos pocos fallos pueden ser normales; lo importante es un cilindro con muchos más que los demás.";
    if (orden[0].v >= 5 && orden[0].v >= 2 * Math.max(1, orden[1] ? orden[1].v : 0)) {
      const n = orden[0].n, codCil = `P03${String(n).padStart(2, "0")}`;
      out.push(H("misfire_cilindro", "media", `Fallos de encendido en el cilindro ${n}`,
        `La computadora contó ${orden[0].v} fallos en el cilindro ${n}, mucho más que en los demás.`, [...ev, ...(cod.tiene(codCil) ? [`Código ${cod.texto(codCil)}`] : [])], {
          // El código y los contadores salen del mismo monitor: cuentan como UNA fuente. Se confirma con el ralentí inestable (dato independiente).
          certeza: certeza(["computadora", out.some((h) => h.id === "ralenti_inestable") ? "vivo" : null]), referencia, urgencia: "pronto",
          causas: [`Bujía del cilindro ${n}`, `${dist ? "Cable de bujía" : "Bobina"} del cilindro ${n}`, `Inyector del cilindro ${n}`, `Compresión baja en el cilindro ${n}`],
          alternativas: ["Conector o cable de la " + (dist ? "bujía" : "bobina"), "Fuga de vacío cerca de ese cilindro"],
          distinguir: "OBD dice qué cilindro falla, no qué pieza. Se separa intercambiando piezas con otro cilindro y viendo si los fallos se mudan." + (dist ? " Con distribuidor, la bobina es común a todos: no explica un solo cilindro." : ""),
          prueba: `Intercambiá la ${dist ? "bujía y el cable" : "bobina"} del cilindro ${n} con la de otro cilindro, manejá unos minutos y repetí la prueba guiada de fallos por cilindro.`,
          esperado: "Si los fallos se mudan al otro cilindro, es la pieza que moviste. Si se quedan, revisá bujía, luego inyector y por último la compresión.",
          no_cambiar: `Todas las ${dist ? "bujías y cables" : "bobinas o bujías"} a la vez sin confirmar.`, donde: "casa" }));
    } else if (total >= 10) {
      out.push(H("misfire_varios", "media", "Fallos de encendido repartidos en varios cilindros", "Cuando fallan varios cilindros a la vez suele ser algo común a todos.", ev, {
        certeza: "sospecha", referencia, causas: ["Entrada de aire falsa", "Presión de combustible baja", "Bujías gastadas", "EGR pegada abierta", "Gasolina contaminada"],
        distinguir: "OBD no separa estas causas; la prueba de mezcla y el estado de las bujías orientan.",
        prueba: "Revisá la mezcla (prueba guiada) y el estado de las bujías.", esperado: "Si la mezcla está pobre, corregir eso suele quitar los fallos.",
        no_cambiar: "Las bobinas (rara vez fallan todas juntas).", donde: "ambos" }));
    } else if (total > 0) {
      out.push(H("misfire_pocos", "info", "La computadora registró pocos fallos de encendido", "Unos pocos fallos son normales en muchos motores.", ev, { referencia }));
    } else {
      out.push(H("misfire_cero", "info", "Cero fallos de encendido por cilindro", "Ningún cilindro registra fallos en los contadores internos de la computadora.", ev));
    }
  }

  // ------------------------------------------------------------------ lectura (monitores, freeze frame, permanentes, avisos)
  function reglaLectura(l, out) {
    if (!l) return;
    const estado = l.estado || {}, codigos = l.codigos || [], extras = l.extras || {};
    const inc = (estado.monitores || []).filter((m) => !m.completo).map((m) => m.nombre_es);
    if (inc.length) {
      const ev = [`Sin completar: ${inc.join(", ")}`];
      if (extras.km_desde_borrado != null) ev.push(`Km desde que se borraron los códigos: ${r0(extras.km_desde_borrado)}`);
      if (extras.calentamientos_desde_borrado != null) ev.push(`Calentamientos desde el borrado: ${extras.calentamientos_desde_borrado}`);
      out.push(H("monitores_incompletos", "info", `${inc.length} monitor(es) de autodiagnóstico sin completar`,
        "Esto pasa cuando se borran los códigos, se desconecta la batería o el carro casi no se ha manejado. Algunos monitores (como el EVAP) tardan mucho o necesitan condiciones especiales, sobre todo en carros viejos. " +
        "Si estás comprando el carro, preguntá por qué (borrar códigos antes de vender es un truco conocido, aunque también hay razones normales).", ev));
    } else if (extras.km_desde_borrado != null && extras.km_desde_borrado < 50 && !codigos.length) {
      out.push(H("borrado_reciente", "info", "Los códigos se borraron hace muy poco", "Si estás revisando un carro para comprarlo, preguntá por qué.", [`Km desde el borrado: ${r0(extras.km_desde_borrado)}`]));
    }
    if (estado.mil && !codigos.length) {
      out.push(H("mil_sin_codigos", "info", "Check engine encendido pero sin códigos leídos",
        "Puede que la falla esté en otra computadora que el OBD2 genérico no lee, o que el adaptador no pudo leer los códigos. Intentá otra vez con el motor apagado y la llave en ON."));
    }
    for (const a of l.avisos || []) out.push(H("aviso_lectura", "info", "Aviso de la lectura", a));
    const perm = codigos.filter((c) => c.tipo === "permanente" || (c.tambien || []).includes("permanente")).map((c) => c.codigo);
    if (perm.length) out.push(H("codigos_permanentes", "info", "Hay códigos permanentes",
      "No se borran con el escáner. Se borran solos cuando el carro comprueba varias veces que la falla ya se reparó.", [perm.join(", ")]));
    const pend = codigos.filter((c) => c.tipo === "pendiente" && !(c.tambien || []).length).map((c) => c.codigo);
    if (pend.length) out.push(H("codigos_pendientes", "info", "Hay códigos pendientes",
      "La computadora detectó la falla una vez, pero todavía no la confirma (no enciende la luz). Si se repite en el próximo ciclo de manejo, pasa a confirmado.", [pend.join(", ")]));
    const ff = l.freeze_frame;
    if (ff && ff.datos) {
      const d = ff.datos, partes = [], momento = [];
      if (d.rpm != null) partes.push(`${r0(d.rpm)} rpm`);
      if (d.velocidad != null) partes.push(`${r0(d.velocidad)} km/h`);
      if (d.temp_motor != null) partes.push(`motor a ${r0(d.temp_motor)} °C`);
      if (d.carga != null) partes.push(`carga ${r0(d.carga)}%`);
      if (d.map != null) partes.push(`MAP ${r0(d.map)} kPa`);
      if (d.stft1 != null && d.ltft1 != null) partes.push(`ajuste de combustible total ${f(d.stft1 + d.ltft1, 0)}%`);
      if ((d.velocidad ?? 1) === 0 && (d.rpm ?? 9999) < 1100) momento.push("en ralentí (carro detenido)");
      else if ((d.velocidad ?? 0) > 0) momento.push("manejando");
      if ((d.temp_motor ?? 90) < CALIENTE && (d.temp_motor ?? 90) > -30) momento.push("con el motor frío");
      out.push(H("freeze_frame", "info", `Cómo estaba el carro cuando saltó ${ff.codigo}`,
        "El freeze frame es una 'foto' de los sensores en el momento exacto de la falla. " + (momento.length ? `La falla ocurrió ${momento.join(" y ")}. ` : "") +
        "Reproducir esas condiciones sirve para confirmar la reparación.", partes.length ? [partes.join(", ")] : []));
    }
  }

  // ------------------------------------------------------------------ síntomas
  S.SINTOMAS = [
    { id: "tiembla", texto: "Tiembla en ralentí", relacion: /ralenti_inestable|misfire|vacio_bajo|fuga_vacio/, pruebas: ["ralenti", "misfire", "mezcla"],
      fuera: "Si los datos no muestran fallos ni RPM inestables, la vibración puede venir de soportes de motor rotos o accesorios (no se ve por OBD)." },
    { id: "check_parpadea", texto: "La luz check engine PARPADEA", relacion: /misfire|ralenti_inestable/, pruebas: ["misfire"], urgente: true,
      fuera: "Una luz que parpadea indica fallos de encendido fuertes que pueden dañar el catalizador: no manejés hasta revisarlo." },
    { id: "falta_fuerza", texto: "Le falta fuerza al acelerar", relacion: /pobre|maf_bajo|misfire|catalizador|vacio_bajo|presion_combustible|egr/, pruebas: ["mezcla", "maf_map"],
      fuera: "Fuera del OBD: escape tapado (prueba de vacío o contrapresión), frenos pegados, transmisión que patina." },
    { id: "cuesta_arrancar", texto: "Le cuesta arrancar", relacion: /bateria|alternador|ect_|presion_combustible|dato_imposible/, pruebas: ["bateria", "arranque", "sensores"],
      fuera: "Fuera del OBD: presión de combustible que se pierde con el carro apagado (manómetro), motor de arranque, compresión." },
    { id: "se_apaga", texto: "Se apaga solo", relacion: /ralenti_bajo|ralenti_inestable|alternador|vacio_bajo/, pruebas: ["ralenti", "alternador"],
      fuera: "Fuera del OBD: válvula de ralentí sucia, relé principal o de la bomba de combustible con falso contacto." },
    { id: "consume_mucho", texto: "Gasta más gasolina", relacion: /rica|termostato|o2_lento|lazo|dato_imposible/, pruebas: ["mezcla", "calentamiento", "o2"],
      fuera: "Fuera del OBD: llantas bajas, frenos pegados, forma de manejar." },
    { id: "olor_gasolina", texto: "Huele a gasolina", relacion: /rica/, pruebas: ["mezcla"], urgente: true,
      fuera: "Un olor fuerte a gasolina puede ser una FUGA de combustible: riesgo de incendio. No manejés y revisá mangueras y conexiones con el motor apagado." },
    { id: "humo_negro", texto: "Sale humo negro", relacion: /rica/, pruebas: ["mezcla"], fuera: "Humo negro = gasolina sin quemar (mezcla rica)." },
    { id: "humo_blanco", texto: "Sale humo blanco espeso (que no se va al calentar)", relacion: /sobrecalentamiento|temperatura_alta/, pruebas: ["refrigeracion"], urgente: true,
      fuera: "Humo blanco espeso y dulce puede ser refrigerante quemándose (empaque de culata). El OBD no lo ve: un mecánico hace la prueba de gases en el refrigerante." },
    { id: "humo_azul", texto: "Sale humo azul", relacion: null, pruebas: [], fuera: "Humo azul = aceite quemándose (anillos, guías de válvula, PCV). No se ve por OBD; un mecánico hace prueba de compresión y fugas." },
    { id: "se_calienta", texto: "Se calienta (la aguja sube)", relacion: /sobrecalentamiento|temperatura_alta|ect_/, pruebas: ["refrigeracion", "calentamiento"], urgente: true,
      fuera: "Revisá nivel de refrigerante con el motor frío, fugas y que el electroventilador encienda." },
    { id: "luz_bateria", texto: "Se enciende la luz de la batería", relacion: /alternador|bateria|sobrevoltaje/, pruebas: ["alternador", "caida_voltaje"],
      fuera: "Revisá la faja del alternador y los bornes. La luz de carga la controla el alternador, no la computadora del motor en muchos carros." },
    { id: "cambios_bruscos", texto: "La transmisión cambia brusco o parpadea la luz D/D4", relacion: /transmision/, pruebas: [],
      fuera: "Revisá nivel y estado del aceite de transmisión. En Honda de esa época la luz D4 parpadeando indica una falla de transmisión guardada en la computadora; el detalle completo se lee con el escáner de la marca o con el procedimiento de destellos del manual." },
    { id: "ruido_motor", texto: "Ruido raro en el motor", relacion: null, pruebas: [], fuera: "Los ruidos mecánicos (válvulas, faja, bomba, rodamientos) no se ven por OBD: revisión física." },
    { id: "vibra_velocidad", texto: "Vibra a cierta velocidad", relacion: null, pruebas: [], fuera: "Vibración que depende de la velocidad: llantas, balanceo, rótulas, flechas/cardanes. No es OBD." },
  ];
  function reglaSintomas(sintomas, out, r) {
    if (!sintomas || !sintomas.length) return;
    const problemas = out.filter((h) => ["alta", "media", "baja"].includes(h.gravedad));
    const nombresPrueba = Object.fromEntries((S.PRUEBAS_GUIADAS || []).map((p) => [p.id, p.titulo]));
    for (const id of sintomas) {
      const s = S.SINTOMAS.find((x) => x.id === id);
      if (!s) continue;
      const rel = s.relacion ? problemas.filter((h) => s.relacion.test(h.id)) : [];
      const pruebas = s.pruebas.map((p) => nombresPrueba[p]).filter(Boolean);
      const detalle = rel.length
        ? `Los datos muestran algo que puede explicarlo: ${rel.map((h) => h.titulo).join("; ")}. Que coincidan no prueba que sea la causa: confirmalo con la prueba indicada en ese hallazgo.`
        : r.muestras ? "Los datos OBD de esta sesión no muestran algo que lo explique." : "Todavía no hay datos en vivo para relacionarlo.";
      out.push(H("sintoma_" + s.id, s.urgente ? "media" : "info", `Síntoma: ${s.texto}`, `${detalle} ${s.fuera}`,
        pruebas.length ? [`Pruebas guiadas útiles: ${pruebas.join(", ")}`] : [],
        s.urgente ? { urgencia: s.id === "check_parpadea" || s.id === "olor_gasolina" || s.id === "humo_blanco" ? "detener" : "pronto", certeza: "posibilidad" } : {}));
    }
  }

  function reglaPocosDatos(r, out) {
    const cal = r.caliente.rpm;
    if (!r.muestras) out.push(H("sin_datos", "info", "Todavía no hay datos en vivo", "Conectate al carro y esperá unos segundos para que se acumulen datos."));
    else if (!r.motor_encendido && !r.muestras_encendido) out.push(H("motor_apagado", "info", "El motor está apagado", "Con la llave en ON se pueden leer y borrar códigos, pero para analizar los datos en vivo hay que encender el motor."));
    else if (!cal || cal.n < MIN) out.push(H("pocos_datos", "info", "Faltan datos con el motor caliente", "Dejá el motor encendido hasta que esté caliente. Si podés, mantenelo unos 20 segundos a 2,000–2,500 rpm (estacionado) para comparar con el ralentí."));
  }

  /**
   * Corre todas las reglas.
   * extra: { pruebas06, cilindrada, sintomas: [ids], perfil: {encendido}, fuenteVoltaje }
   */
  S.analizar = function (historial, lectura, extra = {}) {
    const r = S.resumir(historial || [], { cilindrada: extra.cilindrada });
    const cod = indiceCodigos(lectura);
    const ctx = { encendido: extra.perfil && extra.perfil.encendido, fuenteVoltaje: extra.fuenteVoltaje };
    const out = [];
    if (r.muestras) {
      reglaDatosImposibles(r, historial, cod, out);
      reglaTemperatura(r, cod, out);
      reglaTemperaturasExtra(r, out);
      reglaLazo(historial, out);
      reglaMezcla(r, cod, out, ctx);
      reglaMAF(r, cod, out);
      reglaMAP(r, cod, out);
      reglaVoltaje(r, out, ctx);
      reglaOxigeno(r, cod, out);
      reglaRalenti(r, cod, out, extra.pruebas06, ctx);
    }
    reglaComunicacion(lectura, r, out);
    reglaPruebas06(extra.pruebas06, cod, out, ctx);
    reglaMisfireCodigos(cod, out, ctx);
    reglaCodigosSistema(r, cod, out);
    reglaLectura(lectura, out);
    reglaPocosDatos(r, out);
    reglaSintomas(extra.sintomas, out, r);
    // Reglas de otros módulos (por ejemplo, la causa común eléctrica). Una regla extra nunca rompe el análisis.
    for (const regla of S.REGLAS_EXTRA || []) { try { regla({ resumen: r, codigos: cod, lectura, extra, H, certeza }, out); } catch (e) { /* se ignora */ } }
    const problemas = out.filter((h) => ["alta", "media", "baja"].includes(h.gravedad));
    const s06 = out.find((h) => h.id === "misfire_cero");
    if (s06 && problemas.length) out.splice(out.indexOf(s06), 1);
    const cal = r.muestras ? r.caliente.rpm : null;
    if (!problemas.length && !cod.size && cal && cal.n >= MIN * 3) {
      out.push(H("todo_bien", "ok", "Los datos en vivo se ven normales",
        "Mezcla, temperatura, voltaje, sensores de oxígeno y ralentí están dentro de lo normal en las condiciones medidas. Si el carro tiene un síntoma (ruido, vibración, frenos), puede ser algo que el OBD2 no mide: marcalo en los síntomas."));
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
    const base = ["rpm", "velocidad", "carga", "temp_motor", "sistema_comb", "stft1", "ltft1", "stft2", "ltft2", "maf", "map", "voltaje"];
    const o2 = [...new Set(h.flatMap((m) => Object.keys(m).filter((k) => ES_O2.test(k))))].sort();
    const claves = [...base, ...o2].filter((c) => h.some((m) => m[c] != null));
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
    const L = [`Muestras: ${r.muestras} en ${r0(r.duracion_s)} s (${r.hz ?? "?"} lecturas por segundo). Motor ${r.motor_encendido ? "encendido" : "apagado"}. ` +
      `Medición de aire: ${r.medicion || "desconocida"}.`, "Dato | actual | mín | prom | máx"];
    for (const [c, s] of Object.entries(r.general)) {
      const m = S.META[c] || { nombre: c, unidad: "" };
      L.push(`${m.nombre} (${m.unidad}) | ${s.actual.toFixed(2)} | ${s.min.toFixed(2)} | ${s.prom.toFixed(2)} | ${s.max.toFixed(2)}`);
    }
    if (r.voltaje_encendido) L.push(`Voltaje con motor encendido: prom ${r.voltaje_encendido.prom.toFixed(2)} V (n=${r.voltaje_encendido.n})`);
    if (r.voltaje_apagado) L.push(`Voltaje con motor apagado y llave en ON: prom ${r.voltaje_apagado.prom.toFixed(2)} V (n=${r.voltaje_apagado.n})`);
    const inv = Object.entries(r.invalidos || {});
    if (inv.length) L.push("Datos fuera de rango físico (no usados): " + inv.map(([k, v]) => `${k}: ${v.n} lecturas (${v.valores.join(", ")})`).join("; "));
    for (const [seg, titulo] of [["ralenti", "En ralentí (lazo cerrado, detenido)"], ["rpm_altas", "A 1800-3500 rpm con carga (lazo cerrado)"]]) {
      const d = r[seg] || {}, partes = [];
      for (const [c, s] of Object.entries(d)) partes.push(`${c}: prom ${s.prom.toFixed(2)}, desv ${s.desv.toFixed(2)}, p5-p95 ${s.p5.toFixed(2)}–${s.p95.toFixed(2)} (n=${s.n})`);
      if (partes.length) L.push(`${titulo}: ${partes.join("; ")}`);
    }
    if (r.cilindrada) L.push(`(ve = eficiencia volumétrica calculada con MAF, MAP, temperatura de admisión y cilindrada ${r.cilindrada} L)`);
    return L.join("\n");
  };
})(typeof window !== "undefined" ? window : globalThis);
