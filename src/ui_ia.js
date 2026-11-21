/* ScanIA · interfaz: diagnóstico con IA (a través del servidor propio), seguimiento, fotos y dictado */
(function () {
  "use strict";
  const S = window.ScanIA, U = S.ui, E = U.estado, $ = U.$, $$ = U.$$, esc = U.esc;
  const URGENCIA = {
    detener: ["Detené el carro", "alta"], pronto: ["Revisar pronto", "media"], programar: ["Programar revisión", "baja"], monitorear: ["Solo vigilar", "ok"],
  };
  const ESTADO_P = { confirmado: ["Confirmado", "confirmada"], sospecha: ["Sospecha", "sospecha"], posibilidad: ["Posibilidad", "posibilidad"] };
  const CONF = { alta: "alta-c", media: "media-c", baja: "baja-c" };

  let fotos = [];          // base64 JPEG (sin el prefijo data:)
  let actual = null;       // { id, mensajes }

  const conexionIA = () => ({ servidor: E.ajustes.servidor, codigo: E.ajustes.codigo });

  // ================================================================== fotos
  /** Achica la foto a 1280 px y la convierte a JPEG (menos datos, misma utilidad). */
  U.fotoABase64 = function (archivo, lado = 1280) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(archivo), img = new Image();
      img.onload = () => {
        const k = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.82).split(",")[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("No se pudo abrir la foto.")); };
      img.src = url;
    });
  };
  function dibujarFotos() {
    $("#miniaturas").innerHTML = fotos.map((f, i) => `<div><img src="data:image/jpeg;base64,${f}" alt="foto ${i + 1}"><button data-quitar="${i}" title="Quitar">×</button></div>`).join("");
    $$("[data-quitar]").forEach((b) => b.addEventListener("click", () => { fotos.splice(Number(b.dataset.quitar), 1); dibujarFotos(); }));
  }
  async function agregarFotos(lista) {
    for (const f of Array.from(lista)) {
      if (fotos.length >= 4) { U.toast("Máximo 4 fotos."); break; }
      try { fotos.push(await U.fotoABase64(f)); } catch (e) { U.toast(e.message, "error"); }
    }
    dibujarFotos();
  }

  // ================================================================== dictado
  function prepararDictado() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return;
    $$("[data-mic]").forEach((b) => {
      b.classList.remove("oculto");
      b.title = "Dictar (usa el reconocimiento de voz del navegador)";
      let rec = null;
      b.addEventListener("click", () => {
        if (rec) { rec.stop(); return; }
        rec = new Rec();
        rec.lang = "es-HN"; rec.interimResults = false; rec.continuous = false;
        const campo = $("#" + b.dataset.mic);
        b.classList.add("grabando");
        rec.onresult = (ev) => { const t = Array.from(ev.results).map((r) => r[0].transcript).join(" "); campo.value = (campo.value ? campo.value.trim() + " " : "") + t; };
        rec.onerror = (ev) => { if (ev.error !== "no-speech" && ev.error !== "aborted") U.toast("No se pudo dictar: " + ev.error); };
        rec.onend = () => { b.classList.remove("grabando"); rec = null; };
        try { rec.start(); } catch (e) { b.classList.remove("grabando"); rec = null; }
      });
    });
  }

  // ================================================================== contexto
  function mantenimientoTexto(c) {
    return ((c && c.mantenimientos) || []).map((m) => ({ ...m, fecha_texto: U.fechaDia(m.fecha) }));
  }
  function armarContexto() {
    const a = U.analizarAhora();
    const c = U.carro();
    return {
      analisis: a,
      texto: S.construirContexto({
        vehiculo: U.vehiculoParaIA(), sintomas: $("#sintomas").value, info: E.fuente ? E.fuente.info() : null, lectura: E.lectura,
        perfil: U.perfil(), calidad: U.calidadDatos(a.resumen),
        sintomasMarcados: E.sintomas.map((id) => (S.SINTOMAS.find((x) => x.id === id) || {}).texto).filter(Boolean),
        resumenTexto: S.resumenTexto(a.resumen), hallazgos: a.hallazgos.filter((h) => h.id !== "todo_bien"), series: S.seriesTexto(E.historial),
        pruebas06: E.pruebas06, guiadas: Object.values(E.guiadas), mantenimiento: E.fuente && E.fuente.esSimulador ? [] : mantenimientoTexto(c),
      }),
    };
  }

  // ================================================================== diagnóstico
  async function diagnosticar() {
    const b = $("#btn-ia"), estado = $("#ia-estado");
    if (!E.lectura && !E.historial.length && !$("#sintomas").value.trim() && !fotos.length) {
      estado.textContent = "Conectate al carro, describí los síntomas o agregá una foto primero."; return;
    }
    U.cargando(b, true, "Analizando…");
    estado.textContent = $("#ia-buscar").checked ? "La IA está analizando y buscando fallas conocidas (hasta 1–2 minutos)…" : "La IA está analizando los datos (20–60 s)…";
    try {
      const ctx = armarContexto();
      const { diagnostico, mensajes } = await S.diagnosticar({ conexion: conexionIA(), modelo: E.ajustes.modelo, contexto: ctx.texto, imagenes: fotos, buscar: $("#ia-buscar").checked });
      // Se revisa la respuesta contra los datos reales (códigos leídos, sensores que el carro reporta)
      diagnostico.verificacion = S.verificarRespuestaIA(diagnostico, { codigos: E.lectura ? (E.lectura.codigos || []).map((c) => c.codigo) : null, pids: E.fuente ? E.fuente.pidsDisponibles() : null });
      const c = U.carro();
      const simulado = !!(E.fuente && E.fuente.esSimulador);
      const id = S.almacen.guardarDiagnostico({
        carroId: c && !simulado ? c.id : null, vehiculo: U.vehiculoParaIA(), sintomas: $("#sintomas").value, simulado,
        codigos: ((E.lectura && E.lectura.codigos) || []).map((x) => x.codigo), hallazgos: ctx.analisis.hallazgos.map((h) => ({ titulo: h.titulo, gravedad: h.gravedad, certeza: h.certeza })),
        diagnostico, mensajes: S.sinFotos(mensajes), chat: [], fotos: fotos.length,
      });
      actual = { id, mensajes };
      mostrarDiagnostico(diagnostico);
      $("#chat-mensajes").innerHTML = "";
      $("#chat").classList.remove("oculto");
      sugerencias(diagnostico);
      fotos = []; dibujarFotos();
      estado.textContent = "Diagnóstico guardado en el historial.";
    } catch (e) {
      estado.textContent = "";
      $("#resultado-ia").innerHTML = `<div class="mensaje error">${esc(e.message || String(e))}</div>
        <p class="nota">El análisis local (en Escanear) sigue funcionando sin IA ni internet.</p>`;
    } finally { U.cargando(b, false); }
  }

  /** HTML de un diagnóstico de la IA (se usa también en el historial y los reportes). */
  U.htmlDiagnostico = function (d) {
    if (!d) return "";
    if (d.formato_libre) return `<div class="resultado-ia">${U.md(d.resumen)}</div>`;
    const nivel = URGENCIA[d.urgencia.nivel] ? d.urgencia.nivel : "programar", u = URGENCIA[nivel];
    let h = `<div class="resultado-ia">
      <div class="urgencia ${nivel}"><span class="nivel">${esc(u[0])}</span>${d.urgencia.puede_manejar === false ? " · No conviene manejarlo" : d.urgencia.puede_manejar === true ? " · Se puede manejar con cuidado" : ""}
        ${d.urgencia.explicacion ? `<p>${U.t(d.urgencia.explicacion)}</p>` : ""}</div>
      <p class="resumen-ia">${U.t(d.resumen)}</p>`;
    if ((d.verificacion || []).length) h += `<div class="advertencia"><b>Revisión de ScanIA a esta respuesta:</b><ul>${d.verificacion.map((x) => `<li>${U.t(x)}</li>`).join("")}</ul></div>`;
    else if (d.incompleta) h += `<div class="advertencia">La respuesta de la IA llegó cortada.</div>`;
    if ((d.evidencias_clave || []).length) h += `<div class="bloque"><b>Evidencias que usó</b><ul>${d.evidencias_clave.map((x) => `<li>${U.t(x)}</li>`).join("")}</ul></div>`;
    if (d.datos_suficientes === false || d.que_falta) h += `<div class="bloque"><b>Datos que faltan para estar seguros</b>${U.t(d.que_falta || "La IA indicó que los datos no alcanzan.")}</div>`;
    if (d.siguiente_paso) h += `<div class="siguiente"><b>Primer paso recomendado:</b> ${U.t(d.siguiente_paso)}</div>`;
    for (const p of d.problemas) {
      const e = ESTADO_P[p.estado] || ESTADO_P.sospecha;
      h += `<div class="problema-ia"><div class="titulo"><span>${U.t(p.problema)}</span><span class="chip ${e[1]}">${e[0]}</span></div>
        ${p.evidencias.length ? `<ul class="evid">${p.evidencias.map((x) => `<li>${U.t(x)}</li>`).join("")}</ul>` : ""}
        ${p.causas.map((c) => `<div class="causa-ia"><div><b>${U.t(c.causa)}</b> <span class="chip ${CONF[c.confianza] || ""}">confianza ${esc(c.confianza)}</span></div>
          ${c.por_que ? `<div class="nota">A favor: ${U.t(c.por_que)}</div>` : ""}${c.en_contra ? `<div class="nota">En contra: ${U.t(c.en_contra)}</div>` : ""}</div>`).join("")}
        ${p.alternativas.length ? `<div class="bloque"><b>Otras posibilidades</b><ul>${p.alternativas.map((x) => `<li>${U.t(x)}</li>`).join("")}</ul></div>` : ""}
        ${p.prueba.descripcion ? `<div class="bloque"><b>Cómo confirmarlo${p.prueba.donde ? ` (${esc(p.prueba.donde)})` : ""}${p.prueba.riesgo ? ` · riesgo ${esc(p.prueba.riesgo)}` : ""}</b>${U.t(p.prueba.descripcion)}
          ${p.prueba.resultado_esperado ? `<div class="nota">Resultado esperado: ${U.t(p.prueba.resultado_esperado)}</div>` : ""}
          ${p.prueba.herramientas.length ? `<div class="nota">Herramientas: ${p.prueba.herramientas.map(U.t).join(", ")}</div>` : ""}</div>` : ""}
        ${p.no_reemplazar ? `<div class="bloque no-cambiar"><b>No cambiés todavía</b>${U.t(p.no_reemplazar)}</div>` : ""}
      </div>`;
    }
    for (const pr of d.pruebas || []) h += `<div class="bloque"><b>${U.t(pr.titulo)}</b><ol>${pr.pasos.map((x) => `<li>${U.t(x)}</li>`).join("")}</ol>${pr.como_interpretar ? `<div class="nota">${U.t(pr.como_interpretar)}</div>` : ""}</div>`;
    const lista = (t, l, cl = "") => (l && l.length ? `<div class="bloque ${cl}"><b>${t}</b><ul>${l.map((x) => `<li>${U.t(typeof x === "object" ? x.causa + (x.por_que ? " — " + x.por_que : "") : x)}</li>`).join("")}</ul></div>` : "");
    h += lista("Descartado", d.descartado) + lista("No cambiés todavía", d.no_cambiar_todavia, "no-cambiar") + lista("Datos a vigilar", d.datos_a_vigilar) +
      lista("Fallas conocidas de este modelo", d.fallas_conocidas) + lista("Preguntas para afinar el diagnóstico", d.preguntas);
    h += lista("Limitaciones de este diagnóstico", d.limitaciones);
    if (d.nota_seguridad) h += `<div class="advertencia">${U.t(d.nota_seguridad)}</div>`;
    const fuentes = (d.fuentes || []).filter((f) => /^https?:\/\//i.test(f.url || ""));
    if (fuentes.length) h += `<div class="fuentes"><b>Fuentes consultadas</b><ul>${fuentes.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo || f.url)}</a></li>`).join("")}</ul></div>`;
    h += `<p class="nota">La IA ayuda a interpretar; no reemplaza la revisión de un mecánico. Confirmá antes de cambiar piezas.</p></div>`;
    return h;
  };

  function mostrarDiagnostico(d) { $("#resultado-ia").innerHTML = U.htmlDiagnostico(d); }

  function sugerencias(d) {
    const s = [...((d && d.preguntas) || []).slice(0, 2), "¿Qué pruebo primero en casa?", "¿Cuánto me puede costar más o menos?", "¿Es seguro manejarlo así?"];
    $("#sugerencias").innerHTML = s.map((x) => `<button type="button" class="chip-btn">${esc(x)}</button>`).join("");
    $$("#sugerencias .chip-btn").forEach((b) => b.addEventListener("click", () => { $("#chat-texto").value = b.textContent; $("#chat-texto").focus(); }));
  }

  function burbuja(rol, texto, fuentes) {
    const div = document.createElement("div");
    div.className = "burbuja " + (rol === "user" ? "usuario" : "ia");
    div.innerHTML = (rol === "user" ? `<p>${U.t(texto)}</p>` : U.md(texto)) +
      (fuentes && fuentes.length ? `<div class="fuentes">${fuentes.filter((f) => /^https?:\/\//i.test(f.url || "")).map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo || f.url)}</a>`).join(" · ")}</div>` : "");
    $("#chat-mensajes").appendChild(div);
    div.scrollIntoView({ block: "nearest" });
    return div;
  }

  let fotoChat = null;
  async function enviarChat(ev) {
    ev.preventDefault();
    if (!actual) return;
    const campo = $("#chat-texto"), pregunta = campo.value.trim();
    if (!pregunta && !fotoChat) return;
    const boton = $("#chat-form button[type=submit]");
    burbuja("user", pregunta + (fotoChat ? " [foto]" : ""));
    campo.value = "";
    const espera = burbuja("assistant", "Pensando…");
    espera.classList.add("pensando");
    U.cargando(boton, true, "…");
    try {
      let datosActualizados = "";
      if (E.conectado) {
        const a = U.analizarAhora();
        datosActualizados = S.resumenTexto(a.resumen) + "\n" + (E.lectura ? "Códigos: " + ((E.lectura.codigos || []).map((c) => c.codigo).join(", ") || "ninguno") : "") +
          (Object.keys(E.guiadas).length ? "\nPruebas guiadas: " + Object.values(E.guiadas).map((g) => `${g.titulo}: ${g.veredicto}`).join("; ") : "");
      }
      const r = await S.seguimiento({ conexion: conexionIA(), modelo: E.ajustes.modelo, mensajes: actual.mensajes, pregunta, datosActualizados,
        imagenes: fotoChat ? [fotoChat] : [], buscar: $("#ia-buscar").checked });
      espera.remove();
      burbuja("assistant", r.respuesta, r.fuentes);
      actual.mensajes = r.mensajes;
      const item = S.almacen.obtener(actual.id);
      if (item) S.almacen.actualizarDiagnostico(actual.id, { mensajes: S.sinFotos(r.mensajes), chat: [...(item.chat || []), { rol: "user", texto: pregunta }, { rol: "assistant", texto: r.respuesta, fuentes: r.fuentes }] });
    } catch (e) {
      espera.innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`;
    } finally { fotoChat = null; U.cargando(boton, false); }
  }

  /** Abre un diagnóstico guardado para verlo y seguir conversando. */
  U.abrirDiagnostico = function (id) {
    const d = S.almacen.obtener(id);
    if (!d) return;
    actual = { id, mensajes: d.mensajes || [] };
    $("#sintomas").value = d.sintomas || "";
    mostrarDiagnostico(d.diagnostico);
    $("#chat-mensajes").innerHTML = "";
    for (const m of d.chat || []) burbuja(m.rol, m.texto, m.fuentes);
    $("#chat").classList.toggle("oculto", !actual.mensajes.length);
    sugerencias(d.diagnostico);
    $("#ia-estado").textContent = `Diagnóstico del ${U.fecha(d.fecha)}${d.simulado ? " (simulador)" : ""}.`;
    U.ir("ia");
  };

  function dibujarCarro() {
    const c = U.carro();
    const sim = E.fuente && E.fuente.esSimulador;
    $("#ia-carro").innerHTML = sim ? `<p class="nota">Conectado al <b>simulador</b>: la IA sabrá que los datos no son de un carro real.</p>` :
      c ? `<p><b>${esc(c.apodo || `${c.marca || ""} ${c.modelo || ""}`)}</b> · ${esc([c.anio, c.motor, c.cilindrada && c.cilindrada + " L", c.transmision, c.km && U.kmTexto(c)].filter(Boolean).join(" · "))}
          ${E.ajustes.compartirVIN ? "" : `<span class="nota"> · el VIN no se envía (Ajustes → Privacidad)</span>`}</p>` :
      `<p class="nota">Elegí o agregá el carro en <a href="#carros">Carros</a>: con marca, modelo, año y motor el diagnóstico es mucho más preciso.</p>`;
    const listo = E.ajustes.servidor && E.ajustes.codigo;
    $("#btn-ia").disabled = !listo;
    if (!listo) $("#ia-estado").innerHTML = `Configurá el servidor de IA en <a href="#" id="ia-ajustes">⚙ Ajustes</a>. Sin IA, el análisis local sigue funcionando.`;
    const l = $("#ia-ajustes"); if (l) l.onclick = (e) => { e.preventDefault(); U.abrirAjustes(); };
  }
  U.dibujarCarroIA = dibujarCarro;

  U.on("init", () => {
    $("#ia-buscar").checked = !!E.ajustes.buscarWeb;
    $("#fotos").addEventListener("change", (e) => { agregarFotos(e.target.files); e.target.value = ""; });
    $("#chat-foto").addEventListener("change", async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      try { fotoChat = await U.fotoABase64(f); U.toast("Foto lista: se manda con tu próximo mensaje."); } catch (x) { U.toast(x.message, "error"); }
    });
    $("#btn-ia").addEventListener("click", diagnosticar);
    $("#btn-ver-envio").addEventListener("click", () => {
      const t = armarContexto().texto;
      U.modal(`<h2>Esto es lo que se manda a la IA</h2><p class="nota">${E.ajustes.compartirVIN ? "Incluye el VIN (lo permitiste en Ajustes)." : "No incluye el VIN ni el apodo del carro."} Las fotos que agregués también se envían.</p>
        <pre class="registro">${esc(t)}</pre><div class="acciones"><button class="btn" id="ve-cerrar">Cerrar</button></div>`, () => { $("#ve-cerrar").onclick = U.cerrarModal; });
    });
    $("#chat-form").addEventListener("submit", enviarChat);
    prepararDictado();
    dibujarCarro();
  });
  U.on("carro", dibujarCarro);
  U.on("conexion", dibujarCarro);
  U.on("ajustes", dibujarCarro);
})();
