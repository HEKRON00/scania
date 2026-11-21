/* ScanIA · ajustes, Mis carros, mantenimiento e historial guardados en este dispositivo (localStorage) */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});
  const memoria = {};
  const MAX_HISTORIAL = 80;

  function leer(clave, defecto) {
    try {
      const v = raiz.localStorage.getItem(clave);
      return v == null ? (clave in memoria ? memoria[clave] : defecto) : JSON.parse(v);
    } catch (e) {
      return clave in memoria ? memoria[clave] : defecto;
    }
  }
  function escribir(clave, valor) {
    memoria[clave] = valor;
    try { raiz.localStorage.setItem(clave, JSON.stringify(valor)); return true; }
    catch (e) {
      // El dato queda solo en memoria (se pierde al cerrar): se avisa en vez de fallar en silencio
      const info = { clave, fecha: Date.now() / 1000, mensaje: e && e.name === "QuotaExceededError" ? "El almacenamiento del navegador está lleno." : "El navegador no permitió guardar (modo privado o almacenamiento bloqueado)." };
      if (S.almacen) { S.almacen.ultimoError = info; if (typeof S.almacen.alFallar === "function") { try { S.almacen.alFallar(info); } catch (x) { /* nada */ } } }
      return false;
    }
  }
  const nuevoId = (lista) => (lista.reduce((m, d) => Math.max(m, d.id || 0), 0) || 0) + 1;

  // Mantenimiento recomendado (valores típicos; cada carro los puede cambiar)
  S.MANTENIMIENTO_BASE = [
    { tipo: "Cambio de aceite y filtro", km: 5000, meses: 6 },
    { tipo: "Filtro de aire del motor", km: 15000, meses: 12 },
    { tipo: "Filtro de aire de cabina (A/C)", km: 15000, meses: 12 },
    { tipo: "Rotación de llantas", km: 10000, meses: 0 },
    { tipo: "Revisión de frenos (pastillas)", km: 10000, meses: 12 },
    { tipo: "Líquido de frenos", km: 0, meses: 24 },
    { tipo: "Refrigerante", km: 40000, meses: 24 },
    { tipo: "Bujías", km: 40000, meses: 0 },
    { tipo: "Filtro de combustible", km: 40000, meses: 0 },
    { tipo: "Aceite de transmisión", km: 60000, meses: 0 },
    { tipo: "Faja de tiempo (si lleva faja)", km: 90000, meses: 0 },
    { tipo: "Revisión de batería", km: 0, meses: 12 },
  ];

  S.almacen = {
    leer, escribir,
    ultimoError: null,
    alFallar: null,
    /** Espacio usado por ScanIA en el navegador (aproximado, en KB). */
    uso() {
      let bytes = 0;
      try {
        for (let i = 0; i < raiz.localStorage.length; i++) {
          const k = raiz.localStorage.key(i);
          if (k && k.startsWith("scania-")) bytes += (k.length + (raiz.localStorage.getItem(k) || "").length) * 2;
        }
      } catch (e) { for (const [k, v] of Object.entries(memoria)) bytes += (k.length + JSON.stringify(v).length) * 2; }
      return Math.round(bytes / 1024);
    },
    ajustes() {
      const a = { servidor: "", codigo: "", modelo: "claude-sonnet-5-5", baud: 38400, pantalla: true, buscarWeb: true, voz: true,
        compartirVIN: false, decodificarVIN: false, unidades: { ...(S.UNIDADES_POR_DEFECTO || {}) }, ...leer("scania-ajustes", {}) };
      // Seguridad: versiones viejas guardaban la clave de Anthropic en el teléfono. Se borra.
      if (a.clave) { delete a.clave; escribir("scania-ajustes", a); a._claveVieja = true; }
      return a;
    },
    guardarAjustes(a) { escribir("scania-ajustes", a); },

    // ------------------------------------------------------------ Mis carros
    carros() { return leer("scania-carros", []); },
    carro(id) { return this.carros().find((c) => c.id === id) || null; },
    guardarCarro(datos) {
      const lista = this.carros();
      if (datos.id) {
        const i = lista.findIndex((c) => c.id === datos.id);
        if (i >= 0) lista[i] = { ...lista[i], ...datos, actualizado: Date.now() / 1000 };
      } else {
        datos = { mantenimientos: [], intervalos: S.MANTENIMIENTO_BASE.map((m) => ({ ...m })), ...datos, id: nuevoId(lista), creado: Date.now() / 1000 };
        lista.push(datos);
      }
      escribir("scania-carros", lista);
      return datos.id;
    },
    borrarCarro(id) {
      escribir("scania-carros", this.carros().filter((c) => c.id !== id));
      if (this.carroActivoId() === id) this.elegirCarro(null);
    },
    carroActivoId() { return leer("scania-carro-activo", null); },
    carroActivo() { const id = this.carroActivoId(); return id ? this.carro(id) : null; },
    elegirCarro(id) { escribir("scania-carro-activo", id); },
    carroPorVIN(vin) { return vin ? this.carros().find((c) => c.vin && c.vin.toUpperCase() === vin.toUpperCase()) || null : null; },

    registrarMantenimiento(carroId, m) {
      const c = this.carro(carroId);
      if (!c) return;
      const lista = [{ id: nuevoId(c.mantenimientos || []), fecha: Date.now() / 1000, ...m }, ...(c.mantenimientos || [])];
      const cambios = { mantenimientos: lista };
      if (m.km && (!c.km || Number(m.km) > Number(c.km))) cambios.km = Number(m.km);
      this.guardarCarro({ id: carroId, ...cambios });
    },
    borrarMantenimiento(carroId, mid) {
      const c = this.carro(carroId);
      if (c) this.guardarCarro({ id: carroId, mantenimientos: (c.mantenimientos || []).filter((m) => m.id !== mid) });
    },

    // ------------------------------------------------------------ historial de diagnósticos
    historial() { return leer("scania-historial", []); },
    obtener(id) { return this.historial().find((d) => d.id === id) || null; },
    guardarDiagnostico(item) {
      const lista = this.historial();
      item.id = nuevoId(lista);
      item.fecha = Date.now() / 1000;
      item.chat = item.chat || [];
      lista.unshift(item);
      while (lista.length > MAX_HISTORIAL) lista.pop();
      if (!escribir("scania-historial", lista)) escribir("scania-historial", lista.slice(0, 20));
      return item.id;
    },
    actualizarDiagnostico(id, cambios) {
      const lista = this.historial();
      const i = lista.findIndex((d) => d.id === id);
      if (i === -1) return;
      lista[i] = { ...lista[i], ...cambios };
      escribir("scania-historial", lista);
    },
    borrarDiagnostico(id) { escribir("scania-historial", this.historial().filter((d) => d.id !== id)); },

    // ------------------------------------------------------------ escaneos (cada lectura de códigos queda guardada)
    escaneos(carroId) {
      const todos = leer("scania-escaneos", []);
      return carroId === undefined ? todos : todos.filter((e) => e.carroId === carroId);
    },
    escaneo(id) { return leer("scania-escaneos", []).find((e) => e.id === id) || null; },
    guardarEscaneo(e) {
      const lista = leer("scania-escaneos", []);
      const item = { ...e, id: nuevoId(lista), fecha: e.fecha || Date.now() / 1000 };
      lista.unshift(item);
      while (lista.length > 120) lista.pop();
      if (!escribir("scania-escaneos", lista)) escribir("scania-escaneos", lista.slice(0, 40));
      return item.id;
    },
    actualizarEscaneo(id, cambios) {
      const lista = leer("scania-escaneos", []);
      const i = lista.findIndex((e) => e.id === id);
      if (i >= 0) { lista[i] = { ...lista[i], ...cambios }; escribir("scania-escaneos", lista); }
    },
    borrarEscaneo(id) { escribir("scania-escaneos", leer("scania-escaneos", []).filter((e) => e.id !== id)); },

    // ------------------------------------------------------------ resultados de pruebas guiadas
    pruebas(carroId) {
      const todas = leer("scania-pruebas", []);
      return carroId === undefined ? todas : todas.filter((p) => p.carroId === carroId);
    },
    guardarPrueba(p) {
      const lista = leer("scania-pruebas", []);
      const item = { ...p, id: nuevoId(lista), fecha: p.fecha || Date.now() / 1000 };
      lista.unshift(item);
      while (lista.length > 200) lista.pop();
      escribir("scania-pruebas", lista);
      return item.id;
    },
    borrarPrueba(id) { escribir("scania-pruebas", leer("scania-pruebas", []).filter((p) => p.id !== id)); },

    // ------------------------------------------------------------ respaldo
    exportar(incluirCodigo) {
      const a = this.ajustes();
      delete a._claveVieja;
      if (!incluirCodigo) delete a.codigo;
      return { app: "ScanIA", version: 2, fecha: new Date().toISOString(), ajustes: a, carros: this.carros(),
        carroActivo: this.carroActivoId(), historial: this.historial(), escaneos: this.escaneos(), pruebas: this.pruebas() };
    },
    importar(d) {
      if (!d || d.app !== "ScanIA") throw new Error("Ese archivo no es un respaldo de ScanIA.");
      const carros = this.carros(), hist = this.historial();
      // Se juntan sin duplicar (por id y fecha)
      // Los ids de carro del respaldo pueden chocar con los de este teléfono: se reasignan y se actualizan las referencias
      const mapa = {};
      for (const c of d.carros || []) {
        const igual = carros.find((x) => x.creado === c.creado && x.vin === c.vin);
        if (igual) { Object.assign(igual, { ...c, id: igual.id }); mapa[c.id] = igual.id; }
        else { const id = nuevoId(carros); carros.push({ ...c, id }); mapa[c.id] = id; }
      }
      const ref = (x) => (x.carroId != null && mapa[x.carroId] != null ? { ...x, carroId: mapa[x.carroId] } : x);
      for (const h of d.historial || []) if (!hist.some((x) => x.fecha === h.fecha)) hist.push({ ...ref(h), id: nuevoId(hist) });
      const esc = this.escaneos();
      for (const e of d.escaneos || []) if (!esc.some((x) => x.fecha === e.fecha)) esc.push({ ...ref(e), id: nuevoId(esc) });
      esc.sort((a, b) => b.fecha - a.fecha);
      const pru = this.pruebas();
      for (const p of d.pruebas || []) if (!pru.some((x) => x.fecha === p.fecha)) pru.push({ ...ref(p), id: nuevoId(pru) });
      pru.sort((a, b) => b.fecha - a.fecha);
      escribir("scania-pruebas", pru.slice(0, 200));
      escribir("scania-escaneos", esc.slice(0, 120));
      hist.sort((a, b) => b.fecha - a.fecha);
      escribir("scania-carros", carros);
      escribir("scania-historial", hist.slice(0, MAX_HISTORIAL));
      if (d.ajustes) { const { clave, ...resto } = d.ajustes; this.guardarAjustes({ ...this.ajustes(), ...resto, codigo: resto.codigo || this.ajustes().codigo }); }
      return { carros: (d.carros || []).length, diagnosticos: (d.historial || []).length, escaneos: (d.escaneos || []).length, pruebas: (d.pruebas || []).length };
    },
  };

  /** Estado de cada mantenimiento de un carro: ok / pronto / vencido / sin_dato. */
  S.estadoMantenimiento = function (carro, ahora = Date.now() / 1000) {
    const km = Number(carro.km) || 0;
    return (carro.intervalos || S.MANTENIMIENTO_BASE).map((it) => {
      const ultimo = (carro.mantenimientos || []).find((m) => m.tipo === it.tipo);
      let estado = "sin_dato", falta = "", proporcion = 0;
      if (ultimo) {
        const pk = it.km && km && ultimo.km ? (km - Number(ultimo.km)) / it.km : 0;
        const pm = it.meses ? (ahora - ultimo.fecha) / (it.meses * 30.4 * 86400) : 0;
        proporcion = Math.max(pk, pm);
        estado = proporcion >= 1 ? "vencido" : proporcion >= 0.85 ? "pronto" : "ok";
        const partes = [];
        if (it.km && ultimo.km) partes.push(`${Math.round(Number(ultimo.km) + it.km - km).toLocaleString("es-HN")} km`);
        if (it.meses) partes.push(`${Math.round((ultimo.fecha + it.meses * 30.4 * 86400 - ahora) / 86400)} días`);
        falta = partes.join(" o ");
      }
      return { ...it, ultimo, estado, falta, proporcion };
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
