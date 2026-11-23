/* ScanIA · pruebas guiadas (versión 2)
 *
 * Cada prueba tiene las 8 partes: preparación, herramientas, procedimiento (pasos), condiciones de medición,
 * valores de referencia (diciendo de qué dependen), interpretación, resultado (evaluar) y próxima prueba (siguiente).
 * Ninguna prueba se hace manejando. Las que requieren abrir el sistema de combustible, quitar bujías o trabajar
 * cerca de piezas en movimiento se derivan a un mecánico; la app solo interpreta los números que él mida.
 *
 * Tipos de paso:
 *   voltaje  -> lecturas rápidas del voltaje del adaptador (ATRV o PID 42)
 *   datos    -> junta muestras de los datos en vivo mientras se cumple una condición
 *   pid      -> lecturas rápidas de un solo dato (para ver qué tan rápido cambia)
 *   modo06   -> lee las pruebas internas de la computadora
 *   marca    -> junta datos y el usuario toca un botón cuando pasa algo (ej. "el ventilador encendió")
 *   manual   -> el usuario escribe valores medidos con una herramienta (multímetro, manómetro, compresímetro)
 * Veredictos: ok | regular | mal | no_concluyente | error
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});
  const prom = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  const desv = (l) => { const p = prom(l); return l.length > 1 ? Math.sqrt(l.reduce((a, b) => a + (b - p) ** 2, 0) / l.length) : 0; };
  const mediana = (l) => { if (!l.length) return null; const o = [...l].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };
  const r1 = (v, d = 1) => (v == null ? "?" : Number(v).toFixed(d));
  const peor = (...v) => (v.includes("mal") ? "mal" : v.includes("regular") ? "regular" : "ok");
  const tiene = (f, clave) => f && f.pidsDisponibles && f.pidsDisponibles().includes(clave);
  const trim = (m) => (m.stft1 != null && m.ltft1 != null ? m.stft1 + m.ltft1 : null);
  const caliente = (m) => (m.sistema_comb != null ? S.lazoCerrado(m.sistema_comb) : (m.temp_motor || 0) >= 70);
  const fuenteV = (f) => (f && f.usaATRV ? "medido por el adaptador en el conector OBD (ATRV)" : "reportado por la computadora (PID 42)");
  const NOTA_V = "Se mide en el conector OBD: suele marcar 0.1–0.3 V menos que en los bornes de la batería, y los adaptadores baratos pueden tener ±0.2 V de error. Para una decisión (comprar batería o alternador), confirmá con multímetro en los bornes.";

  /** Eficiencia volumétrica (%) con la densidad del aire en el múltiple. disp = cilindrada en litros. */
  S.eficienciaVolumetrica = function (m, disp) {
    if (!m || !disp || !m.maf || !m.rpm || m.temp_admision == null || m.map == null) return null;
    const densidad = (m.map * 1000) / (287.05 * (m.temp_admision + 273.15));   // g/L
    const teorico = disp * (m.rpm / 120) * densidad;                           // g/s (motor de 4 tiempos)
    return teorico > 0 ? (m.maf / teorico) * 100 : null;
  };

  /** Cuenta los cruces de 0.45 V de un sensor de oxígeno de voltaje (zirconio, 0–1 V). */
  S.crucesO2 = function (valores) {
    let cruces = 0, previo = null;
    for (const v of valores) {
      if (v == null) continue;
      const lado = v >= 0.45;
      if (previo !== null && lado !== previo) cruces++;
      previo = lado;
    }
    return cruces;
  };

  S.GRUPOS_PRUEBAS = { electrico: "Sistema eléctrico", motor: "Motor y mezcla", enfriamiento: "Refrigeración", sensores: "Sensores", taller: "Con herramientas o en el taller" };

  S.PRUEBAS_GUIADAS = [
    // ====================================================================== ELÉCTRICO
    {
      id: "bateria", grupo: "electrico", titulo: "Batería en reposo",
      descripcion: "Mide cuánta carga tiene la batería con el motor apagado.",
      preparacion: "Ideal: el carro apagado al menos 1 hora (así se va la 'carga superficial' que deja el alternador). Puertas cerradas, luces, radio y aire apagados.",
      herramientas: "Solo el escáner (opcional: multímetro para confirmar en los bornes)",
      condiciones: "Motor apagado, llave en ON (la computadora, la bomba y el tablero consumen un poco, por eso la lectura es algo menor que en reposo total)",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Batería de plomo-ácido a ~25 °C, en reposo: ~12.6 V cargada, ~12.4 V media carga, menos de 12.2 V descargada. Las AGM marcan un poco más; el frío baja la lectura. " + NOTA_V,
      interpretacion: "Una batería baja puede estar descargada (carro poco usado o alternador débil) o vieja. Solo una prueba de carga en un taller dice si está sana.",
      siguiente: { ok: "Hacé la prueba 'Arranque'.", regular: "Cargá la batería con cargador y repetí; después hacé 'Arranque' y 'Alternador con carga'.", mal: "Cargala y repetí. Si vuelve a bajar en uno o dos días, hacé 'Alternador con carga' y pedí una prueba de carga de la batería en un taller." },
      requiere: (f) => (f && f.voltajeRapido ? null : "Conectate al carro primero."),
      pasos: [{ texto: "Motor apagado y llave en ON. Esperá unos 10 segundos con todo apagado y tocá Medir.", tipo: "voltaje", segundos: 5, clave: "reposo", evento: "apagar", boton: "Medir" }],
      evaluar(d, ctx) {
        const v = mediana(d.reposo || []);
        if (v == null) return { veredicto: "error", resumen: "No se pudo leer el voltaje. Repetí la prueba." };
        if (v > 13.2) return { veredicto: "no_concluyente", resumen: `Marca ${r1(v, 2)} V: parece que el motor está encendido o la batería tiene carga superficial (se acaba de manejar). Apagá el motor, esperá y repetí.` };
        const ver = v >= 12.4 ? "ok" : v >= 12.2 ? "regular" : "mal";
        return { veredicto: ver, resumen: ver === "ok" ? "La batería tiene buena carga." : ver === "regular" ? "La batería está a media carga." : "La batería está descargada o vieja.",
          valores: [`Voltaje con llave en ON y motor apagado: ${r1(v, 2)} V (${fuenteV(ctx.fuente)})`], detalle: NOTA_V };
      },
    },
    {
      id: "arranque", grupo: "electrico", titulo: "Arranque (caída de voltaje al arrancar)",
      descripcion: "Mide cuánto baja el voltaje mientras el motor de arranque gira y cuánto tarda en encender.",
      preparacion: "Carro estacionado, en Parqueo (o neutro con freno de mano). Nada encendido. Tené a mano la llave.",
      herramientas: "Solo el escáner",
      condiciones: "Motor apagado y frío o tibio; la lectura más útil es el primer arranque del día",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Orientativo a ~20 °C con batería cargada: el voltaje no debería bajar de ~9.6–10 V mientras arranca, y el motor debería encender en pocos segundos. Depende de la temperatura, el tamaño de la batería y el motor de arranque. " +
        "El adaptador lee varias veces por segundo, así que el mínimo medido puede ser algo más alto que el real.",
      interpretacion: "Si baja demasiado: batería débil, bornes sulfatados o flojos, cables o tierra en mal estado, o un motor de arranque que consume mucho. Si tarda mucho en encender pero el voltaje está bien, el problema no es eléctrico (combustible, chispa).",
      siguiente: { ok: "Hacé 'Alternador con carga'.", regular: "Cargá la batería y repetí. Si sigue igual, hacé la prueba 'Caída de voltaje en cables (multímetro)'.", mal: "Limpiá y apretá bornes; hacé 'Caída de voltaje en cables (multímetro)' y una prueba de carga de la batería en un taller." },
      requiere: (f) => (f && f.voltajeRapido ? null : "Conectate al carro primero."),
      pasos: [
        { texto: "Llave en ON, motor apagado, todo apagado. Tocá Medir para tomar el voltaje de antes.", tipo: "voltaje", segundos: 3, clave: "antes", evento: "apagar", boton: "Medir" },
        { texto: "Tocá Empezar y en ese mismo momento dale arranque. Soltá la llave cuando encienda y dejalo encendido.", tipo: "voltaje", segundos: 10, clave: "arranque", evento: "arranque", boton: "Empezar" },
      ],
      evaluar(d, ctx) {
        const antes = mediana(d.antes || []);
        const serie = (d.arranque || []).filter((v) => v > 4);
        if (antes == null || serie.length < 5) return { veredicto: "error", resumen: "No se pudo medir bien. Algunos adaptadores se reinician al dar arranque (el voltaje baja tanto que se apagan): repetí la prueba." + (ctx.reinicios ? " El adaptador SÍ se reinició durante la prueba." : "") };
        const minimo = Math.min(...serie);
        if (minimo > antes - 0.5) return { veredicto: "no_concluyente", resumen: "No detecté el arranque (el voltaje no bajó). Repetí y dale arranque justo al tocar Empezar." };
        // Duración aproximada: desde que baja 0.5 V hasta que pasa de 13 V (alternador cargando)
        const n = serie.length, paso = 10 / n;
        const ini = serie.findIndex((v) => v < antes - 0.5);
        const fin = serie.findIndex((v, i) => i > ini && v >= 13.0);
        const dur = ini >= 0 && fin > ini ? (fin - ini) * paso : null;
        const final = prom(serie.slice(-4));
        const vA = minimo >= 10.0 ? "ok" : minimo >= 9.6 ? "regular" : "mal";
        const vC = final >= 13.2 ? "ok" : "regular";
        const vT = dur == null ? "regular" : dur <= 3 ? "ok" : "regular";
        return {
          veredicto: peor(vA, vC === "ok" ? "ok" : "regular", vT),
          resumen: vA === "ok" ? "El voltaje al arrancar se mantuvo bien." : vA === "regular" ? "Al arrancar el voltaje bajó bastante: la batería o los cables están perdiendo fuerza." : "Al arrancar el voltaje bajó demasiado.",
          detalle: (dur == null ? "No se pudo estimar cuánto tardó en encender (puede que no haya encendido o el adaptador no alcanzó a leer). " : "") +
            (vC !== "ok" ? "Después de encender el voltaje no subió a más de 13.2 V: hacé 'Alternador con carga'. " : "") + NOTA_V,
          valores: [`Antes: ${r1(antes, 2)} V`, `Mínimo al arrancar: ${r1(minimo, 2)} V (${serie.length} lecturas en 10 s)`, `Tiempo aproximado hasta encender: ${dur == null ? "?" : r1(dur) + " s"}`, `Ya encendido: ${r1(final, 2)} V`],
        };
      },
    },
    {
      id: "alternador", grupo: "electrico", titulo: "Alternador con carga",
      descripcion: "Revisa que el alternador aguante cuando todo está encendido (luces, aire, desempañador).",
      preparacion: "Motor caliente, estacionado con freno de mano, en Parqueo o neutro.",
      herramientas: "Solo el escáner",
      condiciones: "Motor en ralentí y luego sostenido a ~2,000 rpm, siempre estacionado",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Típico: 13.5–14.7 V sin carga; con todo encendido, no menos de ~13 V en ralentí y ~13.3 V a 2,000 rpm; nunca más de ~15 V. " +
        "Carros con 'carga inteligente' (por ejemplo varios Honda con detector de carga eléctrica ELD) bajan el voltaje a propósito con poco consumo: ahí 12.6–13.2 V sin carga puede ser normal. " + NOTA_V,
      interpretacion: "Si baja mucho con carga y no mejora al subir las RPM, el alternador no da la corriente (escobillas, diodos) o la faja patina. Si pasa de 15 V, el regulador está sobrecargando.",
      siguiente: { ok: "Nada que hacer.", regular: "Revisá tensión y estado de la faja y limpiá los cables de la batería; repetí.", mal: "Revisá la faja. Si está bien, hacé 'Caída de voltaje en cables' y llevá el alternador a probar." },
      requiere: (f) => (tiene(f, "voltaje") ? null : "Conectate al carro primero."),
      pasos: [
        { texto: "Motor encendido en ralentí y todo apagado (luces, aire, radio). Tocá Medir.", tipo: "datos", segundos: 10, clave: "sin_carga", condicion: (m) => (m.rpm || 0) > 500, objetivo: "Motor encendido" },
        { texto: "Encendé luces altas, aire acondicionado al máximo, ventilador al máximo y desempañador trasero. Esperá 5 segundos y tocá Medir.",
          tipo: "datos", segundos: 15, clave: "con_carga", evento: "cargas", condicion: (m) => (m.rpm || 0) > 500, objetivo: "Motor encendido" },
        { texto: "Con todo eso encendido y el carro estacionado, sostené unas 2,000 rpm. La medición empieza sola.", tipo: "datos", segundos: 10, clave: "carga_rpm",
          condicion: (m) => (m.rpm || 0) >= 1700 && (m.rpm || 0) <= 2800, objetivo: "RPM entre 1,700 y 2,800", eventoFinal: "cargas_off" },
      ],
      evaluar(d) {
        const v = (k) => prom((d[k] || []).map((m) => m.voltaje).filter((x) => x != null));
        const a = v("sin_carga"), b = v("con_carga"), c = v("carga_rpm");
        if (a == null || b == null) return { veredicto: "error", resumen: "No hubo datos de voltaje suficientes. Repetí la prueba." };
        const valores = [`Sin carga: ${r1(a, 2)} V`, `Con carga en ralentí: ${r1(b, 2)} V`, `Con carga a 2,000 rpm: ${r1(c, 2)} V`];
        if (Math.max(a, b, c || 0) > 15.0) return { veredicto: "mal", resumen: "El voltaje pasa de 15 V: el regulador del alternador está sobrecargando. Puede dañar la batería y la electrónica.", valores };
        const va = a >= 13.5 ? "ok" : a >= 12.6 ? "regular" : "mal";
        const vb = b >= 13.0 ? "ok" : b >= 12.6 ? "regular" : "mal";
        const vc = c == null ? "regular" : c >= 13.3 ? "ok" : c >= 12.8 ? "regular" : "mal";
        const ver = peor(va, vb, vc);
        return {
          veredicto: ver, valores,
          resumen: ver === "ok" ? "El alternador carga bien y aguanta con todo encendido." :
            vc === "mal" ? "El alternador no aguanta la carga ni subiendo las RPM: alternador débil o faja floja/patinando." :
            "El alternador carga, pero justo (o el carro tiene carga inteligente). Revisá la faja y los cables de la batería.",
          detalle: "Si tu carro tiene carga inteligente (ELD), un voltaje bajo SIN carga puede ser normal; lo importante es que suba cuando encendés todo.",
        };
      },
    },
    {
      id: "caida_voltaje", grupo: "taller", titulo: "Caída de voltaje en cables (multímetro)",
      descripcion: "Encuentra cables, bornes o tierras en mal estado que hacen perder fuerza al arranque y a la carga.",
      preparacion: "Batería cargada. Un ayudante para dar arranque. Multímetro en escala de voltios DC.",
      herramientas: "Multímetro y un ayudante",
      condiciones: "Midiendo MIENTRAS el ayudante da arranque (puntas del multímetro bien sujetas)",
      dificultad: "media", riesgo: "medio", donde: "ambos",
      advertencia: "Durante el arranque hay piezas que se mueven (faja, ventilador, poleas). Mantené manos, cables y ropa lejos. Si el motor de arranque o la tierra quedan en un lugar difícil o debajo del carro, pedile a un mecánico que haga esta medición.",
      referencia: "Regla común de taller durante el arranque: menos de ~0.5 V en el lado positivo (borne + al terminal grueso del motor de arranque) y menos de ~0.3 V en la tierra (borne − al bloque del motor). Más que eso indica resistencia de más.",
      interpretacion: "Una caída alta en el positivo apunta al cable o al borne positivo; en la tierra, al cable de tierra o su unión al chasis/motor. No es la batería ni el motor de arranque en sí.",
      siguiente: { ok: "Los cables están bien: si el arranque es débil, probá la batería con carga y el motor de arranque.", regular: "Limpiá y apretá las uniones; repetí.", mal: "Limpiá o cambiá el cable o la tierra con caída alta y repetí la prueba 'Arranque'." },
      requiere: () => null,
      pasos: [
        { texto: "Poné la punta roja del multímetro en el borne POSITIVO de la batería (el metal del poste, no la abrazadera) y la negra en el terminal grueso del motor de arranque. El ayudante da arranque 3 segundos. Anotá el voltaje.", tipo: "manual",
          campos: [{ clave: "positivo", etiqueta: "Caída lado positivo", unidad: "V", min: 0, max: 12 }] },
        { texto: "Punta negra en el borne NEGATIVO de la batería y punta roja en el bloque del motor (metal limpio). El ayudante da arranque 3 segundos. Anotá el voltaje.", tipo: "manual",
          campos: [{ clave: "tierra", etiqueta: "Caída lado tierra", unidad: "V", min: 0, max: 12 }] },
      ],
      evaluar(d) {
        const p = d.positivo, t = d.tierra;
        if (p == null || t == null) return { veredicto: "error", resumen: "Faltan valores." };
        const vp = p <= 0.5 ? "ok" : p <= 0.8 ? "regular" : "mal", vt = t <= 0.3 ? "ok" : t <= 0.5 ? "regular" : "mal";
        return { veredicto: peor(vp, vt), valores: [`Positivo: ${r1(p, 2)} V (bien ≤ 0.5)`, `Tierra: ${r1(t, 2)} V (bien ≤ 0.3)`],
          resumen: vp === "ok" && vt === "ok" ? "Los cables de batería y tierra están bien." : `Hay resistencia de más en ${[vp !== "ok" ? "el lado positivo" : null, vt !== "ok" ? "la tierra" : null].filter(Boolean).join(" y ")}.` };
      },
    },
    // ====================================================================== MOTOR
    {
      id: "mezcla", grupo: "motor", titulo: "Mezcla en ralentí y a 2,500 rpm",
      descripcion: "Compara la mezcla en ralentí contra 2,500 rpm (estacionado). El patrón orienta hacia fugas, falta de combustible o sensores.",
      preparacion: "Motor caliente (que la computadora esté en lazo cerrado), estacionado con freno de mano, aire acondicionado apagado.",
      herramientas: "Solo el escáner (para buscar fugas después: agua jabonosa o humo de incienso)",
      condiciones: "Motor caliente y en lazo cerrado en las dos mediciones; carro detenido",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Ajuste total (corto + largo) entre −10% y +10% en las dos condiciones. Cada fabricante tiene sus propios límites de código (a menudo cerca de ±20–25%).",
      interpretacion: "Pobre en ralentí y mejor a 2,500: en motores con MAF suele ser una entrada de aire; en motores con MAP, más bien fuga de escape o el sensor MAP. Pobre que empeora a 2,500: falta de combustible o MAF. Rica en todo: inyector, presión alta, purga EVAP o sensor de temperatura. El patrón no prueba la causa: la confirma la prueba física.",
      siguiente: { ok: "La mezcla está bien.", regular: "Vigilalo en la próxima revisión.", mal: "Seguí la prueba indicada en el resultado (buscar fugas, revisar el MAF/MAP o medir la presión de combustible)." },
      requiere: (f) => (tiene(f, "stft1") && tiene(f, "ltft1") ? null : "Tu carro no reporta los ajustes de combustible."),
      pasos: [
        { texto: "Motor caliente, carro detenido en ralentí, sin tocar el acelerador. La medición empieza sola.", tipo: "datos", segundos: 30, clave: "ralenti",
          condicion: (m) => (m.rpm || 0) > 500 && (m.rpm || 0) < 1200 && (m.velocidad || 0) < 3 && (m.temp_motor || 0) >= 70 && caliente(m), objetivo: "Ralentí con motor caliente en lazo cerrado" },
        { texto: "Estacionado, sostené unas 2,500 rpm firmes con el pie. La medición empieza sola.", tipo: "datos", segundos: 30, clave: "alto",
          condicion: (m) => (m.rpm || 0) >= 2100 && (m.rpm || 0) <= 2900 && (m.velocidad || 0) < 3 && caliente(m), objetivo: "RPM entre 2,100 y 2,900, estacionado, en lazo cerrado" },
      ],
      evaluar(d, ctx) {
        const a = prom((d.ralenti || []).map(trim).filter((x) => x != null)), b = prom((d.alto || []).map(trim).filter((x) => x != null));
        if (a == null || b == null) return { veredicto: "error", resumen: "No hubo datos suficientes en las condiciones pedidas. Repetí la prueba." };
        const map = ctx && ctx.medicion === "MAP";
        const vals = [`Ajuste total en ralentí: ${a >= 0 ? "+" : ""}${r1(a)}% (bien: entre −10 y +10)`, `Ajuste total a 2,500 rpm: ${b >= 0 ? "+" : ""}${r1(b)}%`, `Medición de aire del motor: ${ctx && ctx.medicion ? ctx.medicion : "desconocida"}`];
        if (a > 10 && b < a - 8) return { veredicto: "mal", valores: vals,
          resumen: map ? "Pobre en ralentí y mejor a más RPM. En un motor con MAP, revisá primero fugas de escape antes del sensor de oxígeno y la manguera/sensor MAP; después buscá entradas de aire." :
            "Pobre en ralentí y mejor a más RPM: patrón típico de una entrada de aire falsa. Buscá con agua jabonosa o humo: mangueras de vacío, válvula PCV, empaque del múltiple, booster de frenos. También revisá fugas de escape antes del sensor." };
        if (b > 10 && b > a + 5) return { veredicto: "mal", valores: vals, resumen: "Se empobrece cuando el motor pide más: falta de combustible (bomba, filtro, regulador, inyectores)" + (map ? "." : " o un MAF sucio. Limpiá el MAF primero; si no cambia, medí la presión de combustible.") };
        if (a > 10 && b > 10) return { veredicto: "mal", valores: vals, resumen: "Pobre en todo el rango: " + (map ? "presión de combustible baja, sensor MAP o fuga de escape antes del sensor." : "MAF sucio, presión de combustible baja o fuga de escape antes del sensor O2.") };
        if (a < -10 && b < -10) return { veredicto: "mal", valores: vals, resumen: "Rica en todo el rango: inyector goteando, presión de combustible alta, purga EVAP pegada o sensor de temperatura marcando frío." };
        if (Math.abs(a) > 7 || Math.abs(b) > 7) return { veredicto: "regular", valores: vals, resumen: "La mezcla está algo corrida pero dentro de lo aceptable. Vale la pena vigilarla." };
        return { veredicto: "ok", valores: vals, resumen: "La mezcla está bien en ralentí y a 2,500 rpm." };
      },
    },
    {
      id: "ralenti", grupo: "motor", titulo: "Ralentí (estabilidad y vacío)",
      descripcion: "Mide qué tan estable es el ralentí y, si el carro reporta el MAP, cuánto vacío tiene el motor.",
      preparacion: "Motor caliente, estacionado, aire acondicionado y luces apagados, sin tocar el volante (la dirección hidráulica carga el motor).",
      herramientas: "Solo el escáner (para confirmar el vacío: vacuómetro, en un taller)",
      condiciones: "Ralentí caliente, sin cargas, 60 segundos",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Típico: 650–900 rpm con variación menor a ±25 rpm. Vacío en ralentí (si hay MAP): MAP entre ~25% y ~45% de la presión ambiente (a nivel del mar ~101 kPa; en Tegucigalpa ~90 kPa). Revisá el ralentí exacto en el manual de tu carro.",
      interpretacion: "Ralentí que sube y baja: fallos de encendido, entrada de aire, válvula de ralentí o cuerpo de aceleración sucios. MAP alto (poco vacío) con ralentí alto o inestable: entrada de aire, EGR abierta o tiempo de encendido atrasado.",
      siguiente: { ok: "El ralentí está bien.", regular: "Limpiá el cuerpo de aceleración y repetí.", mal: "Hacé 'Fallos de encendido por cilindro' (si tu carro lo reporta) y buscá fugas de vacío." },
      requiere: (f) => (tiene(f, "rpm") ? null : "Conectate al carro primero."),
      pasos: [{ texto: "Motor caliente en ralentí, todo apagado y sin tocar nada. La medición empieza sola y dura 60 segundos.", tipo: "datos", segundos: 60, clave: "ralenti",
        condicion: (m) => (m.rpm || 0) > 400 && (m.rpm || 0) < 1400 && (m.velocidad || 0) < 3 && (m.temp_motor || 0) >= 70, objetivo: "Ralentí con motor caliente" }],
      evaluar(d, ctx) {
        const h = d.ralenti || [];
        const rpm = h.map((m) => m.rpm).filter((x) => x != null);
        if (rpm.length < 8) return { veredicto: "error", resumen: "Muy pocas lecturas. Repetí la prueba." };
        const p = prom(rpm), s = desv(rpm);
        const maps = h.map((m) => m.map).filter((x) => x != null);
        const baro = ctx && ctx.baro;
        const vals = [`RPM promedio: ${Math.round(p)}`, `Variación: ±${Math.round(s)} rpm (${rpm.length} lecturas)`];
        let vMap = "ok";
        if (maps.length) {
          const m = prom(maps);
          vals.push(`MAP promedio: ${Math.round(m)} kPa${baro ? ` (${Math.round((m / baro) * 100)}% de ${Math.round(baro)} kPa)` : ""}`);
          if (baro) vMap = m / baro > 0.52 ? "mal" : m / baro > 0.45 ? "regular" : "ok";
          else vMap = m > 50 ? "regular" : "ok";
        }
        const vS = s <= 25 ? "ok" : s <= 40 ? "regular" : "mal";
        const vR = p >= 600 && p <= 1000 ? "ok" : "regular";
        const ver = peor(vS, vR, vMap);
        return { veredicto: ver, valores: vals,
          resumen: ver === "ok" ? "El ralentí es estable" + (maps.length ? " y el vacío es normal." : ".") :
            [vS !== "ok" ? "el ralentí es inestable" : null, vR !== "ok" ? "las RPM están fuera de lo típico" : null, vMap !== "ok" ? "hay poco vacío (MAP alto)" : null].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase()) + ".",
          detalle: baro ? "" : "Sin la presión barométrica del carro, el vacío se juzga con un valor aproximado. La prueba 'Comparación de sensores' con el motor apagado da esa referencia." };
      },
    },
    {
      id: "misfire", grupo: "motor", titulo: "Fallos de encendido por cilindro",
      descripcion: "Lee los contadores internos de la computadora para ver si algún cilindro falla, aunque todavía no haya código.",
      preparacion: "Ideal después de usar el carro normalmente unos 15–20 minutos (la computadora cuenta los fallos mientras el motor trabaja). Leé con el carro estacionado.",
      herramientas: "Solo el escáner",
      condiciones: "Carro estacionado; los contadores son del último ciclo de manejo y del promedio de los últimos 10 ciclos (solo los carros CAN los reportan de forma estándar)",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Unos pocos fallos por cilindro pueden ser normales. Un cilindro con muchos más que los demás indica un problema en ese cilindro. Solo los carros CAN (la mayoría desde ~2008) reportan estos contadores de forma estándar.",
      interpretacion: "La computadora dice QUÉ cilindro falla, no QUÉ pieza: se separa intercambiando bujía y bobina (o cable de bujía si el motor tiene distribuidor) con otro cilindro.",
      siguiente: { ok: "Nada que hacer.", regular: "Repetí después de usar el carro más tiempo.", mal: "Intercambiá la pieza del cilindro afectado con otro cilindro y repetí para ver si el fallo se muda." },
      requiere: (f) => (f && f.leerPruebas06 ? null : "Conectate al carro primero."),
      pasos: [{ texto: "Con el carro estacionado, tocá Leer.", tipo: "modo06", clave: "m06", boton: "Leer" }],
      evaluar(d) {
        const p = d.m06;
        if (!p || !p.disponible) return { veredicto: "no_concluyente", resumen: (p && p.motivo) || "No se pudieron leer las pruebas internas." };
        const fallidas = (p.fallidas || []).filter((x) => !(x.mid >= 0xa1 && x.mid <= 0xad));
        const extra = fallidas.length ? ` Además hay ${fallidas.length} resultado(s) de monitoreo fuera de límite: miralos en 'Pruebas internas'.` : "";
        const cil = (p.misfire || []).map((c) => ({ n: c.cilindro, v: Math.max(c.actual || 0, c.promedio || 0) }));
        if (!cil.length) return { veredicto: "no_concluyente", resumen: (p.formato === "no_can" ? "En este protocolo (no CAN) la computadora no reporta contadores de fallos por cilindro de forma estándar. Usá los códigos P030x y la prueba 'Ralentí'." : "Tu carro no reporta fallos por cilindro.") + extra };
        const orden = [...cil].sort((a, b) => b.v - a.v), total = cil.reduce((a, c) => a + c.v, 0);
        const valores = [cil.map((c) => `Cil ${c.n}: ${c.v}`).join(" · ")];
        if (orden[0].v >= 5 && orden[0].v >= 2 * Math.max(1, orden[1] ? orden[1].v : 0))
          return { veredicto: "mal", valores, resumen: `El cilindro ${orden[0].n} está fallando (${orden[0].v} fallos). Intercambiá su bujía y bobina (o cable) con otro cilindro y repetí: si el fallo se muda, era esa pieza.` + extra };
        if (total >= 10) return { veredicto: "mal", valores, resumen: "Hay fallos repartidos en varios cilindros: suele ser algo común (mezcla, presión de combustible, bujías gastadas, EGR)." + extra };
        if (total > 0) return { veredicto: fallidas.length ? "regular" : "ok", valores, resumen: "Muy pocos fallos registrados: normal en muchos motores." + extra };
        return { veredicto: fallidas.length ? "regular" : "ok", valores, resumen: "Cero fallos de encendido en todos los cilindros." + extra };
      },
    },
    {
      id: "maf_map", grupo: "motor", titulo: "Sensor MAF contra MAP (sin manejar)",
      descripcion: "Calcula con el MAP, la temperatura y la cilindrada cuánto aire debería entrar y lo compara con lo que mide el MAF. Reemplaza la prueba vieja de acelerar a fondo en marcha.",
      preparacion: "Motor caliente, estacionado con freno de mano, aire acondicionado apagado. Revisá que la cilindrada del carro esté bien en Carros.",
      herramientas: "Solo el escáner",
      condiciones: "Carro detenido: ralentí y luego ~2,500 rpm sostenidas con el pie",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Cálculo orientativo de ScanIA (no es un valor de fábrica): en motores sin turbo suele dar entre ~60% y ~95% en estas condiciones. Muy por debajo de 55% en las dos mediciones sugiere un MAF que mide de menos. " +
        "Una prueba de rendimiento a plena carga (acelerando a fondo) solo la hace un profesional en un lugar adecuado, nunca con el teléfono en la mano.",
      interpretacion: "Si da bajo: MAF sucio o dañado, o una entrada de aire entre el MAF y la mariposa. Si da muy alto: cilindrada mal puesta o motor turbo.",
      siguiente: { ok: "El MAF mide coherente.", regular: "Limpiá el MAF con limpiador especial y revisá la manguera entre el MAF y la mariposa; repetí.", mal: "Limpiá el MAF y repetí. Si sigue bajo, revisá fugas después del MAF y, por último, cambiá el sensor." },
      requiere: (f, ctx) => {
        if (!(tiene(f, "maf") && tiene(f, "map") && tiene(f, "temp_admision"))) return "Esta prueba necesita que el carro reporte MAF, MAP y temperatura de admisión. Tu carro no los reporta todos (los motores con solo MAP, como muchos Honda viejos, no tienen MAF).";
        if (!(ctx && ctx.cilindrada)) return "Falta la cilindrada del motor (ej. 2.0). Agregala en Carros → tu carro.";
        return null;
      },
      pasos: [
        { texto: "Motor caliente en ralentí, estacionado. La medición empieza sola.", tipo: "datos", segundos: 20, clave: "ralenti",
          condicion: (m) => (m.rpm || 0) > 500 && (m.rpm || 0) < 1200 && (m.velocidad || 0) < 3 && (m.temp_motor || 0) >= 70, objetivo: "Ralentí con motor caliente" },
        { texto: "Estacionado, sostené unas 2,500 rpm. La medición empieza sola.", tipo: "datos", segundos: 20, clave: "alto",
          condicion: (m) => (m.rpm || 0) >= 2100 && (m.rpm || 0) <= 2900 && (m.velocidad || 0) < 3, objetivo: "RPM entre 2,100 y 2,900, estacionado" },
      ],
      evaluar(d, ctx) {
        const ve = (k) => prom((d[k] || []).map((m) => S.eficienciaVolumetrica(m, ctx.cilindrada)).filter((v) => v != null));
        const a = ve("ralenti"), b = ve("alto");
        if (a == null || b == null) return { veredicto: "error", resumen: "Faltan datos de MAF, MAP o temperatura en alguna de las mediciones. Repetí la prueba." };
        const vals = [`En ralentí: ${Math.round(a)}%`, `A 2,500 rpm: ${Math.round(b)}%`, `Cilindrada usada: ${ctx.cilindrada} L`];
        if (a > 110 && b > 110) return { veredicto: "regular", valores: vals, resumen: "Sale muy alto: el motor es turbo (normal) o la cilindrada configurada está mal." };
        if (a < 55 && b < 55) return { veredicto: "mal", valores: vals, resumen: "El MAF mide bastante menos aire del que debería entrar: MAF sucio/dañado o entrada de aire después del MAF." };
        if (a < 60 || b < 60) return { veredicto: "regular", valores: vals, resumen: "El MAF mide un poco bajo. Limpiarlo es barato y suele ayudar." };
        return { veredicto: "ok", valores: vals, resumen: "La lectura del MAF es coherente con el MAP y la cilindrada." };
      },
    },
    // ====================================================================== REFRIGERACIÓN
    {
      id: "calentamiento", grupo: "enfriamiento", titulo: "Termostato (calentamiento desde frío)",
      descripcion: "Con el motor FRÍO, sigue cómo sube la temperatura. Un termostato pegado abierto hace que se quede tibio.",
      preparacion: "El motor debe estar frío (apagado varias horas). Estacionado en un lugar ventilado (nunca en un garaje cerrado).",
      herramientas: "Solo el escáner",
      condiciones: "Ralentí desde frío, hasta 20 minutos, aire acondicionado apagado",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Los termostatos empiezan a abrir entre ~76 y ~92 °C según el motor. En ralentí, un motor sano llega a ese rango en unos 10–20 minutos según el clima. Lo que delata un termostato abierto es que la temperatura se queda plana muy por debajo de ese rango.",
      interpretacion: "Si sube hasta su temperatura normal, el termostato cierra bien. Si se estanca por debajo de ~75 °C por varios minutos, el termostato está abierto o lo quitaron. Si sigue subiendo lento, el resultado no alcanza: terminá de calentarlo manejando normalmente y mirá el dato.",
      siguiente: { ok: "El termostato funciona.", regular: "Repetí otro día con el motor bien frío.", mal: "Cambiá el termostato por uno de la temperatura correcta para tu motor (es barato) y repetí." },
      requiere: (f) => (tiene(f, "temp_motor") ? null : "Tu carro no reporta la temperatura del motor."),
      pasos: [{ texto: "Encendé el motor FRÍO y dejalo en ralentí. La prueba termina sola al llegar a 85 °C (máximo 20 minutos).", tipo: "datos", segundos: 1200, clave: "temp",
        terminarSi: (m) => (m.temp_motor || 0) >= 85, boton: "Empezar", evento: "frio" }],
      evaluar(d) {
        const h = (d.temp || []).filter((m) => m.temp_motor != null && S.valorPlausible("temp_motor", m.temp_motor));
        if (h.length < 5) return { veredicto: "error", resumen: "No hubo datos de temperatura válidos." };
        const t0 = h[0].temp_motor, tf = h[h.length - 1];
        if (t0 >= 70) return { veredicto: "no_concluyente", resumen: `El motor ya estaba caliente (${Math.round(t0)} °C). Repetí con el motor frío.` };
        const min = (tf.t - h[0].t) / 60;
        const llego = h.find((m) => m.temp_motor >= 80);
        const vals = [`Inicial: ${Math.round(t0)} °C`, llego ? `Llegó a 80 °C en ${r1((llego.t - h[0].t) / 60)} min` : `Después de ${r1(min)} min: ${Math.round(tf.temp_motor)} °C`];
        if (llego) return { veredicto: "ok", valores: vals, resumen: "El motor llegó a su temperatura de trabajo: el termostato cierra bien." };
        // ¿Meseta? Subió menos de 1.5 °C en los últimos 4 minutos
        const hace4 = h.filter((m) => m.t >= tf.t - 240);
        const subio = hace4.length > 3 ? tf.temp_motor - hace4[0].temp_motor : null;
        if (min >= 8 && subio != null && subio < 1.5 && tf.temp_motor < 75) return { veredicto: "mal", valores: [...vals, `En los últimos 4 minutos subió ${r1(subio)} °C`],
          resumen: `La temperatura se estancó en ${Math.round(tf.temp_motor)} °C: el termostato está abierto (o no tiene). El motor gasta más y se desgasta más.` };
        return { veredicto: "no_concluyente", valores: vals, resumen: "Todavía está subiendo, lento. En ralentí y con clima fresco puede ser normal: terminá de calentarlo manejando y mirá si llega a su temperatura." };
      },
    },
    {
      id: "refrigeracion", grupo: "enfriamiento", titulo: "Refrigeración (electroventilador)",
      descripcion: "Con el motor caliente en ralentí, mide a qué temperatura enciende el electroventilador y si la temperatura baja después.",
      preparacion: "Motor ya caliente. Estacionado, capó cerrado o con alguien que escuche el ventilador. Aire acondicionado APAGADO (con el aire encendido el ventilador trabaja siempre).",
      herramientas: "Solo el escáner y tus oídos",
      condiciones: "Ralentí caliente, sin aire acondicionado, hasta 15 minutos",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      advertencia: "No abras el tapón del radiador ni metás las manos cerca del ventilador: puede encender en cualquier momento aunque el motor esté apagado.",
      referencia: "Muchos carros encienden el ventilador entre ~95 y ~105 °C (depende del modelo; revisá el manual). Después de encender, la temperatura debería dejar de subir y bajar unos grados.",
      interpretacion: "Si la temperatura pasa de ~105 °C y el ventilador no enciende: fusible, relé, sensor/interruptor del ventilador o el motor del ventilador. Si enciende pero la temperatura sigue subiendo: radiador tapado, falta de refrigerante o bomba de agua.",
      siguiente: { ok: "El sistema de enfriamiento responde bien.", regular: "Revisá el nivel de refrigerante con el motor frío y que el radiador esté limpio por fuera.", mal: "Revisá fusible y relé del ventilador; si encienden, revisá el radiador y el nivel. Si se recalienta, apagá el motor." },
      requiere: (f) => (tiene(f, "temp_motor") ? null : "Tu carro no reporta la temperatura del motor."),
      pasos: [{ texto: "Motor caliente en ralentí. Tocá 'El ventilador encendió' cuando lo escuchés arrancar. La prueba termina 90 segundos después (o a los 15 minutos, o si pasa de 108 °C).", tipo: "marca", segundos: 900, clave: "vent",
        botonMarca: "El ventilador encendió", despuesDeMarca: 90, terminarSi: (m) => (m.temp_motor || 0) >= 108, boton: "Empezar" }],
      evaluar(d) {
        const h = (d.vent && d.vent.muestras || []).filter((m) => m.temp_motor != null && S.valorPlausible("temp_motor", m.temp_motor));
        const marca = d.vent && d.vent.marcas && d.vent.marcas[0];
        if (h.length < 5) return { veredicto: "error", resumen: "No hubo datos de temperatura válidos." };
        const max = Math.max(...h.map((m) => m.temp_motor));
        if (!marca) {
          if (max >= 105) return { veredicto: "mal", valores: [`Máxima: ${Math.round(max)} °C`], resumen: "La temperatura pasó de 105 °C y no marcaste que el ventilador encendiera: revisá fusible, relé y motor del ventilador. Apagá el motor si sigue subiendo." };
          return { veredicto: "no_concluyente", valores: [`Máxima: ${Math.round(max)} °C`], resumen: "El motor no llegó a la temperatura en que suele encender el ventilador. Repetí con el motor más caliente o con más tiempo." };
        }
        const enMarca = h.filter((m) => m.t <= marca).pop() || h[0];
        const despues = h.filter((m) => m.t >= marca + 60);
        const bajo = despues.length ? enMarca.temp_motor - Math.min(...despues.map((m) => m.temp_motor)) : null;
        const vals = [`Encendió a ${Math.round(enMarca.temp_motor)} °C`, `Máxima: ${Math.round(max)} °C`, bajo != null ? `Bajó ${r1(bajo)} °C después de encender` : "No hubo datos suficientes después de encender"];
        const vT = enMarca.temp_motor <= 105 ? "ok" : "regular";
        const vB = bajo == null ? "regular" : bajo >= 1 ? "ok" : max > enMarca.temp_motor + 3 ? "mal" : "regular";
        return { veredicto: peor(vT, vB), valores: vals,
          resumen: vB === "mal" ? "El ventilador enciende pero la temperatura sigue subiendo: radiador tapado, falta de refrigerante o bomba de agua." :
            peor(vT, vB) === "ok" ? "El ventilador enciende a tiempo y baja la temperatura." : "El ventilador enciende tarde o la temperatura casi no baja: revisá el radiador y el nivel de refrigerante." };
      },
    },
    // ====================================================================== SENSORES
    {
      id: "o2", grupo: "sensores", titulo: "Sensor de oxígeno (velocidad de cambio)",
      descripcion: "Cuenta qué tan rápido cambia el sensor de oxígeno de voltaje (antes del catalizador) a 2,500 rpm. Un sensor viejo se pone lento.",
      preparacion: "Motor bien caliente (manejado o 10 minutos en ralentí), estacionado con freno de mano.",
      herramientas: "Solo el escáner",
      condiciones: "Estacionado, ~2,500 rpm sostenidas, motor caliente en lazo cerrado. La app mide cuántas lecturas por segundo logra el adaptador.",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Sensor de voltaje (zirconio, 0–1 V) sano: cambia varias veces en 10 s (típicamente 8 o más a 2,500 rpm), de menos de 0.2 V a más de 0.7 V. Para contar bien los cambios hacen falta al menos 4 lecturas por segundo: con menos, el resultado NO es concluyente. Los sensores de banda ancha (A/F) no oscilan y no se prueban así.",
      interpretacion: "Pocos cambios con buen rango: sensor envejecido. Pegado abajo (pobre): fuga de escape antes del sensor, mezcla realmente pobre o sensor muerto. Pegado arriba: mezcla rica real o sensor contaminado.",
      siguiente: { ok: "El sensor está bien.", regular: "Repetí con el motor bien caliente y revisá fugas de escape antes del sensor.", mal: "Descartá fugas de escape y revisá el conector; si sigue igual, el sensor está para cambio." },
      requiere: (f) => {
        const s = (f && f.pidsDisponibles ? f.pidsDisponibles() : []).filter((k) => /^o2_b\ds1$/.test(k));
        if (s.length) return null;
        return tiene(f, "lambda_b1s1") ? "Tu carro usa un sensor de banda ancha (A/F): esta prueba es para sensores de voltaje. El análisis local lo juzga con la lectura λ." : "Tu carro no reporta el voltaje del sensor de oxígeno de antes del catalizador.";
      },
      pasos: [{ texto: "Motor caliente, estacionado: sostené unas 2,500 rpm firmes. La medición empieza sola cuando estés en el rango.",
        tipo: "pid", clave: "o2", pid: "o2_b1s1", pidSegun: (f) => ((f.pidsDisponibles() || []).filter((k) => /^o2_b\ds1$/.test(k))[0] || "o2_b1s1"), segundos: 10,
        condicion: (m) => (m.rpm || 0) >= 2100 && (m.rpm || 0) <= 2900 && (m.temp_motor || 0) >= 70, objetivo: "RPM entre 2,100 y 2,900 con motor caliente" }],
      evaluar(d) {
        const lect = (d.o2 || []).filter((x) => x.v != null);
        if (lect.length < 10) return { veredicto: "error", resumen: "Muy pocas lecturas. Repetí la prueba." };
        const vals = lect.map((x) => x.v);
        const seg = (lect[lect.length - 1].t - lect[0].t) || 10;
        const hz = (lect.length - 1) / seg;
        const cruces = S.crucesO2(vals), mn = Math.min(...vals), mx = Math.max(...vals);
        const por10 = Math.round((cruces * 10) / seg);
        const valores = [`Cambios en 10 s: ${por10}`, `Rango: ${r1(mn, 2)}–${r1(mx, 2)} V`, `Lecturas por segundo: ${r1(hz)} (${lect.length} en ${r1(seg)} s)`];
        const rangoMalo = mx < 0.6 || mn > 0.3;
        if (hz < 4) {
          // Con pocas lecturas por segundo NO se pueden contar los cambios: solo se juzga el rango.
          if (mx - mn < 0.3) return { veredicto: "mal", valores, resumen: "El sensor casi no se mueve (rango muy corto), aun con pocas lecturas: está pegado o muerto." };
          return { veredicto: "no_concluyente", valores, resumen: `El adaptador solo logró ${r1(hz)} lecturas por segundo: no alcanza para contar qué tan rápido cambia el sensor. ${rangoMalo ? "El rango es corto: vale la pena revisarlo." : "El rango de voltaje sí se ve normal."}`,
            detalle: "Para medir la velocidad del sensor hace falta un adaptador más rápido o un osciloscopio en el taller." };
        }
        let ver = por10 >= 8 ? "ok" : por10 >= 3 ? "regular" : "mal";
        if (rangoMalo) ver = peor(ver, "regular");
        const resumen = ver === "ok" ? "El sensor de oxígeno responde rápido y con buen rango." :
          por10 < 3 ? (mx < 0.45 ? "El sensor está pegado marcando pobre. Revisá fugas de escape antes del sensor, o el sensor está muerto." :
            mn > 0.45 ? "El sensor está pegado marcando rico. Puede ser mezcla rica real o sensor contaminado." : "El sensor casi no cambia: está muerto o muy lento.") :
          "El sensor responde lento o con poco rango: está envejeciendo.";
        return { veredicto: ver, resumen, valores };
      },
    },
    {
      id: "sensores", grupo: "sensores", titulo: "Comparación de sensores (motor frío, llave en ON)",
      descripcion: "Con el motor frío y apagado, varios sensores deben marcar casi lo mismo: temperatura del motor = temperatura del aire, y MAP = presión del ambiente.",
      preparacion: "El carro debe haber estado apagado al menos 6 horas (por ejemplo, a primera hora de la mañana). No lo encendás antes de la prueba.",
      herramientas: "Solo el escáner",
      condiciones: "Motor frío y apagado, llave en ON",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "Con el motor frío y en reposo: temperatura del motor y del aire de admisión a menos de ~5 °C entre sí (y cerca de la temperatura del ambiente); MAP igual a la presión barométrica ±~3–5 kPa (nivel del mar ~101 kPa; Tegucigalpa ~90 kPa).",
      interpretacion: "Si un sensor de temperatura marca muy distinto que el otro, ese sensor (o su cable) está descalibrado: la computadora calcula mal la mezcla (arranque difícil, consumo). Si el MAP no marca la presión del ambiente, el MAP está mal.",
      siguiente: { ok: "Los sensores coinciden.", regular: "Repetí otro día con el carro más tiempo apagado.", mal: "Revisá el conector y la resistencia del sensor que no coincide (tabla del manual)." },
      requiere: (f) => (tiene(f, "temp_motor") || tiene(f, "map") ? null : "Tu carro no reporta estos sensores."),
      pasos: [{ texto: "Motor FRÍO y apagado (más de 6 horas), llave en ON. Tocá Medir.", tipo: "datos", segundos: 6, clave: "koeo", boton: "Medir", evento: "apagar",
        condicion: (m) => (m.rpm || 0) < 50, objetivo: "Motor apagado y llave en ON" }],
      evaluar(d, ctx) {
        const h = d.koeo || [];
        const p = (k) => prom(h.map((m) => m[k]).filter((x) => x != null && S.valorPlausible(k, x)));
        const ect = p("temp_motor"), iat = p("temp_admision"), map = p("map"), baro = p("baro") ?? (ctx && ctx.baroPerfil), amb = p("temp_ambiente");
        if (ect == null && map == null) return { veredicto: "error", resumen: "No hubo datos válidos con el motor apagado." };
        if (ect != null && ect > 45) return { veredicto: "no_concluyente", resumen: `El motor todavía está tibio (${Math.round(ect)} °C). Repetí con el motor frío (6 horas apagado).` };
        const vals = [], ver = [];
        if (ect != null && iat != null) {
          const dif = Math.abs(ect - iat);
          vals.push(`Motor ${Math.round(ect)} °C · aire de admisión ${Math.round(iat)} °C (diferencia ${r1(dif)} °C)${amb != null ? ` · ambiente ${Math.round(amb)} °C` : ""}`);
          ver.push(dif <= 5 ? "ok" : dif <= 10 ? "regular" : "mal");
        }
        if (map != null) {
          if (baro != null) { const dif = Math.abs(map - baro); vals.push(`MAP ${Math.round(map)} kPa · barométrica ${Math.round(baro)} kPa (diferencia ${r1(dif)} kPa)`); ver.push(dif <= 5 ? "ok" : dif <= 8 ? "regular" : "mal"); }
          else { vals.push(`MAP ${Math.round(map)} kPa (sin barométrica del carro: compará con la de tu altura)`); ver.push(map >= 70 && map <= 105 ? "ok" : "mal"); }
        }
        const v = peor(...ver);
        return { veredicto: v, valores: vals, resumen: v === "ok" ? "Los sensores coinciden con el motor frío." : "Al menos un sensor no coincide con los demás: revisá el que marca distinto (conector, resistencia, manguera del MAP)." };
      },
    },
    {
      id: "acelerador", grupo: "sensores", titulo: "Sensor del acelerador (barrido)",
      descripcion: "Con el motor apagado, mide el sensor de posición del acelerador mientras pisás el pedal despacio. Un sensor gastado da saltos.",
      preparacion: "Motor APAGADO, llave en ON. Sentate en el asiento del conductor.",
      herramientas: "Solo el escáner",
      condiciones: "Motor apagado, llave en ON, pedal de libre a fondo en unos 5 segundos y de vuelta",
      dificultad: "fácil", riesgo: "bajo", donde: "casa",
      referencia: "El valor debe subir y bajar suave, sin saltos bruscos. El valor con el pedal suelto no es 0% en muchos carros (suele quedar entre ~8% y ~20%). Hacen falta al menos 4 lecturas por segundo para ver saltos.",
      interpretacion: "Un salto hacia abajo mientras el pedal baja (o un hueco) indica una pista gastada en el sensor: tirones o ralentí raro. Si nunca llega alto, revisá el cable o el pedal.",
      siguiente: { ok: "El sensor del acelerador está bien.", regular: "Repetí más despacio.", mal: "Revisá el conector; si sigue, el sensor (TPS o pedal) está gastado." },
      requiere: (f) => (tiene(f, "acelerador") ? null : "Tu carro no reporta la posición del acelerador."),
      pasos: [{ texto: "Motor apagado, llave en ON. Tocá Empezar y pisá el acelerador despacio hasta el fondo (unos 5 segundos) y soltalo despacio.", tipo: "pid", clave: "tps", pid: "acelerador", segundos: 12, boton: "Empezar" }],
      evaluar(d) {
        const l = (d.tps || []).filter((x) => x.v != null);
        if (l.length < 8) return { veredicto: "error", resumen: "Muy pocas lecturas. Repetí." };
        const v = l.map((x) => x.v), seg = (l[l.length - 1].t - l[0].t) || 12, hz = (l.length - 1) / seg;
        const mn = Math.min(...v), mx = Math.max(...v);
        let saltos = 0;
        for (let i = 2; i < v.length; i++) { const tend = v[i - 1] - v[i - 2], cambio = v[i] - v[i - 1]; if (tend > 2 && cambio < -10) saltos++; if (tend < -2 && cambio > 10) saltos++; }
        const vals = [`Mínimo ${r1(mn)}% · máximo ${r1(mx)}%`, `Saltos bruscos: ${saltos}`, `Lecturas por segundo: ${r1(hz)}`];
        if (mx - mn < 40) return { veredicto: "no_concluyente", valores: vals, resumen: "El valor casi no cambió: ¿pisaste el pedal hasta el fondo? Repetí." };
        if (hz < 4) return { veredicto: saltos ? "regular" : "no_concluyente", valores: vals, resumen: "El adaptador leyó pocas veces por segundo: no se pueden ver bien los saltos." };
        return saltos ? { veredicto: "mal", valores: vals, resumen: "El sensor da saltos bruscos: pista gastada o conector con falso contacto." } : { veredicto: "ok", valores: vals, resumen: "El sensor sube y baja suave en todo el recorrido." };
      },
    },
    // ====================================================================== CON HERRAMIENTAS / TALLER
    {
      id: "compresion", grupo: "taller", titulo: "Compresión (resultado del taller)",
      descripcion: "Si un mecánico midió la compresión, escribí los valores y ScanIA los interpreta.",
      preparacion: "Esta prueba requiere quitar las bujías, desactivar combustible y encendido y dar arranque: hacela con un mecánico.",
      herramientas: "Compresímetro (taller)",
      condiciones: "Motor caliente, todas las bujías quitadas, acelerador a fondo durante la medición, batería cargada",
      dificultad: "media", riesgo: "medio", donde: "mecánico",
      advertencia: "Quitar bujías y dar arranque con el motor abierto tiene riesgos (chispas, combustible, piezas en movimiento). La medición la hace un mecánico; aquí solo se interpretan los números.",
      referencia: "El valor mínimo depende del motor (está en el manual de servicio). Regla común de taller: la diferencia entre el cilindro más alto y el más bajo no debería pasar de ~10–15%.",
      interpretacion: "Un cilindro bajo explica fallos de encendido que no se arreglan con bujía, bobina ni inyector. Dos cilindros vecinos bajos pueden indicar el empaque de culata entre ellos. Una prueba de 'compresión húmeda' (con un poco de aceite) separa anillos de válvulas.",
      siguiente: { ok: "La compresión está pareja.", regular: "Pedile al mecánico la prueba húmeda o la de fuga de cilindros.", mal: "Prueba húmeda y de fuga de cilindros para saber si son anillos, válvulas o empaque." },
      requiere: () => null,
      pasos: [{ texto: "Escribí los valores que midió el mecánico (en psi o en kPa, todos en la misma unidad). Dejá vacíos los cilindros que tu motor no tiene. Si sabés el mínimo del manual, ponelo.", tipo: "manual",
        campos: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ clave: "c" + n, etiqueta: `Cilindro ${n}`, unidad: "", min: 0, max: 3000, opcional: n > 4 })).concat([{ clave: "minimo", etiqueta: "Mínimo del manual (opcional)", unidad: "", min: 0, max: 3000, opcional: true }]) }],
      evaluar(d) {
        const v = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => d["c" + n]).filter((x) => x != null && x > 0);
        if (v.length < 3) return { veredicto: "error", resumen: "Escribí al menos 3 cilindros." };
        const mx = Math.max(...v), mn = Math.min(...v), dif = ((mx - mn) / mx) * 100;
        const bajo = v.indexOf(mn) + 1;
        const vals = [`Valores: ${v.join(" · ")}`, `Diferencia entre el más alto y el más bajo: ${r1(dif)}%`];
        let ver = dif <= 10 ? "ok" : dif <= 15 ? "regular" : "mal";
        if (d.minimo && mn < d.minimo) { ver = "mal"; vals.push(`El cilindro ${bajo} está por debajo del mínimo del manual (${d.minimo})`); }
        return { veredicto: ver, valores: vals, resumen: ver === "ok" ? "La compresión está pareja." : `El cilindro ${bajo} está más bajo que los demás.` };
      },
    },
    {
      id: "presion_combustible", grupo: "taller", titulo: "Presión de combustible (resultado del taller)",
      descripcion: "Si un mecánico midió la presión con manómetro, escribí el valor y el que pide el manual.",
      preparacion: "El sistema de combustible está presurizado: abrirlo sin la herramienta y el procedimiento correcto es peligroso (incendio). Lo hace un mecánico.",
      herramientas: "Manómetro de combustible (taller)",
      condiciones: "Según el manual (normalmente llave en ON o motor en ralentí; en algunos carros con la manguera de vacío del regulador quitada)",
      dificultad: "media", riesgo: "alto", donde: "mecánico",
      advertencia: "No abrás el sistema de combustible vos mismo. Riesgo de incendio. La medición la hace un mecánico; aquí solo se compara con el valor del manual.",
      referencia: "No hay un valor universal: cada motor tiene su especificación en el manual (y cambia según si el regulador tiene manguera de vacío o si el sistema es sin retorno). ScanIA solo compara contra el valor que vos ingresés.",
      interpretacion: "Presión baja: bomba débil, filtro tapado o regulador. Presión alta: regulador o retorno tapado. Que la presión caiga rápido con el carro apagado apunta a un inyector goteando, el regulador o la válvula de retención de la bomba.",
      siguiente: { ok: "La presión está bien: la mezcla pobre/rica tiene otra causa.", regular: "Repetí la medición con el motor caliente y revisá el filtro.", mal: "Revisá filtro, regulador y bomba en ese orden (del más barato al más caro)." },
      requiere: () => null,
      pasos: [{ texto: "Escribí la presión medida y la del manual, en la misma unidad (psi o kPa).", tipo: "manual",
        campos: [{ clave: "medida", etiqueta: "Presión medida", unidad: "", min: 0, max: 2000 }, { clave: "espec", etiqueta: "Presión del manual", unidad: "", min: 0, max: 2000 }] }],
      evaluar(d) {
        if (d.medida == null) return { veredicto: "error", resumen: "Falta la presión medida." };
        if (!d.espec) return { veredicto: "no_concluyente", valores: [`Medida: ${d.medida}`], resumen: "Sin el valor del manual no se puede saber si está bien: cada motor es diferente." };
        const dif = ((d.medida - d.espec) / d.espec) * 100;
        const ver = Math.abs(dif) <= 10 ? "ok" : Math.abs(dif) <= 20 ? "regular" : "mal";
        return { veredicto: ver, valores: [`Medida: ${d.medida} · manual: ${d.espec} (${dif >= 0 ? "+" : ""}${r1(dif)}%)`],
          resumen: ver === "ok" ? "La presión está dentro de lo que pide el manual." : dif < 0 ? "La presión está baja." : "La presión está alta." };
      },
    },
  ];
})(typeof window !== "undefined" ? window : globalThis);
