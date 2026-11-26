/* ScanIA · interfaz: buscar códigos, registro técnico, respaldo, capacidades por marca y ajustes */
(function () {
  "use strict";
  const S = window.ScanIA, U = S.ui, E = U.estado, $ = U.$, $$ = U.$$, esc = U.esc;

  // ================================================================== buscar un código
  function buscarCodigo() {
    const cod = $("#buscar-codigo").value.trim().toUpperCase();
    const el = $("#resultado-codigo");
    if (!S.esCodigoValido(cod)) { el.innerHTML = `<p class="mensaje error">Escribí un código como P0171, U0100, B1000 o C0035.</p>`; return; }
    const d = S.describir(cod);
    const listo = E.ajustes.servidor && E.ajustes.codigo;
    el.innerHTML = `<div class="codigo ${esc(d.gravedad)}"><div class="num">${esc(d.codigo)}</div><div class="desc">${esc(d.descripcion)}</div>
      <div class="meta"><span class="chip ${esc(d.gravedad)}">${esc(U.NOMBRE_GRAVEDAD[d.gravedad] || d.gravedad)}</span><span>${esc(d.sistema)}${d.subsistema ? " · " + esc(d.subsistema) : ""}</span>
        ${d.de_fabricante ? `<span class="chip">del fabricante</span>` : ""}</div>${d.nota ? `<div class="aviso">${esc(d.nota)}</div>` : ""}</div>
      ${listo ? `<div class="acciones"><button class="btn" id="bc-ia">Explicar para ${esc(U.carro() ? (U.carro().apodo || U.carro().marca || "mi carro") : "mi carro")} con IA</button></div>` : `<p class="nota">Con el servidor de IA configurado, la IA te explica las causas más comunes en tu modelo.</p>`}
      <div id="bc-resp"></div>`;
    const b = $("#bc-ia");
    if (b) b.onclick = async () => {
      U.cargando(b, true, "Consultando…");
      try {
        const r = await S.consultarCodigo({ conexion: { servidor: E.ajustes.servidor, codigo: E.ajustes.codigo }, modelo: E.ajustes.modelo, codigo: cod, vehiculo: U.vehiculoParaIA(), buscar: false });
        $("#bc-resp").innerHTML = `<div class="resultado-ia">${U.md(r.respuesta)}</div>`;
      } catch (e) { $("#bc-resp").innerHTML = `<p class="mensaje error">${esc(e.message)}</p>`; }
      finally { U.cargando(b, false); }
    };
  }

  // ================================================================== registro técnico
  function dibujarRegistro() {
    const pre = $("#registro");
    const abajo = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
    pre.textContent = U.textoRegistro();
    if (abajo) pre.scrollTop = pre.scrollHeight;
  }
  function registroCompleto() {
    const f = E.registroFuente;
    const info = f ? f.info() : {};
    const cab = [`ScanIA — registro técnico (${new Date().toISOString()})`, `Navegador: ${navigator.userAgent}`,
      `Adaptador: ${info.elm || "?"} · Conexión: ${info.puerto || "?"} · Protocolo: ${info.protocolo || "?"} · CAN: ${f ? f.esCAN : "?"}`,
      ...(f && f.avisos && f.avisos.length ? ["Avisos: " + f.avisos.join(" | ")] : []), "", ""].join("\n");
    // El VIN es dato identificable: se tapa en el registro que se comparte
    return cab + U.textoRegistro().replace(/\b[A-HJ-NPR-Z0-9]{11}([A-HJ-NPR-Z0-9]{6})\b/g, "***********$1");
  }

  // ================================================================== respaldo
  async function exportar() {
    const d = S.almacen.exportar($("#resp-codigo").checked);
    if ($("#resp-archivos") && $("#resp-archivos").checked) { try { d.archivos = await S.archivos.todos(); } catch (e) { d.archivos = []; } }
    U.descargar(`scania-respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2));
    U.mensaje($("#msg-respaldo"), `Respaldo descargado: ${d.carros.length} carro(s), ${d.escaneos.length} escaneo(s), ${d.historial.length} diagnóstico(s).`, "ok");
  }
  async function importar(ev) {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      const nArch = (d.archivos || []).filter((a) => a && a.id && a.datos).length;
      U.confirmar("¿Restaurar este respaldo?", `Se juntan los carros, escaneos y diagnósticos del archivo con los que ya tenés. No se borra nada.${nArch ? ` Trae ${nArch} archivo(s) (fotos o diagramas).` : ""}`, "Restaurar", async () => {
        try {
          const r = S.almacen.importar(d);
          let okA = 0;
          for (const a of d.archivos || []) if (a && a.id && a.datos) { try { await S.archivos.guardar(a); okA++; } catch (e) { /* se informa abajo */ } }
          E.ajustes = S.almacen.ajustes();
          U.mensaje($("#msg-respaldo"), `Restaurado: ${r.carros} carro(s), ${r.escaneos} escaneo(s), ${r.diagnosticos} diagnóstico(s), ${r.pruebas} prueba(s)${nArch ? `, ${okA} de ${nArch} archivo(s)` : ""}.`, okA === nArch ? "ok" : "error");
          U.emit("carro"); U.emit("escaneo"); U.emit("ajustes");
        } catch (e) { U.mensaje($("#msg-respaldo"), e.message, "error"); }
      });
    } catch (e) { U.mensaje($("#msg-respaldo"), "Ese archivo no se pudo leer como respaldo de ScanIA.", "error"); }
  }

  // ================================================================== capacidades por marca
  function dibujarCapacidades() {
    const id = $("#sel-marca").value;
    const f = S.FABRICANTES[id];
    $("#capacidades").innerHTML = (f && f.notas ? `<p class="nota">${esc(f.notas)}</p>` : "") + S.capacidades(id || null).map((m) =>
      `<div class="cap"><b>${esc(m.nombre)}</b> <span class="estado ${m.estado}">${{ disponible: "disponible", parcial: "parcial", no_disponible: "no disponible" }[m.estado]}</span>
        <div class="nota">${esc(m.detalle)}</div>${m.requiere ? `<div class="nota"><i>${esc(m.requiere)}</i></div>` : ""}</div>`).join("");
  }

  // ================================================================== ajustes
  U.abrirAjustes = function () {
    const a = E.ajustes;
    $("#aj-servidor").value = a.servidor || "";
    $("#aj-codigo").value = a.codigo || "";
    $("#aj-modelo").innerHTML = S.MODELOS.map((m) => `<option value="${esc(m.id)}"${m.id === a.modelo ? " selected" : ""}>${esc(m.nombre)}</option>`).join("");
    $("#aj-buscar").checked = !!a.buscarWeb;
    $("#aj-vin-ia").checked = !!a.compartirVIN;
    $("#aj-vin-nhtsa").checked = !!a.decodificarVIN;
    $("#aj-pantalla").checked = !!a.pantalla;
    $("#aj-voz").checked = !!a.voz;
    $("#aj-baud").value = String(a.baud || 38400);
    const NOMBRES = { temperatura: "Temperatura", distancia: "Distancia y velocidad", presion: "Presión", consumo: "Consumo" };
    $("#aj-unidades").innerHTML = Object.entries(S.OPCIONES_UNIDADES).map(([k, ops]) => `<label>${NOMBRES[k] || k}<select data-unidad="${k}">${ops.map(([v, n]) =>
      `<option value="${v}"${(a.unidades || {})[k] === v ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`).join("");
    U.mensaje($("#aj-msg"), a._claveVieja ? "Por seguridad se borró la clave de Anthropic que una versión vieja guardaba en este teléfono. Ahora la IA funciona a través de tu servidor." : "", a._claveVieja ? "error" : "");
    $("#aj-prueba").textContent = "";
    $("#modal-ajustes").classList.remove("oculto");
  };
  function leerFormulario() {
    const unidades = {};
    $$("[data-unidad]").forEach((s) => { unidades[s.dataset.unidad] = s.value; });
    return { ...E.ajustes, servidor: $("#aj-servidor").value.trim().replace(/\/+$/, ""), codigo: $("#aj-codigo").value.trim(), modelo: $("#aj-modelo").value,
      buscarWeb: $("#aj-buscar").checked, compartirVIN: $("#aj-vin-ia").checked, decodificarVIN: $("#aj-vin-nhtsa").checked,
      pantalla: $("#aj-pantalla").checked, voz: $("#aj-voz").checked, baud: Number($("#aj-baud").value), unidades };
  }
  function guardarAjustes() {
    const a = leerFormulario();
    if (a.servidor && !/^https:\/\//i.test(a.servidor) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(a.servidor)) { U.mensaje($("#aj-msg"), "La dirección del servidor debe empezar con https://", "error"); return; }
    delete a._claveVieja;
    S.almacen.guardarAjustes(a);
    E.ajustes = S.almacen.ajustes();
    $("#modal-ajustes").classList.add("oculto");
    U.toast("Ajustes guardados.", "ok");
    U.emit("ajustes");
  }
  async function probarServidor(ev) {
    const a = leerFormulario();
    const b = ev.currentTarget;
    U.cargando(b, true, "Probando…");
    $("#aj-prueba").textContent = "";
    try { await S.probarServidor({ servidor: a.servidor, codigo: a.codigo }); $("#aj-prueba").textContent = "✓ El servidor responde y el código es correcto."; }
    catch (e) { $("#aj-prueba").textContent = "✗ " + e.message; }
    finally { U.cargando(b, false); }
  }

  // ================================================================== inicio de esta parte
  U.on("init", () => {
    $("#btn-buscar-codigo").addEventListener("click", buscarCodigo);
    $("#buscar-codigo").addEventListener("keydown", (e) => { if (e.key === "Enter") buscarCodigo(); });
    $("#buscar-codigo").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase(); });
    $("#btn-copiar-log").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(registroCompleto()); U.toast("Registro copiado.", "ok"); } catch (e) { U.toast("No se pudo copiar; usá Descargar."); }
    });
    $("#btn-bajar-log").addEventListener("click", () => U.descargar(`scania-registro-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`, registroCompleto(), "text/plain"));
    $("#btn-exportar").addEventListener("click", exportar);
    dibujarUso();
    $("#importar").addEventListener("change", importar);
    $("#sel-marca").innerHTML = `<option value="">Elegí una marca…</option>` + Object.entries(S.FABRICANTES).map(([id, f]) => `<option value="${id}">${esc(f.nombre)}</option>`).join("");
    $("#sel-marca").addEventListener("change", dibujarCapacidades);
    const c = U.carro(), fab = c && S.detectarFabricante({ vin: c.vin, marca: c.marca });
    if (fab) $("#sel-marca").value = fab;
    dibujarCapacidades();
    $("#acerca").innerHTML = `ScanIA ${esc(S.VERSION || "")} · ${Object.keys(S.CODIGOS).length} códigos en la base local · ${S.PRUEBAS_GUIADAS.length} pruebas guiadas · ${Object.keys(S.ESCENARIOS).length} escenarios de simulador.<br>
      Todo se guarda solo en este dispositivo. Nada se envía a internet salvo lo que pidás a la IA (a través de tu propio servidor) o la consulta del VIN a la NHTSA si la permitís.<br>
      El OBD2 genérico lee motor y emisiones (y a veces la transmisión). ABS, bolsas de aire y otros módulos necesitan herramientas de cada marca.`;
    // Ajustes
    $("#btn-ajustes").addEventListener("click", U.abrirAjustes);
    $("#aj-cerrar").addEventListener("click", () => $("#modal-ajustes").classList.add("oculto"));
    $("#aj-guardar").addEventListener("click", guardarAjustes);
    $("#aj-probar").addEventListener("click", probarServidor);
    $("#aj-ver").addEventListener("click", () => { const i = $("#aj-codigo"); i.type = i.type === "password" ? "text" : "password"; });
    setInterval(() => { if ($('.vista[data-vista="mas"]').classList.contains("activa")) dibujarRegistro(); }, 1500);
  });
  function dibujarUso() {
    const el = $("#uso-almacen"); if (!el) return;
    const kb = S.almacen.uso(), err = S.almacen.ultimoError;
    el.innerHTML = `ScanIA ocupa unos ${U.num(kb)} KB en este navegador (el límite típico es ~5 000 KB).` +
      (err ? ` <span class="rojo">Último problema al guardar: ${esc(err.mensaje)} Bajá un respaldo.</span>` : "");
  }
  U.on("vista", (v) => { if (v === "mas") { dibujarRegistro(); dibujarUso(); } });
  U.on("carro", () => { const c = U.carro(), fab = c && S.detectarFabricante({ vin: c.vin, marca: c.marca }); if (fab && $("#sel-marca")) { $("#sel-marca").value = fab; dibujarCapacidades(); } });
})();
