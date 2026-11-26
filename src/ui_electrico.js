/* ScanIA · interfaz: Sistema eléctrico y electrónico (fusibles, relés, mediciones, batería y carga, sensores, diagramas, fotos, informe) */
(function () {
  "use strict";
  const S = window.ScanIA, U = S.ui, E = U.estado, $ = U.$, $$ = U.$$, esc = U.esc, A = () => S.almacen;
  let panel = "resumen", caja = "interior", ampliado = false, sel = null, practica = null;

  // ------------------------------------------------------------------ datos del carro
  const carroId = () => { const c = U.carro(); return c ? c.id : null; };
  const datos = () => (practica ? practica.datos : A().electrico(carroId()));
  function guardar(cambios) {
    if (practica) { Object.assign(practica.datos, cambios); return; }
    A().guardarElectrico(carroId(), cambios);
  }
  const ficha = () => S.fichaDe(practica ? practica.carro : U.carro(), E.fuente ? E.fuente.info() : null);

  /** Variante en uso: la de la ficha, con los fusibles que anotaste de tu tapa encima (esos cuentan como confirmados). */
  function variante() {
    const f = ficha(), d = datos();
    const base = S.varianteDe(f, d.variante);
    const propios = d.fusibles_propios || [];
    if (!base && !propios.length) return null;
    const v = base ? JSON.parse(JSON.stringify(base)) : { id: "propia", nombre: "Ficha armada con la etiqueta de tu tapa", mercado: "La de tu carro", cajas: [], diagramas: [], valores_referencia: [] };
    for (const p of propios) {
      let c = v.cajas.find((x) => x.id === p.caja);
      if (!c) { c = { id: p.caja, nombre: CAJAS_NOMBRE[p.caja] || p.caja, ubicacion: "Según tu carro", columnas: 5, fusibles: [], reles: [] }; v.cajas.push(c); }
      const i = c.fusibles.findIndex((x) => x.numero === p.numero);
      const nuevo = { id: i >= 0 ? c.fusibles[i].id : `${p.caja.toUpperCase().slice(0, 3)}-${p.numero}`, numero: p.numero, amperaje: p.amperaje || null, nombre: p.nombre || "Según la tapa", circuito: p.nombre || "",
        componentes: [], sintomas: [], fuentes: ["dueno"], verificacion: "dueno", nota: "Anotado por vos desde la etiqueta de la tapa.", libre: !p.amperaje };
      if (i >= 0) c.fusibles[i] = { ...c.fusibles[i], ...nuevo }; else c.fusibles.push(nuevo);
      c.fusibles.sort((a, b) => a.numero - b.numero);
    }
    return v;
  }
  const CAJAS_NOMBRE = { interior: "Caja interior", motor: "Caja del compartimiento del motor", abs: "Caja del ABS" };

  // ------------------------------------------------------------------ cabecera
  function dibujarCabecera() {
    const c = practica ? practica.carro : U.carro(), f = ficha(), d = datos();
    const v = variante();
    let h = "";
    if (practica) h += `<div class="advertencia"><b>CASO SIMULADO:</b> ${esc(practica.caso.nombre)} — ${esc(practica.caso.descripcion)} Nada de esto se guarda en tus carros. <button class="btn" id="el-salir-practica">Salir del caso</button></div>`;
    if (!c && !practica) h += `<p class="nota">Elegí o agregá tu carro en <a href="#carros">Carros</a> para guardar la inspección. Sin carro, lo que anotes queda en un espacio general.</p>`;
    else if (c) h += `<p><b>${esc([c.marca, c.modelo, c.anio].filter(Boolean).join(" "))}</b>${c.motor ? ` · ${esc(c.motor)}` : ""}</p>`;
    if (f) {
      h += `<p class="nota">Ficha técnica: <b>${esc(f.marca)} ${esc(f.modelo)} ${esc(f.anios)}</b> · ${esc(f.sistema_electrico)} · ${esc(f.protocolo)}</p>`;
      if (f.variantes.length > 1) h += `<label>Variante <select id="el-variante">${f.variantes.map((x) => `<option value="${esc(x.id)}"${x.id === (d.variante || f.variantes[0].id) ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select></label>`;
      else h += `<p class="nota">Variante: ${esc(f.variantes[0].nombre)}. ${esc(f.variantes[0].mercado)}</p>`;
      h += `<details class="el-avisos"><summary>Antes de usar la ficha (${f.advertencias.length} avisos) y fuentes</summary><ul>${f.advertencias.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h4>Fuentes técnicas</h4><ul>${f.fuentes.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.nombre)}</a> <span class="chip">${esc(x.tipo)}</span><br><span class="nota">${esc(x.uso)}</span></li>`).join("")}</ul></details>`;
    } else if (v) h += `<p class="nota">No hay ficha técnica para este carro: se usa lo que anotaste de la etiqueta de tu tapa.</p>`;
    else h += `<p class="nota">No hay ficha técnica para este carro. Podés armarla con la etiqueta de la tapa de tu caja (en "Fusibles y relés").</p>`;
    $("#el-carro").innerHTML = h;
    const sv = $("#el-variante"); if (sv) sv.onchange = () => { guardar({ variante: sv.value }); dibujar(); };
    const sp = $("#el-salir-practica"); if (sp) sp.onclick = () => { practica = null; dibujar(); };
  }

  // ------------------------------------------------------------------ contexto para el diagnóstico
  function contexto() {
    const d = datos(), c = practica ? practica.carro : U.carro();
    const a = !practica && E.historial && E.historial.length ? U.analizarAhora() : null;
    const obd = practica ? (practica.caso.obd || {}) : { codigos: E.lectura ? E.lectura.codigos || [] : [], resumen: a ? a.resumen : null };
    const escaneos = !practica && c ? A().escaneos(c.id).slice().reverse() : [];
    return { variante: variante(), inspeccion: { fusibles: d.fusibles || {}, reles: d.reles || {} }, mediciones: d.mediciones || [], obd, sintomas: d.sintomas || [],
      pruebas: !practica && c ? A().pruebas(c.id) : [], carro: c, componentes: d.componentes || {},
      historialVoltajes: escaneos.map((e) => ({ encendido: e.resumen && e.resumen.voltaje != null ? e.resumen.voltaje : null })),
      conexion: !practica && E.fuente && E.fuente.stats ? { reinicios: E.fuente.stats.reinicios || 0, perdidas: (E.fuente.stats.errores || {}).sin_carro || 0 } : null };
  }
  const lista = (items, vacio) => (items.length ? `<ul>${items.map((x) => `<li>${esc(x.texto)}${x.causas ? `<ul>${x.causas.map((c) => `<li><b>${esc(c.causa)}</b>${c.por_que ? `: ${esc(c.por_que)}` : ""}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>` : `<p class="nota">${esc(vacio)}</p>`);

  // ------------------------------------------------------------------ resumen
  function dibujarResumen() {
    const r = S.diagnosticoElectrico(contexto());
    $("#el-resumen").innerHTML = `
      <div class="el-cuatro">
        <div class="el-col sabe"><h3>Lo que se sabe</h3>${lista(r.sabe, "Todavía nada confirmado. Revisá fusibles o hacé mediciones.")}</div>
        <div class="el-col sospecha"><h3>Lo que se sospecha</h3>${lista(r.sospecha, "Sin sospechas por ahora.")}</div>
        <div class="el-col nosabe"><h3>Lo que no se puede determinar todavía</h3>${lista(r.no_determina, "—")}</div>
        <div class="el-col pruebas"><h3>Pruebas que hacen falta</h3>${lista(r.pruebas, "Ninguna pendiente.")}</div>
      </div>
      <details class="el-sistemas"><summary>Qué se puede revisar por OBD, con instrumentos y a la vista</summary>
        <div class="tabla-scroll"><table class="tabla-el"><thead><tr><th>Sistema</th><th>Por OBD (ELM327)</th><th>Con instrumentos</th><th>Inspección física</th></tr></thead>
        <tbody>${S.SISTEMAS_ELECTRICOS.map((s) => `<tr><td><b>${esc(s.nombre)}</b></td><td>${esc(s.obd)}</td><td>${esc(s.instrumento)}</td><td>${esc(s.fisico)}</td></tr>`).join("")}</tbody></table></div></details>
      <details class="el-seguridad" open><summary>Seguridad eléctrica</summary><ul>${S.SEGURIDAD_ELECTRICA.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
      <div class="el-practica"><label>Practicar con un caso simulado <select id="el-caso"><option value="">Elegí un caso…</option>${Object.entries(S.CASOS_ELECTRICOS).map(([id, c]) => `<option value="${id}">${esc(c.nombre)}</option>`).join("")}</select></label>
        <p class="nota">Carga una falla de ejemplo para ver cómo ScanIA separa lo que sabe, lo que sospecha y lo que necesita medir. No toca tus datos.</p></div>`;
    $("#el-caso").onchange = (e) => {
      const id = e.target.value; if (!id) return;
      const caso = S.CASOS_ELECTRICOS[id];
      practica = { id, caso, carro: { marca: "Honda", modelo: "CR-V", anio: 2000, motor: "B20Z (simulado)" },
        datos: { variante: null, fusibles: JSON.parse(JSON.stringify((caso.inspeccion || {}).fusibles || {})), reles: JSON.parse(JSON.stringify((caso.inspeccion || {}).reles || {})),
          mediciones: JSON.parse(JSON.stringify(caso.mediciones || [])), componentes: JSON.parse(JSON.stringify(caso.componentes || {})), sintomas: caso.sintomas || [], diagramas: [], fotos: [] } };
      dibujar();
    };
  }

  // ------------------------------------------------------------------ fusibles y relés
  function dibujarFusibles() {
    const v = variante(), d = datos();
    const cajas = v ? v.cajas : [];
    if (!cajas.some((c) => c.id === caja) && caja !== "principales" && caja !== "reles") caja = cajas[0] ? cajas[0].id : "interior";
    const tabs = cajas.map((c) => [c.id, c.nombre]).concat(v ? [["principales", "Fusibles principales"], ["reles", "Relés"]] : []);
    let h = `<div class="cabecera"><h2>Fusibles y relés</h2><div class="acciones"><button class="btn" id="el-ampliar">${ampliado ? "Reducir" : "Ampliar"}</button><button class="btn" id="el-propio">Anotar desde la tapa</button></div></div>`;
    if (!v) {
      h += `<p class="nota">${esc(S.PENDIENTE_FUSIBLE)}: no hay ficha para este carro. Tocá <b>Anotar desde la tapa</b> y copiá número, amperaje y nombre de cada posición que diga la etiqueta.</p>`;
      $("#el-fusibles").innerHTML = h; enlazarFusibles(); return;
    }
    h += `<div class="el-cajas">${tabs.map(([id, n]) => `<button class="btn${id === caja ? " primario" : ""}" data-caja="${esc(id)}">${esc(n)}</button>`).join("")}</div>`;
    h += `<p class="nota el-orientativa"><b>Representación orientativa</b>: no es el diagrama del fabricante. Las posiciones están ordenadas por número; en tu caja pueden estar en otro orden. Usá la etiqueta de la tapa para ubicarlas.</p>`;
    h += `<div class="el-leyenda">${["correcto", "pendiente", "quemado", "amperaje", "desconocida"].map((e) => `<span class="fz ${S.ESTADOS_FUSIBLE[e].color}"></span>${esc(S.ESTADOS_FUSIBLE[e].nombre)}`).join(" ")}</div>`;
    if (caja === "reles") {
      const reles = S.relesDe(v);
      h += `<div class="el-reles">${reles.map((r) => { const i = (d.reles || {})[r.id] || {};
        return `<div class="el-rele" data-rele="${esc(r.id)}"><b>${esc(r.nombre)}</b><br><span class="nota">${esc(r.caja_nombre)} · posición ${r.posicion ? esc(r.posicion) : "no documentada"} · ${esc((S.VERIFICACION[r.verificacion] || {}).nombre || "")}</span>
          ${r.nota ? `<p class="nota">${esc(r.nota)}</p>` : ""}${i.resultado ? `<p><span class="chip">${i.resultado === "mejora" ? "Falla confirmada por intercambio" : "Intercambio sin cambio"}</span></p>` : ""}
          <button class="btn" data-rele-insp="${esc(r.id)}">Anotar prueba</button></div>`; }).join("") || `<p class="nota">No hay relés documentados.</p>`}</div>`;
    } else {
      const fusibles = caja === "principales" ? S.fusiblesDe(v).filter((f) => f.principal) : (cajas.find((c) => c.id === caja) || { fusibles: [] }).fusibles;
      const cdef = cajas.find((c) => c.id === caja);
      if (cdef) h += `<p class="nota">${esc(cdef.ubicacion)}${cdef.tipo_fusible ? ` · ${esc(cdef.tipo_fusible)}` : ""}</p>`;
      h += `<div class="el-caja${ampliado ? " ampliada" : ""}" style="--cols:${cdef ? cdef.columnas || 5 : 4}">${fusibles.map((f) => {
        const e = S.evaluarFusible(f, (d.fusibles || {})[f.id]);
        return `<button class="fz-celda ${e.color}${sel === f.id ? " sel" : ""}" data-fus="${esc(f.id)}" title="${esc(`${f.numero} · ${f.amperaje ? f.amperaje + " A · " : ""}${f.nombre} — ${e.nombre_estado}`)}">
          <span class="fz-num">${f.numero}</span><span class="fz-amp">${f.amperaje ? f.amperaje + "A" : "—"}</span>${ampliado ? `<span class="fz-nom">${esc(f.nombre)}</span>` : ""}${f.verificacion === "conflicto" ? `<span class="fz-marca" title="Fuentes en conflicto">?</span>` : ""}</button>`;
      }).join("")}</div>`;
      const inter = S.detectarIntercambios(v, d.fusibles || {});
      if (inter.length) h += `<div class="advertencia">${inter.map((x) => esc(x.texto)).join("<br>")}</div>`;
    }
    h += `<div id="el-detalle-fus"></div>`;
    $("#el-fusibles").innerHTML = h;
    enlazarFusibles();
    if (sel) detalleFusible(sel);
  }
  function enlazarFusibles() {
    const a = $("#el-ampliar"); if (a) a.onclick = () => { ampliado = !ampliado; dibujarFusibles(); };
    const p = $("#el-propio"); if (p) p.onclick = anotarPropio;
    $$("[data-caja]").forEach((b) => (b.onclick = () => { caja = b.dataset.caja; sel = null; dibujarFusibles(); }));
    $$("[data-fus]").forEach((b) => (b.onclick = () => { sel = b.dataset.fus; dibujarFusibles(); $("#el-detalle-fus").scrollIntoView({ block: "nearest" }); }));
    $$("[data-rele-insp]").forEach((b) => (b.onclick = () => inspeccionRele(b.dataset.releInsp)));
  }
  const PROCEDIMIENTO = [
    "Llave en LOCK y luces apagadas.",
    "Ubicá la posición con la etiqueta de la tapa.",
    "Método 1 (sin sacar el fusible): llave en ON y, si el circuito tiene switch, encendelo; con el multímetro en voltios, punta negra a tierra y roja en cada punto de prueba de la cara del fusible. Voltaje de batería en los dos lados = bien; en uno solo = abierto.",
    "Método 2: sacá el fusible con la pinza y medí continuidad entre sus patas (fuera de la caja).",
    "Mirá también el terminal: sulfato, plástico derretido o fusible flojo indican falso contacto.",
    "Si lo cambiás: SIEMPRE del mismo amperaje. Nunca uno más grande.",
  ];
  function detalleFusible(id) {
    const v = variante(), f = S.fusiblesDe(v).find((x) => x.id === id);
    if (!f) return;
    const d = datos(), i = (d.fusibles || {})[id] || {};
    const e = S.evaluarFusible(f, i);
    const fuentes = (ficha() ? ficha().fuentes : []).filter((x) => (f.fuentes || []).includes(x.id));
    $("#el-detalle-fus").innerHTML = `<div class="el-detalle">
      <h3>Fusible ${f.numero} · ${f.amperaje ? f.amperaje + " A" : "sin uso"} · ${esc(f.nombre)}</h3>
      <p><span class="fz ${e.color}"></span> <b>${esc(e.nombre_estado)}</b></p>
      <dl class="info"><dt>Caja</dt><dd>${esc(f.caja_nombre)}</dd><dt>Circuito protegido</dt><dd>${esc(f.circuito || "—")}</dd>
        <dt>Componentes relacionados</dt><dd>${esc((f.componentes || []).join(", ") || "—")}</dd>
        <dt>Síntomas posibles si falla</dt><dd>${esc((f.sintomas || []).join("; ") || "—")} <span class="nota">(deducidos del circuito; no son del manual)</span></dd>
        <dt>Verificación del dato</dt><dd>${esc((S.VERIFICACION[i.confirmado_tapa ? "dueno" : f.verificacion] || {}).nombre || "")}${f.nota ? `<br><span class="nota">${esc(f.nota)}</span>` : ""}${f.condicion ? `<br><span class="nota">Aplica: ${esc(f.condicion)}</span>` : ""}</dd>
        <dt>Fuente</dt><dd>${fuentes.length ? fuentes.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.nombre)}</a>`).join("<br>") : f.fuentes && f.fuentes.includes("dueno") ? "Etiqueta de tu tapa" : "—"}</dd></dl>
      ${e.mensajes.length ? `<ul class="el-msj">${e.mensajes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${e.acciones.length ? `<div class="bloque"><b>Qué hacer</b><ul>${e.acciones.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <details><summary>Procedimiento de comprobación</summary><ol>${PROCEDIMIENTO.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>
      <h4>Lo que observaste</h4>
      <div class="form-carro">
        <label>Estado <select id="fi-estado">${[["", "Sin revisar"], ["bien", "Bien"], ["quemado", "Quemado / abierto"], ["ausente", "No está (falta)"], ["no_se", "No sé"]].map(([k, n]) => `<option value="${k}"${(i.estado || "") === k ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Cómo lo revisaste <select id="fi-metodo">${Object.entries(S.METODOS_INSPECCION).filter(([k]) => k !== "foto_ia" || i.metodo === "foto_ia").map(([k, n]) => `<option value="${k}"${(i.metodo || "visual") === k ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <label>Amperaje que tiene puesto (A) <input id="fi-amp" inputmode="decimal" value="${esc(i.amperaje_obs ?? "")}" placeholder="${f.amperaje || ""}"></label>
        <label>Tipo que tiene puesto <input id="fi-tipo" value="${esc(i.tipo_obs || "")}" placeholder="por ejemplo: hoja mini"></label>
        <label>Veces que se ha quemado <input id="fi-veces" inputmode="numeric" value="${esc(i.veces_quemado ?? "")}"></label>
      </div>
      <label class="check"><input type="checkbox" id="fi-contacto"${i.falso_contacto ? " checked" : ""}> Terminal flojo, sulfato o plástico derretido en esa posición</label>
      <label class="check"><input type="checkbox" id="fi-tapa"${i.confirmado_tapa ? " checked" : ""}> La etiqueta de MI tapa dice lo mismo (número, amperaje y circuito)</label>
      <label>Notas <input id="fi-notas" value="${esc(i.notas || "")}"></label>
      <div class="acciones"><button class="btn primario" id="fi-guardar">Guardar</button><button class="btn" id="fi-cerrar">Cerrar</button></div></div>`;
    $("#fi-guardar").onclick = () => {
      const fus = { ...(datos().fusibles || {}) };
      const n = (x) => (x === "" || x == null ? null : Number(String(x).replace(",", ".")));
      fus[id] = { estado: $("#fi-estado").value || undefined, metodo: $("#fi-metodo").value, amperaje_obs: n($("#fi-amp").value.trim()), tipo_obs: $("#fi-tipo").value.trim() || undefined,
        veces_quemado: n($("#fi-veces").value.trim()), falso_contacto: $("#fi-contacto").checked, confirmado_tapa: $("#fi-tapa").checked, notas: $("#fi-notas").value.trim() || undefined, fecha: Date.now() / 1000 };
      if (fus[id].amperaje_obs != null && f.amperaje && fus[id].amperaje_obs > f.amperaje) U.toast("Ese fusible es MÁS grande que el documentado. No lo dejes así: el cable se puede calentar antes de que el fusible se queme.", "error");
      guardar({ fusibles: fus }); dibujarFusibles(); U.toast("Guardado.");
    };
    $("#fi-cerrar").onclick = () => { sel = null; dibujarFusibles(); };
  }
  function anotarPropio() {
    U.modal(`<h2>Anotar una posición desde la etiqueta de tu tapa</h2>
      <p class="nota">Copiá exactamente lo que dice la etiqueta. Esto se toma como dato confirmado de tu carro y reemplaza lo que diga la ficha para esa posición.</p>
      <div class="form-carro"><label>Caja <select id="pr-caja"><option value="interior">Interior</option><option value="motor">Compartimiento del motor</option><option value="abs">ABS</option></select></label>
      <label>Número de posición <input id="pr-num" inputmode="numeric"></label><label>Amperaje (A) <input id="pr-amp" inputmode="decimal" placeholder="vacío si no se usa"></label>
      <label>Nombre o circuito (como dice la tapa) <input id="pr-nom"></label></div>
      <div class="acciones"><button class="btn primario" id="pr-ok">Guardar</button><button class="btn" id="pr-no">Cancelar</button></div>`, () => {
      $("#pr-no").onclick = U.cerrarModal;
      $("#pr-ok").onclick = () => {
        const numero = Number($("#pr-num").value), amp = $("#pr-amp").value.trim();
        if (!numero) { U.toast("Falta el número de posición.", "error"); return; }
        const lista2 = (datos().fusibles_propios || []).filter((x) => !(x.caja === $("#pr-caja").value && x.numero === numero));
        lista2.push({ caja: $("#pr-caja").value, numero, amperaje: amp ? Number(amp.replace(",", ".")) : null, nombre: $("#pr-nom").value.trim() });
        guardar({ fusibles_propios: lista2 }); U.cerrarModal(); caja = $("#pr-caja") ? $("#pr-caja").value : caja; dibujar();
      };
    });
  }
  function inspeccionRele(id) {
    const r = S.relesDe(variante()).find((x) => x.id === id) || { nombre: id };
    const i = (datos().reles || {})[id] || {};
    U.modal(`<h2>${esc(r.nombre)}</h2><p class="nota">Prueba más simple: cambiarlo por otro relé con el MISMO número de parte (de un circuito que puedas probar). Llave en LOCK para sacar y poner relés.</p>
      <label>Resultado del intercambio <select id="ri-res"><option value="">Sin probar</option><option value="mejora"${i.resultado === "mejora" ? " selected" : ""}>Con el otro relé funciona (el original falla)</option><option value="igual"${i.resultado === "igual" ? " selected" : ""}>Sigue igual</option></select></label>
      <label>Notas <input id="ri-notas" value="${esc(i.notas || "")}"></label>
      <div class="acciones"><button class="btn primario" id="ri-ok">Guardar</button><button class="btn" id="ri-no">Cancelar</button></div>`, () => {
      $("#ri-no").onclick = U.cerrarModal;
      $("#ri-ok").onclick = () => { const rs = { ...(datos().reles || {}) }; rs[id] = { resultado: $("#ri-res").value || undefined, notas: $("#ri-notas").value.trim() || undefined, fecha: Date.now() / 1000 }; guardar({ reles: rs }); U.cerrarModal(); dibujar(); };
    });
  }

  // ------------------------------------------------------------------ mediciones
  function dibujarMediciones() {
    const d = datos(), v = variante();
    const opciones = S.PRUEBAS_CIRCUITO.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
    const comps = [...S.fusiblesDe(v).filter((f) => !f.libre).map((f) => [f.id, `${f.id} · ${f.nombre}`]), ...Object.entries(S.COMPONENTES_ELECTRICOS).map(([k, c]) => [k, c.nombre])];
    $("#el-mediciones").innerHTML = `<h2>Mediciones con multímetro</h2>
      <p class="nota">Anotá lo que mediste. ScanIA no inventa valores de referencia: sin el valor del manual, dice "${esc(S.SIN_REFERENCIA)}".</p>
      <label>Prueba <select id="me-prueba">${opciones}</select></label>
      <div id="me-form"></div>
      <h3>Mediciones guardadas</h3><div id="me-lista"></div>
      <datalist id="me-comps">${comps.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join("")}</datalist>`;
    $("#me-prueba").onchange = formMedicion;
    formMedicion();
    $("#me-lista").innerHTML = (d.mediciones || []).length ? `<div class="tabla-scroll"><table class="tabla-el"><thead><tr><th>Fecha</th><th>Prueba</th><th>Componente</th><th>Valor</th><th>Resultado</th><th></th></tr></thead><tbody>${d.mediciones.map((m, k) => {
      const p = S.pruebaCircuito(m.prueba) || { nombre: m.prueba };
      const e = S.evaluarMedicion(m, m.spec || S.especificacionPara({ variante: v, carro: U.carro(), prueba: m.prueba, componente: m.componente, condicion: m.condicion }));
      return `<tr><td>${m.fecha ? esc(new Date(m.fecha * 1000).toLocaleDateString("es-HN")) : "—"}</td><td>${esc(p.nombre)}</td><td>${esc(m.componente || "")}</td><td>${esc(valorTexto(m))}</td><td><span class="ver ${esc(e.veredicto)}">${esc(VER[e.veredicto] || e.veredicto)}</span> ${esc(e.texto)}</td><td><button class="btn-icono" data-me-borrar="${k}" title="Borrar">×</button></td></tr>`;
    }).join("")}</tbody></table></div>` : `<p class="nota">Todavía no hay mediciones.</p>`;
    $$("[data-me-borrar]").forEach((b) => (b.onclick = () => { const l = datos().mediciones.slice(); l.splice(Number(b.dataset.meBorrar), 1); guardar({ mediciones: l }); dibujarMediciones(); }));
  }
  const VER = { dentro: "Dentro", fuera: "Fuera", sin_referencia: "Sin referencia", orientativo_ok: "Bien (orientativo)", orientativo_alto: "Fuera (orientativo)", incompleto: "Incompleto" };
  function valorTexto(m) {
    if (m.entrada != null || m.salida != null) return `${m.entrada ?? "?"} V / ${m.salida ?? "?"} V`;
    if (m.conector) return Object.entries(m.conector).filter(([, v]) => v).map(([k]) => k).join(", ") || "sin fallas";
    return `${m.valor ?? ""}${m.unidad ? " " + m.unidad : ""}${m.condicion ? ` (${m.condicion})` : ""}`;
  }
  function formMedicion() {
    const p = S.pruebaCircuito($("#me-prueba").value);
    const v = variante(), c = U.carro();
    const entrada = {
      continuidad: `<label>¿Hay continuidad? <select id="me-valor"><option value="">Elegí…</option><option value="si">Sí (pita / casi lo mismo que con las puntas juntas)</option><option value="no">No (OL / abierto)</option><option value="dudoso">Dudoso (marca algo pero claramente más)</option></select></label><label>Ohmios (opcional) <input id="me-ohm" inputmode="decimal"></label>`,
      voltaje_fusible: `<div class="form-carro"><label>Lado 1 (V) <input id="me-ent" inputmode="decimal"></label><label>Lado 2 (V) <input id="me-sal" inputmode="decimal"></label><label>Batería (V) <input id="me-bat" inputmode="decimal" placeholder="12.6"></label></div>`,
      numero: `<div class="form-carro"><label>Valor medido (${esc(p.unidad || "")}) <input id="me-valor" inputmode="decimal"></label>
        ${p.guia ? `<label>Circuito <select id="me-circ"><option value="arranque">Arranque</option><option value="carga">Carga</option><option value="otro">Otro</option></select></label>` : ""}
        ${p.condiciones ? `<label>Condición <select id="me-cond"><option value="reposo">Reposo (1 h sin uso)</option><option value="ralenti">Motor en ralentí</option><option value="2000_cargas">Motor a ~2000 rpm con luces y A/C</option></select></label>` : ""}
        ${p.fisica_abierta ? `<label>Batería (V) <input id="me-bat" inputmode="decimal"></label>` : ""}</div>`,
      conector: ["sulfato", "pines", "cable", "sello", "quemado", "movimiento"].map((k) => `<label class="check"><input type="checkbox" data-con="${k}"> ${{ sulfato: "Sulfato", pines: "Pines flojos o abiertos", cable: "Cable quebrado", sello: "Sello dañado", quemado: "Terminal quemado", movimiento: "El dato en vivo salta al moverlo" }[k]}</label>`).join("") + `<label class="check"><input type="checkbox" id="me-con-ok"> Revisé y no encontré nada</label>`,
      rele: `<label>Resultado <select id="me-valor"><option value="">Elegí…</option><option value="mejora">Con el otro relé funciona</option><option value="igual">Sigue igual</option></select></label>`,
    }[p.entrada];
    $("#me-form").innerHTML = `<div class="el-ocho">
      <p><b>1. Componente</b> <input id="me-comp" list="me-comps" placeholder="fusible, sensor o circuito"></p>
      <p><b>2. Herramienta:</b> ${esc(p.herramienta)}</p>
      <p><b>3. Dónde medir:</b> ${esc(p.donde)}</p>
      <div class="${p.energizado ? "advertencia" : "bloque"}"><b>${p.energizado ? "Medición con el circuito ENERGIZADO (voltaje): " : "Circuito SIN energía (resistencia/continuidad): "}</b><ul>${p.aislar.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <p><b>4. Valor del fabricante:</b> <span id="me-spec"></span></p>
      <div><b>5. Valor obtenido</b>${entrada}</div>
      <div class="acciones"><button class="btn primario" id="me-eval">Evaluar y guardar</button></div>
      <div id="me-res"></div></div>`;
    const specTxt = () => {
      const comp = $("#me-comp").value.trim();
      const s = S.especificacionPara({ variante: v, carro: c, prueba: p.id, componente: comp, condicion: $("#me-cond") ? $("#me-cond").value : null });
      $("#me-spec").innerHTML = s ? `${esc(s.fuente || "Especificación")}: ${s.min ?? ""}${s.max != null ? "–" + s.max : ""}${s.valor != null ? s.valor : ""} ${esc(s.unidad || p.unidad || "")}`
        : `${esc(p.referencia === "fisica" ? p.referencia_texto : p.referencia === "guia" ? p.referencia_texto : S.SIN_REFERENCIA + ". " + p.referencia_texto)} ${p.referencia === "fabricante" && c ? `<button class="enlace" id="me-anotar">Anotar el valor de mi manual</button>` : ""}`;
      const an = $("#me-anotar"); if (an) an.onclick = () => anotarSpec(p, comp);
    };
    $("#me-comp").oninput = specTxt; if ($("#me-cond")) $("#me-cond").onchange = specTxt;
    specTxt();
    $("#me-eval").onclick = () => {
      const n = (sel2) => { const x = $(sel2); if (!x || x.value.trim() === "") return null; return Number(x.value.replace(",", ".")); };
      const m = { prueba: p.id, componente: $("#me-comp").value.trim() || undefined, fecha: Date.now() / 1000, unidad: p.unidad };
      if (p.entrada === "continuidad") { m.valor = $("#me-valor").value; m.ohm = n("#me-ohm"); }
      else if (p.entrada === "voltaje_fusible") { m.entrada = n("#me-ent"); m.salida = n("#me-sal"); m.bateria = n("#me-bat"); }
      else if (p.entrada === "conector") { m.conector = {}; $$("[data-con]").forEach((x) => { if (x.checked) m.conector[x.dataset.con] = true; }); if (!Object.keys(m.conector).length && !$("#me-con-ok").checked) m.conector = {}; else if (!Object.keys(m.conector).length) m.conector = { revisado: false }; }
      else if (p.entrada === "rele") m.valor = $("#me-valor").value;
      else { m.valor = n("#me-valor"); if ($("#me-circ")) m.circuito = $("#me-circ").value; if ($("#me-cond")) m.condicion = $("#me-cond").value; if ($("#me-bat")) m.bateria = n("#me-bat"); }
      const spec = S.especificacionPara({ variante: v, carro: c, prueba: p.id, componente: m.componente, condicion: m.condicion });
      const e = S.evaluarMedicion(m, spec);
      $("#me-res").innerHTML = `<div class="resultado-g ${e.veredicto === "fuera" || e.veredicto === "orientativo_alto" ? "mal" : e.veredicto === "dentro" || e.veredicto === "orientativo_ok" ? "ok" : "no_concluyente"}">
        <p><b>6. ${esc(VER[e.veredicto] || e.veredicto)}:</b> ${esc(e.texto)}</p>
        ${e.causas && e.causas.length ? `<p><b>7. Posibles causas:</b></p><ul>${e.causas.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p><b>7. Posibles causas:</b> —</p>`}
        <p><b>8. Siguiente comprobación:</b> ${esc(e.siguiente || "—")}</p></div>`;
      if (e.veredicto === "incompleto") return;
      guardar({ mediciones: [...(datos().mediciones || []), m] });
      const lst = $("#me-lista"); if (lst) { const r = $("#me-res").innerHTML; dibujarMediciones(); $("#me-prueba").value = p.id; formMedicion(); $("#me-res").innerHTML = r; }
    };
  }
  function anotarSpec(p, comp) {
    const c = U.carro(); if (!c) return;
    U.modal(`<h2>Valor del manual</h2><p class="nota">${esc(p.nombre)}${comp ? ` · ${esc(comp)}` : ""}. Copialo del manual de servicio de TU carro (marca, modelo, año y motor).</p>
      <div class="form-carro"><label>Mínimo <input id="sp-min" inputmode="decimal"></label><label>Máximo <input id="sp-max" inputmode="decimal"></label><label>Unidad <input id="sp-u" value="${esc(p.unidad || "")}"></label>
      <label>Condición (por ejemplo, a 20 °C) <input id="sp-cond"></label><label>Fuente (manual, página) <input id="sp-fuente" placeholder="Manual de servicio, pág. …"></label></div>
      <div class="acciones"><button class="btn primario" id="sp-ok">Guardar</button><button class="btn" id="sp-no">Cancelar</button></div>`, () => {
      $("#sp-no").onclick = U.cerrarModal;
      $("#sp-ok").onclick = () => {
        const n = (x) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
        const fuente = $("#sp-fuente").value.trim();
        if (!fuente) { U.toast("Escribí de dónde sale el valor (manual y página).", "error"); return; }
        const lst = (c.especificaciones_electricas || []).filter((x) => !(x.prueba === p.id && x.componente === comp));
        lst.push({ prueba: p.id, componente: comp || undefined, min: n($("#sp-min").value), max: n($("#sp-max").value), unidad: $("#sp-u").value.trim(), condicion_texto: $("#sp-cond").value.trim(), fuente: `${fuente} (anotado por vos)` });
        A().guardarCarro({ id: c.id, especificaciones_electricas: lst }); U.cerrarModal(); formMedicion();
      };
    });
  }

  // ------------------------------------------------------------------ batería y carga
  function dibujarCarga() {
    const d = datos(), ctx = contexto();
    const r = S.evaluarSistemaCarga({ resumen: ctx.obd.resumen, mediciones: ctx.mediciones, pruebas: ctx.pruebas, sintomas: ctx.sintomas, carro: ctx.carro, variante: ctx.variante, historialVoltajes: ctx.historialVoltajes });
    $("#el-carga").innerHTML = `<h2>Batería, arranque y carga</h2>
      <p class="nota">${esc(r.nota)}</p>
      <details class="sintomas-local" open><summary>Síntomas eléctricos</summary><div class="sintomas-lista">${S.SINTOMAS_ELECTRICOS.map((s) => `<label class="check"><input type="checkbox" data-sint-el="${s.id}"${(d.sintomas || []).includes(s.id) ? " checked" : ""}> ${esc(s.texto)}</label>`).join("")}</div></details>
      ${r.hechos.length ? `<div class="bloque"><b>Medido (hechos)</b><ul>${r.hechos.map((h) => `<li>${esc(h.texto)}</li>`).join("")}</ul></div>` : ""}
      ${r.hipotesis.length ? r.hipotesis.map((h) => `<div class="el-hip"><h3>${esc(h.titulo)} ${h.certeza ? `<span class="chip ${esc(h.certeza)}">${esc(h.certeza)}</span>` : `<span class="chip">sin indicios</span>`}</h3>
        ${h.apoyo.length ? `<p><b>A favor:</b></p><ul>${h.apoyo.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${h.contra.length ? `<p><b>En contra:</b></p><ul>${h.contra.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${h.nota ? `<p class="nota">${esc(h.nota)}</p>` : ""}<p><b>Siguiente:</b> ${esc(h.siguiente)}</p></div>`).join("")
        : `<p class="nota">Sin datos todavía: conectá el carro y analizá, hacé las pruebas guiadas de batería, arranque y alternador, o anotá mediciones.</p>`}
      <div class="acciones"><button class="btn" data-ir-pg="bateria">Prueba: batería en reposo</button><button class="btn" data-ir-pg="arranque">Prueba: arranque</button><button class="btn" data-ir-pg="alternador">Prueba: alternador con carga</button>
        <button class="btn" data-medir="voltaje_bornes">Anotar voltaje en bornes</button><button class="btn" data-medir="caida_tierra">Anotar caída en la tierra</button><button class="btn" data-medir="consumo_parasito">Anotar consumo apagado</button></div>`;
    $$("[data-sint-el]").forEach((x) => (x.onchange = () => { guardar({ sintomas: $$("[data-sint-el]").filter((y) => y.checked).map((y) => y.dataset.sintEl) }); dibujarCarga(); }));
    $$("[data-ir-pg]").forEach((b) => (b.onclick = () => { U.ir("pruebas"); const t = document.querySelector(`[data-prueba="${b.dataset.irPg}"]`); if (t) t.scrollIntoView({ block: "center" }); }));
    $$("[data-medir]").forEach((b) => (b.onclick = () => { abrirPanel("mediciones"); $("#me-prueba").value = b.dataset.medir; formMedicion(); }));
  }

  // ------------------------------------------------------------------ sensores y actuadores
  let compSel = "ect";
  function dibujarSensores() {
    const d = datos(), cmp = S.COMPONENTES_ELECTRICOS[compSel], med = (d.componentes || {})[compSel] || {};
    const leidos = new Set(((E.lectura && E.lectura.codigos) || []).map((c) => c.codigo).concat(practica && practica.caso.obd ? (practica.caso.obd.codigos || []).map((c) => c.codigo) : []));
    const r = S.diferenciarFalla(compSel, med);
    const v = (k) => (med[k] == null ? "" : med[k]);
    $("#el-sensores").innerHTML = `<h2>Sensores y actuadores</h2>
      <p class="nota">Antes de cambiar un sensor: alimentación → tierra → cable → componente. La computadora es lo último.</p>
      <label>Componente <select id="se-comp">${Object.entries(S.COMPONENTES_ELECTRICOS).map(([k, c]) => `<option value="${k}"${k === compSel ? " selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></label>
      <p><b>Tipo:</b> ${esc(cmp.tipo)} <span class="nota">(lo más común; confirmalo con el diagrama de tu carro)</span></p>
      <p><b>Códigos genéricos relacionados:</b> ${cmp.codigos.map((c) => `<span class="chip${leidos.has(c) ? " alta" : ""}" title="${esc((S.describir(c) || {}).descripcion || "")}">${c}${leidos.has(c) ? " · leído" : ""}</span>`).join(" ")}</p>
      <div class="form-carro">
        ${cmp.circuitos.some((x) => x === "alimentacion" || x === "referencia") ? `<label>Alimentación / referencia (V, llave en ON) <input data-se="alimentacion" inputmode="decimal" value="${esc(v("alimentacion"))}"></label>` : ""}
        <label>Caída en la tierra (V, funcionando) <input data-se="tierra" inputmode="decimal" value="${esc(v("tierra"))}"></label>
        <label>Batería (V) <input data-se="bateria" inputmode="decimal" value="${esc(v("bateria"))}"></label>
        <label>Continuidad del cable de señal <select data-se="continuidad_senal"><option value="">Sin medir</option><option value="si"${v("continuidad_senal") === "si" ? " selected" : ""}>Sí</option><option value="no"${v("continuidad_senal") === "no" ? " selected" : ""}>No (abierto)</option></select></label>
        <label>Corto a tierra <select data-se="corto_tierra"><option value="">Sin medir</option><option value="no"${v("corto_tierra") === "no" ? " selected" : ""}>No</option><option value="si"${v("corto_tierra") === "si" ? " selected" : ""}>Sí</option></select></label>
        <label>Conector <select data-se="conector"><option value="">Sin revisar</option><option value="bien"${v("conector") === "bien" ? " selected" : ""}>Bien</option><option value="mal"${v("conector") === "mal" ? " selected" : ""}>Sulfato / flojo / dañado</option></select></label>
        <label>Resistencia del componente (Ω, desconectado) <input data-se="resistencia" inputmode="decimal" value="${esc(v("resistencia"))}"></label>
        <label>Valor del manual: mínimo (Ω) <input id="se-rmin" inputmode="decimal" value="${esc(med.resistencia_spec ? med.resistencia_spec.min ?? "" : "")}"></label>
        <label>Valor del manual: máximo (Ω) <input id="se-rmax" inputmode="decimal" value="${esc(med.resistencia_spec ? med.resistencia_spec.max ?? "" : "")}"></label>
        <label>Fuente del valor (manual, página) <input id="se-rfuente" value="${esc(med.resistencia_spec ? med.resistencia_spec.fuente || "" : "")}"></label>
      </div>
      <div class="acciones"><button class="btn primario" id="se-guardar">Evaluar y guardar</button></div>
      <div class="resultado-g ${r.certeza === "confirmada" ? "mal" : "no_concluyente"}"><p><b>${esc(r.texto)}</b> <span class="chip">${esc(r.certeza)}</span></p>
        ${r.descartado.length ? `<p><b>Descartado:</b> ${esc(r.descartado.join("; "))}</p>` : ""}${r.pendiente.length ? `<p><b>Falta medir:</b> ${esc(r.pendiente.join("; "))}</p>` : ""}
        <p><b>Siguiente:</b> ${esc(r.siguiente || "—")}</p>${r.no_cambiar ? `<p><b>No cambiar todavía:</b> ${esc(r.no_cambiar)}</p>` : ""}</div>`;
    $("#se-comp").onchange = (e) => { compSel = e.target.value; dibujarSensores(); };
    $("#se-guardar").onclick = () => {
      const m = {};
      $$("[data-se]").forEach((x) => { const val = x.value.trim(); if (val === "") return; m[x.dataset.se] = x.tagName === "SELECT" ? val : Number(val.replace(",", ".")); });
      const mn = $("#se-rmin").value.trim(), mx = $("#se-rmax").value.trim(), fu = $("#se-rfuente").value.trim();
      if (mn || mx) {
        if (!fu) { U.toast("Escribí de dónde sale el valor del manual.", "error"); return; }
        m.resistencia_spec = { min: mn ? Number(mn.replace(",", ".")) : null, max: mx ? Number(mx.replace(",", ".")) : null, fuente: `${fu} (anotado por vos)` };
      }
      const comps = { ...(datos().componentes || {}) }; comps[compSel] = m; guardar({ componentes: comps }); dibujarSensores();
    };
  }

  // ------------------------------------------------------------------ diagramas
  function dibujarDiagramas() {
    const d = datos(), f = ficha();
    $("#el-diagramas").innerHTML = `<h2>Diagramas eléctricos</h2>
      <p class="nota">ScanIA no trae diagramas del fabricante y no dibuja diagramas inventados. Subí las páginas de TU manual (foto o PDF) indicando de dónde salen y a qué versión aplican, para no mezclar versiones.</p>
      ${f ? `<p class="nota">Documentos de referencia de la ficha: ${f.fuentes.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.nombre)}</a>`).join(" · ")}</p>` : ""}
      <div class="fila"><input id="di-buscar" placeholder="Buscar por componente, circuito, fusible o código (por ejemplo: P0135, ventilador, 13)"><button class="btn" id="di-buscar-btn">Buscar</button></div>
      <div id="di-res"></div>
      <h3>Tus diagramas</h3><div id="di-lista">${(d.diagramas || []).length ? (d.diagramas || []).map((x, k) => `<div class="el-diag"><b>${esc(x.titulo)}</b> <span class="chip">${esc(x.tipo)}</span><br>
        <span class="nota">Fuente: ${esc(x.fuente)} · Mercado: ${esc(x.mercado || "—")} · Año: ${esc(x.anio || "—")} · Motor: ${esc(x.motor || "—")} · Versión: ${esc(x.version || "—")}</span>${(x.etiquetas || []).length ? `<br><span class="nota">Etiquetas: ${esc(x.etiquetas.join(", "))}</span>` : ""}
        <div class="acciones"><button class="btn" data-di-ver="${k}">Ver</button><button class="btn peligro" data-di-borrar="${k}">Borrar</button></div></div>`).join("") : `<p class="nota">Todavía no subiste diagramas.</p>`}</div>
      <details class="el-subir"><summary>Subir un diagrama</summary><div class="form-carro">
        <label>Título <input id="di-titulo" placeholder="Por ejemplo: Circuito de carga"></label>
        <label>Tipo <select id="di-tipo">${S.TIPOS_DIAGRAMA.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label>
        <label>Fuente (obligatoria) <input id="di-fuente" placeholder="Manual de servicio Honda, sección 22, pág. …"></label>
        <label>Mercado <input id="di-mercado" placeholder="EE. UU."></label><label>Año <input id="di-anio" inputmode="numeric"></label>
        <label>Motor <input id="di-motor" placeholder="B20Z"></label><label>Versión <input id="di-version" placeholder="LX / EX"></label>
        <label>Etiquetas (componentes, fusibles, códigos; separadas por coma) <input id="di-etiquetas"></label>
        <label>Archivo (foto o PDF) <input type="file" id="di-archivo" accept="image/*,application/pdf"></label></div>
        <div class="acciones"><button class="btn primario" id="di-guardar">Guardar diagrama</button></div></details>`;
    const buscar = () => {
      const res = S.buscarElectrico({ variante: variante(), consulta: $("#di-buscar").value, diagramas: datos().diagramas || [], ficha: f });
      $("#di-res").innerHTML = res.length ? `<ul class="el-busqueda">${res.map((x) => `<li><span class="chip">${esc(x.tipo)}</span> <b>${esc(x.titulo)}</b><br><span class="nota">${esc(x.detalle || "")}</span></li>`).join("")}</ul>` : `<p class="nota">Sin resultados.</p>`;
    };
    $("#di-buscar-btn").onclick = buscar; $("#di-buscar").onkeydown = (e) => { if (e.key === "Enter") buscar(); };
    $("#di-guardar").onclick = async () => {
      const arch = $("#di-archivo").files[0], fuente = $("#di-fuente").value.trim(), titulo = $("#di-titulo").value.trim();
      if (!titulo || !fuente) { U.toast("Falta el título o la fuente del diagrama.", "error"); return; }
      if (!arch) { U.toast("Elegí la foto o el PDF.", "error"); return; }
      let datosB64, mime = arch.type || "application/octet-stream";
      try {
        if (mime.startsWith("image/")) { datosB64 = await U.fotoABase64(arch, 2200); mime = "image/jpeg"; }
        else { if (arch.size > 15 * 1024 * 1024) { U.toast("El PDF es muy grande (máximo 15 MB).", "error"); return; } datosB64 = await leerB64(arch); }
      } catch (e) { U.toast(e.message || "No se pudo leer el archivo.", "error"); return; }
      const archivoId = await S.archivos.guardar({ carroId: carroId(), tipo: "diagrama", mime, datos: datosB64 });
      const item = { id: archivoId, archivoId, titulo, tipo: $("#di-tipo").value, fuente, mercado: $("#di-mercado").value.trim(), anio: $("#di-anio").value.trim(), motor: $("#di-motor").value.trim(),
        version: $("#di-version").value.trim(), etiquetas: $("#di-etiquetas").value.split(",").map((x) => x.trim()).filter(Boolean), mime, fecha: Date.now() / 1000 };
      guardar({ diagramas: [...(datos().diagramas || []), item] });
      if (S.archivos.persistente === false) U.toast("El navegador no deja guardar archivos: el diagrama se pierde al cerrar. Bajá un respaldo.", "error"); else U.toast("Diagrama guardado.");
      dibujarDiagramas();
    };
    $$("[data-di-ver]").forEach((b) => (b.onclick = () => verArchivo(datos().diagramas[Number(b.dataset.diVer)])));
    $$("[data-di-borrar]").forEach((b) => (b.onclick = () => U.confirmar("¿Borrar este diagrama?", "Se borra de este teléfono.", "Borrar", async () => {
      const l = datos().diagramas.slice(); const [x] = l.splice(Number(b.dataset.diBorrar), 1); await S.archivos.borrar(x.archivoId); guardar({ diagramas: l }); dibujarDiagramas(); })));
  }
  const leerB64 = (arch) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("No se pudo leer el archivo.")); r.readAsDataURL(arch); });
  async function verArchivo(x) {
    const a = await S.archivos.obtener(x.archivoId);
    if (!a) { U.toast("No se encontró el archivo en este teléfono (¿se restauró un respaldo sin archivos?).", "error"); return; }
    if ((a.mime || "").startsWith("image/")) {
      U.modal(`<h2>${esc(x.titulo)}</h2><p class="nota">${esc(x.fuente || "")}</p><div class="el-visor"><img src="data:${esc(a.mime)};base64,${a.datos}" alt="${esc(x.titulo)}" id="vis-img"></div>
        <div class="acciones"><button class="btn" id="vis-zoom">Ampliar</button><button class="btn" id="vis-cerrar">Cerrar</button></div>`, () => {
        $("#vis-cerrar").onclick = U.cerrarModal; $("#vis-zoom").onclick = () => $("#vis-img").classList.toggle("zoom"); });
    } else {
      const bin = atob(a.datos), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      window.open(URL.createObjectURL(new Blob([arr], { type: a.mime })), "_blank", "noopener");
    }
  }

  // ------------------------------------------------------------------ fotos
  const QUE_FOTO = { caja_interior: "Caja de fusibles interior", caja_motor: "Caja del compartimiento del motor", tapa: "Etiqueta de la tapa", fusible: "Fusible individual", rele: "Relé", conector: "Conector", cableado: "Cableado" };
  function dibujarFotos() {
    const d = datos(), listo = E.ajustes.servidor && E.ajustes.codigo;
    $("#el-fotos").innerHTML = `<h2>Inspección con fotos</h2>
      <p class="nota">Tomá fotos de la caja, la etiqueta de la tapa, fusibles, relés o conectores. ${listo ? "La IA puede ayudar a leerlas: separa lo confirmado, lo probable, lo que no se ve y lo que necesita inspección física." : "Para que la IA las lea, configurá el servidor de IA en ⚙ Ajustes. Sin IA, las fotos quedan como registro."}</p>
      <div class="form-carro"><label>Qué es <select id="fo-que">${Object.entries(QUE_FOTO).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("")}</select></label>
        <label>Caja <select id="fo-caja"><option value="interior">Interior</option><option value="motor">Motor</option><option value="abs">ABS</option><option value="">Otra / no aplica</option></select></label>
        <label>Foto <input type="file" id="fo-archivo" accept="image/*" capture="environment"></label></div>
      <div class="acciones"><button class="btn primario" id="fo-guardar">Guardar foto</button></div>
      <div id="fo-lista">${(d.fotos || []).length ? d.fotos.map((x, k) => `<div class="el-foto"><b>${esc(QUE_FOTO[x.que] || x.que)}</b>${x.caja ? ` · caja ${esc(x.caja)}` : ""} <span class="nota">${esc(new Date(x.fecha * 1000).toLocaleString("es-HN"))}</span>
        <div class="acciones"><button class="btn" data-fo-ver="${k}">Ver</button><button class="btn" data-fo-ia="${k}"${listo ? "" : " disabled"}>Revisar con IA</button><button class="btn peligro" data-fo-borrar="${k}">Borrar</button></div>
        ${x.analisis ? htmlAnalisisFoto(x.analisis, k) : ""}</div>`).join("") : `<p class="nota">Sin fotos todavía.</p>`}</div>`;
    $("#fo-guardar").onclick = async () => {
      const arch = $("#fo-archivo").files[0]; if (!arch) { U.toast("Elegí o tomá una foto.", "error"); return; }
      let b64; try { b64 = await U.fotoABase64(arch, 1600); } catch (e) { U.toast(e.message, "error"); return; }
      const archivoId = await S.archivos.guardar({ carroId: carroId(), tipo: "foto", mime: "image/jpeg", datos: b64 });
      guardar({ fotos: [...(datos().fotos || []), { id: archivoId, archivoId, que: $("#fo-que").value, caja: $("#fo-caja").value, fecha: Date.now() / 1000 }] });
      if (S.archivos.persistente === false) U.toast("El navegador no deja guardar archivos: la foto se pierde al cerrar.", "error");
      dibujarFotos();
    };
    $$("[data-fo-ver]").forEach((b) => (b.onclick = () => { const x = datos().fotos[Number(b.dataset.foVer)]; verArchivo({ ...x, titulo: QUE_FOTO[x.que] || "Foto", fuente: "Foto tuya" }); }));
    $$("[data-fo-borrar]").forEach((b) => (b.onclick = () => U.confirmar("¿Borrar esta foto?", "Se borra de este teléfono.", "Borrar", async () => {
      const l = datos().fotos.slice(); const [x] = l.splice(Number(b.dataset.foBorrar), 1); await S.archivos.borrar(x.archivoId); guardar({ fotos: l }); dibujarFotos(); })));
    $$("[data-fo-ia]").forEach((b) => (b.onclick = () => revisarFotoIA(Number(b.dataset.foIa))));
    $$("[data-fo-aplicar]").forEach((b) => (b.onclick = () => {
      const [k, j] = b.dataset.foAplicar.split(":").map(Number);
      const x = datos().fotos[k], s = S.sugerenciasDeFoto(x.analisis, variante(), x.caja)[j];
      const fus = { ...(datos().fusibles || {}) }; fus[s.id] = { ...(fus[s.id] || {}), ...s.cambios, fecha: Date.now() / 1000 };
      guardar({ fusibles: fus }); U.toast(`Anotado en ${s.id} como dato de foto (sin confirmar).`); dibujarFotos();
    }));
  }
  const ESTADO_VISUAL = { sin_dano_visible: "sin daño visible", filamento_cortado_visible: "filamento cortado visible", derretido_o_quemado: "derretido o quemado", sulfato: "sulfato", flojo_o_fuera_de_lugar: "flojo o fuera de lugar", no_se_ve: "no se ve" };
  const CERT_TXT = { confirmada: "Identificación visual confirmada", probable: "Identificación probable", insuficiente: "Imagen insuficiente", requiere_fisica: "Requiere inspección física" };
  function htmlAnalisisFoto(a, k) {
    const sug = S.sugerenciasDeFoto(a, variante(), (datos().fotos[k] || {}).caja);
    return `<div class="el-ia">${a.error ? `<p class="advertencia">${esc(a.error)}</p>` : ""}${a.que_se_ve ? `<p>${esc(a.que_se_ve)}</p>` : ""}
      ${["confirmada", "probable", "insuficiente", "requiere_fisica"].map((c) => { const el = a.elementos.filter((e) => e.certeza === c); return el.length ? `<p><b>${CERT_TXT[c]}:</b></p><ul>${el.map((e) => `<li>${esc(e.tipo)} ${esc(e.posicion)}${e.amperaje_visto != null ? ` · ${e.amperaje_visto} A` : ""}${e.color_visto ? ` · ${esc(e.color_visto)}` : ""} · ${esc(ESTADO_VISUAL[e.estado_visual] || e.estado_visual.replace(/_/g, " "))}${e.nota ? ` — ${esc(e.nota)}` : ""}</li>`).join("")}</ul>` : ""; }).join("")}
      ${a.comparacion.length ? `<p><b>Comparación con la documentación:</b></p><ul>${a.comparacion.map((c) => `<li>${esc(c.posicion)}: documentado ${esc(c.documentado)} · visto ${esc(c.visto)} · ${c.coincide === true ? "coincide" : c.coincide === false ? "NO coincide" : "no se puede saber"} (${esc(CERT_TXT[c.certeza] || c.certeza)})</li>`).join("")}</ul>` : ""}
      ${a.limitaciones.length ? `<p class="nota">${esc(a.limitaciones.join(" "))}</p>` : ""}${a.siguiente ? `<p><b>Siguiente:</b> ${esc(a.siguiente)}</p>` : ""}
      ${sug.length ? `<p><b>Anotar en la inspección (como dato de foto, sin confirmar):</b></p>${sug.map((s, j) => `<div><button class="btn" data-fo-aplicar="${k}:${j}">${esc(s.id)}</button> ${esc(s.texto)} <span class="nota">(${esc(CERT_TXT[s.certeza] || s.certeza)})</span></div>`).join("")}` : ""}</div>`;
  }
  async function revisarFotoIA(k) {
    const x = datos().fotos[k], a = await S.archivos.obtener(x.archivoId);
    if (!a) { U.toast("No se encontró la foto.", "error"); return; }
    const f = ficha(), v = variante();
    const texto = S.contextoFotoElectrica({ ficha: f, variante: v, caja: x.caja, que: QUE_FOTO[x.que] });
    U.toast("Enviando la foto a la IA…");
    try {
      const r = await S.llamarIA({ conexion: { servidor: E.ajustes.servidor, codigo: E.ajustes.codigo }, modelo: E.ajustes.modelo, maxTokens: 2500, sistema: S.PROMPT_FOTO_ELECTRICA,
        mensajes: [{ role: "user", content: [{ type: "text", text: texto }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: a.datos } }] }] });
      const an = S.interpretarFotoElectrica(r.texto);
      if (r.incompleta) an.limitaciones.push("La respuesta de la IA llegó cortada.");
      const l = datos().fotos.slice(); l[k] = { ...x, analisis: an }; guardar({ fotos: l }); dibujarFotos();
    } catch (e) { U.toast(e.message || "No se pudo consultar la IA.", "error"); }
  }

  // ------------------------------------------------------------------ informe
  function dibujarInforme() {
    $("#el-informe").innerHTML = `<h2>Informe eléctrico</h2><p class="nota">Incluye estado general, fusibles revisados y pendientes, relés, mediciones, componentes, diagramas, fallas confirmadas, sospechas, pruebas recomendadas y fuentes técnicas. Se puede guardar como PDF (imprimir) o JSON.</p>
      <div class="acciones"><button class="btn primario" id="in-generar">Generar informe</button></div>`;
    $("#in-generar").onclick = generarInforme;
  }
  function generarInforme() {
    const ctx = contexto(), d = datos(), f = ficha();
    const inf = S.informeElectrico({ carro: ctx.carro, ficha: f, variante: ctx.variante, inspeccion: ctx.inspeccion, mediciones: ctx.mediciones, diagramas: d.diagramas, componentes: ctx.componentes, obd: ctx.obd, sintomas: ctx.sintomas, pruebas: ctx.pruebas, simulado: !!practica || !!(E.fuente && E.fuente.esSimulador) });
    const li = (l) => (l.length ? `<ul>${l.map((x) => `<li>${esc(typeof x === "string" ? x : x.texto || x.id)}</li>`).join("")}</ul>` : "<p>—</p>");
    const cuerpo = `<h2>Estado general: ${esc(inf.estado_general)}</h2>
      ${inf.ficha ? `<p>Ficha: ${esc(inf.ficha.nombre)} · ${esc(inf.ficha.variante || "")}</p>` : "<p>Sin ficha técnica verificada.</p>"}
      <h3>Fallas confirmadas</h3>${li(inf.fallas_confirmadas)}<h3>Sospechas</h3>${li(inf.sospechas)}<h3>Lo que no se pudo determinar</h3>${li(inf.no_determinado)}<h3>Pruebas recomendadas</h3>${li(inf.pruebas_recomendadas)}
      <h3>Fusibles revisados (${inf.fusibles_revisados.length})</h3>${inf.fusibles_revisados.length ? `<table class="tabla-el"><tr><th>Fusible</th><th>Estado</th><th>Método</th><th>Amperaje puesto</th></tr>${inf.fusibles_revisados.map((x) => `<tr><td>${esc(x.id)} ${esc(x.nombre || "")}</td><td>${esc(x.estado)}</td><td>${esc(S.METODOS_INSPECCION[x.metodo] || x.metodo || "")}</td><td>${x.amperaje_obs ?? "—"}</td></tr>`).join("")}</table>` : "<p>—</p>"}
      <p>Fusibles incorrectos confirmados: ${esc(inf.fusibles_incorrectos_confirmados.join(", ") || "ninguno")}. Pendientes de revisar: ${inf.fusibles_pendientes.length}.</p>
      <h3>Relés revisados</h3>${li(inf.reles_revisados.map((r) => `${r.id}: ${r.resultado === "mejora" ? "falla (intercambio)" : r.resultado === "igual" ? "sin cambio en el intercambio" : "sin probar"}`))}
      <h3>Mediciones</h3>${inf.mediciones.length ? `<table class="tabla-el"><tr><th>Prueba</th><th>Componente</th><th>Valor</th><th>Resultado</th></tr>${inf.mediciones.map((m) => `<tr><td>${esc((S.pruebaCircuito(m.prueba) || {}).nombre || m.prueba)}</td><td>${esc(m.componente || "")}</td><td>${esc(valorTexto(m))}</td><td>${esc(m.evaluacion.texto)}</td></tr>`).join("")}</table>` : "<p>—</p>"}
      <h3>Componentes afectados</h3><p>${esc(inf.componentes_afectados.map((c) => (S.COMPONENTES_ELECTRICOS[c] || {}).nombre || c).join(", ") || "—")}</p>
      <h3>Diagramas consultados</h3>${li(inf.diagramas_consultados.map((x) => `${x.titulo} (${x.tipo}) · ${x.fuente} · ${[x.mercado, x.anio, x.motor, x.version].filter(Boolean).join(" · ")}`))}
      <h3>Fuentes técnicas</h3>${li(inf.fuentes_tecnicas.map((x) => `${x.nombre} — ${x.url}`))}
      <h3>Limitaciones</h3>${li(inf.limitaciones)}`;
    U.reporte("Informe eléctrico", cuerpo, inf, `scania-electrico-${new Date().toISOString().slice(0, 10)}`, { carro: practica ? practica.carro : undefined, simulado: inf.simulado });
  }

  // ------------------------------------------------------------------ navegación interna
  function abrirPanel(p) {
    panel = p;
    $$(".el-tab").forEach((b) => b.classList.toggle("activa", b.dataset.elp === p));
    $$(".el-panel").forEach((x) => x.classList.toggle("oculto", x.dataset.elpanel !== p));
    ({ resumen: dibujarResumen, fusibles: dibujarFusibles, mediciones: dibujarMediciones, carga: dibujarCarga, sensores: dibujarSensores, diagramas: dibujarDiagramas, fotos: dibujarFotos, informe: dibujarInforme })[p]();
  }
  function dibujar() { dibujarCabecera(); abrirPanel(panel); }
  U.dibujarElectrico = dibujar;
  U.on("init", () => {
    $$(".el-tab").forEach((b) => (b.onclick = () => abrirPanel(b.dataset.elp)));
  });
  U.on("vista", (v) => { if (v === "electrico") dibujar(); });
  U.on("carro", () => { if ($("[data-vista='electrico'].vista.activa")) dibujar(); });
})();
