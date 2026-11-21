/* ScanIA · interfaz: pruebas guiadas, pruebas internas (modo 06) y revisión de carro usado */
(function () {
  "use strict";
  const S = window.ScanIA, U = S.ui, E = U.estado, $ = U.$, esc = U.esc;
  const VEREDICTO = { ok: "Bien", regular: "Regular", mal: "Mal", error: "No se pudo medir" };
  const ctx = () => ({ cilindrada: U.cilindrada() });

  // ================================================================== lista de pruebas
  function dibujarLista() {
    const f = E.fuente;
    $("#lista-pruebas").innerHTML = S.PRUEBAS_GUIADAS.map((p) => {
      const falta = f ? p.requiere(f, ctx()) : "Conectate al carro (o al simulador) primero.";
      const r = E.guiadas[p.id];
      return `<div class="prueba-g">
        <div class="tit">${esc(p.titulo)}</div>
        <div class="chips"><span class="chip">Dificultad: ${esc(p.dificultad)}</span><span class="chip riesgo-${esc(p.riesgo)}">Riesgo: ${esc(p.riesgo)}</span></div>
        <p>${U.t(p.descripcion)}</p>
        <p class="nota"><b>Necesitás:</b> ${U.t(p.herramientas)}<br><b>Condiciones:</b> ${U.t(p.condiciones)}</p>
        ${r ? `<div class="resultado-g ${esc(r.veredicto)}"><b>${esc(VEREDICTO[r.veredicto])}:</b> ${U.t(r.resumen)}</div>` : ""}
        ${falta ? `<p class="nota">${U.t(falta)}</p>` : ""}
        <div class="acciones"><button class="btn${falta ? "" : " primario"}" data-prueba="${esc(p.id)}" ${falta ? "disabled" : ""}>${r ? "Repetir" : "Empezar"}</button></div>
      </div>`;
    }).join("");
    document.querySelectorAll("[data-prueba]").forEach((b) => b.addEventListener("click", () => abrirPrueba(b.dataset.prueba)));
  }

  // ================================================================== ejecución
  let ejecucion = null;   // { token, cancelada }

  function abrirPrueba(id) {
    const p = S.PRUEBAS_GUIADAS.find((x) => x.id === id);
    if (!p || !E.fuente) return;
    const intro = `<h2>${esc(p.titulo)}</h2>
      ${p.advertencia ? `<div class="advertencia">${U.t(p.advertencia)}</div>
        <label class="check"><input type="checkbox" id="pg-acepto"> Tengo las condiciones seguras y otra persona maneja</label>` : ""}
      <p class="nota"><b>Necesitás:</b> ${U.t(p.herramientas)} · <b>Condiciones:</b> ${U.t(p.condiciones)}</p>
      <p class="nota"><b>Valores de referencia:</b> ${U.t(p.referencia)}</p>
      ${E.fuente.esSimulador ? `<p class="nota">Simulador: las acciones (apagar, arrancar, encender luces…) se simulan solas.</p>` : ""}
      <div id="pg-cuerpo"></div>
      <div class="acciones"><button class="btn primario" id="pg-empezar"${p.advertencia ? " disabled" : ""}>Empezar</button><button class="btn" id="pg-cancelar">Cancelar</button></div>`;
    U.modal(intro, () => {
      if (p.advertencia) $("#pg-acepto").onchange = (e) => { $("#pg-empezar").disabled = !e.target.checked; };
      $("#pg-cancelar").onclick = cancelar;
      $("#pg-empezar").onclick = () => { $("#pg-empezar").remove(); correr(p); };
    });
  }

  function cancelar() {
    if (ejecucion) ejecucion.cancelada = true;
    E.pausado = false;
    U.cerrarModal();
  }

  /** Espera a que el usuario toque el botón del paso. */
  function esperarBoton(texto) {
    return new Promise((res) => {
      const b = document.createElement("button");
      b.className = "btn primario"; b.textContent = texto;
      $("#pg-accion").appendChild(b);
      b.onclick = () => { b.remove(); res(); };
    });
  }

  async function correr(p) {
    const run = (ejecucion = { cancelada: false });
    const vivo = () => !run.cancelada && E.fuente && !$("#modal").classList.contains("oculto");
    const datos = {};
    const cuerpo = $("#pg-cuerpo");
    try {
      for (let i = 0; i < p.pasos.length; i++) {
        const paso = p.pasos[i];
        cuerpo.innerHTML = `<p class="nota">Paso ${i + 1} de ${p.pasos.length}</p><p>${U.t(paso.texto)}</p>
          <div id="pg-accion" class="acciones"></div><div class="lectura-viva" id="pg-valor"></div>
          <div class="progreso"><span id="pg-barra"></span></div><p class="nota" id="pg-estado"></p>`;
        // Pasos sin condición automática: se espera a que el usuario indique que está listo
        if (!paso.condicion || paso.boton) await esperarBoton(paso.boton || "Medir");
        if (!vivo()) return;
        if (paso.evento) E.fuente.simularEvento(paso.evento);   // solo hace algo en el simulador
        if (paso.tipo === "voltaje") datos[paso.clave] = await medirVoltaje(paso, vivo);
        else if (paso.tipo === "pid") datos[paso.clave] = await medirPid(paso, vivo);
        else if (paso.tipo === "modo06") {
          $("#pg-estado").textContent = "Leyendo las pruebas internas…";
          datos[paso.clave] = E.pruebas06 = await E.fuente.leerPruebas06();
          U.emit("modo06");
        } else datos[paso.clave] = await medirDatos(paso, vivo);
        if (paso.eventoFinal) E.fuente.simularEvento(paso.eventoFinal);
        if (!vivo()) return;
      }
      const r = p.evaluar(datos, ctx());
      mostrarResultado(p, r);
    } catch (e) {
      cuerpo.innerHTML = `<div class="resultado-g error">${esc(e.message || String(e))}</div>`;
      if (U.esErrorConexion(e)) U.toast("Se perdió la conexión durante la prueba.", "error");
    } finally {
      E.pausado = false;
      if (ejecucion === run) ejecucion = null;
    }
  }

  function barra(frac, texto) {
    const b = $("#pg-barra"); if (b) b.style.width = Math.min(100, Math.round(frac * 100)) + "%";
    if (texto != null && $("#pg-estado")) $("#pg-estado").textContent = texto;
  }
  function mostrarValor(clave, v) {
    const el = $("#pg-valor"); if (!el) return;
    if (v == null) { el.textContent = "—"; return; }
    const x = U.valorDato(clave, v); el.textContent = `${x.texto} ${x.unidad}`;
  }

  /** Lecturas rápidas del voltaje del adaptador (pausa los datos en vivo para ir más rápido). */
  async function medirVoltaje(paso, vivo) {
    E.pausado = true;
    await U.esperar(250);
    const vals = [], t0 = performance.now(), dur = paso.segundos * 1000;
    while (vivo() && performance.now() - t0 < dur) {
      const v = await E.fuente.voltajeRapido().catch((e) => { if (U.esErrorConexion(e)) throw e; return null; });
      if (v != null) { vals.push(v); mostrarValor("voltaje", v); }
      barra((performance.now() - t0) / dur, `${vals.length} lecturas`);
      if (E.fuente.esSimulador) await U.esperar(120);
    }
    E.pausado = false;
    return vals;
  }

  /** Espera hasta que se cumpla la condición del paso, mostrando el dato que falta. */
  async function esperarCondicion(paso, vivo) {
    if (!paso.condicion) return true;
    const limite = (paso.espera || 90) * 1000, t0 = performance.now();
    while (vivo()) {
      const u = E.historial[E.historial.length - 1];
      if (u && paso.condicion(u)) return true;
      const r = u && u.rpm != null ? `${Math.round(u.rpm)} rpm` : "sin datos";
      const tm = u && u.temp_motor != null ? ` · ${U.valorDato("temp_motor", u.temp_motor).texto} ${U.valorDato("temp_motor", u.temp_motor).unidad}` : "";
      $("#pg-valor").textContent = r + tm;
      barra(0, `Esperando: ${paso.objetivo}. La medición empieza sola.`);
      if (performance.now() - t0 > limite) throw new Error(`No se llegó a la condición (${paso.objetivo}) en ${Math.round(limite / 1000)} s. Repetí la prueba.`);
      await U.esperar(300);
    }
    return false;
  }

  /** Junta las muestras de datos en vivo durante el paso. */
  async function medirDatos(paso, vivo) {
    if (!(await esperarCondicion(paso, vivo))) return [];
    const inicio = E.historial.length ? E.historial[E.historial.length - 1].t : Date.now() / 1000;
    const t0 = performance.now(), dur = paso.segundos * 1000;
    const muestras = [];
    let vistas = E.historial.length;
    while (vivo() && performance.now() - t0 < dur) {
      const nuevas = E.historial.slice(vistas); vistas = E.historial.length;
      for (const m of nuevas) {
        if (m.t < inicio) continue;
        if (!paso.condicion || paso.condicion(m)) muestras.push(m);
        if (paso.terminarSi && paso.terminarSi(m)) { barra(1, "Listo."); return muestras; }
      }
      const u = E.historial[E.historial.length - 1];
      if (u) {
        const clave = paso.clave === "temp" ? "temp_motor" : u.voltaje != null && /carga/.test(paso.clave) ? "voltaje" : "rpm";
        mostrarValor(clave, u[clave]);
      }
      const fuera = paso.condicion && u && !paso.condicion(u) ? ` · Fuera de rango: ${paso.objetivo}` : "";
      barra((performance.now() - t0) / dur, `Midiendo… ${muestras.length} lecturas${fuera}`);
      await U.esperar(250);
    }
    return muestras;
  }

  /** Lecturas rápidas de un solo sensor (para el sensor de oxígeno). */
  async function medirPid(paso, vivo) {
    if (!(await esperarCondicion(paso, vivo))) return [];
    E.pausado = true;
    await U.esperar(250);
    const vals = [], t0 = performance.now(), dur = paso.segundos * 1000;
    while (vivo() && performance.now() - t0 < dur) {
      const v = await E.fuente.leerPid(paso.pid).catch((e) => { if (U.esErrorConexion(e)) throw e; return null; });
      if (v != null) { vals.push({ t: Date.now() / 1000, v }); mostrarValor(paso.pid, v); }
      barra((performance.now() - t0) / dur, `${vals.length} lecturas`);
      if (E.fuente.esSimulador) await U.esperar(90);
    }
    E.pausado = false;
    return vals;
  }

  function mostrarResultado(p, r) {
    const res = { prueba: p.id, titulo: p.titulo, veredicto: r.veredicto, resumen: r.resumen, detalle: r.detalle || "", valores: r.valores || [],
      siguiente: (p.siguiente || {})[r.veredicto] || "", simulado: !!E.fuente.esSimulador };
    E.guiadas[p.id] = res;
    if (r.veredicto !== "error") {
      const c = U.carro();
      S.almacen.guardarPrueba({ ...res, carroId: c && !res.simulado ? c.id : null, km: c && c.km ? Number(c.km) : null });
    }
    $("#pg-cuerpo").innerHTML = `<div class="resultado-g ${esc(r.veredicto)}"><b>${esc(VEREDICTO[r.veredicto])}:</b> ${U.t(r.resumen)}</div>
      ${res.valores.length ? `<ul>${res.valores.map((v) => `<li>${U.t(v)}</li>`).join("")}</ul>` : ""}
      ${res.detalle ? `<p class="nota">${U.t(res.detalle)}</p>` : ""}
      ${res.siguiente ? `<div class="bloque"><b>Siguiente paso:</b> ${U.t(res.siguiente)}</div>` : ""}
      <p class="nota">El resultado también se manda a la IA si pedís un diagnóstico.</p>`;
    $("#pg-cancelar").textContent = "Cerrar";
    dibujarLista();
    U.emit("guiada", res);
  }

  // ================================================================== modo 06
  async function leerModo06() {
    if (!E.fuente) return;
    const b = $("#btn-modo06");
    U.cargando(b, true, "Leyendo…");
    try { E.pruebas06 = await E.fuente.leerPruebas06(); U.emit("modo06"); U.actualizarAnalisis(); }
    catch (e) { $("#modo06").innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; if (U.esErrorConexion(e)) U.toast(e.message, "error"); }
    finally { U.cargando(b, false); b.disabled = !E.conectado; }
  }

  function dibujarModo06() {
    const p = E.pruebas06, el = $("#modo06");
    if (!p) { el.innerHTML = `<div class="vacio">Sin leer todavía.</div>`; return; }
    if (!p.disponible) { el.innerHTML = `<p class="nota">${esc(p.motivo)}</p>`; return; }
    let html = "";
    if (p.misfire.length) {
      const max = Math.max(5, ...p.misfire.map((c) => Math.max(c.actual || 0, c.promedio || 0)));
      html += `<h3>Fallos de encendido por cilindro</h3><div class="barras-cil">${p.misfire.map((c) => {
        const v = Math.max(c.actual || 0, c.promedio || 0), cl = v >= 10 ? "bad" : v >= 5 ? "warn" : "";
        return `<div class="barra-cil ${cl}"><span>Cil ${c.cilindro}</span><div class="b"><span style="width:${Math.round((v / max) * 100)}%"></span></div>
          <span class="num">${c.actual ?? "—"} <small>(prom ${c.promedio ?? "—"})</small></span></div>`;
      }).join("")}</div><p class="nota">Primer número: fallos del último ciclo de manejo. Prom: promedio de los últimos 10 ciclos.</p>`;
    }
    const otras = p.pruebas.filter((x) => !(x.mid >= 0xa1 && x.mid <= 0xad));
    const fab = otras.some((x) => x.estandar === false || x.escala_conocida === false);
    html += `<p class="nota">${p.pruebas.length} resultados · ${p.fallidas.length ? `<b>${p.fallidas.length} fuera de límite</b>` : "todos dentro de sus límites"}.</p>`;
    if (otras.length) {
      html += `<div class="tabla-scroll"><table class="m06"><tr><th>Sistema</th><th>Prueba</th><th>Valor</th><th>Límites</th><th></th></tr>${otras.map((x) => {
        const u = esc(x.unidad || "");
        return `<tr class="${x.ok ? "" : "falla"}"><td>${esc(x.nombre)}</td><td>${esc(x.prueba)}${x.estandar === false ? ` <span class="chip">fabricante</span>` : ""}</td>
          <td class="num">${esc(x.valor)} ${u}</td><td class="num">${esc(x.min)} – ${esc(x.max)} ${u}</td><td>${x.ok ? "✓" : "✗ fuera"}</td></tr>`;
      }).join("")}</table></div>`;
    }
    if (fab) html += `<p class="nota">Las pruebas marcadas "fabricante" usan códigos que define cada marca: ScanIA muestra el valor y los límites que envía la computadora, pero no tiene una tabla validada de qué mide exactamente cada una en tu carro. Que estén fuera de límite sí es una señal real (lo dice la propia computadora).</p>`;
    el.innerHTML = html;
  }

  // ================================================================== revisión de carro usado
  async function revisarUsado() {
    if (!E.fuente) return;
    const vin = $("#u-vin").value.trim().toUpperCase(), anio = Number($("#u-anio").value) || null, km = Number(String($("#u-km").value).replace(/\D/g, "")) || null;
    if (vin && vin.length !== 17) { $("#usado").innerHTML = `<p class="mensaje error">El VIN tiene 17 caracteres (tiene ${vin.length}).</p>`; return; }
    const b = $("#btn-usado");
    U.cargando(b, true, "Revisando…");
    $("#usado").innerHTML = `<p class="nota">Leyendo códigos, monitores y pruebas internas…</p>`;
    try {
      const id = await U.revisionCompleta("revision_usado");
      if (!E.lectura) throw new Error("No se pudo leer el carro.");
      const r = S.revisionUsado({ lectura: E.lectura, info: E.fuente.info(), pruebas06: E.pruebas06, resumen: U.analizarAhora().resumen, declarado: { vin, anio, km } });
      r.fecha = Date.now() / 1000; r.declarado = { vin, anio, km }; r.simulado = !!E.fuente.esSimulador;
      E.ultimaRevisionUsado = r;
      if (id) S.almacen.actualizarEscaneo(id, { revision_usado: r });   // el veredicto queda junto al escaneo
      $("#usado").innerHTML = htmlUsado(r) + `<div class="acciones"><button class="btn" id="u-reporte">Ver reporte para imprimir</button></div>`;
      $("#u-reporte").onclick = () => U.reporteUsado(r);
      U.emit("escaneo");
    } catch (e) { $("#usado").innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; }
    finally { U.cargando(b, false); b.disabled = !E.conectado; }
  }

  const ICONO = { ok: "✓", aviso: "!", mal: "✗", sin_dato: "?" };
  U.htmlUsado = htmlUsado;
  function htmlUsado(r) {
    return `<div class="resultado-g ${r.veredicto === "aviso" ? "regular" : esc(r.veredicto)}"><b>${esc(r.titulo)}</b>${r.simulado ? " (simulador)" : ""}</div>
      ${r.puntos.map((x) => `<div class="punto-u ${esc(x.estado)}"><span class="ic">${ICONO[x.estado] || "·"}</span><div><b>${esc(x.tema)}:</b> ${U.t(x.texto)}</div></div>`).join("")}
      <p class="nota">${esc(r.limites)}</p>`;
  }

  // ================================================================== inicio de esta parte
  U.on("init", () => {
    $("#btn-modo06").addEventListener("click", leerModo06);
    $("#btn-usado").addEventListener("click", revisarUsado);
    $("#u-vin").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
    dibujarLista();
    dibujarModo06();
  });
  U.on("conexion", () => { dibujarLista(); dibujarModo06(); });
  U.on("modo06", dibujarModo06);
  U.on("carro", dibujarLista);
})();
