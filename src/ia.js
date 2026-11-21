/* ScanIA · diagnóstico con IA (Claude), llamado directo desde el navegador */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  S.ErrorIA = class ErrorIA extends Error { constructor(m) { super(m); this.name = "ErrorIA"; } };

  S.MODELOS = [
    { id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5 (rápido y económico)" },
    { id: "claude-opus-5-5", nombre: "Claude Opus 5.5 (razona más fino, cuesta más)" },
  ];

  S.PROMPT_SISTEMA = `Sos un técnico automotriz con más de 20 años de experiencia en diagnóstico electrónico (nivel ASE Master Technician), trabajando en Centroamérica. Ayudás a una familia a encontrar la causa REAL de una falla de sus carros usando datos de un escáner OBD2 (adaptador ELM327).

Principios:
1. Confirmar antes de cambiar piezas. Proponé primero las pruebas más baratas y simples que confirmen o descarten cada causa.
2. Trabajá con la evidencia que te mandan: códigos (confirmados, pendientes, permanentes y de qué computadora vienen), freeze frame, datos en vivo y sus curvas, pruebas internas de la computadora (modo 06), pruebas guiadas, hallazgos del motor de reglas local, historial de mantenimiento, síntomas y fotos. Explicá qué dato apoya cada causa y qué dato la contradice.
3. NO inventes mediciones, valores ni resultados que no están en los datos. NO uses porcentajes de probabilidad. Usá niveles de confianza razonados (alta / media / baja) y explicá en qué evidencia se basa cada uno.
4. Distinguí siempre: "confirmado" (dos o más evidencias independientes coinciden, por ejemplo código + patrón en datos en vivo + prueba), "sospecha" (una evidencia clara) y "posibilidad" (indicio débil o solo conocimiento general).
5. Si los datos no alcanzan para concluir, decilo claramente y pedí lo que falta (qué prueba hacer o qué dato leer).
6. El motor de reglas local ya analizó los datos: sus hallazgos son evidencia, pero si no estás de acuerdo con alguno explicá por qué.
7. Un código dice qué sistema detectó la falla, no qué pieza está mala. Señalá las piezas que la gente cambia por error.
8. Fallas conocidas del modelo: si tenés la herramienta de búsqueda web, buscá (en inglés y español) fallas típicas, boletines técnicos (TSB) y campañas de ese modelo/motor/año relacionadas con los códigos o síntomas, y citá de dónde salen. Sin búsqueda, presentalo como conocimiento general (posibilidad), no como certeza. Interpretá los códigos del fabricante (P1xxx, etc.) según la marca y aclaralo.
9. Contexto local: clima caliente y húmedo, calles en mal estado, gasolina de calidad variable, repuestos genéricos o usados comunes, y dueños con herramientas básicas. Preferí pruebas con herramientas sencillas (multímetro, agua jabonosa, humo de incienso, intercambiar piezas entre cilindros).
10. Seguridad: si hay riesgo (sobrecalentamiento, presión de aceite baja, olor a gasolina, misfire fuerte con check engine parpadeando, frenos), decí claramente que no maneje. No pidas usar el teléfono mientras se maneja. Las pruebas con riesgo (piezas en movimiento, alto voltaje, sistema de combustible presurizado, bolsas de aire) derivalas a un mecánico.
11. Limitaciones: un ELM327 lee cada dato cada 0.2–2 segundos (no ve señales rápidas) y el OBD2 genérico casi solo ve motor, emisiones y a veces transmisión (no ABS, bolsas de aire, carrocería).
12. Lenguaje sencillo, español centroamericano (el voseo está bien), directo. Explicá los términos técnicos la primera vez.

FORMATO DE TU PRIMERA RESPUESTA: después de buscar (si buscás), tu texto final debe ser únicamente un objeto JSON válido, sin texto antes ni después y sin bloques de código:
{
  "resumen": "2 a 4 frases sencillas: qué está pasando y qué es lo más probable",
  "datos_suficientes": true,
  "que_falta": "si los datos no alcanzan, qué falta para concluir (o cadena vacía)",
  "urgencia": {"nivel": "detener | pronto | programar | monitorear", "puede_manejar": true, "explicacion": "por qué"},
  "problemas": [
    {
      "problema": "nombre corto del problema",
      "estado": "confirmado | sospecha | posibilidad",
      "evidencias": ["dato observado que lo respalda", "..."],
      "causas": [{"causa": "...", "confianza": "alta | media | baja", "por_que": "evidencia a favor", "en_contra": "evidencia en contra o cadena vacía"}],
      "alternativas": ["otras causas menos probables que todavía no se descartan"],
      "prueba": {"descripcion": "la prueba para confirmar", "resultado_esperado": "si ves X entonces..., si ves Y entonces...", "herramientas": ["..."], "donde": "casa | mecánico", "riesgo": "bajo | medio | alto"},
      "no_reemplazar": "pieza que NO se debe cambiar todavía y por qué"
    }
  ],
  "siguiente_paso": "la prueba más útil para hacer ahora mismo",
  "descartado": [{"causa": "...", "por_que": "qué dato la descarta"}],
  "datos_a_vigilar": ["qué dato en vivo mirar y qué valor esperar"],
  "preguntas": ["pregunta para el dueño que ayudaría a afinar el diagnóstico"],
  "fallas_conocidas": ["falla típica o boletín técnico de este modelo que aplique (o lista vacía)"],
  "nota_seguridad": "advertencia importante o cadena vacía"
}
Reglas del JSON: de 1 a 4 problemas, ordenados del más urgente/probable al menos; cada problema con 1 a 5 causas ordenadas; máximo 4 preguntas.

MENSAJES DE SEGUIMIENTO (después de la primera respuesta): respondé en texto normal (NO JSON), breve y práctico (máximo unas 250 palabras), con listas cortas si ayuda. Si el usuario reporta el resultado de una prueba: decí qué causas quedan descartadas y por qué, cuál es la siguiente prueba y, si ya está confirmado, qué reparar exactamente. Si te mandan "datos actualizados", usalos y no inventes otros.`;

  function lineaVehiculo(v) {
    const partes = [];
    for (const [k, n] of [["apodo", "Carro"], ["marca", "Marca"], ["modelo", "Modelo"], ["anio", "Año"], ["motor", "Motor"], ["codigo_motor", "Código de motor"],
      ["cilindrada", "Cilindrada (L)"], ["cilindros", "Cilindros"], ["combustible", "Combustible"], ["transmision", "Transmisión"], ["traccion", "Tracción"],
      ["km", "Kilometraje"], ["vin", "VIN"]]) {
      if (k === "vin" && !(v && v._compartirVIN)) continue;
      const val = String((v || {})[k] || "").trim();
      if (val) partes.push(`${n}: ${val}`);
    }
    return partes.length ? partes.join(" | ") : "No especificado";
  }

  S.construirContexto = function (o) {
    const { vehiculo, sintomas, info, lectura, resumenTexto, hallazgos, series, pruebas06, guiadas, mantenimiento } = o;
    const s = ["# Vehículo", lineaVehiculo(vehiculo)];
    if (vehiculo && vehiculo.notas) s.push(`Notas del dueño: ${vehiculo.notas}`);
    if (info) {
      if (info.tipo === "simulador") s.push("NOTA: estos datos vienen de un SIMULADOR de prueba, no de un carro real.");
      if (info.vin && vehiculo && vehiculo._compartirVIN) s.push(`VIN leído de la computadora: ${info.vin}`);
      if (info.protocolo) s.push(`Protocolo OBD: ${info.protocolo}`);
      if (info.computadora) s.push(`Computadora: ${info.computadora}`);
      if (info.calibracion) s.push(`ID de calibración (software): ${info.calibracion}`);
    }
    if (mantenimiento && mantenimiento.length) {
      s.push("\n# Mantenimientos registrados por el dueño");
      for (const m of mantenimiento.slice(0, 15)) s.push(`- ${m.fecha_texto || ""} ${m.km ? m.km + " km" : ""}: ${m.tipo}${m.nota ? " (" + m.nota + ")" : ""}`);
    }
    s.push("\n# Síntomas que describe el dueño", String(sintomas || "").trim() || "No describió síntomas.");
    const estado = (lectura && lectura.estado) || null;
    s.push("\n# Luz check engine y monitores");
    if (estado) {
      const mil = estado.mil;
      s.push(`Check engine encendido: ${mil ? "sí" : mil === false ? "no" : "desconocido"}. Códigos confirmados según la computadora: ${estado.num_dtc ?? "?"}. Tipo de motor: ${estado.encendido || "?"}` +
        (estado.computadoras ? `. Computadoras que respondieron: ${estado.computadoras.join(", ")}` : ""));
      const mon = estado.monitores || [];
      if (mon.length) {
        const inc = mon.filter((m) => !m.completo).map((m) => m.nombre_es);
        s.push(`Monitores completos: ${mon.length - inc.length}/${mon.length}` + (inc.length ? `. Incompletos: ${inc.join(", ")}` : ""));
      }
    } else s.push("No se leyó el estado (no se presionó 'Leer códigos').");
    s.push("\n# Códigos de falla");
    const cods = (lectura && lectura.codigos) || [];
    if (cods.length) {
      for (const c of cods) {
        s.push(`- ${c.codigo} [${[c.tipo, ...(c.tambien || [])].join(", ")}]${(c.modulos || []).length ? " (" + c.modulos.join(", ") + ")" : ""} ${c.descripcion} (gravedad ${c.gravedad}${c.de_fabricante ? ", código del fabricante" : ""})`);
      }
    } else s.push(lectura ? "Ninguno." : "No se leyeron.");
    const ff = lectura && lectura.freeze_frame;
    if (ff) s.push(`\n# Freeze frame (foto de los sensores cuando saltó ${ff.codigo})`, Object.entries(ff.datos || {}).map(([k, v]) => `${k}=${v}`).join(", ") || "sin datos");
    const extras = (lectura && lectura.extras) || {};
    if (Object.keys(extras).length) s.push("\n# Otros datos", Object.entries(extras).map(([k, v]) => `${(S.NOMBRES_EXTRAS && S.NOMBRES_EXTRAS[k]) || k}: ${v}`).join("; "));
    if (pruebas06 && pruebas06.disponible) {
      s.push("\n# Pruebas internas de la computadora (modo 06)");
      if ((pruebas06.misfire || []).length) s.push("Fallos de encendido por cilindro (promedio 10 ciclos / ciclo actual): " + pruebas06.misfire.map((c) => `cil ${c.cilindro}: ${c.promedio ?? "?"}/${c.actual ?? "?"}`).join(", "));
      const fall = pruebas06.fallidas || [];
      s.push(fall.length ? "Pruebas FALLIDAS: " + fall.map((p) => `${p.nombre} – ${p.prueba}: ${p.valor} ${p.unidad} (límite ${p.min}–${p.max})`).join("; ") : `Todas las ${pruebas06.pruebas.length} pruebas dentro de sus límites.`);
    } else if (pruebas06 && pruebas06.motivo) s.push("\n# Pruebas internas (modo 06)", pruebas06.motivo);
    if (guiadas && guiadas.length) {
      s.push("\n# Pruebas guiadas que hizo el dueño con la app");
      for (const g of guiadas) s.push(`- ${g.titulo}: ${g.veredicto.toUpperCase()} — ${g.resumen}` + (g.valores ? ` (${g.valores.join("; ")})` : ""));
    }
    s.push("\n# Datos en vivo (resumen estadístico)", resumenTexto || "Sin datos en vivo.");
    if (series) s.push("\n# Curvas de datos en el tiempo (CSV, muestreado)", series);
    s.push("\n# Hallazgos del análisis automático local (reglas)");
    if (hallazgos && hallazgos.length) {
      for (const h of hallazgos) s.push(`- [${h.gravedad}] ${h.titulo}` + ((h.evidencia || []).length ? ` — ${h.evidencia.join("; ")}` : ""));
    } else s.push("Ninguno.");
    return s.join("\n");
  };

  const HERRAMIENTA_BUSQUEDA = { type: "web_search_20250305", name: "web_search", max_uses: 4,
    user_location: { type: "approximate", country: "HN", timezone: "America/Tegucigalpa" } };

  /** Ajustes de conexión con el servidor de IA propio (la clave de Anthropic NUNCA está en la app). */
  function servidorDe(conexion) {
    const url = String((conexion && conexion.servidor) || "").trim().replace(/\/+$/, "");
    if (!url) throw new S.ErrorIA("Falta configurar el servidor de IA. Tocá ⚙ Ajustes → Servidor de IA (instrucciones en servidor/LEEME.md).");
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) throw new S.ErrorIA("La dirección del servidor de IA debe empezar con https://");
    if (!conexion.codigo) throw new S.ErrorIA("Falta el código familiar del servidor de IA (⚙ Ajustes).");
    return url;
  }

  async function pedir(conexion, ruta, cuerpo) {
    const url = servidorDe(conexion);
    let resp;
    try {
      resp = await fetch(url + ruta, {
        method: "POST",
        headers: { "content-type": "application/json", "x-codigo-familiar": conexion.codigo },
        body: JSON.stringify(cuerpo || {}),
      });
    } catch (e) {
      throw new S.ErrorIA("No se pudo llegar al servidor de IA (¿hay internet? ¿la dirección está bien?). El escáner y el análisis local siguen funcionando sin internet.");
    }
    let datos = {};
    try { datos = await resp.json(); } catch (e) { /* sin cuerpo */ }
    if (!resp.ok) {
      const original = (datos && datos.error && datos.error.message) || "";
      const msg = original.toLowerCase();
      const err = (m) => { const e = new S.ErrorIA(m); e.status = resp.status; e.detalle = msg; return e; };
      if (resp.status === 401 && msg.includes("código familiar")) throw err("El código familiar no coincide con el del servidor. Revisalo en ⚙ Ajustes.");
      if (resp.status === 401) throw err("El servidor de IA tiene una clave de Anthropic inválida. Revisá ANTHROPIC_API_KEY en Cloudflare.");
      if (resp.status === 403 && msg.includes("autorizado")) throw err("Este sitio no está autorizado en el servidor de IA. Agregá su dirección en ORIGENES (Cloudflare).");
      if (resp.status === 403) throw err("La cuenta de Anthropic no tiene permiso para usar este modelo. Probá con otro modelo en ⚙ Ajustes.");
      if (resp.status === 404) throw err(`El modelo '${cuerpo.model}' no existe o el servidor no tiene esa ruta. Revisá ⚙ Ajustes.`);
      if (resp.status === 413) throw err("La consulta es demasiado grande. Mandá menos fotos.");
      if (resp.status === 429) throw err(original || "Se alcanzó el límite de consultas. Esperá un momento.");
      if (resp.status === 400 && msg.includes("credit")) throw err("La cuenta de Anthropic no tiene saldo. Recargá en console.anthropic.com.");
      if (resp.status === 529 || resp.status >= 500) throw err(original || "La IA está ocupada en este momento. Intentá de nuevo en un minuto.");
      throw err(`La IA respondió con un error (${resp.status}). ${original}`.trim());
    }
    return datos;
  }

  /** Comprueba que el servidor responde y que el código familiar es correcto (no gasta IA). */
  S.probarServidor = async function (conexion) { await pedir(conexion, "/v1/probar", {}); return true; };

  /**
   * Llama a Claude. Con buscar=true le da la herramienta de búsqueda web (fallas conocidas, boletines).
   * Devuelve { texto, fuentes: [{titulo, url}], busquedas }.
   */
  async function llamar({ conexion, modelo, mensajes, maxTokens, buscar, sistema }) {
    const cuerpo = { model: modelo, max_tokens: maxTokens, system: sistema || S.PROMPT_SISTEMA, messages: mensajes.slice() };
    if (buscar) cuerpo.tools = [HERRAMIENTA_BUSQUEDA];
    const bloques = [];
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      let datos;
      try {
        datos = await pedir(conexion, "/v1/mensajes", cuerpo);
      } catch (e) {
        // Si la búsqueda web no está disponible para esta cuenta/modelo, se intenta sin ella
        if (cuerpo.tools && e.status === 400 && /tool|web_search|search/.test(e.detalle || "")) { delete cuerpo.tools; vuelta--; continue; }
        // Si el servidor dejó pasar un error de cuerpo por la búsqueda, se reintenta sin ella una vez
        throw e;
      }
      bloques.push(...(datos.content || []));
      if (datos.stop_reason !== "pause_turn") break;
      // La búsqueda tardó: se manda lo que va y se pide que siga
      cuerpo.messages = [...mensajes, { role: "assistant", content: bloques.slice() }];
    }
    const textos = bloques.filter((b) => b.type === "text");
    // El texto final es lo que viene después de la última búsqueda
    let ultimo = -1;
    bloques.forEach((b, i) => { if (b.type === "web_search_tool_result" || b.type === "server_tool_use") ultimo = i; });
    const finales = bloques.slice(ultimo + 1).filter((b) => b.type === "text");
    const texto = (finales.length ? finales : textos).map((b) => b.text).join("").trim();
    if (!texto) throw new S.ErrorIA("La IA no devolvió respuesta. Intentá de nuevo.");
    const fuentes = [];
    for (const b of bloques) {
      for (const c of b.citations || []) if (c.url && !fuentes.some((f) => f.url === c.url)) fuentes.push({ titulo: c.title || c.url, url: c.url });
    }
    if (!fuentes.length) {
      for (const b of bloques) if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content.slice(0, 3)) if (r.url && !fuentes.some((f) => f.url === r.url)) fuentes.push({ titulo: r.title || r.url, url: r.url });
      }
    }
    return { texto, fuentes: fuentes.slice(0, 10), busquedas: bloques.filter((b) => b.type === "server_tool_use").length };
  }
  S.llamarIA = llamar;

  const comoLista = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const txt = (v) => (v == null ? "" : String(v));

  const nivelConf = (v) => { const t = txt(v).toLowerCase(); return ["alta", "media", "baja"].includes(t) ? t : "media"; };
  const estadoProb = (v) => { const t = txt(v).toLowerCase(); return t.startsWith("confirm") ? "confirmado" : t.startsWith("posib") ? "posibilidad" : "sospecha"; };

  S.interpretarJson = function (texto) {
    const limpio = texto.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const i = limpio.indexOf("{"), j = limpio.lastIndexOf("}");
    let d = null;
    if (i !== -1 && j > i) { try { d = JSON.parse(limpio.slice(i, j + 1)); } catch (e) { d = null; } }
    const vacio = { resumen: texto, datos_suficientes: null, que_falta: "", urgencia: { nivel: "programar", puede_manejar: null, explicacion: "" }, problemas: [],
      siguiente_paso: "", descartado: [], no_cambiar_todavia: [], datos_a_vigilar: [], preguntas: [], fallas_conocidas: [], nota_seguridad: "", formato_libre: true };
    if (!d || typeof d !== "object" || Array.isArray(d)) return vacio;
    const u = d.urgencia && typeof d.urgencia === "object" ? d.urgencia : {};
    let nivel = txt(u.nivel || "programar").toLowerCase().trim();
    if (!["detener", "pronto", "programar", "monitorear"].includes(nivel)) nivel = "programar";
    let problemas = comoLista(d.problemas).filter((p) => p && typeof p === "object").map((p) => {
      const pr = p.prueba && typeof p.prueba === "object" ? p.prueba : { descripcion: txt(p.prueba) };
      return {
        problema: txt(p.problema).trim(), estado: estadoProb(p.estado), evidencias: comoLista(p.evidencias).map(txt).filter(Boolean),
        causas: comoLista(p.causas).map((c) => (typeof c === "object" && c ? c : { causa: txt(c) })).map((c) => ({
          causa: txt(c.causa).trim(), confianza: nivelConf(c.confianza), por_que: txt(c.por_que), en_contra: txt(c.en_contra) })).filter((c) => c.causa),
        alternativas: comoLista(p.alternativas).map(txt).filter(Boolean),
        prueba: { descripcion: txt(pr.descripcion), resultado_esperado: txt(pr.resultado_esperado), herramientas: comoLista(pr.herramientas).map(txt),
          donde: txt(pr.donde), riesgo: txt(pr.riesgo) },
        no_reemplazar: txt(p.no_reemplazar),
      };
    }).filter((p) => p.problema);
    // Compatibilidad con diagnósticos viejos (causas con porcentaje)
    if (!problemas.length && Array.isArray(d.causas_probables) && d.causas_probables.length) {
      problemas = [{ problema: "Causas analizadas", estado: "sospecha", evidencias: [], alternativas: [], no_reemplazar: "",
        prueba: { descripcion: "", resultado_esperado: "", herramientas: [], donde: "", riesgo: "" },
        causas: d.causas_probables.map((c) => ({ causa: txt(c.causa), confianza: c.probabilidad >= 50 ? "alta" : c.probabilidad >= 25 ? "media" : "baja", por_que: txt(c.por_que), en_contra: txt(c.en_contra) })) }];
    }
    return {
      resumen: txt(d.resumen), datos_suficientes: d.datos_suficientes ?? null, que_falta: txt(d.que_falta),
      urgencia: { nivel, puede_manejar: u.puede_manejar ?? null, explicacion: txt(u.explicacion) },
      problemas, siguiente_paso: txt(d.siguiente_paso),
      descartado: comoLista(d.descartado).map((x) => (typeof x === "object" && x ? { causa: txt(x.causa), por_que: txt(x.por_que) } : { causa: txt(x), por_que: "" })).filter((x) => x.causa),
      pruebas: comoLista(d.pruebas).filter((p) => p && typeof p === "object").map((p) => ({ titulo: txt(p.titulo), pasos: comoLista(p.pasos).map(txt), como_interpretar: txt(p.como_interpretar) })),
      no_cambiar_todavia: comoLista(d.no_cambiar_todavia).map(txt).filter(Boolean),
      datos_a_vigilar: comoLista(d.datos_a_vigilar).map(txt).filter(Boolean), preguntas: comoLista(d.preguntas).map(txt).filter(Boolean),
      fallas_conocidas: comoLista(d.fallas_conocidas).map(txt).filter(Boolean), nota_seguridad: txt(d.nota_seguridad),
    };
  };

  /** Arma el contenido de un mensaje con texto y fotos (base64 JPEG). */
  function contenido(texto, imagenes) {
    if (!imagenes || !imagenes.length) return texto;
    return [{ type: "text", text: texto }, ...imagenes.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }))];
  }
  /** Versión del historial sin fotos (para guardar en el teléfono sin llenar la memoria). */
  S.sinFotos = (mensajes) => mensajes.map((m) => (Array.isArray(m.content)
    ? { role: m.role, content: m.content.map((b) => (b.type === "image" ? { type: "text", text: "[foto adjunta]" } : b)).filter((b) => b.type === "text").map((b) => b.text).join("\n") }
    : m));

  S.diagnosticar = async function ({ conexion, modelo, contexto, imagenes, buscar }) {
    const mensajes = [{ role: "user", content: contenido(contexto + (imagenes && imagenes.length ? `\n\nTe mando ${imagenes.length} foto(s).` : "") + "\n\nHacé el diagnóstico.", imagenes) }];
    const r = await llamar({ conexion, modelo, mensajes, maxTokens: buscar ? 7000 : 5000, buscar });
    mensajes.push({ role: "assistant", content: r.texto });
    return { diagnostico: { ...S.interpretarJson(r.texto), fuentes: r.fuentes }, mensajes };
  };

  S.seguimiento = async function ({ conexion, modelo, mensajes, pregunta, datosActualizados, imagenes, buscar }) {
    pregunta = String(pregunta || "").trim();
    if (!pregunta && !(imagenes && imagenes.length)) throw new S.ErrorIA("Escribí un mensaje.");
    if (!mensajes || !mensajes.length) throw new S.ErrorIA("Primero hacé un diagnóstico.");
    let texto = pregunta || "Mirá esta foto.";
    if (datosActualizados) texto += "\n\n--- Datos actualizados del escáner ---\n" + datosActualizados;
    const nuevos = [...mensajes, { role: "user", content: contenido(texto, imagenes) }];
    const r = await llamar({ conexion, modelo, mensajes: nuevos, maxTokens: 2000, buscar });
    nuevos.push({ role: "assistant", content: r.texto });
    return { respuesta: r.texto, fuentes: r.fuentes, mensajes: nuevos };
  };

  /** Pregunta rápida sobre un código (sin conectar el carro). */
  S.consultarCodigo = async function ({ conexion, modelo, codigo, vehiculo, buscar }) {
    const d = S.describir(codigo);
    const texto = `Explicame el código ${d.codigo} (${d.descripcion}) para este carro: ${lineaVehiculo(vehiculo)}.\n` +
      "Respondé en texto normal (NO JSON), corto y práctico: qué significa, causas más comunes en ese modelo ordenadas de más a menos probable, " +
      "pruebas sencillas para confirmar, si se puede manejar, y qué piezas NO cambiar todavía.";
    const sistema = S.PROMPT_SISTEMA.split("FORMATO DE TU PRIMERA RESPUESTA")[0] + "Respondé siempre en texto normal (NO JSON), con listas cortas.";
    const r = await llamar({ conexion, modelo, mensajes: [{ role: "user", content: texto }], maxTokens: 1800, buscar, sistema });
    return { respuesta: r.texto, fuentes: r.fuentes };
  };
})(typeof window !== "undefined" ? window : globalThis);
