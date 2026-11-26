/* ScanIA · interfaz: conexión, datos en vivo, códigos, diagnóstico local y modo tablero */
(function () {
  "use strict";
  const S = window.ScanIA, U = S.ui, E = U.estado, $ = U.$, $$ = U.$$, esc = U.esc;

  const PROGRESO = { adaptador: "Adaptador listo. Buscando la computadora del carro…", buscando: "Buscando el protocolo del carro (puede tardar hasta 20 s)…", carro: "Carro encontrado. Leyendo qué sensores tiene…" };

  // ================================================================== conexión
  async function conectar(tipo, boton, reusar) {
    if (E.conectado) await desconectar(true);
    U.mensaje($("#msg-conexion"), "");
    let transporte;
    try {
      if (reusar) transporte = reusar;
      else if (tipo === "simulador") transporte = new S.TransporteVirtual($("#sel-escenario").value, { perfil: $("#sel-perfil-sim").value });
      else if (tipo === "ble") transporte = await S.TransporteBLE.elegir();
      else transporte = await S.TransporteSerial.elegir(Number(E.ajustes.baud) || 38400);
    } catch (e) { U.mensaje($("#msg-conexion"), e.message, "error"); return; }
    const fuente = new S.ELM327(transporte);
    E.registroFuente = fuente;
    fuente.alProgreso = (etapa) => { U.mensaje($("#msg-conexion"), PROGRESO[etapa] || ""); pill(etapa === "carro" ? "Leyendo el carro…" : "Conectando con el adaptador…", "espera"); };
    U.cargando(boton, true, "Conectando…");
    pill("Conectando con el adaptador…", "espera");
    try {
      await fuente.conectar();
      E.fuente = fuente;
      E.historial = []; E.lectura = null; E.pruebas06 = null;
      E.ultimaConexion = { tipo, transporte };
      ponerConectado(true);
      U.mensaje($("#msg-conexion"), "Conectado al carro. Haciendo la revisión completa…", "ok");
      iniciarMonitor();
      enlazarVIN();
      await revisionCompleta();
      U.mensaje($("#msg-conexion"), "Conectado al carro.", "ok");
      pedirPantalla();
    } catch (e) {
      U.mensaje($("#msg-conexion"), e.message || String(e), "error");
      pill("Desconectado", "");
      if (!E.fuente) { try { await fuente.desconectar(); } catch (x) { /* nada */ } }
      if (E.ultimaConexion === null && tipo !== "simulador") E.ultimaConexion = { tipo, transporte };
      actualizarReconectar();
    } finally {
      U.cargando(boton, false);
      U.emit("conexion");
      if (tipo === "serial") dibujarRecordados();
    }
  }

  async function desconectar(silencioso) {
    E.token++;
    const f = E.fuente;
    E.fuente = null;
    ponerConectado(false);
    if (f) { try { await f.desconectar(); } catch (e) { /* nada */ } }
    soltarPantalla();
    if (!silencioso) U.mensaje($("#msg-conexion"), "Desconectado.");
    U.emit("conexion");
  }

  function conexionPerdida(motivo) {
    E.token++;
    const f = E.fuente;
    E.fuente = null;
    ponerConectado(false);
    pill("Conexión perdida", "error");
    U.mensaje($("#msg-conexion"), (motivo || "Se perdió la conexión con el adaptador.") + " Tocá Reconectar.", "error");
    U.toast("Se perdió la conexión con el adaptador.", "error");
    if (f) f.desconectar().catch(() => {});
    soltarPantalla();
    actualizarReconectar();
    U.emit("conexion");
  }

  function pill(texto, clase) {
    const p = $("#pill-conexion");
    p.className = "estado-conexion " + (clase || "");
    $("#texto-conexion").textContent = texto;
  }

  function ponerConectado(on) {
    E.conectado = on;
    for (const id of ["#btn-desconectar", "#btn-leer", "#btn-borrar", "#btn-revision", "#btn-modo06", "#btn-usado"]) { const b = $(id); if (b) b.disabled = !on; }
    $("#tarjeta-conexion").classList.toggle("conectado", on);
    const sim = on && E.fuente && E.fuente.esSimulador;
    $("#banda-sim").classList.toggle("oculto", !sim);
    if (on) {
      const info = E.fuente.info();
      pill(sim ? `Simulador · ${info.escenario_nombre}` : `Carro conectado · ${info.protocolo}`, sim ? "on sim" : "on");
      mostrarInfo(info);
    } else {
      pill("Desconectado", "");
      $("#vivo-estado").textContent = "Sin conexión";
      $("#tiles").innerHTML = `<div class="vacio">Conectate al carro (o al simulador) para ver los datos en vivo.</div>`;
      E.tilesDe = "";
    }
    actualizarReconectar();
  }

  function actualizarReconectar() {
    $("#btn-reconectar").classList.toggle("oculto", E.conectado || !E.ultimaConexion);
  }

  function mostrarInfo(info) {
    const filas = [["Conexión", info.puerto], ["Protocolo", info.protocolo + (info.es_can === false ? " (no CAN)" : "")], ["Adaptador", info.elm],
      ["VIN", info.vin || "no disponible (común antes de ~2005)"], ["Computadora", info.computadora], ["Calibración", info.calibracion],
      ["Medición de aire", info.medicion_aire === "MAP" ? "sensor MAP (sin MAF)" : info.medicion_aire], ["Datos en vivo", `${(info.pids || []).length} datos`],
      ["Sensores de oxígeno", info.sensores_o2 != null ? `${info.sensores_o2} (mapa PID ${info.mapa_o2})` : "según los PIDs soportados"],
      ["Lectura rápida", info.lectura_rapida ? "sí (varios datos por consulta)" : "no (uno por uno)"], ["Encabezados CAN", info.es_can === false ? "no aplica" : info.encabezados ? "sí" : "no"]];
    const p = U.perfil();
    const contraste = p && !(E.fuente && E.fuente.esSimulador) ? S.contrastarPerfil(p, info) : [];
    $("#info-obd").innerHTML = filas.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") +
      (p ? `<dt>Perfil</dt><dd>${esc(p.nombre)}${contraste.length ? `<div class="aviso">${contraste.map(esc).join("<br>")}</div>` : ""}</dd>` : "");
  }

  /** Si el VIN que leyó la computadora coincide con un carro guardado, se elige ese carro. */
  function enlazarVIN() {
    const vin = E.fuente && E.fuente.info().vin;
    if (!vin || E.fuente.esSimulador) return;
    const c = S.almacen.carroPorVIN(vin);
    if (c) { S.almacen.elegirCarro(c.id); U.emit("carro"); U.toast(`Carro reconocido por el VIN: ${c.apodo || c.marca + " " + c.modelo}`, "ok"); }
    else if (!U.carro()) U.toast("Carro nuevo. Podés guardarlo en Carros con el VIN que se leyó.");
  }

  // ================================================================== pantalla encendida
  async function pedirPantalla() {
    if (!E.ajustes.pantalla || !("wakeLock" in navigator) || E.wakeLock) return;
    try { E.wakeLock = await navigator.wakeLock.request("screen"); E.wakeLock.addEventListener("release", () => { E.wakeLock = null; }); } catch (e) { /* no permitido */ }
  }
  function soltarPantalla() { if (E.wakeLock) { E.wakeLock.release().catch(() => {}); E.wakeLock = null; } }
  U.pedirPantalla = pedirPantalla; U.soltarPantalla = soltarPantalla;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && E.conectado) pedirPantalla(); });

  // ================================================================== datos en vivo
  function iniciarMonitor() {
    const token = ++E.token;
    (async () => {
      let errores = 0;
      while (E.token === token && E.fuente) {
        const t0 = performance.now();
        if (E.pausado) { await U.esperar(150); continue; }
        try {
          const m = await E.fuente.muestra();
          if (E.token !== token) return;
          E.historial.push(m);
          if (E.historial.length > 7200) E.historial.shift();
          errores = 0;
          dibujarTiles();
          if (!$("#tablero").classList.contains("oculto")) actualizarTablero(m);
        } catch (e) {
          if (E.token !== token) return;
          if (U.esErrorConexion(e) || ++errores >= 5) { conexionPerdida(e.message); return; }
        }
        const intervalo = E.fuente && E.fuente.esSimulador ? 1000 : 100;
        await U.esperar(Math.max(0, intervalo - (performance.now() - t0)));
      }
    })();
  }

  function nivelValor(clave, v, u) {
    if (v == null) return "";
    const enc = (u.rpm || 0) > 400;
    switch (clave) {
      case "temp_motor": return v >= 106 ? "bad" : v >= 101 ? "warn" : enc && v < 60 ? "warn" : "";
      case "voltaje": if (enc) return v < 12.4 || v > 15.2 ? "bad" : v < 13.0 || v > 14.9 ? "warn" : ""; return v < 12.0 ? "bad" : v < 12.3 ? "warn" : "";
      case "stft1": case "stft2": case "ltft1": case "ltft2": return Math.abs(v) >= 20 ? "bad" : Math.abs(v) >= 10 ? "warn" : "";
      case "temp_aceite": return v >= 130 ? "bad" : v >= 120 ? "warn" : "";
      case "combustible": return v < 10 ? "warn" : "";
      case "rpm": return v > 6000 ? "bad" : "";
      case "sistema_comb": return v & 8 ? "bad" : v & 16 ? "warn" : "";
      default: return "";
    }
  }
  /** Valor con las unidades elegidas: {texto, unidad} */
  U.valorDato = function (clave, v) {
    const m = S.META[clave] || { dec: 1, unidad: "" };
    if (m.texto) return { texto: m.texto(v), unidad: "" };
    if (v == null) return { texto: "—", unidad: m.unidad };
    const c = S.convertir(v, m.unidad, E.ajustes.unidades);
    let t = Number(c.valor).toFixed(m.dec);
    if (/^-0(\.0+)?$/.test(t)) t = t.slice(1);
    return { texto: t, unidad: c.unidad };
  };

  function crearTiles(claves) {
    $("#tiles").innerHTML = claves.map((c) => {
      const m = S.META[c] || { nombre: c };
      return `<div class="tile" data-clave="${esc(c)}" title="Tocá para ver la gráfica"><div class="nombre">${esc(m.nombre)}</div>
        <div class="valor${m.texto ? " texto" : ""}"><span class="num">—</span><span class="unidad"></span></div><canvas></canvas><div class="meta-dato"></div></div>`;
    }).join("");
    $$("#tiles .tile").forEach((t) => t.addEventListener("click", () => graficaGrande(t.dataset.clave)));
    E.tilesDe = claves.join(",");
  }

  function dibujarLinea(canvas, valores, color, opciones = {}) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const datos = valores.filter((v) => v != null);
    if (datos.length < 2) return;
    let min = Math.min(...datos), max = Math.max(...datos);
    if (max - min < 1e-6) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12; min -= pad; max += pad;
    const ejes = opciones.ejes ? 34 : 0;
    if (opciones.ejes) {
      ctx.fillStyle = "#8b93a7"; ctx.font = "11px system-ui";
      ctx.fillText(opciones.formato(max - pad), 2, 12); ctx.fillText(opciones.formato(min + pad), 2, h - 4);
      ctx.strokeStyle = "#262b38"; ctx.beginPath(); ctx.moveTo(ejes, 0); ctx.lineTo(ejes, h); ctx.stroke();
    }
    ctx.beginPath();
    let primero = true;
    valores.forEach((v, i) => {
      if (v == null) return;
      const x = ejes + (i / (valores.length - 1)) * (w - ejes), y = h - ((v - min) / (max - min)) * h;
      if (primero) { ctx.moveTo(x, y); primero = false; } else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = opciones.ejes ? 2 : 1.6; ctx.lineJoin = "round"; ctx.stroke();
  }
  const COLORES = { "": "#8b93a7", warn: "#f5a524", bad: "#ef4d4d" };

  function dibujarTiles() {
    if (!E.fuente) return;
    const ult = E.historial[E.historial.length - 1];
    if (!ult) return;
    // Los recuadros muestran el último valor conocido de cada dato (aunque sea viejo, marcado como tal); el análisis solo usa datos frescos.
    const u = { ...(E.fuente.ultimos ? E.fuente.ultimos() : ult), t: ult.t };
    const claves = E.fuente.pidsDisponibles().filter((c) => c !== "tiempo_motor" && u[c] != null);
    if (claves.join(",") !== E.tilesDe) crearTiles(claves);
    const ultimos = E.historial.slice(-90), ahora = Date.now() / 1000;
    for (const c of claves) {
      const tile = document.querySelector(`.tile[data-clave="${c}"]`);
      if (!tile) continue;
      const v = u[c], m = S.META[c] || {}, val = U.valorDato(c, v);
      tile.querySelector(".num").textContent = val.texto;
      tile.querySelector(".unidad").textContent = val.unidad;
      const nivel = nivelValor(c, v, u);
      const fuera = v != null && !S.valorPlausible(c, v);
      tile.classList.toggle("warn", nivel === "warn" || fuera);
      tile.classList.toggle("bad", nivel === "bad");
      const meta = E.fuente.metaDato ? E.fuente.metaDato(c) : { fuente: "", t: u.t };
      const edad = meta.t ? ahora - meta.t : 0, viejo = edad > (m.rapido ? 6 : 20);
      tile.classList.toggle("viejo", viejo);
      tile.querySelector(".meta-dato").textContent = (fuera ? "⚠ dato imposible (sensor o cable) · " : "") + (viejo ? "dato viejo · " : "") +
        `${meta.fuente || ""}${meta.t ? ` · hace ${Math.max(0, Math.round(edad))} s` : ""}`;
      if (!m.texto) dibujarLinea(tile.querySelector("canvas"), ultimos.map((x) => x[c]), COLORES[nivel]);
    }
    const t = u.tiempo_motor;
    $("#vivo-estado").textContent = `${E.fuente.esSimulador ? "SIMULADOR · " : ""}${E.historial.length} lecturas` + (t != null ? ` · motor encendido hace ${Math.floor(t / 60)} min` : "");
  }

  function graficaGrande(clave) {
    const m = S.META[clave] || { nombre: clave, dec: 1 };
    const fmt = (v) => U.valorDato(clave, v).texto + " " + U.valorDato(clave, v).unidad;
    U.modal(`<h2>${esc(m.nombre)}</h2><p class="nota" id="gg-info"></p><canvas class="grafica-grande" id="gg"></canvas>
      <div class="acciones"><button class="btn" id="gg-5">Últimos 5 min</button><button class="btn" id="gg-todo">Toda la sesión</button><button class="btn" id="gg-cerrar">Cerrar</button></div>`, (caja) => {
      let ventana = 300;
      const pintar = () => {
        if (caja.closest(".oculto")) return;
        const fin = E.historial.length ? E.historial[E.historial.length - 1].t : 0;
        const datos = E.historial.filter((x) => !ventana || x.t >= fin - ventana).map((x) => x[clave]);
        const v = datos.filter((x) => x != null);
        if (v.length) $("#gg-info").textContent = `Mín ${fmt(Math.min(...v))} · Prom ${fmt(v.reduce((a, b) => a + b, 0) / v.length)} · Máx ${fmt(Math.max(...v))} · ${v.length} lecturas`;
        dibujarLinea($("#gg"), datos, "#f5a524", { ejes: true, formato: (x) => U.valorDato(clave, x).texto });
      };
      $("#gg-5").onclick = () => { ventana = 300; pintar(); };
      $("#gg-todo").onclick = () => { ventana = 0; pintar(); };
      $("#gg-cerrar").onclick = () => { clearInterval(timer); U.cerrarModal(); };
      const timer = setInterval(() => { if ($("#modal").classList.contains("oculto")) clearInterval(timer); else pintar(); }, 1000);
      pintar();
    });
  }

  function exportarCSV() {
    if (!E.historial.length) { U.toast("Todavía no hay datos en vivo."); return; }
    const claves = [...new Set(E.historial.flatMap((m) => Object.keys(m)))].filter((k) => k !== "t");
    const filas = [["fecha_hora", ...claves.map((c) => `${c} (${(S.META[c] || {}).unidad || ""})`)].join(",")];
    for (const m of E.historial) filas.push([new Date(m.t * 1000).toISOString(), ...claves.map((c) => (m[c] == null ? "" : m[c]))].join(","));
    U.descargar(`scania-datos-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`, filas.join("\n"), "text/csv");
  }

  // ================================================================== códigos
  async function leerSoloCodigos() {
    if (!E.fuente) return;
    const b = $("#btn-leer");
    U.cargando(b, true, "Leyendo…");
    try {
      E.lectura = await E.fuente.leerTodo();
      mostrarLectura(E.lectura);
      actualizarAnalisis();
      guardarEscaneo("manual");
    } catch (e) { $("#mil-detalle").textContent = e.message; if (U.esErrorConexion(e)) conexionPerdida(e.message); }
    finally { U.cargando(b, false); b.disabled = !E.conectado; }
  }

  /** Lee todo (códigos, freeze frame, monitores, extras y modo 06) y guarda el escaneo. */
  async function revisionCompleta(origen = "completo") {
    if (!E.fuente) return null;
    const b = $("#btn-revision");
    U.cargando(b, true, "Revisando…");
    try {
      E.lectura = await E.fuente.leerTodo();
      mostrarLectura(E.lectura);
      $("#mil-detalle").textContent += " · Leyendo pruebas internas…";
      E.pruebas06 = await E.fuente.leerPruebas06();
      U.emit("modo06");
      mostrarLectura(E.lectura);
      const a = actualizarAnalisis();
      const id = guardarEscaneo(origen, a);
      U.toast("Revisión completa guardada en el historial del carro.", "ok");
      return id;
    } catch (e) {
      $("#mil-detalle").textContent = e.message;
      if (U.esErrorConexion(e)) conexionPerdida(e.message);
      return null;
    } finally { U.cargando(b, false); b.disabled = !E.conectado; U.emit("escaneo"); }
  }
  U.revisionCompleta = revisionCompleta;

  function guardarEscaneo(origen, analisis) {
    if (!E.lectura) return null;
    const a = analisis || U.analizarAhora();
    const c = U.carro();
    const p6 = E.pruebas06;
    return S.almacen.guardarEscaneo({
      carroId: c ? c.id : null, km: c && c.km ? Number(c.km) : null, origen,
      simulado: !!(E.fuente && E.fuente.esSimulador), info: E.fuente ? E.fuente.info() : null,
      lectura: E.lectura,
      pruebas06: p6 && p6.disponible ? { disponible: true, total: p6.pruebas.length, fallidas: p6.fallidas, misfire: p6.misfire } : p6 ? { disponible: false, motivo: p6.motivo } : null,
      resumen: S.resumenEscaneo(a.resumen),
      hallazgos: a.hallazgos.map((h) => ({ id: h.id, gravedad: h.gravedad, certeza: h.certeza, titulo: h.titulo, evidencia: h.evidencia })),
      avisos: E.fuente && E.fuente.avisos ? E.fuente.avisos.slice(-5) : [],
    });
  }
  U.guardarEscaneo = guardarEscaneo;

  function mostrarLectura(l) {
    const st = l.estado || {};
    const mil = $("#mil");
    mil.classList.toggle("on", !!st.mil);
    mil.classList.toggle("off", st.mil === false);
    const n = (l.codigos || []).length;
    $("#mil-texto").textContent = st.mil ? "Check engine ENCENDIDO" : st.mil === false ? "Check engine apagado" : "Estado desconocido";
    $("#mil-detalle").textContent = (n ? `${n} código(s) encontrados` : "No hay códigos de falla guardados.") + (st.computadoras ? ` · Respondieron: ${st.computadoras.join(", ")}` : "") +
      ((l.avisos || []).length ? " · " + l.avisos.join(" ") : "");
    $("#lista-codigos").innerHTML = (l.codigos || []).map((c) => `
      <div class="codigo ${esc(c.gravedad)}">
        <div class="num">${esc(c.codigo)}</div>
        <div class="desc">${esc(c.descripcion)}</div>
        <div class="meta"><span class="chip ${esc(c.gravedad)}">${esc(U.NOMBRE_GRAVEDAD[c.gravedad] || c.gravedad)}</span>
          ${[c.tipo, ...(c.tambien || [])].map((t) => `<span class="chip">${esc(t)}</span>`).join("")}
          ${(c.modulos || []).map((m) => `<span class="chip">${esc(m)}</span>`).join("")}<span>${esc(c.sistema)}</span></div>
        ${c.nota ? `<div class="aviso">${esc(c.nota)}</div>` : ""}
      </div>`).join("");
    const ff = l.freeze_frame;
    $("#freeze-frame").innerHTML = ff && ff.datos ? `<h3>Freeze frame de ${esc(ff.codigo)}</h3><p class="nota">Cómo estaba el carro cuando saltó la falla${ff.con_mapa === false ? " (el carro no reporta qué datos guardó: se muestran los básicos)" : ""}.</p>
      <table class="mini">${Object.entries(ff.datos).map(([k, v]) => { const m = S.META[k] || { nombre: k }; const x = U.valorDato(k, v); return `<tr><td>${esc(m.nombre)}</td><td>${esc(x.texto)} ${esc(x.unidad)}</td></tr>`; }).join("")}</table>` : "";
    const mon = st.monitores || [];
    $("#monitores").innerHTML = mon.length ? `<h3>Monitores de emisiones</h3><p class="nota">Si alguno no está listo, se borraron códigos o se desconectó la batería hace poco.</p>` +
      mon.map((m) => `<div class="monitor"><span>${esc(m.nombre_es)}</span><span class="${m.completo ? "si" : "no"}">${m.completo ? "✓ listo" : "… pendiente"}</span></div>`).join("") : "";
    const ex = l.extras || {};
    $("#extras-lectura").innerHTML = Object.keys(ex).length ? `<h3>Otros datos de la computadora</h3><table class="mini">${Object.entries(ex).map(([k, v]) =>
      `<tr><td>${esc(S.NOMBRES_EXTRAS[k] || k)}</td><td>${S.textoExtra(k, v) != null ? esc(S.textoExtra(k, v)) : U.t(/km/.test(k) ? `${Math.round(v)} km` : Math.round(v))}</td></tr>`).join("")}</table>` : "";
    U.emit("lectura");
  }
  U.mostrarLectura = mostrarLectura;

  function confirmarBorrado() {
    U.modal(`<h2>¿Borrar los códigos?</h2>
      <p>Antes de borrar, ScanIA <strong>guarda este escaneo completo</strong> en el historial del carro.</p>
      <ul class="lista-simple alerta">
        <li>Borrar códigos <strong>no repara nada</strong>: si la falla sigue, el código vuelve.</li>
        <li>Se pierde el <strong>freeze frame</strong> (la "foto" del momento de la falla), que es muy útil para diagnosticar.</li>
        <li>Se reinician los <strong>monitores de emisiones</strong>: el carro necesita varios días de manejo para completarlos y no pasaría una inspección.</li>
        <li>Los códigos <strong>permanentes</strong> no se borran con el escáner.</li>
      </ul>
      <p class="nota">Recomendado: motor apagado y llave en ON.</p>
      <label class="check"><input type="checkbox" id="conf-borrar"> Entiendo y quiero borrar los códigos</label>
      <div class="acciones"><button class="btn peligro" id="si-borrar" disabled>Guardar escaneo y borrar</button><button class="btn" id="no-borrar">Cancelar</button></div>`, () => {
      $("#conf-borrar").onchange = (e) => { $("#si-borrar").disabled = !e.target.checked; };
      $("#no-borrar").onclick = U.cerrarModal;
      $("#si-borrar").onclick = async () => { U.cerrarModal(); await borrarCodigos(); };
    });
  }

  async function borrarCodigos() {
    const b = $("#btn-borrar");
    U.cargando(b, true, "Borrando…");
    try {
      if (!E.lectura) E.lectura = await E.fuente.leerTodo();
      guardarEscaneo("antes_de_borrar");
      const ok = await E.fuente.borrarCodigos();
      await U.esperar(600);
      E.lectura = await E.fuente.leerTodo();
      mostrarLectura(E.lectura);
      $("#mil-detalle").textContent = (ok ? "Códigos borrados. El escaneo anterior quedó guardado." : `${(E.fuente.ultimoBorrado && E.fuente.ultimoBorrado.motivo) || "El carro no confirmó el borrado."} Probá con el motor apagado y la llave en ON.`) +
        " Si la falla sigue, el código va a volver.";
      actualizarAnalisis();
    } catch (e) { $("#mil-detalle").textContent = e.message; if (U.esErrorConexion(e)) conexionPerdida(e.message); }
    finally { U.cargando(b, false); b.disabled = !E.conectado; U.emit("escaneo"); }
  }

  // ================================================================== diagnóstico local
  U.htmlHallazgo = function (h, abierto) {
    const causas = (h.causas || []).length ? `<div class="bloque"><b>Causas posibles (de más a menos probable)</b><ol>${h.causas.map((c) =>
      `<li>${U.t(c.causa)}${c.por_que ? ` <span class="nota">— ${U.t(c.por_que)}</span>` : ""}</li>`).join("")}</ol></div>` : "";
    const alt = (h.alternativas || []).length ? `<div class="bloque"><b>Otras posibilidades</b><ul>${h.alternativas.map((a) => `<li>${U.t(a)}</li>`).join("")}</ul></div>` : "";
    const prueba = h.prueba ? `<div class="bloque"><b>Prueba para confirmar${h.donde ? ` (${h.donde === "casa" ? "se puede en casa" : h.donde === "mecánico" ? "con mecánico" : "en casa o con mecánico"})` : ""}</b>${U.t(h.prueba)}</div>` : "";
    const esp = h.esperado ? `<div class="bloque"><b>Resultado esperado</b>${U.t(h.esperado)}</div>` : "";
    const nc = h.no_cambiar ? `<div class="bloque no-cambiar"><b>No cambiés todavía</b>${U.t(h.no_cambiar)}</div>` : "";
    const dis = h.distinguir ? `<div class="bloque"><b>Lo que los datos no pueden separar</b>${U.t(h.distinguir)}</div>` : "";
    const cond = h.condiciones ? `<div class="bloque"><b>Condiciones de la medición</b>${U.t(h.condiciones)}</div>` : "";
    const ref = h.referencia ? `<div class="bloque"><b>Valores de referencia</b>${U.t(h.referencia)}</div>` : "";
    const ELECTRICOS = /^(causa_comun_electrica|alternador|bateria_baja|sobrevoltaje|ect_imposible|ect_intermitente|dato_imposible_|maf_sin_senal|inyector_circuito|bobina_circuito)/;
    const irEl = ELECTRICOS.test(h.id || "") ? `<div class="acciones"><a class="btn" href="#electrico">Revisar en Sistema eléctrico</a></div>` : "";
    const detalle = cond + ref + causas + alt + dis + prueba + esp + nc + irEl;
    return `<div class="hallazgo ${esc(h.gravedad)}">
      <div class="titulo"><span>${U.t(h.titulo)}</span><span class="chips">
        ${h.certeza ? `<span class="chip ${esc(h.certeza)}" title="Qué tan seguro es que la condición existe (no la causa)">${esc(S.CERTEZAS[h.certeza])}</span>` : ""}
        <span class="chip ${esc(h.gravedad)}">${esc(U.NOMBRE_GRAVEDAD[h.gravedad] || h.gravedad)}</span></span></div>
      <p>${U.t(h.detalle)}</p>
      ${h.urgencia ? `<p class="urgencia-h ${esc(h.urgencia.nivel)}"><b>${esc(S.URGENCIAS[h.urgencia.nivel])}:</b> ${U.t(h.urgencia.texto)}</p>` : ""}
      ${(h.evidencia || []).length ? `<ul>${h.evidencia.map((e) => `<li>${U.t(e)}</li>`).join("")}</ul>` : ""}
      ${detalle ? `<details${abierto ? " open" : ""}><summary>Condiciones, referencias, causas, cómo confirmarlo y qué no cambiar</summary>${detalle}</details>` : ""}
    </div>`;
  };

  function actualizarAnalisis() {
    const r = U.analizarAhora();
    const res = r.resumen;
    $("#analisis-info").textContent = res.muestras ? `${res.muestras} lecturas analizadas (${Math.round(res.duracion_s)} s, ${res.hz ?? "?"} por segundo)${res.medicion ? ` · motor con ${res.medicion}` : ""}${U.cilindrada() || res.medicion !== "MAF" ? "" : " · Agregá la cilindrada del carro para revisar el sensor MAF"}.` :
      "Relaciona códigos, freeze frame, datos en vivo y pruebas internas. Cada hallazgo dice qué tan seguro es y cómo confirmarlo.";
    $("#hallazgos").innerHTML = r.hallazgos.map((h) => U.htmlHallazgo(h)).join("") || `<div class="vacio">Sin hallazgos todavía.</div>`;
    U.ultimoAnalisis = r;
    U.emit("analisis", r);
    return r;
  }
  U.actualizarAnalisis = actualizarAnalisis;

  // ================================================================== modo tablero
  const MEDIDORES = ["velocidad", "rpm", "temp_motor", "voltaje", "consumo", "temp_aceite"];
  const ultimoAviso = {};
  function hablar(clave, texto, cadaSeg = 120) {
    const ahora = Date.now() / 1000;
    if (ultimoAviso[clave] && ahora - ultimoAviso[clave] < cadaSeg) return;
    ultimoAviso[clave] = ahora;
    if (!E.ajustes.voz || !("speechSynthesis" in window)) return;
    try { const u = new SpeechSynthesisUtterance(texto); u.lang = "es-419"; u.rate = 1; speechSynthesis.speak(u); } catch (e) { /* sin voz */ }
  }
  function abrirTablero() {
    if (!E.conectado) { U.toast("Conectate primero al carro."); return; }
    $("#tablero").classList.remove("oculto");
    pedirPantalla();
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* nada */ }
    const u = E.historial[E.historial.length - 1];
    if (u) actualizarTablero(u);
    E.timerCodigos = setInterval(vigilarCodigos, 90000);
  }
  function cerrarTablero() {
    $("#tablero").classList.add("oculto");
    clearInterval(E.timerCodigos);
    try { document.fullscreenElement && document.exitFullscreen(); } catch (e) { /* nada */ }
  }
  async function vigilarCodigos() {
    if (!E.fuente) return;
    try {
      const antes = new Set(((E.lectura && E.lectura.codigos) || []).map((c) => c.codigo));
      const ahora = await E.fuente.leerCodigos();
      const nuevos = ahora.filter((c) => !antes.has(c.codigo));
      if (nuevos.length) {
        E.lectura = { ...(E.lectura || {}), codigos: ahora };
        hablar("codigo-" + nuevos[0].codigo, `Atención. Nuevo código de falla ${nuevos.map((c) => c.codigo.split("").join(" ")).join(", ")}.`, 3600);
        E.alertasTablero = [...(E.alertasTablero || []), `Nuevo código: ${nuevos.map((c) => c.codigo).join(", ")}`];
      }
    } catch (e) { /* se reintenta luego */ }
  }
  function actualizarTablero(u) {
    const claves = MEDIDORES.filter((c) => u[c] != null).slice(0, 4);
    $("#tablero-medidores").innerHTML = claves.map((c) => {
      const m = S.META[c], v = U.valorDato(c, u[c]), n = nivelValor(c, u[c], u);
      return `<div class="medidor ${n}"><div class="n">${esc(m.nombre)}</div><div class="v">${esc(v.texto)}<span class="u">${esc(v.unidad)}</span></div></div>`;
    }).join("");
    const alertas = [...(E.alertasTablero || [])];
    const enc = (u.rpm || 0) > 400;
    if (u.temp_motor >= 106) { alertas.push(`Motor caliente: ${U.valorDato("temp_motor", u.temp_motor).texto} ${U.valorDato("temp_motor", u.temp_motor).unidad}`); hablar("temp", "Atención. El motor se está calentando. Detenete en un lugar seguro."); }
    const ult = E.historial.slice(-20).map((m) => m.voltaje).filter((x) => x != null);
    if (enc && ult.length >= 10 && ult.every((x) => x < 12.6)) { alertas.push(`Voltaje bajo: ${u.voltaje.toFixed(1)} V (el alternador no carga)`); hablar("volt", "Atención. El alternador no está cargando la batería."); }
    if (u.temp_aceite >= 130) { alertas.push("Aceite demasiado caliente"); hablar("aceite", "Atención. El aceite del motor está demasiado caliente."); }
    if (u.sistema_comb != null && u.sistema_comb & 8) alertas.push("La computadora reporta una falla en el control de mezcla");
    $("#tablero-alertas").innerHTML = alertas.map((a) => `<div>${esc(a)}</div>`).join("");
    $("#tablero-estado").textContent = (E.fuente && E.fuente.esSimulador ? "SIMULADOR · " : "") + "Modo tablero";
  }

  // ================================================================== registro técnico
  function textoRegistro() {
    const f = E.registroFuente;
    if (!f || !f.registro.length) return "Sin conexión todavía.";
    return f.registro.map((r) => `${new Date(r.t).toISOString().slice(11, 23)} ${r.tipo === "tx" ? ">>" : r.tipo === "rx" ? "<<" : r.tipo === "error" ? "!!" : "--"} ${r.texto}`).join("\n");
  }
  U.textoRegistro = textoRegistro;

  // ================================================================== inicio de esta parte
  // ================================================================== adaptadores recordados
  async function dibujarRecordados() {
    const cont = $("#recordados");
    const puertos = await S.TransporteSerial.recordados();
    if (!puertos.length) { cont.innerHTML = ""; return; }
    // Chrome no da el nombre de un puerto Bluetooth recordado: se numeran en el orden en que se autorizaron
    cont.innerHTML = `<p class="nota">Adaptadores ya autorizados en este navegador (conectan sin elegir de la lista):</p>` + puertos.map((p, i) => {
      const inf = (p.getInfo && p.getInfo()) || {};
      const tipo = inf.bluetoothServiceClassId ? "Bluetooth" : inf.usbVendorId ? "USB" : "Serial";
      return `<div class="fila-rec"><button class="btn" data-rec="${i}">Usar adaptador ${i + 1} (${tipo})</button><button class="btn chico" data-olvidar="${i}" title="Quitar el permiso">Olvidar</button></div>`;
    }).join("");
    cont.querySelectorAll("[data-rec]").forEach((b) => b.addEventListener("click", (e) => conectar("serial", e.currentTarget, new S.TransporteSerial(puertos[Number(b.dataset.rec)], Number(E.ajustes.baud) || 38400))));
    cont.querySelectorAll("[data-olvidar]").forEach((b) => b.addEventListener("click", async () => {
      if (await S.TransporteSerial.olvidar(puertos[Number(b.dataset.olvidar)])) { U.toast("Adaptador olvidado."); dibujarRecordados(); }
      else U.toast("Este navegador no permite olvidar el permiso desde la app; quitalo en la configuración del sitio en Chrome.");
    }));
  }

  // ================================================================== diagnóstico de conexión
  function entornoNavegador() {
    const ua = navigator.userAgent, chrome = (ua.match(/Chrome\/(\d+)/) || [])[1];
    return { navegador: ua, version_chrome: chrome ? Number(chrome) : null, android: /Android/i.test(ua), contexto_seguro: window.isSecureContext,
      web_serial: S.TransporteSerial.disponible(), web_bluetooth: S.TransporteBLE.disponible(), origen: location.origin || "archivo local" };
  }
  function textoDiagnostico(d) {
    const L = [`ScanIA ${S.VERSION || ""} — diagnóstico de conexión (${d.fecha || new Date().toISOString()})`, ""];
    const e = d.entorno;
    L.push(`Navegador: ${e.navegador}`, `Chrome: ${e.version_chrome ?? "no es Chrome"} · Android: ${e.android ? "sí" : "no"} · contexto seguro: ${e.contexto_seguro ? "sí" : "NO"}`,
      `Web Serial (Bluetooth clásico/USB): ${e.web_serial ? "sí" : "NO"} · Web Bluetooth (BLE): ${e.web_bluetooth ? "sí" : "NO"} · adaptadores recordados: ${e.recordados}`, "");
    for (const p of d.pasos || []) L.push(`${p.ok ? "OK  " : "MAL "} ${p.nombre}: ${p.detalle}`);
    if (d.velocidad) L.push("", `Velocidad: ${JSON.stringify(d.velocidad)}`);
    if (d.estadisticas) L.push(`Estadísticas: ${JSON.stringify(d.estadisticas)}`);
    if (d.transporte) L.push(`Puerto: ${JSON.stringify(d.transporte)}`);
    if ((d.avisos || []).length) L.push("Avisos: " + d.avisos.join(" | "));
    if ((d.negativas || []).length) L.push("Respuestas negativas: " + d.negativas.join(" | "));
    if (d.nota_adaptador) L.push(d.nota_adaptador);
    L.push("", "Registro técnico (últimas líneas, VIN tapado):", d.registro || "");
    return L.join("\n");
  }
  async function diagnosticoConexion() {
    const entorno = { ...entornoNavegador(), recordados: (await S.TransporteSerial.recordados()).length };
    const consejos = [];
    if (!entorno.contexto_seguro) consejos.push("Abrí ScanIA desde su enlace https:// (o el archivo ScanIA.html en la compu): sin eso el navegador no deja usar Bluetooth.");
    if (!entorno.web_serial) consejos.push(entorno.android ? "Este Chrome no tiene Web Serial: actualizá Chrome a la versión 138 o más nueva. Si tu teléfono ya tiene Chrome actualizado y no aparece, el navegador no permite Bluetooth clásico: la alternativa sería una app nativa de Android que haga de puente (no incluida)." :
      "Este navegador no tiene Web Serial: usá Google Chrome o Microsoft Edge actualizado en la compu.");
    if (entorno.android && entorno.version_chrome && entorno.version_chrome < 138) consejos.push(`Chrome ${entorno.version_chrome} no conecta adaptadores Bluetooth clásicos; necesitás 138 o más nuevo.`);
    U.modal(`<h2>Diagnóstico de conexión</h2><p class="nota">Prueba paso a paso del navegador, el adaptador y el carro. No manda nada que cambie el carro. Sirve para investigar problemas con un adaptador.</p>
      <div id="dc-pasos" class="lista-simple"><p>Revisando…</p></div>
      <div class="acciones"><button class="btn" id="dc-copiar" disabled>Copiar</button><button class="btn" id="dc-txt" disabled>Descargar .txt</button><button class="btn" id="dc-json" disabled>Descargar .json</button><button class="btn" id="dc-cerrar">Cerrar</button></div>`, async () => {
      $("#dc-cerrar").onclick = U.cerrarModal;
      let d = { fecha: new Date().toISOString(), entorno, pasos: [] };
      const pintar = () => {
        $("#dc-pasos").innerHTML = [
          `<div class="punto-u ${entorno.web_serial ? "ok" : "mal"}"><span class="ic">${entorno.web_serial ? "✓" : "✗"}</span><div><b>Navegador:</b> Web Serial ${entorno.web_serial ? "sí" : "no"} · BLE ${entorno.web_bluetooth ? "sí" : "no"} · Chrome ${entorno.version_chrome ?? "?"}${entorno.contexto_seguro ? "" : " · SIN contexto seguro"}</div></div>`,
          ...consejos.map((c) => `<div class="punto-u aviso"><span class="ic">!</span><div>${esc(c)}</div></div>`),
          ...d.pasos.map((p) => `<div class="punto-u ${p.ok ? "ok" : "aviso"}"><span class="ic">${p.ok ? "✓" : "!"}</span><div><b>${esc(p.nombre)}:</b> ${esc(p.detalle)}</div></div>`),
          !E.fuente ? `<p class="nota">No hay un adaptador conectado: conectate y volvé a abrir este diagnóstico para probar el adaptador y el carro.</p>` : "",
        ].join("");
      };
      pintar();
      if (E.fuente) {
        E.pausado = true;
        try { d = { ...(await E.fuente.diagnosticoConexion({ lecturas: 15 })), entorno }; }
        catch (e) { d.pasos.push({ nombre: "Error", ok: false, detalle: e.message }); }
        finally { E.pausado = false; }
        d.registro = U.textoRegistro().split("\n").slice(-80).join("\n").replace(/\b[A-HJ-NPR-Z0-9]{11}([A-HJ-NPR-Z0-9]{6})\b/g, "***********$1");
        pintar();
      }
      const txt = textoDiagnostico(d);
      for (const id of ["#dc-copiar", "#dc-txt", "#dc-json"]) $(id).disabled = false;
      $("#dc-copiar").onclick = async () => { try { await navigator.clipboard.writeText(txt); U.toast("Copiado.", "ok"); } catch (e) { U.toast("No se pudo copiar; descargalo."); } };
      $("#dc-txt").onclick = () => U.descargar(`scania-diagnostico-conexion-${d.fecha.slice(0, 16).replace(/[:T]/g, "-")}.txt`, txt, "text/plain");
      $("#dc-json").onclick = () => U.descargar(`scania-diagnostico-conexion-${d.fecha.slice(0, 16).replace(/[:T]/g, "-")}.json`, JSON.stringify(d, null, 2));
    });
  }

  // ================================================================== síntomas (análisis local)
  function dibujarSintomas() {
    $("#sintomas-lista").innerHTML = S.SINTOMAS.map((x) => `<label class="check"><input type="checkbox" data-sintoma="${esc(x.id)}"${E.sintomas.includes(x.id) ? " checked" : ""}> ${esc(x.texto)}</label>`).join("");
    $$("#sintomas-lista [data-sintoma]").forEach((c) => c.addEventListener("change", () => {
      E.sintomas = $$("#sintomas-lista [data-sintoma]:checked").map((x) => x.dataset.sintoma);
      actualizarAnalisis();
    }));
  }

  U.on("init", async () => {
    const sel = $("#sel-escenario"), selP = $("#sel-perfil-sim");
    selP.innerHTML = Object.entries(S.PERFILES_SIM).map(([id, p]) => `<option value="${esc(id)}">${esc(p.nombre)}</option>`).join("");
    const grupos = { vehiculo: "Fallas del carro", electrico: "Fallas eléctricas", protocolo: "Fallas del adaptador" };
    const llenarEscenarios = () => {
      const noAplica = S.PERFILES_SIM[selP.value].noAplica || [];
      const previo = sel.value;
      sel.innerHTML = Object.entries(grupos).map(([g, n]) => `<optgroup label="${n}">${Object.entries(S.ESCENARIOS).filter(([id, e]) => e.grupo === g && !noAplica.includes(id))
        .map(([id, e]) => `<option value="${esc(id)}">${esc(e.nombre)}</option>`).join("")}</optgroup>`).join("");
      if (previo && sel.querySelector(`option[value="${previo}"]`)) sel.value = previo;
      desc();
    };
    const desc = () => { $("#desc-escenario").textContent = (S.ESCENARIOS[sel.value] || {}).descripcion || ""; };
    sel.addEventListener("change", desc);
    selP.addEventListener("change", llenarEscenarios);
    llenarEscenarios();
    dibujarSintomas();
    $("#btn-diag-conexion").addEventListener("click", diagnosticoConexion);

    $$(".pestana").forEach((b) => b.addEventListener("click", () => {
      E.modo = b.dataset.modo;
      $$(".pestana").forEach((x) => x.classList.toggle("activa", x === b));
      $$(".panel-modo").forEach((p) => p.classList.toggle("oculto", p.dataset.panel !== E.modo));
    }));
    $("#btn-conectar-bt").addEventListener("click", (e) => conectar("serial", e.currentTarget));
    $("#btn-conectar-ble").addEventListener("click", () => conectar("ble", $("#btn-conectar-bt")));
    $("#btn-conectar-sim").addEventListener("click", (e) => conectar("simulador", e.currentTarget));
    $("#btn-desconectar").addEventListener("click", () => desconectar());
    $("#btn-reconectar").addEventListener("click", (e) => {
      const u = E.ultimaConexion;
      if (!u) return;
      const t = u.tipo === "simulador" ? new S.TransporteVirtual(u.transporte.escenario, { perfil: u.transporte.perfil })
        : u.tipo === "ble" ? new S.TransporteBLE(u.transporte.dispositivo) : new S.TransporteSerial(u.transporte.puerto, Number(E.ajustes.baud) || 38400);
      conectar(u.tipo, e.currentTarget, t);
    });
    $("#btn-revision").addEventListener("click", () => revisionCompleta());
    $("#btn-leer").addEventListener("click", leerSoloCodigos);
    $("#btn-borrar").addEventListener("click", confirmarBorrado);
    $("#btn-analizar").addEventListener("click", actualizarAnalisis);
    $("#btn-tablero").addEventListener("click", abrirTablero);
    $("#tablero-salir").addEventListener("click", cerrarTablero);
    $("#btn-csv").addEventListener("click", exportarCSV);
    $("#btn-limpiar-vivo").addEventListener("click", () => { E.historial = []; E.tilesDe = ""; $("#tiles").innerHTML = ""; actualizarAnalisis(); });

    // Compatibilidad del navegador
    const aviso = $("#aviso-compat");
    const serial = S.TransporteSerial.disponible(), ble = S.TransporteBLE.disponible();
    if (!window.isSecureContext) aviso.textContent = "Para conectarte por Bluetooth, abrí ScanIA desde su enlace https:// (en la laptop también funciona abriendo ScanIA.html).";
    else if (!serial && !ble) aviso.textContent = "Este navegador no puede conectarse a adaptadores Bluetooth. Usá Google Chrome actualizado (Android 138+) o Chrome/Edge en la compu. Podés probar el simulador.";
    else if (!serial) aviso.textContent = "Este navegador no soporta Bluetooth clásico (el ELM327 común). Actualizá Chrome a la versión 138 o más nueva. Solo vas a poder usar adaptadores BLE.";
    if (aviso.textContent) { aviso.classList.remove("oculto"); $("#btn-conectar-bt").disabled = !serial; }
    // Adaptadores ya autorizados antes: se puede conectar sin elegir de la lista (y elegir cuál, si hay dos)
    await dibujarRecordados();
    ponerConectado(false);
    $("#hallazgos").innerHTML = `<div class="vacio">Sin datos todavía.</div>`;
    setInterval(() => { if (E.conectado) actualizarAnalisis(); }, 10000);
    window.addEventListener("beforeunload", () => { if (E.fuente) E.fuente.desconectar(); });
  });
})();
