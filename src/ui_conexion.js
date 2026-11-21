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
      else if (tipo === "simulador") transporte = new S.TransporteVirtual($("#sel-escenario").value);
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
    const filas = [["Conexión", info.puerto], ["Protocolo", info.protocolo], ["Adaptador", info.elm], ["VIN", info.vin || "no disponible"],
      ["Computadora", info.computadora], ["Calibración", info.calibracion], ["Datos en vivo", `${(info.pids || []).length} sensores`],
      ["Lectura rápida", info.lectura_rapida ? "sí (varios sensores por consulta)" : "no (uno por uno)"], ["Encabezados CAN", info.encabezados ? "sí" : "no"]];
    $("#info-obd").innerHTML = filas.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
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

  // Rangos físicos posibles: fuera de ellos el dato es sospechoso (sensor desconectado, adaptador con error)
  const RANGO = { temp_motor: [-39, 140], temp_admision: [-39, 90], temp_aceite: [-39, 160], rpm: [0, 9000], voltaje: [6, 18], maf: [0, 600], map: [5, 255],
    stft1: [-50, 50], ltft1: [-50, 50], stft2: [-50, 50], ltft2: [-50, 50], o2_b1s1: [0, 1.275], o2_b1s2: [0, 1.275], lambda_b1s1: [0.5, 2] };
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
    const u = E.historial[E.historial.length - 1];
    if (!u) return;
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
      const r = RANGO[c], fuera = r && v != null && (v < r[0] || v > r[1]);
      tile.classList.toggle("warn", nivel === "warn" || fuera);
      tile.classList.toggle("bad", nivel === "bad");
      const meta = E.fuente.metaDato ? E.fuente.metaDato(c) : { fuente: "", t: u.t };
      const edad = meta.t ? ahora - meta.t : 0, viejo = edad > (m.rapido ? 6 : 20);
      tile.classList.toggle("viejo", viejo);
      tile.querySelector(".meta-dato").textContent = (fuera ? "⚠ fuera de rango · " : "") + (viejo ? "dato viejo · " : "") +
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
    $("#mil-detalle").textContent = (n ? `${n} código(s) encontrados` : "No hay códigos de falla guardados.") + (st.computadoras ? ` · Respondieron: ${st.computadoras.join(", ")}` : "");
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
    $("#freeze-frame").innerHTML = ff && ff.datos ? `<h3>Freeze frame de ${esc(ff.codigo)}</h3><p class="nota">Cómo estaba el carro cuando saltó la falla.</p>
      <table class="mini">${Object.entries(ff.datos).map(([k, v]) => { const m = S.META[k] || { nombre: k }; const x = U.valorDato(k, v); return `<tr><td>${esc(m.nombre)}</td><td>${esc(x.texto)} ${esc(x.unidad)}</td></tr>`; }).join("")}</table>` : "";
    const mon = st.monitores || [];
    $("#monitores").innerHTML = mon.length ? `<h3>Monitores de emisiones</h3><p class="nota">Si alguno no está listo, se borraron códigos o se desconectó la batería hace poco.</p>` +
      mon.map((m) => `<div class="monitor"><span>${esc(m.nombre_es)}</span><span class="${m.completo ? "si" : "no"}">${m.completo ? "✓ listo" : "… pendiente"}</span></div>`).join("") : "";
    const ex = l.extras || {};
    $("#extras-lectura").innerHTML = Object.keys(ex).length ? `<h3>Otros datos de la computadora</h3><table class="mini">${Object.entries(ex).map(([k, v]) =>
      `<tr><td>${esc(S.NOMBRES_EXTRAS[k] || k)}</td><td>${U.t(/km/.test(k) ? `${Math.round(v)} km` : Math.round(v))}</td></tr>`).join("")}</table>` : "";
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
      $("#mil-detalle").textContent = (ok ? "Códigos borrados. El escaneo anterior quedó guardado." : "El carro no confirmó el borrado. Probá con el motor apagado y la llave en ON.") +
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
    const detalle = causas + alt + prueba + esp + nc;
    return `<div class="hallazgo ${esc(h.gravedad)}">
      <div class="titulo"><span>${U.t(h.titulo)}</span><span class="chips">
        ${h.certeza ? `<span class="chip ${esc(h.certeza)}" title="Qué tan seguro es">${esc(S.CERTEZAS[h.certeza])}</span>` : ""}
        <span class="chip ${esc(h.gravedad)}">${esc(U.NOMBRE_GRAVEDAD[h.gravedad] || h.gravedad)}</span></span></div>
      <p>${U.t(h.detalle)}</p>
      ${(h.evidencia || []).length ? `<ul>${h.evidencia.map((e) => `<li>${U.t(e)}</li>`).join("")}</ul>` : ""}
      ${detalle ? `<details${abierto ? " open" : ""}><summary>Causas, cómo confirmarlo y qué no cambiar</summary>${detalle}</details>` : ""}
    </div>`;
  };

  function actualizarAnalisis() {
    const r = U.analizarAhora();
    const res = r.resumen;
    $("#analisis-info").textContent = res.muestras ? `${res.muestras} lecturas analizadas (${Math.round(res.duracion_s)} s)${U.cilindrada() ? "" : " · Agregá la cilindrada del carro para revisar el sensor MAF"}.` :
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
  U.on("init", async () => {
    const sel = $("#sel-escenario");
    const grupos = { vehiculo: "Fallas del carro", protocolo: "Fallas del adaptador" };
    sel.innerHTML = Object.entries(grupos).map(([g, n]) => `<optgroup label="${n}">${Object.entries(S.ESCENARIOS).filter(([, e]) => e.grupo === g)
      .map(([id, e]) => `<option value="${esc(id)}">${esc(e.nombre)}</option>`).join("")}</optgroup>`).join("");
    const desc = () => { $("#desc-escenario").textContent = S.ESCENARIOS[sel.value].descripcion; };
    sel.addEventListener("change", desc); desc();

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
      const t = u.tipo === "simulador" ? new S.TransporteVirtual(u.transporte.escenario)
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
    // Adaptador ya autorizado antes: se puede conectar sin elegir de la lista
    const puertos = await S.TransporteSerial.recordados();
    if (puertos.length) {
      const b = $("#btn-conectar-recordado");
      b.classList.remove("oculto");
      b.addEventListener("click", (e) => conectar("serial", e.currentTarget, new S.TransporteSerial(puertos[0], Number(E.ajustes.baud) || 38400)));
    }
    ponerConectado(false);
    $("#hallazgos").innerHTML = `<div class="vacio">Sin datos todavía.</div>`;
    setInterval(() => { if (E.conectado) actualizarAnalisis(); }, 10000);
    window.addEventListener("beforeunload", () => { if (E.fuente) E.fuente.desconectar(); });
  });
})();
