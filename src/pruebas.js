/* ScanIA · pruebas guiadas: la app te dice qué hacer y mide sola */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});
  const prom = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  const mediana = (l) => { if (!l.length) return null; const o = [...l].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };
  const r1 = (v, d = 1) => (v == null ? "?" : Number(v).toFixed(d));
  const peor = (...v) => (v.includes("mal") ? "mal" : v.includes("regular") ? "regular" : "ok");
  const tiene = (f, clave) => f && f.pidsDisponibles && f.pidsDisponibles().includes(clave);
  const trim = (m) => (m.stft1 != null && m.ltft1 != null ? m.stft1 + m.ltft1 : null);

  /** Eficiencia volumétrica (%) de una muestra. disp = cilindrada en litros. */
  S.eficienciaVolumetrica = function (m, disp) {
    if (!m || !disp || !m.maf || !m.rpm || m.temp_admision == null) return null;
    const p = m.map && m.map >= 60 ? m.map : m.baro || 101.3;
    const densidad = (p * 1000) / (287.05 * (m.temp_admision + 273.15));   // g/L
    const teorico = disp * (m.rpm / 120) * densidad;                       // g/s (motor de 4 tiempos)
    return teorico > 0 ? (m.maf / teorico) * 100 : null;
  };

  /** Cuenta los cruces de 0.45 V de un sensor O2 de 4 cables. */
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

  S.PRUEBAS_GUIADAS = [
    {
      id: "bateria",
      herramientas: "Solo el escáner (opcional: multímetro)",
      condiciones: "Carro estacionado, motor apagado, llave en ON, consumidores apagados",
      dificultad: "fácil", riesgo: "bajo",
      referencia: "Reposo 12.4–12.7 V · al arrancar no menos de 10.0 V · encendido 13.5–14.7 V (medido en el conector OBD, puede leer 0.1–0.3 V menos que en la batería)",
      siguiente: {"ok": "Nada que hacer. Repetí la prueba cada 6 meses.", "regular": "Cargá la batería con cargador y repetí. Si sigue igual, hacé que prueben la batería con carga en un taller.", "mal": "Limpiá y apretá los bornes. Si sigue mal, probá la batería en un taller (prueba de carga) antes de comprar otra; si la batería está bien, revisar motor de arranque."},
      titulo: "Batería y arranque",
      descripcion: "Mide la batería en reposo y cuánto baja el voltaje al dar arranque. Descubre baterías débiles y terminales flojos antes de que te dejen botado.",
      requiere: (f) => (f && f.voltajeRapido ? null : "Conectate al carro primero."),
      pasos: [
        { texto: "Apagá el motor y dejá la llave en ON (tablero encendido, motor apagado). Esperá unos 10 segundos con todo apagado (luces, radio, aire).",
          tipo: "voltaje", segundos: 4, clave: "reposo", evento: "apagar", boton: "Medir" },
        { texto: "Tocá Empezar y en ese mismo momento dale arranque al carro. Dejalo encendido.",
          tipo: "voltaje", segundos: 9, clave: "arranque", evento: "arranque", boton: "Empezar" },
      ],
      evaluar(d) {
        const reposo = mediana(d.reposo || []);
        const arr = (d.arranque || []).filter((v) => v > 5);
        if (reposo == null || arr.length < 5) return { veredicto: "error", resumen: "No se pudo medir bien. Algunos adaptadores se reinician al dar arranque: repetí la prueba." };
        const minimo = Math.min(...arr);
        const final = prom(arr.slice(-4));
        if (minimo > reposo - 0.4) return { veredicto: "error", resumen: "No detecté el arranque (el voltaje no bajó). Repetí la prueba y dale arranque justo al tocar Empezar." };
        const vR = reposo >= 12.4 ? "ok" : reposo >= 12.2 ? "regular" : "mal";
        const vA = minimo >= 10.0 ? "ok" : minimo >= 9.6 ? "regular" : "mal";
        const vC = final >= 13.3 ? "ok" : "mal";
        const det = [];
        det.push(vR === "ok" ? "La batería en reposo está bien cargada." : vR === "regular" ? "La batería está a media carga: puede ser que el carro se use poco o que el alternador no la cargue bien." : "La batería está baja o vieja.");
        det.push(vA === "ok" ? "Al dar arranque el voltaje bajó dentro de lo normal." : vA === "regular" ? "Al dar arranque el voltaje bajó bastante: la batería está perdiendo fuerza." :
          "Al dar arranque el voltaje bajó demasiado: batería débil, terminales sulfatados/flojos o un motor de arranque que consume mucho.");
        det.push(vC === "ok" ? "Después de encender, el alternador está cargando." : "Después de encender el voltaje no subió a más de 13.3 V: revisá el alternador (hacé la prueba de alternador).");
        return {
          veredicto: peor(vR, vA, vC),
          resumen: det[0] + " " + det[1],
          detalle: det.join(" ") + " En clima caliente una batería dura normalmente de 2 a 4 años.",
          valores: [`Reposo: ${r1(reposo, 2)} V (bien ≥ 12.4)`, `Mínimo al arrancar: ${r1(minimo, 2)} V (bien ≥ 10.0)`, `Encendido: ${r1(final, 2)} V (bien ≥ 13.3)`],
        };
      },
    },
    {
      id: "alternador",
      herramientas: "Solo el escáner",
      condiciones: "Motor caliente, carro estacionado con freno de mano",
      dificultad: "fácil", riesgo: "bajo",
      referencia: "Sin carga 13.5–14.7 V · con todo encendido al menos 13.0 V en ralentí y 13.3 V a 2,000 rpm · nunca más de 15 V",
      siguiente: {"ok": "Nada que hacer.", "regular": "Revisá la tensión y el estado de la faja y limpiá los cables de batería; repetí la prueba.", "mal": "Revisá la faja; si está bien, llevá el alternador a probar (escobillas, regulador, diodos)."},
      titulo: "Alternador con carga",
      descripcion: "Revisa que el alternador aguante cuando todo está encendido (luces, aire, desempañador). Detecta alternadores cansados y fajas flojas.",
      requiere: (f) => (tiene(f, "voltaje") ? null : "Conectate al carro primero."),
      pasos: [
        { texto: "Con el motor encendido en ralentí y todo apagado (luces, aire, radio), tocá Medir.", tipo: "datos", segundos: 10, clave: "sin_carga",
          condicion: (m) => (m.rpm || 0) > 500, objetivo: "Motor encendido" },
        { texto: "Encendé luces altas, aire acondicionado al máximo, ventilador al máximo y desempañador trasero. Esperá 5 segundos y tocá Medir.",
          tipo: "datos", segundos: 15, clave: "con_carga", evento: "cargas", condicion: (m) => (m.rpm || 0) > 500, objetivo: "Motor encendido" },
        { texto: "Con todo eso encendido, subí a unas 2,000 rpm y mantenelas.", tipo: "datos", segundos: 10, clave: "carga_rpm",
          condicion: (m) => (m.rpm || 0) >= 1700 && (m.rpm || 0) <= 2800, objetivo: "RPM entre 1,700 y 2,800", eventoFinal: "cargas_off" },
      ],
      evaluar(d) {
        const v = (k) => prom((d[k] || []).map((m) => m.voltaje).filter((x) => x != null));
        const a = v("sin_carga"), b = v("con_carga"), c = v("carga_rpm");
        if (a == null || b == null) return { veredicto: "error", resumen: "No hubo datos de voltaje suficientes. Repetí la prueba." };
        if (Math.max(a, b, c || 0) > 15.0) return { veredicto: "mal", resumen: "El voltaje pasa de 15 V: el regulador del alternador está sobrecargando. Puede dañar la batería y la electrónica.",
          valores: [`Sin carga: ${r1(a, 2)} V`, `Con carga: ${r1(b, 2)} V`, `Con carga a 2,000 rpm: ${r1(c, 2)} V`] };
        const va = a >= 13.5 ? "ok" : a >= 13.2 ? "regular" : "mal";
        const vb = b >= 13.0 ? "ok" : b >= 12.6 ? "regular" : "mal";
        const vc = c == null ? "regular" : c >= 13.3 ? "ok" : "mal";
        const ver = peor(va, vb, vc);
        return {
          veredicto: ver,
          resumen: ver === "ok" ? "El alternador carga bien y aguanta con todo encendido." :
            vc === "mal" ? "El alternador no aguanta la carga ni subiendo las RPM: alternador débil (escobillas, diodos) o faja floja/patinando." :
            "El alternador carga, pero justo. Revisá la tensión de la faja y los cables de la batería.",
          detalle: "Algunos carros modernos bajan el voltaje a propósito para ahorrar combustible ('carga inteligente'); si el tuyo es así, un valor de 12.8–13.2 V sin carga puede ser normal.",
          valores: [`Sin carga: ${r1(a, 2)} V (bien ≥ 13.5)`, `Con carga en ralentí: ${r1(b, 2)} V (bien ≥ 13.0)`, `Con carga a 2,000 rpm: ${r1(c, 2)} V (bien ≥ 13.3)`],
        };
      },
    },
    {
      id: "o2",
      herramientas: "Solo el escáner",
      condiciones: "Motor caliente (más de 70 °C), carro estacionado en parqueo/neutro con freno de mano",
      dificultad: "fácil", riesgo: "bajo",
      referencia: "Sensor de 4 cables sano: 8 o más cambios en 10 s a 2,500 rpm, de menos de 0.2 V a más de 0.7 V",
      siguiente: {"ok": "El sensor está bien.", "regular": "Repetí con el motor bien caliente. Revisá fugas de escape antes del sensor.", "mal": "Descartá fugas de escape y revisá el conector; si sigue igual, el sensor está para cambio."},
      titulo: "Sensor de oxígeno",
      descripcion: "Cuenta qué tan rápido cambia el sensor de oxígeno de adelante a 2,500 rpm. Un sensor viejo se pone lento y hace gastar más gasolina.",
      requiere: (f) => tiene(f, "o2_b1s1") ? null : tiene(f, "lambda_b1s1")
        ? "Tu carro usa un sensor de banda ancha (A/F): esta prueba es para sensores de 4 cables. La IA analiza tu sensor con la curva λ."
        : "Tu carro no reporta el voltaje del sensor de oxígeno.",
      pasos: [
        { texto: "Con el motor caliente (más de 70 °C), subí a unas 2,500 rpm y mantenelas firmes. La medición empieza sola cuando estés en el rango.",
          tipo: "pid", clave: "o2", pid: "o2_b1s1", segundos: 10, condicion: (m) => (m.rpm || 0) >= 2100 && (m.rpm || 0) <= 2900 && (m.temp_motor || 0) >= 70,
          objetivo: "RPM entre 2,100 y 2,900 con motor caliente" },
      ],
      evaluar(d) {
        const vals = (d.o2 || []).map((x) => x.v).filter((v) => v != null);
        if (vals.length < 15) return { veredicto: "error", resumen: "Muy pocas lecturas. Repetí la prueba." };
        const cruces = S.crucesO2(vals), mn = Math.min(...vals), mx = Math.max(...vals);
        const seg = ((d.o2[d.o2.length - 1].t - d.o2[0].t) || 10);
        const por10 = Math.round((cruces * 10) / seg);
        let ver = por10 >= 8 ? "ok" : por10 >= 3 ? "regular" : "mal";
        if (mx < 0.6 || mn > 0.3) ver = peor(ver, "regular");
        const resumen = ver === "ok" ? "El sensor de oxígeno responde rápido y con buen rango." :
          por10 < 3 ? (mx < 0.45 ? "El sensor está pegado marcando pobre (casi no cambia). Revisá fugas de escape antes del sensor, o el sensor está muerto." :
            mn > 0.45 ? "El sensor está pegado marcando rico. Puede ser mezcla rica real o sensor contaminado." : "El sensor casi no cambia: está muerto o muy lento.") :
          "El sensor responde lento o con poco rango: está envejeciendo.";
        return { veredicto: ver, resumen, valores: [`Cambios en 10 s: ${por10} (bien ≥ 8)`, `Rango: ${r1(mn, 2)}–${r1(mx, 2)} V (bien: menos de 0.2 a más de 0.7)`, `Lecturas: ${vals.length}`] };
      },
    },
    {
      id: "mezcla",
      herramientas: "Solo el escáner (para buscar la fuga: agua jabonosa o humo de incienso)",
      condiciones: "Motor caliente, carro estacionado con freno de mano",
      dificultad: "fácil", riesgo: "bajo",
      referencia: "Ajuste total (corto + largo) entre −10% y +10% en ralentí y a 2,500 rpm",
      siguiente: {"ok": "La mezcla está bien.", "regular": "Vigilalo en la próxima revisión.", "mal": "Seguí la prueba recomendada en el hallazgo (fuga de vacío, presión de combustible o MAF)."},
      titulo: "Fuga de vacío / mezcla",
      descripcion: "Compara la mezcla en ralentí contra 2,500 rpm. Si mejora al acelerar es una fuga de vacío; si empeora, falta de combustible.",
      requiere: (f) => (tiene(f, "stft1") && tiene(f, "ltft1") ? null : "Tu carro no reporta los ajustes de combustible."),
      pasos: [
        { texto: "Motor caliente, carro detenido en ralentí, sin tocar el acelerador.", tipo: "datos", segundos: 30, clave: "ralenti",
          condicion: (m) => (m.rpm || 0) > 500 && (m.rpm || 0) < 1200 && (m.velocidad || 0) < 3 && (m.temp_motor || 0) >= 70, objetivo: "Ralentí con motor caliente" },
        { texto: "Ahora subí a unas 2,500 rpm y mantenelas firmes.", tipo: "datos", segundos: 30, clave: "alto",
          condicion: (m) => (m.rpm || 0) >= 2100 && (m.rpm || 0) <= 2900, objetivo: "RPM entre 2,100 y 2,900" },
      ],
      evaluar(d) {
        const a = prom((d.ralenti || []).map(trim).filter((x) => x != null)), b = prom((d.alto || []).map(trim).filter((x) => x != null));
        if (a == null || b == null) return { veredicto: "error", resumen: "No hubo datos suficientes. Repetí la prueba." };
        const vals = [`Ajuste total en ralentí: ${a >= 0 ? "+" : ""}${r1(a)}% (bien: entre −10 y +10)`, `Ajuste total a 2,500 rpm: ${b >= 0 ? "+" : ""}${r1(b)}%`];
        if (a > 10 && b < a - 8) return { veredicto: "mal", resumen: "Fuga de vacío: la mezcla es pobre en ralentí y mejora al acelerar. Buscá mangueras rajadas, la válvula PCV, el empaque del múltiple o el booster de frenos.", valores: vals };
        if (b > 10 && b > a + 5) return { veredicto: "mal", resumen: "Falta combustible cuando el motor pide más: bomba débil, filtro tapado, regulador o inyectores sucios. También un MAF sucio.", valores: vals };
        if (a > 10 && b > 10) return { veredicto: "mal", resumen: "Mezcla pobre en todo el rango: MAF sucio, presión de combustible baja o fuga de escape antes del sensor O2.", valores: vals };
        if (a < -10 && b < -10) return { veredicto: "mal", resumen: "Mezcla rica: inyector goteando, presión de combustible alta, purga EVAP pegada o sensor de temperatura marcando frío.", valores: vals };
        if (Math.abs(a) > 7 || Math.abs(b) > 7) return { veredicto: "regular", resumen: "La mezcla está algo corrida pero dentro de lo aceptable. Vale la pena vigilarla.", valores: vals };
        return { veredicto: "ok", resumen: "La mezcla está bien en ralentí y a 2,500 rpm: no hay señales de fuga de vacío ni de falta de combustible.", valores: vals };
      },
    },
    {
      id: "eficiencia",
      herramientas: "Solo el escáner + otra persona que maneje",
      condiciones: "Motor caliente, lugar cerrado al tráfico o pista; quien maneja NO toca el teléfono",
      dificultad: "media", riesgo: "alto",
      referencia: "Motor sin turbo: 75–95% con el acelerador a fondo",
      siguiente: {"ok": "El motor respira bien.", "regular": "Cambiá o revisá el filtro de aire y limpiá el MAF; repetí.", "mal": "Limpiá el MAF y revisá el filtro de aire; si sigue bajo, un mecánico debe revisar restricción del escape (catalizador tapado) y la distribución."},
      advertencia: "Prueba de RIESGO ALTO: requiere acelerar a fondo en marcha. Hacela solo con un mecánico o en un lugar cerrado al tráfico, con otra persona manejando. Quien maneja nunca toca el teléfono: la medición empieza sola. Si no tenés esas condiciones, NO la hagás.",
      titulo: "Respiración del motor (eficiencia volumétrica)",
      descripcion: "Con el acelerador a fondo calcula cuánto aire 'respira' el motor. Si es bajo: MAF sucio, filtro de aire tapado o catalizador/escape tapado.",
      requiere: (f, ctx) => {
        if (!(tiene(f, "maf") && tiene(f, "rpm") && tiene(f, "temp_admision"))) return "Tu carro no tiene sensor MAF (o no lo reporta): esta prueba no aplica.";
        if (!(ctx && ctx.cilindrada)) return "Falta la cilindrada del motor (ej. 1.8). Agregala en Carros → tu carro.";
        return null;
      },
      pasos: [
        { texto: "SOLO con otra persona manejando y en un lugar seguro y sin tráfico: en 2da o 3ra marcha, pisá el acelerador a fondo desde unas 2,000 hasta 5,000 rpm. La medición empieza sola.",
          tipo: "datos", segundos: 12, clave: "fondo", evento: "a_fondo", condicion: (m) => ((m.acelerador || 0) >= 70 || (m.carga || 0) >= 85) && (m.rpm || 0) >= 2500,
          objetivo: "Acelerador a fondo y más de 2,500 rpm", espera: 120 },
      ],
      evaluar(d, ctx) {
        const ve = (d.fondo || []).map((m) => S.eficienciaVolumetrica(m, ctx.cilindrada)).filter((v) => v != null).sort((a, b) => a - b);
        if (ve.length < 3) return { veredicto: "error", resumen: "Muy pocas lecturas a fondo. Repetí la prueba sosteniendo el acelerador a fondo más tiempo." };
        const v = ve[Math.floor(ve.length * 0.9)] ?? ve[ve.length - 1];
        const vals = [`Eficiencia máxima: ${Math.round(v)}% (normal en motor sin turbo: 75–95%)`, `Cilindrada usada: ${ctx.cilindrada} L`];
        if (v > 110) return { veredicto: "regular", resumen: "La eficiencia sale muy alta: o el motor es turbo/supercargado (normal) o la cilindrada configurada está mal.", valores: vals };
        if (v >= 75) return { veredicto: "ok", resumen: "El motor respira bien: el MAF mide bien y no hay restricción en la admisión ni en el escape.", valores: vals };
        if (v >= 65) return { veredicto: "regular", resumen: "El motor respira un poco menos de lo normal. Revisá el filtro de aire y limpiá el sensor MAF (con limpiador especial para MAF).", valores: vals };
        return { veredicto: "mal", resumen: "El motor respira poco: MAF sucio o dañado, filtro de aire tapado, catalizador/escape tapado o problema de distribución.", valores: vals };
      },
    },
    {
      id: "misfire",
      herramientas: "Solo el escáner",
      condiciones: "Ideal después de manejar 10–20 minutos",
      dificultad: "fácil", riesgo: "bajo",
      referencia: "0 a 4 fallos por cilindro es normal; un cilindro con muchos más que los demás indica un problema en ese cilindro",
      siguiente: {"ok": "Nada que hacer.", "regular": "Repetí después de manejar más.", "mal": "Intercambiá la bobina del cilindro afectado con otro y repetí la prueba para ver si el fallo se muda."},
      titulo: "Fallos de encendido por cilindro",
      descripcion: "Lee los contadores internos de la computadora para ver si algún cilindro está fallando, aunque todavía no haya código.",
      requiere: (f) => (f && f.leerPruebas06 ? null : "Conectate al carro primero."),
      pasos: [
        { texto: "Lo ideal es manejar el carro unos minutos antes, porque la computadora cuenta los fallos mientras el motor trabaja. Tocá Leer.", tipo: "modo06", clave: "m06", boton: "Leer" },
      ],
      evaluar(d) {
        const p = d.m06;
        if (!p || !p.disponible) return { veredicto: "error", resumen: (p && p.motivo) || "No se pudieron leer las pruebas internas." };
        const cil = (p.misfire || []).map((c) => ({ n: c.cilindro, v: Math.max(c.actual || 0, c.promedio || 0) }));
        const fallidas = (p.fallidas || []).filter((x) => !(x.mid >= 0xa1 && x.mid <= 0xad));
        const extra = fallidas.length ? ` Además hay ${fallidas.length} prueba(s) interna(s) fallida(s): mirá la lista de pruebas internas.` : "";
        if (!cil.length) return { veredicto: fallidas.length ? "regular" : "ok", resumen: "Tu carro no reporta fallos por cilindro." + extra };
        const orden = [...cil].sort((a, b) => b.v - a.v), total = cil.reduce((a, c) => a + c.v, 0);
        const valores = [cil.map((c) => `Cil ${c.n}: ${c.v}`).join(" · ")];
        if (orden[0].v >= 5 && orden[0].v >= 2 * Math.max(1, orden[1] ? orden[1].v : 0))
          return { veredicto: "mal", resumen: `El cilindro ${orden[0].n} está fallando (${orden[0].v} fallos). Revisá su bujía, bobina e inyector. Truco: cambiá su bobina con la de otro cilindro y volvé a hacer esta prueba.` + extra, valores };
        if (total >= 10) return { veredicto: "mal", resumen: "Hay fallos repartidos en varios cilindros: suele ser fuga de vacío, presión de combustible, bujías gastadas o EGR." + extra, valores };
        if (total > 0) return { veredicto: fallidas.length ? "regular" : "ok", resumen: "Muy pocos fallos registrados: normal en muchos motores." + extra, valores };
        return { veredicto: fallidas.length ? "regular" : "ok", resumen: "Cero fallos de encendido en todos los cilindros." + extra, valores };
      },
    },
    {
      id: "calentamiento",
      herramientas: "Solo el escáner",
      condiciones: "Motor FRÍO (encendido hace menos de 2 minutos), carro estacionado",
      dificultad: "fácil", riesgo: "bajo",
      referencia: "En ralentí, de frío a 85 °C en menos de 12 minutos (en clima caliente)",
      siguiente: {"ok": "El termostato funciona.", "regular": "Repetí en otro día; si se repite, revisar el termostato.", "mal": "Cambiar el termostato (es barato) usando el de la temperatura correcta para tu motor."},
      titulo: "Termostato (calentamiento)",
      descripcion: "Con el motor FRÍO, mide cuánto tarda en llegar a temperatura normal. Si tarda demasiado, el termostato está pegado abierto.",
      requiere: (f) => (tiene(f, "temp_motor") ? null : "Tu carro no reporta la temperatura del motor."),
      pasos: [
        { texto: "Solo con el motor FRÍO (encendido hace menos de 2 minutos, o recién encendido). Dejalo en ralentí; la prueba termina sola al llegar a 85 °C (máximo 15 minutos).",
          tipo: "datos", segundos: 900, clave: "temp", terminarSi: (m) => (m.temp_motor || 0) >= 85, boton: "Empezar" },
      ],
      evaluar(d) {
        const h = (d.temp || []).filter((m) => m.temp_motor != null);
        if (h.length < 5) return { veredicto: "error", resumen: "No hubo datos de temperatura." };
        const t0 = h[0].temp_motor;
        if (t0 >= 75) return { veredicto: "error", resumen: `El motor ya estaba caliente (${Math.round(t0)} °C). Repetí la prueba con el motor frío.` };
        const llego = h.find((m) => m.temp_motor >= 85);
        const min = ((llego || h[h.length - 1]).t - h[0].t) / 60;
        const vals = [`Temperatura inicial: ${Math.round(t0)} °C`, llego ? `Llegó a 85 °C en ${r1(min)} min` : `Después de ${r1(min)} min llegó a ${Math.round(h[h.length - 1].temp_motor)} °C`];
        if (llego && min <= 12) return { veredicto: "ok", resumen: "El motor calienta normal: el termostato funciona.", valores: vals };
        if (llego) return { veredicto: "regular", resumen: "El motor tarda en calentar. Si hace mucho frío o estaba en ralentí puede ser normal; si no, el termostato puede estar abriendo antes de tiempo.", valores: vals };
        if (min >= 14) return { veredicto: "mal", resumen: "El motor no llegó a temperatura normal en 15 minutos: termostato pegado abierto (o lo quitaron). Gasta más gasolina y se desgasta más.", valores: vals };
        return { veredicto: "error", resumen: "La prueba se cortó antes de tiempo.", valores: vals };
      },
    },
  ];
})(typeof window !== "undefined" ? window : globalThis);
