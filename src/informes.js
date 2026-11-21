/* ScanIA · informes: comparación de escaneos, revisión de carro usado y verificación del VIN */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  // ------------------------------------------------------------------ VIN
  const VALOR = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const PESOS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  /** Dígito verificador (posición 9). Obligatorio en carros hechos para Norteamérica; otros mercados pueden no usarlo. */
  S.verificarVIN = function (vin) {
    vin = String(vin || "").toUpperCase().trim();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { valido: false, motivo: "El VIN debe tener 17 caracteres, sin I, O ni Q." };
    let suma = 0;
    for (let i = 0; i < 17; i++) { const c = vin[i]; suma += (/\d/.test(c) ? Number(c) : VALOR[c]) * PESOS[i]; }
    const resto = suma % 11, esperado = resto === 10 ? "X" : String(resto);
    const norteamerica = "12345".includes(vin[0]);
    return { valido: true, digito_ok: vin[8] === esperado, esperado, norteamerica,
      nota: vin[8] === esperado ? "El dígito verificador es correcto." :
        norteamerica ? "El dígito verificador NO coincide: en un carro de Norteamérica eso indica un VIN mal copiado o alterado." :
          "El dígito verificador no coincide, pero en carros de otros mercados (Japón, Corea, Europa) no siempre se usa." };
  };

  // ------------------------------------------------------------------ comparación de escaneos
  const promedio = (e, clave) => (e && e.resumen && e.resumen[clave] != null ? e.resumen[clave] : null);

  /** Qué cambió entre dos escaneos del mismo carro (a = anterior, b = reciente). */
  S.compararEscaneos = function (a, b) {
    const cods = (e) => new Map(((e && e.lectura && e.lectura.codigos) || []).map((c) => [c.codigo, c]));
    const ca = cods(a), cb = cods(b);
    const nuevos = [...cb.keys()].filter((c) => !ca.has(c)), resueltos = [...ca.keys()].filter((c) => !cb.has(c));
    const siguen = [...cb.keys()].filter((c) => ca.has(c));
    const mon = (e) => new Map((((e && e.lectura && e.lectura.estado) || {}).monitores || []).map((m) => [m.nombre_es, m.completo]));
    const ma = mon(a), mb = mon(b);
    const monitores = [...mb.keys()].filter((k) => ma.has(k) && ma.get(k) !== mb.get(k)).map((k) => ({ monitor: k, antes: ma.get(k), ahora: mb.get(k) }));
    const mis = (e) => new Map(((e && e.pruebas06 && e.pruebas06.misfire) || []).map((c) => [c.cilindro, Math.max(c.actual || 0, c.promedio || 0)]));
    const xa = mis(a), xb = mis(b);
    const misfire = [...xb.keys()].filter((k) => xa.has(k) && xa.get(k) !== xb.get(k)).map((k) => ({ cilindro: k, antes: xa.get(k), ahora: xb.get(k) }));
    const datos = [];
    for (const [clave, nombre] of [["trim_ralenti", "Ajuste de combustible en ralentí (%)"], ["trim_altas", "Ajuste a más RPM (%)"], ["voltaje", "Voltaje con motor encendido (V)"],
      ["temp_max", "Temperatura máxima del motor (°C)"], ["rpm_desv", "Variación del ralentí (± rpm)"]]) {
      const x = promedio(a, clave), y = promedio(b, clave);
      if (x != null && y != null) datos.push({ nombre, antes: x, ahora: y, cambio: y - x });
    }
    const hall = (e) => new Set(((e && e.hallazgos) || []).filter((h) => h.certeza).map((h) => h.titulo));
    const ha = hall(a), hb = hall(b);
    return { dias: a && b ? Math.round((b.fecha - a.fecha) / 86400) : null, km: a && b && a.km && b.km ? b.km - a.km : null,
      nuevos, resueltos, siguen, monitores, misfire, datos,
      hallazgos_nuevos: [...hb].filter((t) => !ha.has(t)), hallazgos_resueltos: [...ha].filter((t) => !hb.has(t)) };
  };

  /** Resumen numérico compacto de los datos en vivo (para guardar en cada escaneo). */
  S.resumenEscaneo = function (resumen) {
    if (!resumen || !resumen.muestras) return {};
    const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
    return {
      muestras: resumen.muestras,
      trim_ralenti: r1(resumen.ralenti.trim_total1 && resumen.ralenti.trim_total1.prom),
      trim_altas: r1(resumen.rpm_altas.trim_total1 && resumen.rpm_altas.trim_total1.prom),
      voltaje: r1(resumen.caliente.voltaje && resumen.caliente.voltaje.prom),
      temp_max: r1(resumen.general.temp_motor && resumen.general.temp_motor.max),
      rpm_desv: r1(resumen.ralenti.rpm && resumen.ralenti.rpm.desv),
    };
  };

  // ------------------------------------------------------------------ revisión de carro usado
  /**
   * Arma un informe con lo que la computadora del carro permite saber.
   * entrada: { lectura, info, pruebas06, resumen, declarado: { vin, anio, km } }
   * Cada punto: { tema, estado: ok|aviso|mal|sin_dato, texto }
   */
  S.revisionUsado = function ({ lectura, info, pruebas06, resumen, declarado = {} }) {
    const p = [];
    const add = (tema, estado, texto) => p.push({ tema, estado, texto });
    const l = lectura || {}, e = l.estado || {}, ex = l.extras || {}, cods = l.codigos || [];
    const conf = cods.filter((c) => c.tipo === "almacenado"), pend = cods.filter((c) => c.tipo === "pendiente" && !(c.tambien || []).includes("almacenado"));
    const perm = cods.filter((c) => c.tipo === "permanente" || (c.tambien || []).includes("permanente"));

    if (!lectura) add("Códigos", "sin_dato", "No se leyeron los códigos.");
    else if (!cods.length) add("Códigos", "ok", "Sin códigos de falla confirmados, pendientes ni permanentes.");
    else {
      if (conf.length) add("Códigos confirmados", "mal", conf.map((c) => `${c.codigo}: ${c.descripcion}`).join(" · "));
      if (pend.length) add("Códigos pendientes", "aviso", "Fallas detectadas una vez que todavía no encienden la luz: " + pend.map((c) => c.codigo).join(", "));
    }
    if (perm.length) add("Códigos permanentes", "mal", `${perm.map((c) => c.codigo).join(", ")}. Estos códigos NO se pueden borrar con un escáner: si los códigos normales aparecen borrados pero hay permanentes, la falla sigue sin reparar.`);
    if (e.mil && !cods.length) add("Luz check engine", "aviso", "La computadora reporta la luz encendida pero no se leyeron códigos (puede ser de otro módulo).");

    const inc = (e.monitores || []).filter((m) => !m.completo).map((m) => m.nombre_es);
    if (e.monitores && e.monitores.length) {
      if (inc.length) add("Monitores de emisiones", "aviso", `${inc.length} sin completar (${inc.join(", ")}). Pasa cuando se borran los códigos o se desconecta la batería, y también si el carro casi no se ha manejado.`);
      else add("Monitores de emisiones", "ok", "Todos los monitores completos.");
    }
    const kmB = ex.km_desde_borrado, calB = ex.calentamientos_desde_borrado, minB = ex.minutos_desde_borrado;
    if (kmB != null || calB != null) {
      const reciente = (kmB != null && kmB < 100) || (calB != null && calB < 10);
      add("Borrado de códigos", reciente ? "aviso" : "ok",
        (reciente ? "Los códigos o la batería se borraron/desconectaron hace poco: " : "No hay señales de un borrado reciente: ") +
        [kmB != null ? `${Math.round(kmB)} km` : null, calB != null ? `${calB} calentamientos` : null, minB != null ? `${Math.round(minB)} min de motor` : null].filter(Boolean).join(", ") +
        " desde el último borrado. (Este contador también se reinicia al desconectar la batería; no prueba que alguien haya escondido una falla.)");
    } else add("Borrado de códigos", "sin_dato", "Este carro no reporta la distancia desde el último borrado: no se puede saber si borraron códigos recientemente.");

    const vinEcu = info && info.vin;
    if (vinEcu) {
      const v = S.verificarVIN(vinEcu);
      add("VIN de la computadora", v.valido && (v.digito_ok || !v.norteamerica) ? "ok" : "aviso", `${vinEcu}. ${v.valido ? v.nota : v.motivo}`);
      if (declarado.vin) {
        const igual = declarado.vin.toUpperCase().replace(/\s/g, "") === vinEcu;
        add("VIN de la computadora vs. el del carro", igual ? "ok" : "mal", igual ? "Coinciden." :
          `NO coinciden (carro: ${declarado.vin.toUpperCase()}). Puede ser una computadora cambiada o de otro carro, o un error al copiar el VIN. Preguntá y revisá la placa del VIN en el parabrisas y en la puerta.`);
      }
      const loc = S.decodificarVINLocal ? S.decodificarVINLocal(vinEcu) : null;
      if (loc && loc.anio && declarado.anio && String(declarado.anio) !== String(loc.anio)) {
        add("Año del modelo", "aviso", `Según el VIN el modelo es ${loc.anio}, pero se declaró ${declarado.anio}. (El año del modelo puede diferir en uno del año de fabricación.)`);
      }
    } else add("VIN de la computadora", "sin_dato", "La computadora no reportó el VIN (común en carros anteriores a ~2005).");

    if (ex.odometro_ecu_km != null) {
      const km = Number(declarado.km);
      if (km) {
        const dif = Math.abs(ex.odometro_ecu_km - km) / Math.max(km, 1);
        add("Kilometraje", dif > 0.05 ? "mal" : "ok", `Computadora: ${Math.round(ex.odometro_ecu_km).toLocaleString("es-HN")} km · tablero declarado: ${km.toLocaleString("es-HN")} km` +
          (dif > 0.05 ? ". La diferencia es grande: posible tablero cambiado o manipulado. Preguntá." : "."));
      } else add("Kilometraje", "ok", `La computadora reporta ${Math.round(ex.odometro_ecu_km).toLocaleString("es-HN")} km. Comparalo con el tablero.`);
    } else add("Kilometraje", "sin_dato", "Este carro no reporta el odómetro por OBD2 (solo algunos modelos recientes lo hacen).");

    if (pruebas06 && pruebas06.disponible) {
      const f = (pruebas06.fallidas || []).filter((x) => !(x.mid >= 0xa1 && x.mid <= 0xad));
      add("Pruebas internas (modo 06)", f.length ? "aviso" : "ok", f.length ? `${f.length} prueba(s) fuera de límite: ${[...new Set(f.map((x) => x.nombre))].join(", ")}.` : `Las ${pruebas06.pruebas.length} pruebas internas están dentro de sus límites.`);
      const mis = (pruebas06.misfire || []).filter((c) => Math.max(c.actual || 0, c.promedio || 0) >= 5);
      if ((pruebas06.misfire || []).length) add("Fallos de encendido", mis.length ? "aviso" : "ok", mis.length ? `Cilindro(s) con fallos: ${mis.map((c) => c.cilindro).join(", ")}.` : "Sin fallos de encendido relevantes por cilindro.");
    } else add("Pruebas internas (modo 06)", "sin_dato", (pruebas06 && pruebas06.motivo) || "No se leyeron.");

    if (resumen && resumen.general && resumen.general.voltaje) {
      const v = resumen.general.voltaje.prom;
      const enc = resumen.motor_encendido;
      const ok = enc ? v >= 13.2 && v <= 14.9 : v >= 12.3;
      add("Sistema eléctrico", ok ? "ok" : "aviso", `${v.toFixed(2)} V con el motor ${enc ? "encendido" : "apagado"}. ${ok ? "Normal." : "Fuera de lo normal: hacé las pruebas de batería y alternador."}`);
    }
    const mal = p.filter((x) => x.estado === "mal").length, aviso = p.filter((x) => x.estado === "aviso").length;
    return {
      veredicto: mal ? "mal" : aviso ? "aviso" : "ok",
      titulo: mal ? "Hay problemas que revisar antes de comprar" : aviso ? "Hay puntos que conviene preguntar" : "Sin problemas detectados por OBD2",
      puntos: p,
      limites: "El OBD2 solo ve motor, emisiones y a veces la transmisión. No revisa carrocería, chasis, suspensión, frenos, fugas, choques ni el historial del carro. Siempre hacé que un mecánico de confianza lo revise y pedí el historial por VIN.",
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
