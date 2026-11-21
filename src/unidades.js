/* ScanIA · unidades configurables (internamente todo se guarda en sistema métrico) */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  S.OPCIONES_UNIDADES = {
    temperatura: [["C", "°C"], ["F", "°F"]],
    distancia: [["km", "km y km/h"], ["mi", "millas y mph"]],
    presion: [["kPa", "kPa"], ["psi", "PSI"]],
    consumo: [["Lh", "L/h"], ["galh", "gal/h (EE. UU.)"]],
  };
  S.UNIDADES_POR_DEFECTO = { temperatura: "C", distancia: "km", presion: "kPa", consumo: "Lh" };

  const REGLAS = {
    "°C": { tipo: "temperatura", F: (v) => (v * 9) / 5 + 32, unidadF: "°F" },
    "km/h": { tipo: "distancia", mi: (v) => v * 0.621371, unidadmi: "mph" },
    km: { tipo: "distancia", mi: (v) => v * 0.621371, unidadmi: "mi" },
    kPa: { tipo: "presion", psi: (v) => v * 0.145038, unidadpsi: "psi" },
    "L/h": { tipo: "consumo", galh: (v) => v * 0.264172, unidadgalh: "gal/h" },
  };

  /** Convierte un valor métrico a las unidades elegidas. Devuelve {valor, unidad}. */
  S.convertir = function (valor, unidad, preferencias) {
    const p = { ...S.UNIDADES_POR_DEFECTO, ...(preferencias || {}) };
    const r = REGLAS[unidad];
    if (valor == null || !r) return { valor, unidad };
    const elegido = p[r.tipo];
    if (!r[elegido]) return { valor, unidad };
    return { valor: r[elegido](valor), unidad: r["unidad" + elegido] };
  };

  /** Texto listo para mostrar: "88 °C" o "190 °F". */
  S.formatoValor = function (valor, unidad, decimales, preferencias) {
    if (valor == null || Number.isNaN(valor)) return "—";
    const c = S.convertir(valor, unidad, preferencias);
    let t = Number(c.valor).toFixed(decimales ?? 1);
    if (/^-0(\.0+)?$/.test(t)) t = t.slice(1);
    return c.unidad ? `${t} ${c.unidad}` : t;
  };
  /**
   * Convierte los números con unidad dentro de un texto (°C, km/h, km, kPa), incluso rangos como "85–100 °C".
   * Se usa para que las explicaciones también salgan en las unidades elegidas.
   */
  S.convertirTexto = function (texto, preferencias) {
    const p = { ...S.UNIDADES_POR_DEFECTO, ...(preferencias || {}) };
    if (texto == null) return texto;
    let t = String(texto);
    const num = (x) => parseFloat(String(x).replace(/,/g, ""));
    // Cifras grandes sin decimales (932 mi, 1,553 mi); pequeñas con uno (31.1 mph, 14.5 psi)
    const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
    const reglas = [];
    if (p.temperatura === "F") reglas.push(["°C", "°F", (v) => (v * 9) / 5 + 32]);
    if (p.distancia === "mi") { reglas.push(["km/h", "mph", (v) => v * 0.621371]); reglas.push(["km", "mi", (v) => v * 0.621371]); }
    if (p.presion === "psi") reglas.push(["kPa", "psi", (v) => v * 0.145038]);
    for (const [de, a, f] of reglas) {
      const u = de.replace("/", "\\/");
      const N = "(-?\\d{1,3}(?:,\\d{3})+|-?\\d+(?:\\.\\d+)?)";
      const fin = de === "km" ? "(?![\\/\\w])" : "";
      t = t.replace(new RegExp(N + "\\s?[–-]\\s?" + N + "\\s?" + u + fin, "g"), (m, x, y) => `${fmt(f(num(x)))}–${fmt(f(num(y)))} ${a}`);
      t = t.replace(new RegExp(N + "\\s?" + u + fin, "g"), (m, x) => `${fmt(f(num(x)))} ${a}`);
    }
    return t;
  };
})(typeof window !== "undefined" ? window : globalThis);
