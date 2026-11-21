/* ScanIA · interfaz: Mis carros, mantenimiento, historial, comparación de escaneos y reportes */
(function () {
  "use strict";
  const S = window.ScanIA, U = S.ui, E = U.estado, $ = U.$, $$ = U.$$, esc = U.esc;
  const A = () => S.almacen;
  const nombreCarro = (c) => (c ? c.apodo || [c.marca, c.modelo, c.anio].filter(Boolean).join(" ") || "Carro sin nombre" : "Sin carro");

  const CAMPOS = [
    ["apodo", "Apodo (ej. El Corolla de mamá)", "text"], ["marca", "Marca", "text"], ["modelo", "Modelo", "text"], ["anio", "Año", "numeric"],
    ["motor", "Motor (ej. 1.8 VVT-i)", "text"], ["codigo_motor", "Código de motor (ej. 2ZR-FE)", "text"], ["cilindrada", "Cilindrada en litros (ej. 1.8)", "decimal"],
    ["cilindros", "Cilindros", "numeric"], ["combustible", "Combustible", ["", "Gasolina", "Diésel", "Híbrido", "GLP / gas"]],
    ["transmision", "Transmisión", ["", "Manual", "Automática", "CVT", "Doble embrague"]], ["traccion", "Tracción", ["", "Delantera", "Trasera", "4x4 / AWD"]],
    ["km", "Kilometraje actual", "numeric"], ["vin", "VIN (opcional, 17 caracteres)", "text"],
  ];

  // ================================================================== formulario
  function formCarro(c = {}) {
    const leido = E.fuente && !E.fuente.esSimulador && E.fuente.info().vin;
    U.modal(`<h2>${c.id ? "Editar carro" : "Agregar carro"}</h2>
      <div class="form-carro">${CAMPOS.map(([k, n, t]) => Array.isArray(t)
        ? `<label>${n}<select data-campo="${k}">${t.map((o) => `<option${(c[k] || "") === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`
        : `<label>${n}<input data-campo="${k}" value="${esc(c[k] ?? "")}" ${t === "text" ? "" : `inputmode="${t}"`} ${k === "vin" ? 'maxlength="17" spellcheck="false" autocomplete="off"' : ""}></label>`).join("")}</div>
      <label>Notas (fallas que ya tuvo, modificaciones, etc.)<textarea data-campo="notas" rows="2">${esc(c.notas || "")}</textarea></label>
      <div class="acciones">
        ${leido ? `<button class="btn" id="fc-vin-leido">Usar el VIN leído del carro</button>` : ""}
        <button class="btn" id="fc-decodificar">Completar con el VIN</button>
      </div>
      <p class="nota" id="fc-vin-msg"></p>
      <div class="acciones"><button class="btn primario" id="fc-guardar">Guardar</button><button class="btn" id="fc-cancelar">Cancelar</button></div>`, () => {
      const campo = (k) => document.querySelector(`[data-campo="${k}"]`);
      campo("vin").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); revisarVIN(); });
      function revisarVIN() {
        const v = campo("vin").value;
        $("#fc-vin-msg").textContent = !v ? "" : v.length < 17 ? `${v.length}/17 caracteres` : (() => { const r = S.verificarVIN(v); return r.valido ? r.nota : r.motivo; })();
      }
      revisarVIN();
      if (leido) $("#fc-vin-leido").onclick = () => { campo("vin").value = leido; revisarVIN(); };
      $("#fc-decodificar").onclick = async (ev) => {
        const vin = campo("vin").value;
        if (vin.length !== 17) { $("#fc-vin-msg").textContent = "Escribí los 17 caracteres del VIN primero."; return; }
        U.cargando(ev.target, true, "Buscando…");
        try {
          let r;
          if (E.ajustes.decodificarVIN) r = await S.decodificarVIN(vin);
          else { r = { ...(S.decodificarVINLocal(vin) || {}), fuente: "local" }; }
          for (const k of ["marca", "modelo", "anio", "cilindrada", "cilindros", "codigo_motor"]) if (r[k] && !campo(k).value) campo(k).value = r[k];
          if (!campo("marca").value && r.fabricante) campo("marca").value = r.fabricante;
          $("#fc-vin-msg").textContent = r.fuente === "NHTSA" ? "Datos completados con la base pública de la NHTSA (puede no conocer modelos de Latinoamérica). Revisalos."
            : `Solo se pudo deducir ${[r.fabricante && "el fabricante", r.anio && "el año"].filter(Boolean).join(" y ") || "poco"} sin internet.` +
              (E.ajustes.decodificarVIN ? "" : " Para más datos, permití la consulta a la NHTSA en ⚙ Ajustes → Privacidad (envía el VIN a internet).");
        } catch (e) { $("#fc-vin-msg").textContent = e.message; }
        finally { U.cargando(ev.target, false); }
      };
      $("#fc-cancelar").onclick = U.cerrarModal;
      $("#fc-guardar").onclick = () => {
        const datos = { ...(c.id ? { id: c.id } : {}) };
        for (const [k] of CAMPOS) datos[k] = campo(k).value.trim();
        datos.notas = campo("notas").value.trim();
        if (datos.vin && datos.vin.length !== 17) { $("#fc-vin-msg").textContent = "El VIN debe tener 17 caracteres (o dejalo vacío)."; return; }
        if (datos.cilindrada) datos.cilindrada = datos.cilindrada.replace(",", ".");
        if (datos.km) datos.km = Number(String(datos.km).replace(/\D/g, "")) || "";
        if (!datos.apodo && !datos.marca && !datos.modelo) { $("#fc-vin-msg").textContent = "Poné al menos un apodo o la marca y el modelo."; return; }
        const id = A().guardarCarro(datos);
        if (!c.id || !A().carroActivoId()) A().elegirCarro(id);
        U.cerrarModal();
        U.emit("carro");
        dibujar(id);
      };
    });
  }

  // ================================================================== lista y detalle
  let abierto = null;
  function dibujar(id) {
    const carros = A().carros(), activo = A().carroActivoId();
    if (id !== undefined) abierto = id;
    if (abierto == null || !carros.some((c) => c.id === abierto)) abierto = activo ?? (carros[0] && carros[0].id) ?? null;
    const sinCarro = A().escaneos().filter((e) => e.carroId == null && !e.simulado).length;
    $("#lista-carros").innerHTML = carros.map((c) => {
      const venc = S.estadoMantenimiento(c).filter((m) => m.estado === "vencido").length;
      return `<div class="carro-card${c.id === activo ? " activo" : ""}" data-carro="${c.id}">
        <div class="ap">${esc(nombreCarro(c))}</div>
        <div class="nota">${esc([c.marca, c.modelo, c.anio, c.motor].filter(Boolean).join(" · "))}</div>
        <div class="nota">${c.km ? U.num(c.km) + " km" : "km sin registrar"}${venc ? ` · <span class="rojo">${venc} mantenimiento(s) vencido(s)</span>` : ""}</div>
        ${c.id === activo ? `<span class="chip ok">Carro activo</span>` : `<button class="btn chico" data-activar="${c.id}">Usar este carro</button>`}
      </div>`;
    }).join("") + (carros.length ? "" : `<div class="vacio">Todavía no hay carros. Agregá uno para guardar su historial y mantenimiento.</div>`) +
      (sinCarro ? `<div class="vacio">${sinCarro} escaneo(s) sin carro asignado. <button class="btn chico" id="ver-sin-carro">Ver</button></div>` : "");
    $$("[data-carro]").forEach((d) => d.addEventListener("click", (e) => { if (!e.target.closest("button")) dibujar(Number(d.dataset.carro)); }));
    $$("[data-activar]").forEach((b) => b.addEventListener("click", () => { A().elegirCarro(Number(b.dataset.activar)); U.emit("carro"); dibujar(Number(b.dataset.activar)); }));
    const vs = $("#ver-sin-carro"); if (vs) vs.onclick = verSinCarro;
    detalle(abierto != null ? A().carro(abierto) : null);
  }
  U.dibujarCarros = dibujar;

  function detalle(c) {
    const el = $("#detalle-carro");
    if (!c) { el.classList.add("oculto"); return; }
    el.classList.remove("oculto");
    const mant = S.estadoMantenimiento(c);
    const escaneos = A().escaneos(c.id), diags = A().historial().filter((d) => d.carroId === c.id), pruebas = A().pruebas(c.id);
    const fab = S.detectarFabricante({ vin: c.vin, marca: c.marca });
    const ESTADO_M = { vencido: "Vencido", pronto: "Pronto", ok: "Al día", sin_dato: "Sin registro" };
    el.innerHTML = `<div class="cabecera"><h2>${esc(nombreCarro(c))}</h2>
        <div class="acciones"><button class="btn" id="dc-editar">Editar</button><button class="btn" id="dc-km">Actualizar km</button><button class="btn peligro" id="dc-borrar">Borrar</button></div></div>
      <dl class="info">${CAMPOS.filter(([k]) => c[k]).map(([k, n]) => `<dt>${esc(n.replace(/ \(.*\)/, ""))}</dt><dd>${esc(k === "km" ? U.num(c.km) : c[k])}</dd>`).join("")}
        ${fab ? `<dt>Fabricante</dt><dd>${esc(S.FABRICANTES[fab].nombre)}</dd>` : ""}</dl>
      ${c.notas ? `<p class="nota">${esc(c.notas)}</p>` : ""}

      <h3>Mantenimiento</h3>
      <p class="nota">Los intervalos son típicos; ajustalos según el manual de tu carro (botón Intervalos).</p>
      ${mant.map((m, i) => `<div class="mant"><div><b>${esc(m.tipo)}</b> <span class="nota">${esc([m.km && `cada ${U.num(m.km)} km`, m.meses && `cada ${m.meses} meses`].filter(Boolean).join(" o "))}</span>
          <div class="estado ${m.estado}">${ESTADO_M[m.estado]}${m.ultimo ? ` · último: ${U.fechaDia(m.ultimo.fecha)}${m.ultimo.km ? " a " + U.num(m.ultimo.km) + " km" : ""}` : ""}${m.falta && m.estado !== "vencido" ? ` · faltan ${esc(m.falta)}` : ""}</div></div>
          <button data-mant="${i}">Registrar</button></div>`).join("")}
      <div class="acciones"><button class="btn" id="dc-intervalos">Intervalos</button><button class="btn" id="dc-reparacion">Registrar reparación</button></div>

      <h3>Reparaciones y trabajos registrados</h3>
      ${((c.mantenimientos || []).length ? c.mantenimientos.map((m) => `<div class="fila-hist"><span class="nota">${U.fechaDia(m.fecha)}</span>
          <div><b>${esc(m.tipo)}</b>${m.km ? ` · ${U.num(m.km)} km` : ""}${m.costo ? ` · L ${U.num(m.costo)}` : ""}${m.nota ? `<div class="nota">${esc(m.nota)}</div>` : ""}</div>
          <div class="acc"><button data-borrar-mant="${m.id}">Borrar</button></div></div>`).join("") : `<p class="nota">Nada registrado todavía.</p>`)}

      <h3>Escaneos guardados</h3>
      ${escaneos.length ? `<p class="nota">Marcá dos para compararlos.</p>` + escaneos.map((e) => filaEscaneo(e)).join("") +
        `<div class="acciones"><button class="btn" id="dc-comparar" disabled>Comparar seleccionados</button></div>` : `<p class="nota">Ninguno. Cada vez que leés los códigos se guarda uno.</p>`}

      <h3>Pruebas guiadas</h3>
      ${pruebas.length ? pruebas.slice(0, 15).map((p) => `<div class="fila-hist"><span class="nota">${U.fechaDia(p.fecha)}</span><div><b>${esc(p.titulo)}</b>: <span class="${p.veredicto === "ok" ? "verde" : p.veredicto === "mal" ? "rojo" : "ambar"}">${esc(p.veredicto)}</span> — ${U.t(p.resumen)}</div><div class="acc"><button data-borrar-prueba="${p.id}">Borrar</button></div></div>`).join("") : `<p class="nota">Ninguna todavía.</p>`}

      <h3>Diagnósticos con IA</h3>
      ${diags.length ? diags.map((d) => `<div class="fila-hist"><span class="nota">${U.fecha(d.fecha)}</span>
          <div>${esc((d.diagnostico && d.diagnostico.resumen || "").slice(0, 140))}${(d.codigos || []).length ? ` <span class="nota">(${esc(d.codigos.join(", "))})</span>` : ""}</div>
          <div class="acc"><button data-abrir-diag="${d.id}">Abrir</button><button data-rep-diag="${d.id}">Reporte</button><button data-borrar-diag="${d.id}">Borrar</button></div></div>`).join("") : `<p class="nota">Ninguno todavía.</p>`}`;

    $("#dc-editar").onclick = () => formCarro(c);
    $("#dc-borrar").onclick = () => confirmar(`¿Borrar ${esc(nombreCarro(c))}?`, "Se borra el carro y su mantenimiento. Los escaneos y diagnósticos quedan guardados sin carro asignado (podés exportar un respaldo antes).", "Borrar carro", () => {
      for (const e of A().escaneos(c.id)) A().actualizarEscaneo(e.id, { carroId: null });
      A().borrarCarro(c.id); U.emit("carro"); dibujar(null);
    });
    $("#dc-km").onclick = () => pedirTexto("Kilometraje actual", c.km || "", "numeric", (v) => { const km = Number(String(v).replace(/\D/g, "")); if (km) { A().guardarCarro({ id: c.id, km }); dibujar(c.id); U.emit("carro"); } });
    $$("[data-mant]").forEach((b) => b.addEventListener("click", () => registrarMant(c, mant[Number(b.dataset.mant)].tipo)));
    $("#dc-reparacion").onclick = () => registrarMant(c, "");
    $("#dc-intervalos").onclick = () => editarIntervalos(c);
    $$("[data-borrar-mant]").forEach((b) => b.addEventListener("click", () => confirmar("¿Borrar este registro?", "", "Borrar", () => { A().borrarMantenimiento(c.id, Number(b.dataset.borrarMant)); dibujar(c.id); })));
    $$("[data-borrar-prueba]").forEach((b) => b.addEventListener("click", () => confirmar("¿Borrar este resultado?", "", "Borrar", () => { A().borrarPrueba(Number(b.dataset.borrarPrueba)); dibujar(c.id); })));
    $$("[data-abrir-diag]").forEach((b) => b.addEventListener("click", () => U.abrirDiagnostico(Number(b.dataset.abrirDiag))));
    $$("[data-rep-diag]").forEach((b) => b.addEventListener("click", () => U.reporteDiagnostico(A().obtener(Number(b.dataset.repDiag)))));
    $$("[data-borrar-diag]").forEach((b) => b.addEventListener("click", () => confirmar("¿Borrar este diagnóstico?", "", "Borrar", () => { A().borrarDiagnostico(Number(b.dataset.borrarDiag)); dibujar(c.id); })));
    enlazarEscaneos(el, () => dibujar(c.id));
  }

  function filaEscaneo(e) {
    const n = ((e.lectura && e.lectura.codigos) || []).length;
    const ORIGEN = { completo: "Revisión completa", manual: "Lectura de códigos", antes_de_borrar: "Antes de borrar códigos", revision_usado: "Revisión de usado" };
    return `<div class="fila-hist"><input type="checkbox" data-sel-esc="${e.id}" title="Comparar">
      <div><b>${U.fecha(e.fecha)}</b>${e.km ? ` · ${U.num(e.km)} km` : ""} · ${esc(ORIGEN[e.origen] || e.origen || "Escaneo")}${e.simulado ? " · simulador" : ""}
        <div class="nota">${n ? `${n} código(s): ${esc(e.lectura.codigos.map((c) => c.codigo).join(", "))}` : "Sin códigos"}${(e.hallazgos || []).filter((h) => h.certeza).length ? ` · ${e.hallazgos.filter((h) => h.certeza).length} hallazgo(s)` : ""}</div></div>
      <div class="acc"><button data-rep-esc="${e.id}">Ver</button><button data-borrar-esc="${e.id}">Borrar</button></div></div>`;
  }
  function enlazarEscaneos(raiz, refrescar) {
    raiz.querySelectorAll("[data-rep-esc]").forEach((b) => b.addEventListener("click", () => U.reporteEscaneo(A().escaneo(Number(b.dataset.repEsc)))));
    raiz.querySelectorAll("[data-borrar-esc]").forEach((b) => b.addEventListener("click", () => confirmar("¿Borrar este escaneo?", "Se pierde del historial (no afecta al carro).", "Borrar", () => { A().borrarEscaneo(Number(b.dataset.borrarEsc)); refrescar(); })));
    const comp = raiz.querySelector("#dc-comparar");
    const sel = () => Array.from(raiz.querySelectorAll("[data-sel-esc]:checked")).map((x) => Number(x.dataset.selEsc));
    raiz.querySelectorAll("[data-sel-esc]").forEach((x) => x.addEventListener("change", () => { if (comp) comp.disabled = sel().length !== 2; }));
    if (comp) comp.onclick = () => {
      const [a, b] = sel().map((id) => A().escaneo(id)).sort((x, y) => x.fecha - y.fecha);
      U.reporteComparacion(a, b);
    };
  }

  function verSinCarro() {
    const lista = A().escaneos().filter((e) => e.carroId == null && !e.simulado);
    const activo = U.carro();
    U.modal(`<h2>Escaneos sin carro</h2>${lista.map((e) => filaEscaneo(e)).join("")}
      <div class="acciones">${activo ? `<button class="btn primario" id="sc-asignar" disabled>Asignar los marcados a ${esc(nombreCarro(activo))}</button>` : `<span class="nota">Elegí un carro activo para poder asignarlos.</span>`}
      <button class="btn" id="sc-cerrar">Cerrar</button></div>`, (caja) => {
      enlazarEscaneos(caja, verSinCarro);
      const sel = () => Array.from(caja.querySelectorAll("[data-sel-esc]:checked")).map((x) => Number(x.dataset.selEsc));
      const b = $("#sc-asignar");
      caja.querySelectorAll("[data-sel-esc]").forEach((x) => x.addEventListener("change", () => { if (b) b.disabled = !sel().length; }));
      if (b) b.onclick = () => { for (const id of sel()) A().actualizarEscaneo(id, { carroId: activo.id }); U.cerrarModal(); dibujar(activo.id); };
      $("#sc-cerrar").onclick = U.cerrarModal;
    });
  }

  function registrarMant(c, tipo) {
    const tipos = (c.intervalos || S.MANTENIMIENTO_BASE).map((m) => m.tipo);
    U.modal(`<h2>${tipo ? "Registrar mantenimiento" : "Registrar reparación o trabajo"}</h2>
      <label>Qué se hizo <input id="rm-tipo" list="rm-tipos" value="${esc(tipo)}" placeholder="Ej: Cambio de bobina cilindro 2"></label>
      <datalist id="rm-tipos">${tipos.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
      <div class="form-carro"><label>Fecha <input id="rm-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>Kilometraje <input id="rm-km" inputmode="numeric" value="${esc(c.km || "")}"></label>
        <label>Costo (L, opcional) <input id="rm-costo" inputmode="decimal"></label></div>
      <label>Nota (taller, piezas, códigos que resolvió) <textarea id="rm-nota" rows="2"></textarea></label>
      <div class="acciones"><button class="btn primario" id="rm-guardar">Guardar</button><button class="btn" id="rm-cancelar">Cancelar</button></div>`, () => {
      $("#rm-cancelar").onclick = U.cerrarModal;
      $("#rm-guardar").onclick = () => {
        const t = $("#rm-tipo").value.trim();
        if (!t) { $("#rm-tipo").focus(); return; }
        const f = $("#rm-fecha").value ? new Date($("#rm-fecha").value + "T12:00:00").getTime() / 1000 : Date.now() / 1000;
        A().registrarMantenimiento(c.id, { tipo: t, fecha: f, km: Number(String($("#rm-km").value).replace(/\D/g, "")) || "", costo: $("#rm-costo").value.trim(), nota: $("#rm-nota").value.trim() });
        U.cerrarModal(); dibujar(c.id); U.emit("carro");
      };
    });
  }

  function editarIntervalos(c) {
    const lista = (c.intervalos || S.MANTENIMIENTO_BASE).map((m) => ({ ...m }));
    U.modal(`<h2>Intervalos de mantenimiento</h2><p class="nota">0 = no aplica. Usá los del manual de tu carro.</p>
      <table class="mini"><tr><th>Trabajo</th><th>km</th><th>meses</th></tr>${lista.map((m, i) => `<tr><td>${esc(m.tipo)}</td>
        <td><input data-ikm="${i}" inputmode="numeric" value="${m.km || 0}"></td><td><input data-imes="${i}" inputmode="numeric" value="${m.meses || 0}"></td></tr>`).join("")}</table>
      <div class="acciones"><button class="btn primario" id="iv-guardar">Guardar</button><button class="btn" id="iv-base">Valores típicos</button><button class="btn" id="iv-cancelar">Cancelar</button></div>`, () => {
      $("#iv-cancelar").onclick = U.cerrarModal;
      $("#iv-base").onclick = () => { A().guardarCarro({ id: c.id, intervalos: S.MANTENIMIENTO_BASE.map((m) => ({ ...m })) }); U.cerrarModal(); dibujar(c.id); };
      $("#iv-guardar").onclick = () => {
        lista.forEach((m, i) => { m.km = Number(document.querySelector(`[data-ikm="${i}"]`).value) || 0; m.meses = Number(document.querySelector(`[data-imes="${i}"]`).value) || 0; });
        A().guardarCarro({ id: c.id, intervalos: lista }); U.cerrarModal(); dibujar(c.id); U.emit("carro");
      };
    });
  }

  // ================================================================== diálogos pequeños
  function confirmar(titulo, texto, boton, alAceptar) {
    U.modal(`<h2>${titulo}</h2>${texto ? `<p>${esc(texto)}</p>` : ""}<div class="acciones"><button class="btn peligro" id="cf-si">${esc(boton)}</button><button class="btn" id="cf-no">Cancelar</button></div>`, () => {
      $("#cf-no").onclick = U.cerrarModal;
      $("#cf-si").onclick = () => { U.cerrarModal(); alAceptar(); };
    });
  }
  U.confirmar = confirmar;
  function pedirTexto(titulo, valor, modo, alAceptar) {
    U.modal(`<h2>${esc(titulo)}</h2><input id="pt-valor" value="${esc(valor)}" inputmode="${modo}"><div class="acciones"><button class="btn primario" id="pt-si">Guardar</button><button class="btn" id="pt-no">Cancelar</button></div>`, () => {
      $("#pt-valor").focus();
      $("#pt-no").onclick = U.cerrarModal;
      $("#pt-si").onclick = () => { const v = $("#pt-valor").value; U.cerrarModal(); alAceptar(v); };
    });
  }

  // ================================================================== reportes (imprimir / PDF / JSON)
  let jsonReporte = null, nombreReporte = "reporte";
  U.reporte = function (titulo, cuerpo, datos, nombre, { carro, simulado } = {}) {
    jsonReporte = datos; nombreReporte = nombre || "reporte";
    const c = carro === undefined ? U.carro() : carro;
    $("#reporte-hoja").innerHTML = `<header class="rep-cab"><div><h1>${esc(titulo)}</h1><p>ScanIA · ${esc(new Date().toLocaleString("es-HN"))}</p></div>
        <div class="rep-carro">${c ? `<b>${esc(nombreCarro(c))}</b><br>${esc([c.marca, c.modelo, c.anio, c.motor].filter(Boolean).join(" · "))}${c.km ? `<br>${U.num(c.km)} km` : ""}` : ""}</div></header>
      ${simulado ? `<div class="advertencia">DATOS DE SIMULADOR — no corresponden a un carro real.</div>` : ""}
      ${cuerpo}
      <footer class="rep-pie">ScanIA orienta el diagnóstico con OBD2 genérico; no reemplaza la revisión física de un mecánico. Confirmá antes de cambiar piezas.</footer>`;
    $("#reporte").classList.remove("oculto");
    document.body.classList.add("con-reporte");
  };
  function cerrarReporte() { $("#reporte").classList.add("oculto"); document.body.classList.remove("con-reporte"); }

  function htmlCodigos(l) {
    const cods = (l && l.codigos) || [];
    return cods.length ? `<table class="rep-tabla"><tr><th>Código</th><th>Descripción</th><th>Tipo</th><th>Gravedad</th></tr>${cods.map((c) =>
      `<tr><td><b>${esc(c.codigo)}</b></td><td>${esc(c.descripcion)}</td><td>${esc([c.tipo, ...(c.tambien || [])].join(", "))}${(c.modulos || []).length ? `<br><small>${esc(c.modulos.join(", "))}</small>` : ""}</td><td>${esc(U.NOMBRE_GRAVEDAD[c.gravedad] || c.gravedad)}</td></tr>`).join("")}</table>`
      : "<p>Sin códigos de falla.</p>";
  }
  function htmlMonitores(l) {
    const mon = (l && l.estado && l.estado.monitores) || [];
    return mon.length ? `<p>${mon.map((m) => `${esc(m.nombre_es)}: ${m.completo ? "listo" : "<b>pendiente</b>"}`).join(" · ")}</p>` : "";
  }

  U.reporteEscaneo = function (e) {
    if (!e) return;
    const l = e.lectura || {}, st = l.estado || {};
    const ff = l.freeze_frame;
    const cuerpo = `<h2>Escaneo del ${esc(U.fecha(e.fecha))}${e.km ? ` · ${U.num(e.km)} km` : ""}</h2>
      ${e.info ? `<p><small>${esc([e.info.protocolo, e.info.computadora, e.info.calibracion && "Calibración " + e.info.calibracion].filter(Boolean).join(" · "))}</small></p>` : ""}
      <p><b>Check engine:</b> ${st.mil ? "ENCENDIDO" : st.mil === false ? "apagado" : "desconocido"}</p>
      <h3>Códigos</h3>${htmlCodigos(l)}
      ${ff && ff.datos ? `<h3>Freeze frame (${esc(ff.codigo)})</h3><p>${Object.entries(ff.datos).map(([k, v]) => { const x = U.valorDato(k, v); return `${esc((S.META[k] || {}).nombre || k)}: ${esc(x.texto)} ${esc(x.unidad)}`; }).join(" · ")}</p>` : ""}
      ${htmlMonitores(l) ? `<h3>Monitores</h3>${htmlMonitores(l)}` : ""}
      ${e.pruebas06 ? `<h3>Pruebas internas (modo 06)</h3><p>${e.pruebas06.disponible ? `${e.pruebas06.total} pruebas, ${(e.pruebas06.fallidas || []).length} fuera de límite.` +
        ((e.pruebas06.misfire || []).length ? ` Fallos por cilindro: ${e.pruebas06.misfire.map((c) => `cil ${c.cilindro}: ${Math.max(c.actual || 0, c.promedio || 0)}`).join(", ")}.` : "") : esc(e.pruebas06.motivo)}</p>` : ""}
      ${(e.hallazgos || []).length ? `<h3>Análisis local</h3><ul>${e.hallazgos.map((h) => `<li><b>${U.t(h.titulo)}</b>${h.certeza ? ` (${esc(S.CERTEZAS[h.certeza])})` : ""}${(h.evidencia || []).length ? `: ${U.t(h.evidencia.join("; "))}` : ""}</li>`).join("")}</ul>` : ""}
      ${e.revision_usado ? `<h3>Revisión de carro usado</h3>${U.htmlUsado(e.revision_usado)}` : ""}`;
    U.reporte("Reporte de escaneo", cuerpo, e, `scania-escaneo-${e.id}`, { carro: e.carroId != null ? A().carro(e.carroId) : null, simulado: e.simulado });
  };

  U.reporteDiagnostico = function (d) {
    if (!d) return;
    const cuerpo = `<h2>Diagnóstico del ${esc(U.fecha(d.fecha))}</h2>
      ${d.sintomas ? `<p><b>Síntomas:</b> ${esc(d.sintomas)}</p>` : ""}
      ${(d.codigos || []).length ? `<p><b>Códigos:</b> ${esc(d.codigos.join(", "))}</p>` : ""}
      ${U.htmlDiagnostico(d.diagnostico)}
      ${(d.chat || []).length ? `<h3>Seguimiento</h3>${d.chat.map((m) => `<div class="rep-chat"><b>${m.rol === "user" ? "Pregunta" : "IA"}:</b> ${U.md(m.texto)}</div>`).join("")}` : ""}`;
    const datos = { ...d }; delete datos.mensajes;
    U.reporte("Diagnóstico con IA", cuerpo, datos, `scania-diagnostico-${d.id}`, { carro: d.carroId != null ? A().carro(d.carroId) : null, simulado: d.simulado });
  };

  U.reporteUsado = function (r) {
    const cuerpo = `<h2>Revisión de carro usado</h2>
      ${r.declarado ? `<p>Datos declarados: ${esc([r.declarado.vin && "VIN " + r.declarado.vin, r.declarado.anio && "año " + r.declarado.anio, r.declarado.km && U.num(r.declarado.km) + " km"].filter(Boolean).join(" · ") || "ninguno")}</p>` : ""}
      ${U.htmlUsado(r)}<h3>Códigos leídos</h3>${htmlCodigos(E.lectura)}`;
    U.reporte("Revisión de carro usado", cuerpo, { revision: r, lectura: E.lectura, info: E.fuente ? E.fuente.info() : null }, "scania-revision-usado", { carro: null, simulado: r.simulado });
  };

  U.reporteComparacion = function (a, b) {
    const x = S.compararEscaneos(a, b);
    const lista = (t, l) => `<p><b>${t}:</b> ${l.length ? esc(l.join(", ")) : "ninguno"}</p>`;
    const cuerpo = `<h2>Comparación de escaneos</h2>
      <p>${esc(U.fecha(a.fecha))} → ${esc(U.fecha(b.fecha))}${x.dias != null ? ` (${x.dias} días` : ""}${x.km != null ? `, ${U.num(x.km)} km` : ""}${x.dias != null ? ")" : ""}</p>
      ${lista("Códigos nuevos", x.nuevos)}${lista("Códigos que desaparecieron", x.resueltos)}${lista("Códigos que siguen", x.siguen)}
      ${x.monitores.length ? `<p><b>Monitores que cambiaron:</b> ${x.monitores.map((m) => `${esc(m.monitor)} (${m.antes ? "listo" : "pendiente"} → ${m.ahora ? "listo" : "pendiente"})`).join(", ")}</p>` : ""}
      ${x.misfire.length ? `<p><b>Fallos por cilindro:</b> ${x.misfire.map((m) => `cil ${m.cilindro}: ${m.antes} → ${m.ahora}`).join(", ")}</p>` : ""}
      ${x.datos.length ? `<table class="rep-tabla"><tr><th>Dato</th><th>Antes</th><th>Ahora</th><th>Cambio</th></tr>${x.datos.map((d) => `<tr><td>${U.t(d.nombre)}</td><td>${U.t(String(d.antes))}</td><td>${U.t(String(d.ahora))}</td><td>${d.cambio >= 0 ? "+" : ""}${Math.round(d.cambio * 10) / 10}</td></tr>`).join("")}</table>` : "<p>No hay datos en vivo comparables (hace falta que ambos escaneos tengan datos en vivo).</p>"}
      ${lista("Hallazgos nuevos", x.hallazgos_nuevos)}${lista("Hallazgos que ya no aparecen", x.hallazgos_resueltos)}
      <p class="nota">Si un código desapareció justo después de borrarlo, no significa que se reparó: esperá varios días de manejo y volvé a escanear.</p>`;
    U.reporte("Comparación de escaneos", cuerpo, { antes: a, ahora: b, comparacion: x }, `scania-comparacion-${a.id}-${b.id}`, { carro: a.carroId != null ? A().carro(a.carroId) : null, simulado: a.simulado || b.simulado });
  };

  // ================================================================== inicio de esta parte
  U.on("init", () => {
    $("#btn-nuevo-carro").addEventListener("click", () => formCarro({}));
    $("#rep-cerrar").addEventListener("click", cerrarReporte);
    $("#rep-imprimir").addEventListener("click", () => window.print());
    $("#rep-json").addEventListener("click", () => U.descargar(`${nombreReporte}.json`, JSON.stringify(jsonReporte, null, 2)));
    dibujar();
  });
  U.on("carro", () => { if (!$("#modal").classList.contains("oculto")) return; dibujar(); });
  U.on("escaneo", () => dibujar());
  U.on("guiada", () => dibujar());
  U.nuevoCarro = () => formCarro({});
})();
