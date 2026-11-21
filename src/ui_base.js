/* ScanIA · interfaz: utilidades compartidas, estado y navegación */
(function () {
  "use strict";
  const S = window.ScanIA;
  const U = (S.ui = {});

  U.$ = (sel) => document.querySelector(sel);
  U.$$ = (sel) => Array.from(document.querySelectorAll(sel));
  U.esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  U.estado = {
    modo: "bluetooth",
    fuente: null,            // ELM327 (real o con adaptador virtual)
    conectado: false,
    historial: [],           // muestras en vivo
    lectura: null,           // última lectura de códigos
    pruebas06: null,         // último modo 06
    guiadas: {},             // id de prueba -> resultado (esta sesión)
    token: 0,
    pausado: false,          // las pruebas guiadas rápidas pausan la lectura continua
    tilesDe: "",
    sesionId: null,
    wakeLock: null,
    instalar: null,
    ajustes: S.almacen.ajustes(),
    ultimaConexion: null,    // para reconectar: { tipo, transporte }
  };

  // ------------------------------------------------------------------ texto
  U.esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** Texto con las unidades elegidas por el usuario y escapado para HTML. */
  U.t = (texto) => U.esc(S.convertirTexto(texto, U.estado.ajustes.unidades));
  U.md = function (texto) {
    const lineas = U.esc(S.convertirTexto(texto, U.estado.ajustes.unidades)).split(/\r?\n/);
    let html = "", lista = null;
    const cerrar = () => { if (lista) { html += `</${lista}>`; lista = null; } };
    for (let l of lineas) {
      l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      let m;
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (lista !== "ul") { cerrar(); html += "<ul>"; lista = "ul"; } html += `<li>${m[1]}</li>`; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (lista !== "ol") { cerrar(); html += "<ol>"; lista = "ol"; } html += `<li>${m[1]}</li>`; }
      else if (l.trim() === "") cerrar();
      else { cerrar(); html += `<p>${l.replace(/^#+\s*/, "")}</p>`; }
    }
    cerrar();
    return html;
  };
  U.fecha = (ts) => new Date(ts * 1000).toLocaleString("es-HN", { dateStyle: "short", timeStyle: "short" });
  U.fechaDia = (ts) => new Date(ts * 1000).toLocaleDateString("es-HN", { dateStyle: "medium" });
  U.num = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("es-HN"));

  U.mensaje = (el, texto, tipo = "") => { el.textContent = texto || ""; el.className = "mensaje " + tipo; };
  U.cargando = function (b, activo, texto) {
    if (!b) return;
    if (activo) { b.dataset.texto = b.textContent; b.textContent = texto || b.textContent; b.classList.add("cargando"); b.disabled = true; }
    else { b.textContent = b.dataset.texto || b.textContent; b.classList.remove("cargando"); b.disabled = false; }
  };
  let tToast = null;
  U.toast = function (texto, tipo = "") {
    const t = U.$("#toast");
    t.textContent = texto; t.className = "toast " + tipo;
    clearTimeout(tToast);
    tToast = setTimeout(() => t.classList.add("oculto"), 4500);
  };
  U.descargar = function (nombre, contenido, tipo = "application/json") {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  U.esErrorConexion = (e) => e && (e instanceof S.ErrorConexion || e.name === "ErrorConexion");
  U.NOMBRE_GRAVEDAD = { alta: "Urgente", media: "Importante", baja: "Leve", info: "Info", ok: "Bien" };

  // ------------------------------------------------------------------ eventos simples
  const oyentes = {};
  U.on = (ev, fn) => { (oyentes[ev] = oyentes[ev] || []).push(fn); };
  U.emit = (ev, dato) => (oyentes[ev] || []).forEach((fn) => { try { fn(dato); } catch (e) { console.error(e); } });

  // ------------------------------------------------------------------ carro activo
  U.carro = () => S.almacen.carroActivo();
  U.cilindrada = function () {
    const f = U.estado.fuente;
    if (f && f.esSimulador) return f.info().cilindrada;   // el simulador es un motor 1.8 L, no el carro guardado
    const c = U.carro();
    return c && Number(c.cilindrada) ? Number(c.cilindrada) : null;
  };
  /** Datos del carro para la IA. El VIN solo va si el usuario lo permitió. */
  U.vehiculoParaIA = function () {
    const c = U.carro() || {};
    const v = { ...c };
    delete v.mantenimientos; delete v.intervalos; delete v.id; delete v.creado; delete v.actualizado;
    v._compartirVIN = !!U.estado.ajustes.compartirVIN;
    if (!v._compartirVIN) delete v.vin;
    return v;
  };
  U.analizarAhora = () => S.analizar(U.estado.historial, U.estado.lectura, { pruebas06: U.estado.pruebas06, cilindrada: U.cilindrada() });

  // ------------------------------------------------------------------ navegación
  const VISTAS = ["inicio", "escanear", "vivo", "pruebas", "ia", "carros", "mas"];
  U.ir = function (vista) {
    if (!VISTAS.includes(vista)) vista = "inicio";
    U.$$(".vista").forEach((v) => v.classList.toggle("activa", v.dataset.vista === vista));
    U.$$("#nav button").forEach((b) => b.classList.toggle("activa", b.dataset.vista === vista));
    if (location.hash !== "#" + vista) history.replaceState(null, "", "#" + vista);
    window.scrollTo({ top: 0 });
    U.emit("vista", vista);
  };

  // ------------------------------------------------------------------ modal genérico
  U.modal = function (html, alAbrir) {
    U.$("#modal-caja").innerHTML = html;
    U.$("#modal").classList.remove("oculto");
    if (alAbrir) alAbrir(U.$("#modal-caja"));
  };
  U.cerrarModal = () => U.$("#modal").classList.add("oculto");
})();
