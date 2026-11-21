/* ScanIA · arranque de la app: navegación, inicio, PWA */
(function () {
  "use strict";
  const S = window.ScanIA, U = S.ui, E = U.estado, $ = U.$, $$ = U.$$, esc = U.esc;
  S.VERSION = "2.1.0";

  // ================================================================== barra superior y selector de carro
  function dibujarBarra() {
    const c = U.carro(), carros = S.almacen.carros();
    const sim = E.fuente && E.fuente.esSimulador;
    const el = $("#carro-barra");
    if (carros.length > 1 && !sim) {
      el.innerHTML = `<select id="sel-carro-barra" aria-label="Carro activo">${carros.map((x) => `<option value="${x.id}"${c && c.id === x.id ? " selected" : ""}>${esc(x.apodo || [x.marca, x.modelo, x.anio].filter(Boolean).join(" "))}</option>`).join("")}</select>`;
      $("#sel-carro-barra").onchange = (e) => { S.almacen.elegirCarro(Number(e.target.value)); U.emit("carro"); };
    } else el.textContent = sim ? "Simulador" : c ? c.apodo || [c.marca, c.modelo, c.anio].filter(Boolean).join(" ") : "Sin carro elegido";
  }

  // ================================================================== inicio
  function dibujarInicio() {
    const sim = E.fuente && E.fuente.esSimulador;
    const info = E.conectado && E.fuente ? E.fuente.info() : null;
    $("#inicio-estado").innerHTML = E.conectado
      ? `<h2>${sim ? "Simulador conectado" : "Carro conectado"}</h2>
         <p>${esc(sim ? info.escenario_nombre : `${info.protocolo} · ${info.elm || "ELM327"}`)}</p>
         ${E.lectura ? `<p>${E.lectura.estado && E.lectura.estado.mil ? "<b class='rojo'>Check engine encendido</b>" : "Check engine apagado"} · ${(E.lectura.codigos || []).length} código(s)</p>` : ""}
         <div class="acciones"><a class="btn primario" href="#escanear">Ver códigos</a><a class="btn" href="#vivo">Datos en vivo</a><a class="btn" href="#pruebas">Pruebas</a></div>`
      : `<h2>Revisá un carro</h2>
         <ol class="pasos"><li>Conectá el adaptador ELM327 debajo del timón.</li><li>Llave en ON o motor encendido.</li><li>Tocá Conectar.</li></ol>
         <div class="acciones"><a class="btn primario grande" href="#escanear">Conectar</a><button class="btn" id="ini-sim">Probar con el simulador</button></div>
         <p class="nota">El análisis local funciona sin internet. La IA es opcional.</p>`;
    const bs = $("#ini-sim");
    if (bs) bs.onclick = () => { U.ir("escanear"); document.querySelector('.pestana[data-modo="simulador"]').click(); };

    const c = U.carro();
    $("#inicio-carro").innerHTML = c ? `<h2>${esc(c.apodo || [c.marca, c.modelo].filter(Boolean).join(" "))}</h2>
        <p class="nota">${esc([c.marca, c.modelo, c.anio, c.motor].filter(Boolean).join(" · "))}</p>
        <p>${c.km ? U.num(c.km) + " km" : "Kilometraje sin registrar"}</p>
        ${(() => { const e = S.almacen.escaneos(c.id)[0]; return e ? `<p class="nota">Último escaneo: ${U.fecha(e.fecha)} · ${((e.lectura && e.lectura.codigos) || []).length} código(s)</p>` : `<p class="nota">Sin escaneos todavía.</p>`; })()}
        <div class="acciones"><a class="btn" href="#carros">Ver historial</a></div>`
      : `<h2>Mis carros</h2><p class="nota">Guardá los carros de la familia para llevar su historial, mantenimiento y comparar revisiones.</p>
        <div class="acciones"><button class="btn primario" id="ini-nuevo">Agregar carro</button></div>`;
    const bn = $("#ini-nuevo"); if (bn) bn.onclick = () => { U.ir("carros"); U.nuevoCarro(); };

    const a = U.ultimoAnalisis;
    const imp = a ? a.hallazgos.filter((h) => h.gravedad === "alta" || h.gravedad === "media" || h.id === "todo_bien") : [];
    $("#inicio-alertas").innerHTML = `<h2>Lo más importante</h2>` + (imp.length ? imp.slice(0, 4).map((h) => U.htmlHallazgo(h)).join("") +
      `<div class="acciones"><a class="btn" href="#escanear">Ver todo el análisis</a></div>` : `<p class="nota">Cuando te conectés, acá aparecen las fallas importantes con su evidencia.</p>`);

    const m = c ? S.estadoMantenimiento(c).filter((x) => x.estado === "vencido" || x.estado === "pronto") : [];
    $("#inicio-mantenimiento").innerHTML = `<h2>Mantenimiento</h2>` + (!c ? `<p class="nota">Elegí un carro para ver sus recordatorios.</p>` :
      m.length ? m.map((x) => `<div class="mant"><div><b>${esc(x.tipo)}</b><div class="estado ${x.estado}">${x.estado === "vencido" ? "Vencido" : "Pronto"}${x.falta && x.estado !== "vencido" ? " · faltan " + esc(x.falta) : ""}</div></div></div>`).join("") :
      S.estadoMantenimiento(c).every((x) => x.estado === "sin_dato") ? `<p class="nota">Registrá el último cambio de aceite y otros trabajos en Carros para recibir recordatorios.</p>` : `<p>Todo al día.</p>`);
  }

  // ================================================================== PWA
  function prepararPWA() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      E.instalar = e;
      $("#btn-instalar").classList.remove("oculto");
    });
    $("#btn-instalar").addEventListener("click", async () => {
      if (!E.instalar) return;
      E.instalar.prompt();
      await E.instalar.userChoice.catch(() => null);
      E.instalar = null;
      $("#btn-instalar").classList.add("oculto");
    });
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if ("serviceWorker" in navigator && (location.protocol === "https:" || local) && document.querySelector('link[rel="manifest"]')) {
      navigator.serviceWorker.register("sw.js").catch(() => { /* sin modo sin conexión */ });
    }
  }

  // ================================================================== arranque
  function iniciar() {
    $$("#nav button").forEach((b) => b.addEventListener("click", () => U.ir(b.dataset.vista)));
    window.addEventListener("hashchange", () => U.ir(location.hash.slice(1)));
    // Modales: cerrar con Escape o tocando fuera
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#modal").classList.contains("oculto")) U.cerrarModal();
      else if (!$("#modal-ajustes").classList.contains("oculto")) $("#modal-ajustes").classList.add("oculto");
      else if (!$("#reporte").classList.contains("oculto")) $("#rep-cerrar").click();
    });
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") U.cerrarModal(); });
    $("#modal-ajustes").addEventListener("click", (e) => { if (e.target.id === "modal-ajustes") $("#modal-ajustes").classList.add("oculto"); });

    // Si el navegador no deja guardar (lleno o modo privado), se avisa una vez por sesión en vez de perder datos en silencio
    let avisado = false;
    S.almacen.alFallar = (info) => {
      if (avisado) return;
      avisado = true;
      U.toast(`${info.mensaje} Lo último NO quedó guardado. Bajá un respaldo en Más → Respaldo.`, "error");
    };
    U.emit("init");
    prepararPWA();
    dibujarBarra();
    dibujarInicio();
    U.ir(location.hash.slice(1) || "inicio");
    if (E.ajustes._claveVieja) { U.toast("Se borró una clave de IA vieja guardada en este teléfono (por seguridad). Configurá tu servidor de IA en Ajustes.", "error"); }
  }

  for (const ev of ["carro", "conexion", "analisis", "escaneo", "lectura"]) U.on(ev, () => { dibujarBarra(); dibujarInicio(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
