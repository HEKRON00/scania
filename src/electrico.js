/* ScanIA · diagnóstico eléctrico y electrónico
 *
 * Separa siempre tres cosas:
 *   - lo que se ve por OBD (computadora del motor),
 *   - lo que se mide con instrumentos (multímetro, amperímetro, probador),
 *   - lo que se ve con inspección física (fusibles, conectores, cables).
 * No inventa amperajes, resistencias ni voltajes de referencia: si no hay documentación, lo dice.
 * Nunca recomienda un fusible de más amperaje ni medir resistencia con el circuito energizado.
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});
  const SIN_REF = () => S.SIN_REFERENCIA || "Valor de referencia no disponible: requiere documentación técnica";
  const PEND = () => S.PENDIENTE_FUSIBLE || "Configuración del fusible pendiente de verificación";
  const norm = (t) => String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const r2 = (v) => (v == null || isNaN(v) ? "?" : Math.round(v * 100) / 100);

  // ================================================================== seguridad
  S.SEGURIDAD_ELECTRICA = [
    "Nunca midas resistencia ni continuidad con el circuito energizado: sacá el fusible o desconectá el conector primero (la lectura no sirve y podés dañar el multímetro).",
    "Nunca pongas un fusible de más amperaje que el original, ni lo puentees con alambre o papel aluminio: el fusible protege el cable y uno más grande puede causar un incendio.",
    "Bolsas de aire (SRS, conectores amarillos) y pretensores: no midas nada en esos circuitos. Requieren el procedimiento del fabricante y personal capacitado; pueden dispararse.",
    "El cable de alta tensión de la bobina y el distribuidor tiene miles de voltios: no lo toques con el motor encendido.",
    "Carros híbridos o eléctricos (cables naranja): no se tocan. Solo personal capacitado.",
    "Si desconectás la batería: primero el negativo; al reconectar, el negativo de último. Se pueden borrar memorias (código del radio, ralentí aprendido): anotá el código del radio antes.",
    "Con el motor encendido hay piezas que giran (faja, ventilador): manos, ropa y cables lejos.",
  ];

  // ================================================================== qué se puede revisar y cómo
  const O = "obd", I = "instrumento", F = "fisico";
  S.SISTEMAS_ELECTRICOS = [
    { id: "caja_interior", nombre: "Caja de fusibles interior", [O]: "No. El OBD no ve fusibles.", [I]: "Probador o multímetro: voltaje en los puntos de prueba con llave en ON, o continuidad con el fusible fuera.", [F]: "Ver cada fusible, la etiqueta de la tapa, sulfato o plástico derretido." },
    { id: "caja_motor", nombre: "Caja del compartimiento del motor", [O]: "No.", [I]: "Igual que la interior. Los grandes se revisan por su ventanita o con multímetro.", [F]: "Ver fusibles y relés, humedad, sulfato, tornillos flojos." },
    { id: "principales", nombre: "Fusibles principales", [O]: "Indirecto: si la computadora no responde o el voltaje cae, puede ser uno principal.", [I]: "Voltaje a ambos lados con llave en ON.", [F]: "Ventanita del fusible; tornillos de sujeción." },
    { id: "reles", nombre: "Relés", [O]: "Indirecto: un código de circuito o un sistema que no responde.", [I]: "Resistencia de la bobina (con especificación) o voltaje en el zócalo.", [F]: "Intercambiar con uno idéntico (mismo número de parte) y ver si cambia." },
    { id: "alternador", nombre: "Alternador", [O]: "Voltaje con el motor encendido (PID 42 o el adaptador). Orientativo.", [I]: "Multímetro en los bornes a ralentí y ~2000 rpm con cargas; probador de alternador en taller.", [F]: "Faja, conector, cable grueso." },
    { id: "bateria", nombre: "Batería", [O]: "Voltaje con motor apagado (orientativo).", [I]: "Multímetro en reposo; probador de carga o de conductancia.", [F]: "Bornes sulfatados o flojos, caja hinchada, fecha." },
    { id: "arranque", nombre: "Sistema de arranque", [O]: "Caída de voltaje al dar arranque (si el adaptador lee rápido) y RPM de arranque.", [I]: "Caída de voltaje en positivo y tierra durante el arranque.", [F]: "Cables, terminal del motor de arranque, ruido (clic)." },
    { id: "carga", nombre: "Sistema de carga", [O]: "Voltaje con el motor encendido y con cargas.", [I]: "Caída de voltaje en el cable de salida del alternador y su tierra.", [F]: "Faja y conexiones." },
    { id: "tierras", nombre: "Tierras y conexiones", [O]: "Indirecto: varios sensores raros a la vez o voltaje inestable.", [I]: "Caída de voltaje con el circuito funcionando.", [F]: "Puntos de tierra flojos, oxidados o pintados." },
    { id: "cableado", nombre: "Cableado", [O]: "Indirecto: códigos de circuito abierto/bajo/alto.", [I]: "Continuidad y corto a tierra con el circuito desconectado.", [F]: "Roces, cables quebrados, reparaciones viejas, roedores." },
    { id: "sensores", nombre: "Sensores", [O]: "Sí: lectura en vivo y códigos de circuito.", [I]: "Alimentación, tierra, señal y resistencia (con especificación).", [F]: "Conector y cables." },
    { id: "actuadores", nombre: "Actuadores (inyectores, bobina, solenoides, motores)", [O]: "Códigos de circuito. ScanIA no activa actuadores.", [I]: "Resistencia (con especificación) y alimentación.", [F]: "Conectores, ruido de funcionamiento." },
    { id: "resistencias", nombre: "Resistencias (de sensores, de soplador, calentadores)", [O]: "Códigos de calentador o de circuito.", [I]: "Resistencia con el circuito desconectado, comparada con el manual.", [F]: "Quemaduras, conectores." },
    { id: "alimentacion", nombre: "Circuitos de alimentación", [O]: "Indirecto.", [I]: "Voltaje con el circuito activo.", [F]: "Fusibles y relés." },
    { id: "senal", nombre: "Circuitos de señal", [O]: "Sí, si el sensor tiene PID: la lectura en vivo es la señal ya interpretada.", [I]: "Voltaje de señal (con especificación).", [F]: "Conector." },
    { id: "comunicacion", nombre: "Circuitos de comunicación (OBD, entre módulos)", [O]: "Si la computadora del motor responde. ScanIA no habla con ABS, SRS ni carrocería.", [I]: "Voltaje en el conector OBD (pin 16 batería, pines 4/5 tierra según el estándar).", [F]: "Conector OBD, pines doblados." },
    { id: "modulos", nombre: "Computadora y módulos electrónicos", [O]: "La del motor sí (códigos P0600…, comunicación). Las demás, no.", [I]: "Alimentación y tierras de la computadora según el diagrama.", [F]: "Humedad, conectores." },
  ];

  // ================================================================== fusibles
  S.ESTADOS_FUSIBLE = {
    correcto: { nombre: "Correcto", color: "verde" },
    pendiente: { nombre: "Pendiente de inspección", color: "gris" },
    quemado: { nombre: "Defectuoso confirmado", color: "rojo" },
    quemado_probable: { nombre: "Posiblemente quemado (sin confirmar)", color: "naranja" },
    ausente: { nombre: "Falta el fusible", color: "rojo" },
    amperaje: { nombre: "Posible amperaje incorrecto", color: "ambar" },
    tipo: { nombre: "Tipo de fusible distinto", color: "ambar" },
    contacto: { nombre: "Posible falso contacto", color: "ambar" },
    desconocida: { nombre: "Posición desconocida / pendiente de verificación", color: "azul" },
    libre: { nombre: "Posición sin uso", color: "tenue" },
  };
  const METODO_FISICO = ["continuidad", "voltaje", "probador"];
  S.METODOS_INSPECCION = { visual: "Vista a ojo", continuidad: "Multímetro (continuidad, fusible fuera)", voltaje: "Voltaje en ambos lados (llave en ON)", probador: "Lámpara de prueba", foto_ia: "Foto revisada por la IA" };

  /**
   * Evalúa un fusible: documentación (doc, puede ser null) + lo que se observó (insp).
   * insp: { estado: "bien"|"quemado"|"ausente"|"no_se", metodo, amperaje_obs, tipo_obs, veces_quemado, confirmado_tapa, falso_contacto, notas }
   */
  S.evaluarFusible = function (doc, insp) {
    insp = insp || {};
    const v = doc ? (insp.confirmado_tapa ? "dueno" : doc.verificacion || "desconocido") : "desconocido";
    const confiable = v === "dueno" || v === "oem";
    const usable = confiable || v === "secundaria_coincidente";
    const mensajes = [], acciones = [];
    let estado = doc ? "pendiente" : "desconocida";
    const amp = doc && doc.amperaje;
    const nombre = doc ? doc.nombre : "este circuito";
    if (!doc) mensajes.push(PEND() + ": no hay documentación de esta posición para tu carro.");
    const metodoFisico = METODO_FISICO.includes(insp.metodo);

    if (doc && doc.libre) {
      if (insp.estado === "bien" || insp.estado === "quemado") {
        estado = "desconocida";
        mensajes.push("Hay un fusible en una posición documentada como 'no usada'. Puede ser otra variante o equipamiento, o un fusible fuera de lugar. Comparalo con la etiqueta de la tapa.");
      } else estado = "libre";
    } else if (insp.estado === "ausente") {
      estado = doc ? "ausente" : "desconocida";
      mensajes.push(`Falta el fusible de ${nombre}: ese circuito queda sin alimentación.`);
      if (amp) acciones.push(usable ? `Poné uno de ${amp} A (el documentado${confiable ? "" : "; confirmalo antes con la etiqueta de la tapa"}).` : `Confirmá en la etiqueta de la tapa qué amperaje va (las fuentes dicen ${amp} A, pero no está verificado).`);
      acciones.push("Averiguá por qué lo sacaron: a veces lo quitan porque se quemaba.");
    } else if (insp.estado === "quemado") {
      estado = metodoFisico ? "quemado" : "quemado_probable";
      mensajes.push(metodoFisico ? `El fusible de ${nombre} está abierto (comprobado con ${S.METODOS_INSPECCION[insp.metodo].toLowerCase()}).`
        : `El fusible de ${nombre} parece quemado (${S.METODOS_INSPECCION[insp.metodo] || "sin método"}). Confirmalo con multímetro o probador antes de concluir.`);
      acciones.push(amp ? `Reemplazalo por uno del MISMO amperaje (${amp} A${usable ? "" : ", confirmado con la tapa"}). Nunca uno más grande.` : "Reemplazalo por uno del mismo amperaje que dice la etiqueta de la tapa. Nunca uno más grande.");
      acciones.push("Un fusible se quema por algo: si el nuevo se vuelve a quemar, hay un corto o un consumo excesivo en ese circuito.");
    } else if (insp.estado === "bien") {
      estado = doc ? "correcto" : "desconocida";
      if (!doc) mensajes.push("El fusible en sí está bien, pero no se sabe si es el que corresponde a esa posición.");
      if (!metodoFisico) mensajes.push("Revisado solo a ojo: un fusible puede estar abierto sin que se note. Para descartarlo, medí voltaje en ambos lados o continuidad.");
    }

    // Se vuelve a quemar
    const seQuema = (Number(insp.veces_quemado) || 0) >= 2;
    if (seQuema) {
      mensajes.push(`Se ha quemado ${insp.veces_quemado} veces: hay un corto a tierra o un consumo excesivo en ese circuito.`);
      acciones.push("Con el fusible fuera y el componente desconectado, medí si hay continuidad a tierra en el cable (prueba 'Corto a tierra').");
      acciones.push("Revisá roces del cableado (bisagras de puertas, bordes metálicos) y el componente del circuito (motor trabado, por ejemplo).");
    }

    // Amperaje observado vs documentado
    const obs = insp.amperaje_obs != null && insp.amperaje_obs !== "" ? Number(insp.amperaje_obs) : null;
    if (obs != null && amp && obs !== amp) {
      if (!usable) {
        if (estado === "correcto" || estado === "pendiente") estado = "desconocida";
        mensajes.push(`Tiene ${obs} A; las fuentes dicen ${amp} A pero no coinciden entre sí (${(S.VERIFICACION[v] || {}).nombre || v}). ${PEND()}.`);
        acciones.push("Leé el amperaje en la etiqueta de la tapa de tu caja y anotá si coincide.");
      } else {
        if (!["quemado", "quemado_probable", "ausente"].includes(estado)) estado = "amperaje";
        mensajes.push(`Tiene ${obs} A donde la documentación (${(S.VERIFICACION[v] || {}).nombre}) dice ${amp} A.`);
        if (obs > amp) mensajes.push("Es MÁS grande que el documentado: si hay una falla, el cable se puede calentar antes de que el fusible se queme. Riesgo de incendio.");
        else mensajes.push("Es más chico que el documentado: se puede quemar sin que haya falla.");
        acciones.push(confiable ? `Poné uno de ${amp} A.` : `Confirmá con la etiqueta de la tapa; si dice ${amp} A, poné uno de ${amp} A.`);
        if (obs > amp) acciones.push("Si alguien puso uno más grande porque se quemaba, la falla sigue ahí: buscá el corto o el consumo excesivo.");
      }
    } else if (obs != null && !amp && doc && !doc.libre) {
      mensajes.push(`Tiene ${obs} A; no hay amperaje documentado para comparar.`);
    }

    // Tipo
    if (insp.tipo_obs && doc && doc.tipo_fusible && norm(insp.tipo_obs) !== norm(doc.tipo_fusible)) {
      if (estado === "correcto" || estado === "pendiente") estado = "tipo";
      mensajes.push(`Tipo observado: ${insp.tipo_obs}; documentado: ${doc.tipo_fusible}.`);
    }

    // Falso contacto en la caja
    if (insp.falso_contacto) {
      if (estado === "correcto" || estado === "pendiente") estado = "contacto";
      mensajes.push("Se observó terminal flojo, sulfato o calentamiento en esa posición: posible falso contacto.");
      acciones.push("Con el circuito funcionando, medí la caída de voltaje a través del fusible y compárala con la de un fusible igual de otro circuito; revisá la presión de los terminales.");
    }

    if (doc && doc.principal && ["quemado", "quemado_probable", "ausente"].includes(estado)) {
      mensajes.push("Es un fusible PRINCIPAL: varios circuitos quedan sin alimentación a la vez. Antes de reemplazarlo, revisá el cable grueso por cortos (un principal casi nunca se quema solo).");
    }
    if (doc && !confiable && v !== "desconocido" && !doc.libre) mensajes.push(`Dato de documentación: ${(S.VERIFICACION[v] || {}).nombre}. Confirmalo con la etiqueta de la tapa.`);
    if (doc && doc.condicion) mensajes.push(`Aplica: ${doc.condicion}.`);

    const e = S.ESTADOS_FUSIBLE[estado];
    return { estado, nombre_estado: e.nombre, color: e.color, mensajes, acciones, verificacion: v, se_quema: seQuema };
  };

  /** Fusibles que parecen intercambiados entre posiciones (A tiene el amperaje de B y viceversa). */
  S.detectarIntercambios = function (variante, inspecciones) {
    const docs = (S.fusiblesDe ? S.fusiblesDe(variante) : []).filter((f) => f.amperaje);
    const out = [];
    for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i], b = docs[j];
      if (a.amperaje === b.amperaje) continue;
      const ia = (inspecciones || {})[a.id], ib = (inspecciones || {})[b.id];
      if (!ia || !ib || ia.amperaje_obs == null || ib.amperaje_obs == null) continue;
      if (Number(ia.amperaje_obs) === b.amperaje && Number(ib.amperaje_obs) === a.amperaje) {
        out.push({ a: a.id, b: b.id, texto: `Posible intercambio: en ${a.id} (${a.nombre}) hay ${ia.amperaje_obs} A y en ${b.id} (${b.nombre}) hay ${ib.amperaje_obs} A; la documentación dice lo contrario. Confirmá con la tapa.` });
      }
    }
    return out;
  };

  /** Voltaje en los dos puntos de prueba del fusible (llave en ON y circuito activo). */
  S.evaluarVoltajeFusible = function ({ entrada, salida, bateria }) {
    const vb = Number(bateria) > 6 ? Number(bateria) : 12.0;
    const hay = (v) => v != null && v >= 0.8 * vb, nada = (v) => v != null && v < 0.5;
    if (entrada == null || salida == null) return { resultado: "incompleto", texto: "Faltan los dos voltajes." };
    if (nada(entrada) && nada(salida)) return { resultado: "sin_alimentacion", texto: "No llega voltaje a ninguno de los dos lados: el fusible no es el problema; falta alimentación antes (fusible principal, relé, switch de encendido o cable). Confirmá que el circuito debía tener voltaje con la llave en ON." };
    if (hay(entrada) && nada(salida)) return { resultado: "abierto", texto: "Hay voltaje de batería en un lado y nada en el otro: el fusible está abierto (quemado)." };
    if (hay(entrada) && hay(salida)) return { resultado: "bien", texto: "Hay voltaje de batería en los dos lados: el fusible deja pasar corriente." };
    return { resultado: "dudoso", texto: `Lectura intermedia (${r2(entrada)} V / ${r2(salida)} V con batería en ${r2(vb)} V): posible falso contacto o una carga que baja el voltaje. Medí la caída a través del fusible con el circuito funcionando.` };
  };

  // Palabras clave para relacionar un código con fusibles por el nombre del circuito
  const CLAVES_CODIGO = [
    [/^P05(0[0-3])$/, ["velocidad", "sp sensor"]],
    [/^P056[0-3]$/, ["alternador", "acg", "principal de bateria"]],
    [/^P013[5]|^P014[1]|^P015[5]|^P016[1]$/, ["oxigeno", "o2"]],
    [/^P035[0-9]$|^P030[0-9]$/, ["bobina", "ign"]],
    [/^P02(3[0-2])$/, ["bomba de gasolina", "fuel pump"]],
    [/^P06(0[0-6])$|^U0/, ["computadora", "ecm", "pcm", "fi e/m"]],
    [/^P048[0-3]$/, ["ventilador"]],
    [/^P064[5-7]$|^P053[0-4]$/, ["a/c", "compresor"]],
  ];
  /** Fusibles que podrían relacionarse con un código, según el nombre de su circuito (relación posible, no confirmada). */
  S.fusiblesParaCodigo = function (variante, codigo) {
    const c = String(codigo || "").toUpperCase();
    const regla = CLAVES_CODIGO.find(([re]) => re.test(c));
    if (!regla) return [];
    return (S.fusiblesDe ? S.fusiblesDe(variante) : []).filter((f) => !f.libre && !f.repuesto && regla[1].some((k) => norm(`${f.nombre} ${f.circuito} ${(f.componentes || []).join(" ")}`).includes(k)));
  };

  // ================================================================== mediciones con multímetro
  /**
   * Cada prueba: qué componente, herramienta, dónde medir, si se hace energizada o no, cómo aislar el circuito,
   * qué tipo de valor se anota y cómo se interpreta. "referencia": fisica (criterio físico, no depende del fabricante),
   * fabricante (hace falta el valor del manual) o guia (guía general de taller, orientativa).
   */
  const AISLAR_RES = ["Llave en LOCK (apagado) y luces apagadas.", "Sacá el fusible del circuito o desconectá el conector del componente: el tramo a medir no debe tener voltaje.", "Si vas a desconectar la batería: primero el negativo (se pueden borrar memorias del radio y de la computadora).", "Nunca en circuitos de bolsas de aire (SRS, conectores amarillos)."];
  S.PRUEBAS_CIRCUITO = [
    { id: "fusible_continuidad", nombre: "Continuidad de un fusible", para: "fusible", herramienta: "Multímetro en continuidad (pitido) u ohmios", energizado: false, aislar: ["Llave en LOCK.", "Sacá el fusible con la pinza."],
      donde: "Entre las dos patas del fusible, fuera de la caja.", entrada: "continuidad", referencia: "fisica",
      referencia_texto: "Criterio físico: un fusible sano tiene continuidad (el multímetro pita o marca casi lo mismo que con las puntas juntas). Abierto (OL) = quemado.",
      causas_fuera: ["Fusible quemado por un corto o consumo excesivo", "Fusible viejo o vibración (raro)"], siguiente_ok: "El fusible está bien: el problema está después (relé, cable, componente) o antes (sin alimentación).", siguiente_mal: "Reemplazalo por uno del mismo amperaje. Si se vuelve a quemar, hacé 'Corto a tierra'." },
    { id: "fusible_voltaje", nombre: "Voltaje en ambos lados del fusible", para: "fusible", herramienta: "Multímetro en voltios DC o lámpara de prueba", energizado: true, aislar: ["Es una medición de VOLTAJE: se hace con la llave en ON (y el switch del circuito encendido si lo tiene). No midas ohmios así."],
      donde: "Punta negra a tierra (metal limpio o borne negativo); punta roja en cada uno de los dos puntos de prueba metálicos de la cara del fusible.", entrada: "voltaje_fusible", referencia: "fisica",
      referencia_texto: "Criterio físico: voltaje de batería en los dos lados = fusible bien; en un lado sí y en el otro no = fusible abierto; en ninguno = falta alimentación antes del fusible.",
      causas_fuera: ["Fusible abierto", "Falta alimentación antes del fusible (fusible principal, relé, switch de encendido)", "Falso contacto en la caja"], siguiente_ok: "El fusible deja pasar corriente: revisá relé, cable y componente.", siguiente_mal: "Según el resultado: cambiá el fusible (mismo amperaje) o buscá por qué no llega alimentación." },
    { id: "continuidad_cable", nombre: "Continuidad de un cable (circuito abierto)", para: "cable", herramienta: "Multímetro en continuidad", energizado: false, aislar: AISLAR_RES.concat(["Desconectá los conectores de los DOS extremos del cable que vas a medir."]),
      donde: "Una punta en el terminal del cable en un conector y la otra en el mismo cable en el otro conector (usá el diagrama para saber qué terminal es).", entrada: "continuidad", referencia: "fisica",
      referencia_texto: "Criterio del fabricante en estas pruebas: debe haber continuidad. Sin continuidad (OL) = cable abierto. Si marca claramente más que con las puntas juntas, hay resistencia de más: hacé una caída de voltaje.",
      causas_fuera: ["Cable cortado o quebrado por dentro", "Terminal suelto o sulfatado en un conector", "Reparación vieja mal hecha"], siguiente_ok: "El cable está bien: revisá el componente o la alimentación.", siguiente_mal: "Ubicá el corte (mové el arnés midiendo) y reparalo. No cambies el sensor ni la computadora por esto." },
    { id: "corto_tierra", nombre: "Corto a tierra", para: "cable", herramienta: "Multímetro en continuidad", energizado: false, aislar: AISLAR_RES.concat(["Sacá el fusible del circuito y desconectá el componente (si queda conectado, su propia resistencia puede confundir la lectura)."]),
      donde: "Entre el cable del circuito (o el lado de salida del fusible) y tierra (metal limpio).", entrada: "continuidad", invertida: true, referencia: "fisica",
      referencia_texto: "Criterio físico: con el componente desconectado NO debe haber continuidad a tierra. Si la hay, el cable toca metal en algún punto.",
      causas_fuera: ["Cable pelado tocando la carrocería", "Arnés aplastado o rozado (bisagras, bordes)", "Componente en corto (si quedó conectado)"], siguiente_ok: "No hay corto en el cable: si el fusible se quema, revisá el componente (motor trabado, consumo alto).", siguiente_mal: "Mové el arnés por tramos mientras medís para encontrar el punto del corto." },
    { id: "resistencia_componente", nombre: "Resistencia de un sensor, actuador o resistencia", para: "componente", herramienta: "Multímetro en ohmios (y termómetro si es un sensor de temperatura)", energizado: false, aislar: AISLAR_RES.concat(["Desconectá el conector del componente y medí en los terminales del COMPONENTE."]),
      donde: "Entre los terminales del componente que indique el manual.", entrada: "numero", unidad: "Ω", referencia: "fabricante",
      referencia_texto: "Hace falta el valor del manual de servicio para ese componente (y la temperatura para sensores de temperatura).",
      causas_fuera: ["Componente dañado (abierto, en corto o fuera de valor)", "Medición en terminales equivocados", "Temperatura distinta a la del valor del manual"], siguiente_ok: "El componente mide bien: revisá alimentación, tierra y cables.", siguiente_mal: "Antes de cambiarlo, confirmá que mediste los terminales correctos y a la temperatura indicada; revisá también su alimentación y tierra." },
    { id: "alimentacion_componente", nombre: "Alimentación de un componente o sensor", para: "componente", herramienta: "Multímetro en voltios DC", energizado: true, aislar: ["Es VOLTAJE: llave en ON. Medí por detrás del conector (sin perforar cables) o con el conector desconectado del lado del arnés."],
      donde: "Entre el terminal de alimentación (o de referencia) del conector y tierra.", entrada: "numero", unidad: "V", referencia: "fabricante", fisica_cero: true,
      referencia_texto: "El valor correcto (por ejemplo, una referencia de 5 V o voltaje de batería) depende del fabricante y del componente. Criterio físico: 0 V = no llega alimentación.",
      causas_fuera: ["Fusible o relé del circuito", "Cable de alimentación abierto", "Referencia en corto por otro sensor que la comparte", "Computadora sin alimentación"], siguiente_ok: "Llega alimentación: revisá la tierra y la señal.", siguiente_mal: "Revisá fusible, relé y el cable de alimentación. No cambies el componente." },
    { id: "tierra_componente", nombre: "Tierra de un componente (caída de voltaje)", para: "conexion", herramienta: "Multímetro en voltios DC", energizado: true, aislar: ["Es VOLTAJE con el circuito funcionando."],
      donde: "Punta roja en el terminal de tierra del componente; punta negra en el borne negativo de la batería.", entrada: "numero", unidad: "V", referencia: "fabricante", fisica_abierta: true,
      referencia_texto: "Debe ser muy baja; el límite exacto depende del fabricante. Criterio físico: si se acerca al voltaje de batería, la tierra está abierta.",
      causas_fuera: ["Punto de tierra flojo, oxidado o pintado", "Cable de tierra dañado"], siguiente_ok: "La tierra está bien.", siguiente_mal: "Limpiá y apretá el punto de tierra; repetí la medición." },
    { id: "caida_positivo", nombre: "Caída de voltaje en el positivo", para: "conexion", herramienta: "Multímetro en voltios DC (y un ayudante si es el arranque)", energizado: true, aislar: ["Es VOLTAJE con el circuito funcionando (por ejemplo, mientras el ayudante da arranque). Manos lejos de piezas que giran."],
      donde: "Entre el borne positivo de la batería (el poste) y el terminal positivo del componente (por ejemplo, el terminal grueso del motor de arranque o la salida del alternador).", entrada: "numero", unidad: "V", referencia: "guia",
      guia: { arranque: 0.5, carga: 0.5 }, referencia_texto: "Valor del fabricante si existe. Si no, guía general de taller (orientativa, no del fabricante): menos de ~0.5 V en el cable positivo del arranque o de la carga.",
      causas_fuera: ["Borne o terminal sulfatado o flojo", "Cable dañado por dentro"], siguiente_ok: "El cable positivo está bien.", siguiente_mal: "Limpiá/apretá bornes y terminales; si sigue alta, cambiá el cable." },
    { id: "caida_tierra", nombre: "Caída de voltaje en la tierra", para: "conexion", herramienta: "Multímetro en voltios DC (y un ayudante si es el arranque)", energizado: true, aislar: ["Es VOLTAJE con el circuito funcionando. Manos lejos de piezas que giran."],
      donde: "Entre el borne negativo de la batería (el poste) y el bloque del motor o el punto de tierra del componente.", entrada: "numero", unidad: "V", referencia: "guia",
      guia: { arranque: 0.3, carga: 0.3 }, referencia_texto: "Valor del fabricante si existe. Si no, guía general de taller (orientativa): menos de ~0.3 V en la tierra del arranque o de la carga.",
      causas_fuera: ["Cable de tierra del motor o de la carrocería flojo/oxidado", "Correa de tierra rota"], siguiente_ok: "La tierra está bien.", siguiente_mal: "Limpiá y apretá la tierra; repetí la medición." },
    { id: "conector", nombre: "Inspección de conector y prueba de movimiento", para: "conexion", herramienta: "Vista, linterna y el escáner en 'En vivo'", energizado: true, aislar: ["La inspección se hace desconectado; la prueba de movimiento, con el motor en ralentí mirando el dato en vivo (manos lejos de piezas que giran)."],
      donde: "En el conector del componente sospechoso.", entrada: "conector", referencia: "fisica",
      referencia_texto: "Criterio físico: sin sulfato, pines firmes y rectos, sello sano; el dato en vivo no debe saltar al mover el conector y los cables.",
      causas_fuera: ["Sulfato (polvo verde o blanco)", "Pines abiertos o flojos", "Cable quebrado cerca del conector"], siguiente_ok: "El conector está bien.", siguiente_mal: "Limpiá con limpiador de contactos, ajustá o cambiá los terminales. No cambies el sensor todavía." },
    { id: "consumo_parasito", nombre: "Consumo con el carro apagado (fuga de corriente)", para: "bateria", herramienta: "Multímetro en amperios (escala de 10 A) en serie con el borne negativo", energizado: true,
      aislar: ["Carro apagado, puertas cerradas (traba el switch de la puerta), sin llave. El multímetro va EN SERIE entre el borne negativo y su cable.", "Esperá a que los módulos 'se duerman' (el tiempo depende del carro).", "Nunca des arranque ni enciendas luces con el multímetro en serie: se quema su fusible interno."],
      donde: "Entre el borne negativo de la batería y el cable negativo desconectado.", entrada: "numero", unidad: "mA", referencia: "fabricante",
      referencia_texto: "El consumo aceptable lo define el fabricante. Si es alto, sacá los fusibles uno por uno mirando el amperímetro: el que lo hace bajar señala el circuito.",
      causas_fuera: ["Luz que queda encendida (guantera, maletero)", "Radio o accesorio mal instalado", "Relé pegado", "Alternador con diodo en fuga"], siguiente_ok: "No hay consumo anormal: si la batería se descarga, revisá la batería y la carga.", siguiente_mal: "Sacá fusibles uno por uno para encontrar el circuito." },
    { id: "rele_intercambio", nombre: "Relé: intercambio con uno idéntico", para: "rele", herramienta: "Otro relé con el MISMO número de parte", energizado: false, aislar: ["Llave en LOCK para sacar y poner relés."],
      donde: "En la caja de relés: cambiá el relé sospechoso por uno idéntico de un circuito que puedas probar.", entrada: "rele", referencia: "fisica",
      referencia_texto: "Criterio práctico: si el síntoma se va con el otro relé (y aparece en el otro circuito), el relé original falla.",
      causas_fuera: ["Relé defectuoso (contactos o bobina)"], siguiente_ok: "El relé no era el problema: revisá su alimentación (fusible), la señal que lo activa y el componente.", siguiente_mal: "Cambiá el relé por uno del mismo número de parte." },
    { id: "rele_bobina", nombre: "Resistencia de la bobina de un relé", para: "rele", herramienta: "Multímetro en ohmios", energizado: false, aislar: ["Sacá el relé de la caja."],
      donde: "Entre los terminales de la bobina del relé (según el diagrama impreso en el relé o el manual).", entrada: "numero", unidad: "Ω", referencia: "fabricante",
      referencia_texto: "El valor depende del relé: hace falta su especificación. Abierto (OL) = bobina cortada (criterio físico).", fisica_abierto: true,
      causas_fuera: ["Bobina abierta o en corto"], siguiente_ok: "La bobina mide bien; los contactos se prueban aplicando 12 V a la bobina con un cable con fusible (o el intercambio).", siguiente_mal: "Cambiá el relé." },
    { id: "voltaje_bornes", nombre: "Voltaje en los bornes de la batería", para: "bateria", herramienta: "Multímetro en voltios DC", energizado: true, aislar: ["Es VOLTAJE: no hace falta desconectar nada."],
      donde: "Directo en los postes de plomo de la batería (no en las abrazaderas).", entrada: "numero", unidad: "V", referencia: "guia", condiciones: ["reposo", "ralenti", "2000_cargas"],
      referencia_texto: "Reposo (1 h o más sin uso, ~25 °C), referencia general de baterías de plomo-ácido: ~12.6 V cargada, ~12.4 V media, menos de 12.2 V descargada. Con el motor encendido: el valor de carga del fabricante (si lo anotaste en 'Datos del manual'); como guía general, 13.5–14.7 V. Algunos Honda con detector de carga (ELD) cargan menos a propósito.",
      causas_fuera: ["Batería descargada o vieja", "Alternador, regulador, faja o conexiones"], siguiente_ok: "Voltaje normal en esa condición.", siguiente_mal: "Seguí con la evaluación de batería y carga." },
  ];
  S.pruebaCircuito = (id) => S.PRUEBAS_CIRCUITO.find((p) => p.id === id) || null;

  /** Valor de referencia para una medición: del dueño (manual de su carro) o de la ficha. Nunca inventado. */
  S.especificacionPara = function ({ variante, carro, prueba, componente, condicion }) {
    const propias = ((carro && carro.especificaciones_electricas) || []).filter((e) => e.prueba === prueba && (!componente || e.componente === componente) && (!condicion || !e.condicion || e.condicion === condicion));
    if (propias.length) return { ...propias[0], origen: "dueno" };
    const ficha = ((variante && variante.valores_referencia) || []).filter((e) => e.prueba === prueba && (!componente || e.componente === componente));
    if (ficha.length) return { ...ficha[0], origen: "ficha" };
    if (prueba === "voltaje_bornes" && condicion !== "reposo" && carro && carro.especificaciones && carro.especificaciones.carga_v) {
      const m = String(carro.especificaciones.carga_v).match(/(\d+(?:[.,]\d+)?)\s*(?:[-–a]\s*(\d+(?:[.,]\d+)?))?/);
      if (m) { const a = Number(m[1].replace(",", ".")), b = m[2] ? Number(m[2].replace(",", ".")) : null; return { min: b ? Math.min(a, b) : null, max: b ? Math.max(a, b) : null, valor: b ? null : a, unidad: "V", fuente: "Datos del manual (anotado por el dueño)", origen: "dueno" }; }
    }
    return null;
  };

  /**
   * Interpreta una medición. m: { prueba, valor (número o "si"/"no"/"dudoso"), entrada, salida, bateria, condicion, circuito, conector:{...}, rele }
   * spec: { min, max, valor, tolerancia, unidad, fuente } o null.
   * Devuelve { veredicto: dentro|fuera|sin_referencia|orientativo_ok|orientativo_alto|incompleto, texto, causas, siguiente, referencia }
   */
  S.evaluarMedicion = function (m, spec) {
    const p = S.pruebaCircuito(m && m.prueba);
    if (!p) return { veredicto: "incompleto", texto: "Prueba desconocida." };
    const base = { referencia: spec ? `${spec.fuente || "Especificación"}${spec.min != null || spec.max != null ? `: ${spec.min ?? "—"} a ${spec.max ?? "—"} ${spec.unidad || p.unidad || ""}` : spec.valor != null ? `: ${spec.valor} ${spec.unidad || p.unidad || ""}` : ""}` : p.referencia_texto };
    const res = (veredicto, texto, malo) => ({ ...base, veredicto, texto, causas: malo ? p.causas_fuera : [], siguiente: malo ? p.siguiente_mal : veredicto === "sin_referencia" ? "Buscá el valor en el manual de servicio de tu carro y anotalo para poder comparar." : p.siguiente_ok });

    if (p.entrada === "continuidad") {
      const v = norm(m.valor);
      if (!["si", "no", "dudoso"].includes(v)) return res("incompleto", "Anotá si hay continuidad (sí / no / dudoso).");
      if (v === "dudoso") return res("fuera", "Lectura dudosa: hay continuidad pero con resistencia de más. Hacé una caída de voltaje con el circuito funcionando.", true);
      const bien = p.invertida ? v === "no" : v === "si";
      const txt = { fusible_continuidad: bien ? "El fusible tiene continuidad: está bien." : "El fusible está abierto: quemado.",
        continuidad_cable: bien ? "El cable tiene continuidad." : "El cable está abierto (sin continuidad).",
        corto_tierra: bien ? "No hay continuidad a tierra: no hay corto en ese tramo." : "Hay continuidad a tierra con el componente desconectado: corto a tierra." }[p.id];
      return res(bien ? "dentro" : "fuera", txt, !bien);
    }
    if (p.entrada === "voltaje_fusible") {
      const r = S.evaluarVoltajeFusible(m);
      if (r.resultado === "incompleto") return res("incompleto", r.texto);
      return { ...res(r.resultado === "bien" ? "dentro" : "fuera", r.texto, r.resultado !== "bien"), resultado: r.resultado };
    }
    if (p.entrada === "conector") {
      const c = m.conector || {};
      const fallas = [c.sulfato && "sulfato", c.pines && "pines flojos o abiertos", c.cable && "cable quebrado", c.sello && "sello dañado", c.quemado && "terminal quemado", c.movimiento && "el dato en vivo salta al moverlo"].filter(Boolean);
      if (!Object.keys(c).length) return res("incompleto", "Marcá lo que observaste.");
      return fallas.length ? res("fuera", `Conector con: ${fallas.join(", ")}.`, true) : res("dentro", "Conector sin daños visibles y estable al moverlo.");
    }
    if (p.entrada === "rele") {
      const v = norm(m.valor);
      if (v === "mejora") return res("fuera", "Con el otro relé el sistema funciona: el relé original falla.", true);
      if (v === "igual") return res("dentro", "Con el otro relé sigue igual: el relé probablemente no es la causa.");
      return res("incompleto", "Anotá si el síntoma mejoró o quedó igual con el otro relé.");
    }
    // Números
    const val = Number(m.valor);
    if (m.valor == null || m.valor === "" || isNaN(val)) return res("incompleto", "Anotá el valor medido.");
    const vb = Number(m.bateria) > 6 ? Number(m.bateria) : null;
    if (p.fisica_abierto && val >= 1e6) return res("fuera", "Abierto (OL): la bobina está cortada.", true);
    if (p.fisica_cero && val < 0.5) return res("fuera", "Prácticamente 0 V: no llega alimentación (criterio físico).", true);
    if (p.fisica_abierta && vb && val >= 0.8 * vb) return res("fuera", "La caída en la tierra es casi el voltaje de batería: la tierra está abierta (criterio físico).", true);
    if (spec) {
      const lo = spec.min != null ? spec.min : spec.valor != null && spec.tolerancia != null ? spec.valor - spec.tolerancia : null;
      const hi = spec.max != null ? spec.max : spec.valor != null && spec.tolerancia != null ? spec.valor + spec.tolerancia : null;
      if (lo == null && hi == null) return res("sin_referencia", `Medido: ${r2(val)} ${p.unidad || ""}. La especificación anotada no tiene rango. ${SIN_REF()}.`);
      const dentro = (lo == null || val >= lo) && (hi == null || val <= hi);
      return res(dentro ? "dentro" : "fuera", `Medido: ${r2(val)} ${p.unidad || ""}; ${dentro ? "dentro" : "fuera"} de la especificación.`, !dentro);
    }
    if (p.referencia === "guia" && p.guia && p.guia[m.circuito]) {
      const g = p.guia[m.circuito];
      return res(val <= g ? "orientativo_ok" : "orientativo_alto", `Medido: ${r2(val)} V. Guía general de taller (no es del fabricante): ${val <= g ? "dentro" : "por encima"} de ~${g} V.`, val > g);
    }
    if (p.id === "voltaje_bornes") {
      if (m.condicion === "reposo") {
        const est = val >= 12.6 ? "cargada" : val >= 12.4 ? "a media carga" : val >= 12.2 ? "baja" : "descargada";
        const mal = val < 12.4;
        return res(mal ? "orientativo_alto" : "orientativo_ok", `Medido en reposo: ${r2(val)} V → batería ${est} (referencia general de plomo-ácido a ~25 °C; no indica su estado interno).`, mal);
      }
      const ok = val >= 13.5 && val <= 14.7;
      return res(ok ? "orientativo_ok" : "orientativo_alto", `Medido con motor encendido: ${r2(val)} V. Guía general 13.5–14.7 V (anotá el valor del fabricante en 'Datos del manual' para comparar en serio).`, !ok);
    }
    return res("sin_referencia", `Medido: ${r2(val)} ${p.unidad || ""}. ${SIN_REF()}.`);
  };

  // ================================================================== batería, arranque y carga (combinando fuentes)
  S.SINTOMAS_ELECTRICOS = [
    { id: "no_da_arranque", texto: "Gira la llave y no da arranque (solo clic o nada)" },
    { id: "arranque_lento", texto: "Da arranque lento" },
    { id: "arranca_no_enciende", texto: "Da arranque normal pero no enciende" },
    { id: "bateria_se_descarga", texto: "La batería amanece descargada" },
    { id: "luz_carga", texto: "Luz de batería/carga encendida en el tablero" },
    { id: "luces_bajan", texto: "Las luces bajan de intensidad (por ejemplo, en ralentí o con el A/C)" },
    { id: "falla_intermitente", texto: "Algo eléctrico funciona y deja de funcionar" },
    { id: "varios_sistemas", texto: "Varios sistemas eléctricos fallan a la vez" },
    { id: "fusible_se_quema", texto: "Un fusible se vuelve a quemar" },
    { id: "olor_quemado", texto: "Olor a cable quemado" },
    { id: "se_apaga_marcha", texto: "El motor se apaga de golpe en marcha" },
  ];

  /**
   * Junta OBD (resumen de S.resumir), pruebas guiadas guardadas, mediciones con multímetro, historial de escaneos y síntomas.
   * OBD solo nunca da una conclusión definitiva.
   */
  S.evaluarSistemaCarga = function (ctx = {}) {
    const r = ctx.resumen || {}, med = ctx.mediciones || [], pr = ctx.pruebas || [], sint = new Set(ctx.sintomas || []), hist = ctx.historialVoltajes || [];
    const ultimaPrueba = (id) => pr.filter((p) => p.prueba === id || p.id_prueba === id).sort((a, b) => (b.fecha || 0) - (a.fecha || 0))[0] || null;
    const ultimaMed = (id, cond) => med.filter((m) => m.prueba === id && (!cond || m.condicion === cond)).sort((a, b) => (b.fecha || 0) - (a.fecha || 0))[0] || null;
    const hip = {
      bateria: { id: "bateria", titulo: "Batería (carga o estado interno)", apoyo: [], contra: [], fuentes: new Set() },
      alternador: { id: "alternador", titulo: "Alternador / regulador", apoyo: [], contra: [], fuentes: new Set() },
      conexiones: { id: "conexiones", titulo: "Bornes, cables o tierras (caída de voltaje)", apoyo: [], contra: [], fuentes: new Set() },
      faja: { id: "faja", titulo: "Faja del alternador", apoyo: [], contra: [], fuentes: new Set() },
      consumo: { id: "consumo", titulo: "Consumo con el carro apagado (fuga de corriente)", apoyo: [], contra: [], fuentes: new Set() },
      arranque: { id: "arranque", titulo: "Motor de arranque o su circuito", apoyo: [], contra: [], fuentes: new Set() },
    };
    const a = (h, txt, f) => { hip[h].apoyo.push(txt); hip[h].fuentes.add(f); };
    const c = (h, txt) => hip[h].contra.push(txt);
    // OBD
    const ve = r.voltaje_encendido, va = r.voltaje_apagado;
    if (ve && ve.n >= 3) {
      if (ve.prom < 13.0) { a("alternador", `OBD: ${ve.prom.toFixed(2)} V promedio con el motor encendido (orientativo, medido en el conector OBD)`, "obd"); a("conexiones", "OBD: voltaje de carga bajo (también lo causan malas conexiones)", "obd"); a("faja", "OBD: voltaje de carga bajo (también lo causa una faja que patina)", "obd"); }
      else if (ve.prom <= 14.9) c("alternador", `OBD: ${ve.prom.toFixed(2)} V con el motor encendido (normal en esas condiciones)`);
    }
    if (va && va.n >= 3) {
      if (va.prom < 12.2) a("bateria", `OBD: ${va.prom.toFixed(2)} V con motor apagado y llave en ON (orientativo: con consumo de la llave en ON)`, "obd");
      else c("bateria", `OBD: ${va.prom.toFixed(2)} V con motor apagado`);
    }
    // Pruebas guiadas
    const pb = ultimaPrueba("bateria"), pa = ultimaPrueba("arranque"), pl = ultimaPrueba("alternador"), pc = ultimaPrueba("caida_voltaje");
    if (pb) (pb.veredicto === "mal" || pb.veredicto === "regular" ? a("bateria", `Prueba 'Batería en reposo': ${pb.resumen || pb.veredicto}`, "prueba") : c("bateria", `Prueba 'Batería en reposo': ${pb.resumen || "bien"}`));
    if (pa) {
      if (pa.veredicto === "mal" || pa.veredicto === "regular") { a("bateria", `Prueba 'Arranque': ${pa.resumen || pa.veredicto}`, "prueba"); a("conexiones", "Prueba 'Arranque' con caída grande (también la causan cables/tierras)", "prueba"); a("arranque", "Prueba 'Arranque' con caída grande (también la causa un motor de arranque que consume de más)", "prueba"); }
      else c("arranque", `Prueba 'Arranque': ${pa.resumen || "bien"}`);
    }
    if (pl) (pl.veredicto === "mal" || pl.veredicto === "regular" ? a("alternador", `Prueba 'Alternador con carga': ${pl.resumen || pl.veredicto}`, "prueba") : c("alternador", `Prueba 'Alternador con carga': ${pl.resumen || "bien"}`));
    if (pc) (pc.veredicto === "mal" || pc.veredicto === "regular" ? a("conexiones", `Prueba 'Caída de voltaje': ${pc.resumen || pc.veredicto}`, "medicion") : c("conexiones", `Prueba 'Caída de voltaje': ${pc.resumen || "bien"}`));
    // Mediciones del módulo eléctrico
    const mr = ultimaMed("voltaje_bornes", "reposo");
    if (mr) { const e = S.evaluarMedicion(mr, null); (e.veredicto === "orientativo_alto" ? a("bateria", `Multímetro en reposo: ${mr.valor} V`, "medicion") : c("bateria", `Multímetro en reposo: ${mr.valor} V`)); }
    const mc = ultimaMed("voltaje_bornes", "2000_cargas") || ultimaMed("voltaje_bornes", "ralenti");
    if (mc) {
      const e = S.evaluarMedicion(mc, S.especificacionPara({ carro: ctx.carro, prueba: "voltaje_bornes", condicion: mc.condicion }));
      if (e.veredicto === "fuera" || e.veredicto === "orientativo_alto") a("alternador", `Multímetro en los bornes con motor encendido: ${mc.valor} V`, "medicion"); else c("alternador", `Multímetro con motor encendido: ${mc.valor} V`);
    }
    for (const id of ["caida_positivo", "caida_tierra"]) {
      const m = ultimaMed(id);
      if (!m) continue;
      const e = S.evaluarMedicion(m, S.especificacionPara({ carro: ctx.carro, variante: ctx.variante, prueba: id }));
      (["fuera", "orientativo_alto"].includes(e.veredicto) ? a("conexiones", `${S.pruebaCircuito(id).nombre}: ${m.valor} V`, "medicion") : c("conexiones", `${S.pruebaCircuito(id).nombre}: ${m.valor} V (bien)`));
    }
    const mp = ultimaMed("consumo_parasito");
    if (mp) {
      const spec = S.especificacionPara({ carro: ctx.carro, variante: ctx.variante, prueba: "consumo_parasito" });
      const e = S.evaluarMedicion(mp, spec);
      if (e.veredicto === "fuera") a("consumo", `Consumo con el carro apagado: ${mp.valor} mA (fuera de la especificación anotada)`, "medicion");
      else if (e.veredicto === "dentro") c("consumo", `Consumo con el carro apagado: ${mp.valor} mA (dentro de la especificación)`);
    }
    // Historial
    if (hist.length >= 3) {
      const ult = hist.slice(-3).map((h) => h.encendido).filter((v) => v != null);
      if (ult.length >= 3 && ult[2] < ult[0] - 0.3) a("alternador", `Historial: el voltaje con motor encendido bajó de ${ult[0].toFixed(2)} a ${ult[2].toFixed(2)} V en los últimos escaneos`, "historial");
    }
    // Síntomas
    if (sint.has("bateria_se_descarga")) { a("bateria", "Síntoma: la batería amanece descargada", "sintoma"); a("consumo", "Síntoma: la batería amanece descargada", "sintoma"); a("alternador", "Síntoma: la batería amanece descargada", "sintoma"); }
    if (sint.has("luz_carga")) { a("alternador", "Síntoma: luz de carga encendida", "sintoma"); a("faja", "Síntoma: luz de carga encendida", "sintoma"); }
    if (sint.has("arranque_lento")) { a("bateria", "Síntoma: arranque lento", "sintoma"); a("conexiones", "Síntoma: arranque lento", "sintoma"); a("arranque", "Síntoma: arranque lento", "sintoma"); }
    if (sint.has("no_da_arranque")) { a("bateria", "Síntoma: no da arranque", "sintoma"); a("conexiones", "Síntoma: no da arranque", "sintoma"); a("arranque", "Síntoma: no da arranque", "sintoma"); }
    if (sint.has("luces_bajan")) { a("alternador", "Síntoma: las luces bajan", "sintoma"); a("conexiones", "Síntoma: las luces bajan", "sintoma"); }

    const SIG = {
      bateria: "Cargá la batería y medí en reposo (1 h sin uso) con multímetro; después probala con un probador de carga o conductancia (taller de baterías).",
      alternador: "Medí en los bornes a ~2000 rpm con luces y A/C encendidos; revisá la faja y el fusible de excitación del alternador; un taller puede probar el alternador.",
      conexiones: "Hacé 'Caída de voltaje en el positivo' y 'en la tierra' mientras un ayudante da arranque.",
      faja: "Con el motor APAGADO, revisá tensión, grietas y brillo de la faja.",
      consumo: "Hacé la prueba de consumo con el carro apagado (amperímetro en serie) y compará con el valor del fabricante.",
      arranque: "Primero descartá batería y cables (caída de voltaje). El motor de arranque se prueba en taller.",
    };
    // Las HIPÓTESIS (qué pieza) nunca quedan confirmadas solo con voltajes: lo confirmado son los HECHOS medidos.
    const lista = Object.values(hip).map((h) => {
      const fuentes = [...h.fuentes];
      const soloObd = fuentes.length && fuentes.every((f) => f === "obd" || f === "sintoma" || f === "historial");
      const certeza = !h.apoyo.length ? null : soloObd ? "posibilidad" : "sospecha";
      return { id: h.id, titulo: h.titulo, apoyo: h.apoyo, contra: h.contra, fuentes, certeza, siguiente: SIG[h.id],
        nota: soloObd ? "Solo con datos OBD o síntomas no se puede concluir: medí con multímetro." : "" };
    }).filter((h) => h.apoyo.length || h.contra.length);
    // Hechos medidos con multímetro (criterio físico)
    const hechos = [];
    if (mr && Number(mr.valor) < 12.4) hechos.push({ id: "bateria_descargada", texto: `La batería está ${Number(mr.valor) < 12.2 ? "descargada" : "a media carga"}: ${mr.valor} V en reposo medido en los bornes (referencia general de plomo-ácido). No dice si la batería está buena o vieja.` });
    if (mc && Number(mc.valor) < 12.9) hechos.push({ id: "no_carga", texto: `El sistema de carga no está cargando: ${mc.valor} V en los bornes con el motor encendido (casi el voltaje de la batería en reposo). Falta saber si es el alternador, la faja, su fusible/excitación o sus cables.` });
    const orden = { sospecha: 1, posibilidad: 2, null: 3 };
    lista.sort((x, y) => (orden[x.certeza] ?? 3) - (orden[y.certeza] ?? 3) || y.apoyo.length - x.apoyo.length);
    const conApoyo = lista.filter((h) => h.apoyo.length);
    return {
      hipotesis: lista, hechos,
      estado: !conApoyo.length && !hechos.length ? (lista.length ? "sin_indicios" : "sin_datos") : hechos.length ? "falla_confirmada" : "revisar",
      nota: "El voltaje que lee el OBD es orientativo (se mide en el conector y depende de las cargas). Las conclusiones necesitan mediciones en los bornes.",
    };
  };

  // ================================================================== sensores y actuadores
  // Rangos de códigos genéricos SAE J2012 (iguales en todas las marcas). Los tipos de sensor son los más comunes: confirmalos con el diagrama.
  S.COMPONENTES_ELECTRICOS = {
    ect: { nombre: "Sensor de temperatura del refrigerante (ECT)", tipo: "Normalmente termistor de 2 cables (señal y tierra de sensores)", circuitos: ["senal", "tierra"], codigos: ["P0115", "P0116", "P0117", "P0118", "P0119"], pid: "temp_motor" },
    iat: { nombre: "Sensor de temperatura del aire (IAT)", tipo: "Normalmente termistor de 2 cables", circuitos: ["senal", "tierra"], codigos: ["P0110", "P0111", "P0112", "P0113", "P0114"], pid: "temp_admision" },
    map: { nombre: "Sensor MAP", tipo: "Normalmente 3 cables: referencia, señal y tierra", circuitos: ["referencia", "senal", "tierra"], codigos: ["P0105", "P0106", "P0107", "P0108", "P0109"], pid: "map", ref5v: true },
    maf: { nombre: "Sensor MAF", tipo: "3 a 5 cables según el carro (alimentación, tierra, señal, a veces IAT)", circuitos: ["alimentacion", "senal", "tierra"], codigos: ["P0100", "P0101", "P0102", "P0103", "P0104"], pid: "maf" },
    tps: { nombre: "Sensor de posición del acelerador (TPS)", tipo: "Normalmente 3 cables: referencia, señal y tierra", circuitos: ["referencia", "senal", "tierra"], codigos: ["P0120", "P0121", "P0122", "P0123", "P0124"], pid: "acelerador", ref5v: true },
    ckp: { nombre: "Sensor de posición del cigüeñal (CKP)", tipo: "Inductivo (2 cables) o de efecto Hall (3 cables), depende del carro", circuitos: ["senal", "tierra", "alimentacion"], codigos: ["P0335", "P0336", "P0337", "P0338", "P0339"], pid: "rpm" },
    cmp: { nombre: "Sensor de posición del árbol de levas (CMP)", tipo: "Inductivo o Hall, depende del carro", circuitos: ["senal", "tierra", "alimentacion"], codigos: ["P0340", "P0341", "P0342", "P0343", "P0344"] },
    o2: { nombre: "Sensor de oxígeno (señal)", tipo: "Zirconia de 1 a 4 cables o banda ancha de 5–6 cables", circuitos: ["senal", "tierra"], codigos: ["P0130", "P0131", "P0132", "P0133", "P0134", "P0136", "P0137", "P0138", "P0139", "P0140"], pid: "o2_b1s1" },
    o2_calentador: { nombre: "Calentador del sensor de oxígeno", tipo: "Resistencia: alimentación (fusible/relé) y control a tierra desde la computadora", circuitos: ["alimentacion", "control"], codigos: ["P0135", "P0141", "P0155", "P0161", "P0030", "P0031", "P0032", "P0036", "P0037", "P0038"] },
    vss: { nombre: "Sensor de velocidad (VSS)", tipo: "Inductivo o Hall, depende del carro", circuitos: ["senal", "alimentacion", "tierra"], codigos: ["P0500", "P0501", "P0502", "P0503"], pid: "velocidad" },
    inyector: { nombre: "Inyector", tipo: "Bobina: alimentación (relé principal) y control a tierra desde la computadora", circuitos: ["alimentacion", "control"], codigos: ["P0200", "P0201", "P0202", "P0203", "P0204", "P0205", "P0206"] },
    bobina: { nombre: "Bobina de encendido", tipo: "Primario: alimentación y control (módulo o computadora); secundario de alta tensión", circuitos: ["alimentacion", "control"], codigos: ["P0350", "P0351", "P0352", "P0353", "P0354"] },
    solenoide: { nombre: "Válvula solenoide (EVAP, EGR, transmisión, VTEC)", tipo: "Bobina: alimentación y control", circuitos: ["alimentacion", "control"], codigos: ["P0443", "P0403", "P0750", "P0755", "P0760", "P0765", "P2646"] },
    rele: { nombre: "Relé", tipo: "Bobina de control y contactos de potencia", circuitos: ["alimentacion", "control"], codigos: ["P0685", "P0686", "P0687", "P0689", "P0690"] },
    motor_electrico: { nombre: "Motor eléctrico (ventilador, bomba, soplador)", tipo: "Alimentación por relé y fusible; tierra", circuitos: ["alimentacion", "tierra"], codigos: ["P0480", "P0481", "P0230", "P0231", "P0232"] },
    iac: { nombre: "Válvula de control de ralentí (IAC)", tipo: "Solenoide o motor paso a paso, depende del carro", circuitos: ["alimentacion", "control"], codigos: ["P0505", "P0506", "P0507", "P0508", "P0509"] },
  };

  /** Qué dice un código sobre el circuito (según su descripción genérica SAE). */
  S.clasificarCodigoElectrico = function (codigo) {
    const c = String(codigo || "").toUpperCase();
    const comp = Object.entries(S.COMPONENTES_ELECTRICOS).find(([, d]) => d.codigos.includes(c));
    const desc = (S.describir ? S.describir(c).descripcion : "") || "";
    const d = norm(desc);
    let falla = null;
    if (/calentador|heater/.test(d) || (comp && comp[0] === "o2_calentador")) falla = "calentador";
    else if (/entrada baja|senal baja|\bbaj[oa]\b|\blow\b/.test(d)) falla = "bajo";
    else if (/entrada alta|senal alta|\balt[oa]\b|\bhigh\b/.test(d)) falla = "alto";
    else if (/intermitente|intermittent/.test(d)) falla = "intermitente";
    else if (/rango|desempeno|range|performance/.test(d)) falla = "rango";
    else if (/sin senal|no signal|sin actividad/.test(d)) falla = "sin_senal";
    else if (/circuito|circuit/.test(d) || comp) falla = "circuito";
    const potencia = /^P056[0-3]$|^P060[0-6]$|^P068[5-9]$|^P0690$/.test(c) || /^U0/.test(c);
    const POS = {
      bajo: "Voltaje de señal bajo: en sensores de temperatura suele ser señal en corto a tierra o sensor en corto; en sensores de 3 cables, sin referencia o señal a tierra.",
      alto: "Voltaje de señal alto: suele ser circuito abierto (cable o conector), tierra de sensores abierta o señal en corto a voltaje.",
      calentador: "Circuito del calentador: fusible o relé de su alimentación, cable, o resistencia del calentador abierta.",
      intermitente: "Falla intermitente: típico de conector o cable que hace falso contacto.",
      rango: "Fuera de rango o desempeño: puede ser el sensor o una condición mecánica real; no siempre es eléctrico.",
      sin_senal: "Sin señal: alimentación, tierra, cable o sensor.",
      circuito: "Falla del circuito: alimentación, tierra, cable o componente.",
    };
    return { codigo: c, descripcion: desc, componente: comp ? comp[0] : null, falla, potencia, electrico: !!(comp && falla && falla !== "rango") || potencia, explicacion: falla ? POS[falla] : potencia ? "Código de alimentación o de la computadora." : "" };
  };

  /**
   * Separa sensor defectuoso, alimentación, tierra, cable abierto, corto, conector o computadora.
   * med: { alimentacion: V, referencia_spec, tierra: V, bateria: V, continuidad_senal: "si"|"no", corto_tierra: "si"|"no",
   *        resistencia: Ω, resistencia_spec: {min,max,fuente}, conector: "bien"|"mal", senal_ok: true|false|null }
   */
  S.diferenciarFalla = function (componente, med = {}) {
    const d = S.COMPONENTES_ELECTRICOS[componente] || { nombre: componente, circuitos: ["alimentacion", "tierra", "senal"] };
    const vb = Number(med.bateria) > 6 ? Number(med.bateria) : 12;
    const usaAlim = d.circuitos.some((x) => x === "alimentacion" || x === "referencia");
    const descartado = [], pendiente = [];
    const out = (id, texto, certeza, siguiente, no_cambiar) => ({ id, texto, certeza, descartado, pendiente, siguiente, no_cambiar: no_cambiar || "" });
    if (med.conector === "mal") return out("conector", `Conector de ${d.nombre} con daño o falso contacto.`, "confirmada", "Limpiá o repará los terminales y repetí la lectura.", "El componente: primero repará el conector.");
    if (med.conector === "bien") descartado.push("Conector (inspección)");
    // Alimentación
    if (usaAlim) {
      if (med.alimentacion == null) pendiente.push("Alimentación/referencia en el conector (llave en ON)");
      else if (med.alimentacion < 0.5) return out("sin_alimentacion", `No llega alimentación a ${d.nombre} (${r2(med.alimentacion)} V).`, "confirmada",
        d.ref5v ? "La referencia la da la computadora y suele ser compartida: desconectá los otros sensores que la usan uno por uno; si vuelve, uno de ellos la está poniendo en corto. Si no vuelve, revisá el cable y la computadora." : "Revisá el fusible y el relé del circuito y el cable de alimentación.",
        "El componente: no tiene alimentación, cambiarlo no lo arregla.");
      else if (med.referencia_spec && (med.alimentacion < med.referencia_spec.min || med.alimentacion > med.referencia_spec.max)) return out("alimentacion_fuera", `La alimentación de ${d.nombre} está fuera de la especificación (${r2(med.alimentacion)} V; ${med.referencia_spec.fuente || "manual"}).`, "confirmada", "Revisá el circuito de alimentación (caídas de voltaje) y la computadora.", "El componente.");
      else descartado.push(`Alimentación (${r2(med.alimentacion)} V${med.referencia_spec ? ", dentro de la especificación" : ", hay voltaje"})`);
    }
    // Tierra
    if (med.tierra == null) pendiente.push("Tierra del componente (caída de voltaje con el circuito funcionando)");
    else if (med.tierra >= 0.8 * vb) return out("tierra_abierta", `La tierra de ${d.nombre} está abierta (${r2(med.tierra)} V de caída).`, "confirmada", "Seguí el cable de tierra hasta su punto de unión; limpiá y apretá.", "El componente.");
    else if (med.tierra_spec && med.tierra > med.tierra_spec.max) return out("tierra_deficiente", `La tierra de ${d.nombre} tiene caída de más (${r2(med.tierra)} V; ${med.tierra_spec.fuente || "manual"}).`, "confirmada", "Limpiá y apretá el punto de tierra.", "El componente.");
    else descartado.push(`Tierra (${r2(med.tierra)} V de caída)`);
    // Cable de señal / control
    if (med.continuidad_senal === "no") return out("cable_abierto", `El cable de señal/control de ${d.nombre} está abierto.`, "confirmada", "Ubicá el corte y repará el cable.", "El componente y la computadora.");
    if (med.continuidad_senal === "si") descartado.push("Cable de señal (continuidad)"); else pendiente.push("Continuidad del cable de señal entre el componente y la computadora (desconectado)");
    if (med.corto_tierra === "si") return out("corto", `El cable de ${d.nombre} tiene corto a tierra.`, "confirmada", "Mové el arnés por tramos midiendo para encontrar el roce.", "El componente y la computadora.");
    if (med.corto_tierra === "no") descartado.push("Corto a tierra");
    // Componente
    if (med.resistencia != null) {
      if (!med.resistencia_spec) pendiente.push(`Comparar la resistencia medida (${r2(med.resistencia)} Ω) con el manual: ${SIN_REF()}`);
      else {
        const s = med.resistencia_spec, dentro = (s.min == null || med.resistencia >= s.min) && (s.max == null || med.resistencia <= s.max);
        if (!dentro) {
          const todoVerificado = (!usaAlim || med.alimentacion != null) && med.tierra != null;
          return out("componente", `${d.nombre}: resistencia fuera de especificación (${r2(med.resistencia)} Ω; ${s.fuente || "manual"}).`, todoVerificado ? "confirmada" : "sospecha",
            todoVerificado ? "Cambiá el componente (alimentación y tierra ya verificadas)." : "Antes de cambiarlo, verificá alimentación y tierra (pendientes).", todoVerificado ? "" : "Todavía no: faltan verificar alimentación y tierra.");
        }
        descartado.push(`Componente (resistencia dentro de especificación: ${r2(med.resistencia)} Ω)`);
      }
    } else if (d.circuitos.includes("senal") || d.circuitos.includes("control")) pendiente.push("Resistencia del componente desconectado (con el valor del manual)");
    if (med.senal_ok === false && !pendiente.length) return out("computadora", `Alimentación, tierra, cables y componente verificados, pero la señal sigue mal: posible problema en la computadora o en un dato de especificación.`, "sospecha", "Confirmá con el manual de servicio antes de condenar la computadora (es lo último).", "La computadora sin una prueba del taller.");
    if (!pendiente.length) return out("sin_falla", `No se encontró falla eléctrica en ${d.nombre} con las mediciones hechas.`, "sospecha", "Si el código sigue, puede ser intermitente: prueba de movimiento con el dato en vivo.", "");
    return out("pendiente", `Faltan mediciones para separar la causa en ${d.nombre}.`, "posibilidad", pendiente[0], "El componente: todavía no hay pruebas suficientes.");
  };

  // ================================================================== causa común (regla que se suma al análisis)
  S.REGLAS_EXTRA = S.REGLAS_EXTRA || [];
  /** Varios circuitos con falla a la vez, voltaje bajo o códigos de alimentación: se buscan causas comunes en vez de tratar cada código aparte. */
  function reglaCausaComun(ctx, out) {
    const { resumen: r, lectura, extra, H } = ctx;
    const codigos = ((lectura && lectura.codigos) || []).map((c) => ({ ...S.clasificarCodigoElectrico(c.codigo), tipo: c.tipo }));
    const elec = codigos.filter((c) => c.electrico);
    const potencia = codigos.filter((c) => c.potencia);
    const comps = [...new Set(elec.filter((c) => c.componente).map((c) => c.componente))];
    const ve = r && r.voltaje_encendido, va = r && r.voltaje_apagado;
    const vBajo = (ve && ve.n >= 3 && ve.prom < 13.0) || (va && va.n >= 3 && va.prom < 12.2);
    const con = (extra && extra.conexion) || {};
    const perdidas = (con.perdidas || 0) > 0, reinicios = (con.reinicios || 0) > 0;
    const ref5 = elec.filter((c) => c.componente && S.COMPONENTES_ELECTRICOS[c.componente].ref5v && c.falla === "bajo");
    const tierraSens = elec.filter((c) => c.falla === "alto" && c.componente && ["ect", "iat", "map", "tps"].includes(c.componente));
    // Una sola señal (por ejemplo, solo P0562 con voltaje bajo) ya la cubre su propia regla: aquí se buscan VARIAS a la vez.
    const disparo = comps.length >= 2 || (potencia.length && (comps.length >= 1 || perdidas || reinicios)) || (vBajo && comps.length >= 1) || ((perdidas || reinicios) && (comps.length >= 1 || vBajo));
    if (!disparo) return;
    const ev = [];
    if (elec.length) ev.push(`Códigos de circuito: ${elec.map((c) => `${c.codigo} (${c.tipo === "pendiente" ? "pendiente" : "confirmado"})`).join(", ")}`);
    if (potencia.length) ev.push(`Códigos de alimentación o computadora: ${potencia.map((c) => c.codigo).join(", ")}`);
    if (ve && ve.n >= 3) ev.push(`Voltaje con motor encendido (OBD): ${ve.prom.toFixed(2)} V`);
    if (va && va.n >= 3) ev.push(`Voltaje con motor apagado (OBD): ${va.prom.toFixed(2)} V`);
    if (perdidas) ev.push("La computadora dejó de responder durante la lectura");
    if (reinicios) ev.push("El adaptador se reinició (caída de voltaje en el conector OBD)");
    const hip = [];
    if (ref5.length >= 2) hip.push({ causa: `Referencia de 5 V compartida (${ref5.map((c) => c.codigo).join(", ")})`, por_que: "Varios sensores de 3 cables con señal baja al mismo tiempo: suele ser la referencia en corto (por un sensor o cable) o sin salida desde la computadora." });
    if (tierraSens.length >= 2) hip.push({ causa: "Tierra de sensores", por_que: `Varios sensores con señal alta a la vez (${tierraSens.map((c) => c.codigo).join(", ")}): típico de tierra de sensores abierta.` });
    hip.push({ causa: "Batería", por_que: va && va.n >= 3 && va.prom < 12.2 ? `Voltaje con motor apagado bajo (${va.prom.toFixed(2)} V).` : "Sin indicio directo en los datos; descartala con multímetro." });
    hip.push({ causa: "Alternador / regulador", por_que: ve && ve.n >= 3 ? (ve.prom < 13 ? `Voltaje con motor encendido bajo (${ve.prom.toFixed(2)} V).` : `Voltaje con motor encendido normal (${ve.prom.toFixed(2)} V): menos probable.`) : "Sin lectura de voltaje con motor encendido." });
    hip.push({ causa: "Fusible principal o de la computadora", por_que: perdidas ? "La computadora dejó de responder: puede faltarle alimentación." : "Revisalo con voltaje en ambos lados." });
    hip.push({ causa: "Relé principal de la computadora (en Honda: PGM-FI)", por_que: perdidas || reinicios ? "Cortes de alimentación intermitentes son típicos de un relé principal con soldaduras agrietadas." : "Posible si las fallas aparecen y desaparecen, sobre todo con calor." });
    hip.push({ causa: "Tierras del motor o de la computadora", por_que: comps.length >= 2 ? `Varios circuitos distintos (${comps.map((c) => S.COMPONENTES_ELECTRICOS[c].nombre).join(", ")}) a la vez.` : "Revisala con caída de voltaje." });
    const fuentes = [elec.length || potencia.length ? "computadora" : null, vBajo ? "vivo" : null];
    const n = new Set(fuentes.filter(Boolean)).size;
    out.push(H("causa_comun_electrica", "media", "Varias señales eléctricas a la vez: buscar una causa común antes de cambiar piezas",
      "No conviene tratar cada código como una avería separada. Cuando varios circuitos fallan juntos, o hay voltaje bajo y códigos de circuito, suele haber una causa común en la alimentación o las tierras.",
      ev, {
        certeza: n >= 2 ? "sospecha" : "posibilidad", urgencia: "pronto",
        condiciones: "Datos OBD y códigos leídos. El voltaje OBD es orientativo.",
        referencia: "Las hipótesis se confirman con mediciones: voltaje en ambos lados de los fusibles, caída de voltaje en tierras y alimentación de los sensores.",
        causas: hip, distinguir: "El OBD no ve fusibles, relés ni tierras: solo sus consecuencias. La separación se hace en 'Sistema eléctrico' con multímetro.",
        prueba: "En 'Sistema eléctrico': 1) voltaje en bornes (reposo y motor encendido), 2) fusibles principales y de la computadora (voltaje en ambos lados), 3) caída de voltaje en las tierras, 4) alimentación de los sensores con código.",
        esperado: "Si hay una causa común, al corregirla desaparecen varios síntomas o códigos a la vez. Si las mediciones salen normales, se sigue con cada código por separado.",
        no_cambiar: "Los sensores de cada código: primero descartá la causa común.", donde: "ambos" }));
  }
  S.REGLAS_EXTRA.push(reglaCausaComun);
  S.reglaCausaComun = reglaCausaComun;

  // ================================================================== diagnóstico eléctrico integrado
  /**
   * ctx: { variante, inspeccion:{fusibles:{}, reles:{}}, mediciones:[], obd:{codigos:[{codigo,tipo}], resumen}, sintomas:[], pruebas:[], carro, componentes:{id: med} }
   * Devuelve qué se sabe, qué se sospecha, qué no se puede determinar y qué prueba hace falta.
   */
  S.diagnosticoElectrico = function (ctx = {}) {
    const sabe = [], sospecha = [], no_determina = [], pruebas = [];
    const add = (l, id, texto, extra = {}) => { if (!l.some((x) => x.id === id)) l.push({ id, texto, ...extra }); };
    const variante = ctx.variante, insp = (ctx.inspeccion && ctx.inspeccion.fusibles) || {};
    const docs = S.fusiblesDe ? S.fusiblesDe(variante) : [];
    const docDe = (id) => docs.find((f) => f.id === id) || null;
    const evaluados = [];
    for (const [id, i] of Object.entries(insp)) {
      const doc = docDe(id), e = S.evaluarFusible(doc, i);
      evaluados.push({ id, doc, insp: i, e });
      const nombre = doc ? `${id} (${doc.nombre})` : id;
      if (e.estado === "quemado") { add(sabe, `fusible_quemado:${id}`, `El fusible ${nombre} está abierto.`); add(no_determina, `por_que_quemo:${id}`, `Por qué se quemó ${nombre}: el fusible solo muestra el efecto.`); add(pruebas, `reemplazar:${id}`, `Reemplazar ${id} por uno del mismo amperaje${doc && doc.amperaje ? ` (${doc.amperaje} A)` : ""} y probar el circuito.`); }
      if (e.estado === "quemado_probable") { add(sospecha, `fusible_quemado_probable:${id}`, `El fusible ${nombre} parece quemado (sin confirmar).`); add(pruebas, `confirmar_fusible:${id}`, `Confirmar ${id} con continuidad (fuera) o voltaje en ambos lados.`); }
      if (e.estado === "ausente") { add(sabe, `fusible_ausente:${id}`, `Falta el fusible ${nombre}.`); add(no_determina, `por_que_falta:${id}`, `Si lo sacaron a propósito (por ejemplo, porque se quemaba).`); add(pruebas, `poner:${id}`, `Confirmar el amperaje con la tapa y poner el fusible ${id}.`); }
      if (e.estado === "amperaje") { add(sabe, `amperaje_distinto:${id}`, `En ${nombre} hay ${i.amperaje_obs} A; la documentación dice ${doc && doc.amperaje} A.`);
        if (e.verificacion !== "dueno" && e.verificacion !== "oem") add(no_determina, `doc_aplica:${id}`, `Si la documentación de ${id} corresponde a tu variante (no está confirmada con la tapa).`);
        if (Number(i.amperaje_obs) > (doc && doc.amperaje)) add(sospecha, `falla_tapada:${id}`, `Alguien pudo poner un fusible más grande porque el original se quemaba: posible falla en ${doc ? doc.circuito : "ese circuito"}.`);
        add(pruebas, `amperaje_correcto:${id}`, `Confirmar con la tapa y poner el amperaje documentado en ${id} (nunca uno más grande).`); }
      if (e.estado === "desconocida") add(no_determina, `config:${id}`, `${PEND()} (${nombre}).`);
      if (e.estado === "contacto") { add(sospecha, `falso_contacto:${id}`, `Posible falso contacto en la posición ${id}.`); add(pruebas, `caida_fusible:${id}`, `Medir la caída de voltaje a través de ${id} con el circuito funcionando.`); }
      if (e.se_quema) { add(sabe, `se_quema:${id}`, `${nombre} se ha quemado ${i.veces_quemado} veces.`); add(sospecha, `corto:${id}`, `Corto a tierra o consumo excesivo en ${doc ? doc.circuito : "ese circuito"}.`); add(pruebas, `corto_tierra:${id}`, `Prueba 'Corto a tierra' en el circuito de ${id} con el fusible fuera y el componente desconectado.`); }
    }
    for (const x of S.detectarIntercambios(variante, insp)) add(sospecha, `intercambio:${x.a}:${x.b}`, x.texto);
    // Relés
    for (const [id, r] of Object.entries((ctx.inspeccion && ctx.inspeccion.reles) || {})) {
      const rel = (S.relesDe ? S.relesDe(variante) : []).find((x) => x.id === id);
      const nombre = rel ? rel.nombre : id;
      if (r.resultado === "mejora") { add(sabe, `rele_falla:${id}`, `${nombre}: con un relé idéntico el sistema funciona; el original falla.`); add(pruebas, `cambiar_rele:${id}`, `Cambiar ${nombre} por uno del mismo número de parte.`); }
      if (r.resultado === "igual") add(sabe, `rele_ok:${id}`, `${nombre}: con un relé idéntico sigue igual; el relé no parece la causa.`);
      if (rel && !rel.posicion) add(no_determina, `rele_pos:${id}`, `La posición exacta de ${nombre} en la caja (no está documentada).`);
    }
    // Mediciones
    for (const m of ctx.mediciones || []) {
      const p = S.pruebaCircuito(m.prueba);
      if (!p) continue;
      const e = S.evaluarMedicion(m, m.spec || S.especificacionPara({ variante, carro: ctx.carro, prueba: m.prueba, componente: m.componente, condicion: m.condicion }));
      const donde = m.componente ? ` (${m.componente})` : "";
      if (e.veredicto === "fuera") {
        add(sabe, `medicion_fuera:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`);
        if (p.id === "alimentacion_componente") add(sospecha, `alim:${m.componente}`, `Falta alimentación en ${m.componente}: fusible, relé, cable o referencia compartida.`);
        if (p.id === "corto_tierra") add(pruebas, `ubicar_corto:${m.componente || ""}`, "Mover el arnés por tramos midiendo para ubicar el corto.");
        if (p.id === "continuidad_cable") add(pruebas, `reparar_cable:${m.componente || ""}`, "Ubicar y reparar el cable abierto; no cambiar el componente por esto.");
      } else if (e.veredicto === "dentro") add(sabe, `medicion_ok:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`);
      else if (e.veredicto === "orientativo_alto") { add(sospecha, `medicion_guia:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`); add(no_determina, `sin_spec:${m.prueba}`, `El límite exacto del fabricante para '${p.nombre}' (se usó una guía general).`); }
      else if (e.veredicto === "sin_referencia") { add(no_determina, `sin_spec:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${SIN_REF()}.`); }
    }
    // Componentes (sensor / actuador)
    for (const [comp, med] of Object.entries(ctx.componentes || {})) {
      const r = S.diferenciarFalla(comp, med);
      const nombre = (S.COMPONENTES_ELECTRICOS[comp] || {}).nombre || comp;
      if (r.certeza === "confirmada") add(sabe, `componente:${comp}:${r.id}`, r.texto); else if (r.id !== "pendiente" && r.id !== "sin_falla") add(sospecha, `componente:${comp}:${r.id}`, r.texto);
      if (r.pendiente.length) add(no_determina, `componente_pend:${comp}`, `${nombre}: falta ${r.pendiente.join("; ")}.`);
      if (r.siguiente) add(pruebas, `componente_sig:${comp}`, r.siguiente);
      if (r.no_cambiar) add(no_determina, `no_cambiar:${comp}`, `No cambiar todavía: ${r.no_cambiar}`);
    }
    // Códigos OBD
    const codigos = ((ctx.obd && ctx.obd.codigos) || []).map((c) => ({ ...S.clasificarCodigoElectrico(c.codigo || c), tipo: c.tipo }));
    for (const c of codigos.filter((x) => x.electrico)) {
      add(sabe, `codigo:${c.codigo}`, `La computadora reporta ${c.codigo}${c.descripcion ? ` (${c.descripcion})` : ""}${c.tipo === "pendiente" ? " como pendiente" : ""}.`);
      if (c.explicacion) add(sospecha, `codigo_circ:${c.codigo}`, `${c.codigo}: ${c.explicacion}`);
      const fus = variante ? S.fusiblesParaCodigo(variante, c.codigo) : [];
      if (fus.length) add(pruebas, `fusible_codigo:${c.codigo}`, `Revisar ${fus.map((f) => `${f.id} (${f.nombre})`).join(", ")}: relación posible por el nombre del circuito, no confirmada.`);
      else add(no_determina, `fusible_codigo:${c.codigo}`, `Qué fusible alimenta el circuito de ${c.codigo}: la tabla de fusibles no lo identifica; requiere el diagrama eléctrico.`);
      if (c.componente) add(pruebas, `flujo:${c.componente}`, `Seguir el flujo de ${S.COMPONENTES_ELECTRICOS[c.componente].nombre}: alimentación → tierra → cable → componente.`);
    }
    // Batería y carga
    const carga = S.evaluarSistemaCarga({ resumen: ctx.obd && ctx.obd.resumen, mediciones: ctx.mediciones, pruebas: ctx.pruebas, sintomas: ctx.sintomas, carro: ctx.carro, variante, historialVoltajes: ctx.historialVoltajes });
    for (const h of carga.hechos) add(sabe, `carga_hecho:${h.id}`, h.texto);
    for (const h of carga.hipotesis.filter((x) => x.apoyo.length)) {
      add(sospecha, `carga:${h.id}`, `${h.titulo} (${h.certeza}): ${h.apoyo.join("; ")}.`);
      add(pruebas, `carga_sig:${h.id}`, h.siguiente);
      if (h.nota) add(no_determina, `carga_obd:${h.id}`, `${h.titulo}: ${h.nota}`);
    }
    if (carga.hipotesis.some((h) => h.id === "bateria" && h.apoyo.length)) add(no_determina, "bateria_interna", "El estado interno de la batería (necesita un probador de carga o de conductancia).");
    // Causa común
    const cc = []; const Hs = (id, g, t, d, ev, x) => ({ id, gravedad: g, titulo: t, detalle: d, evidencia: ev, ...x });
    reglaCausaComun({ resumen: (ctx.obd && ctx.obd.resumen) || {}, lectura: { codigos: (ctx.obd && ctx.obd.codigos) || [] }, extra: { conexion: ctx.conexion }, H: Hs }, cc);
    for (const h of cc) { add(sospecha, h.id, h.titulo, { causas: h.causas }); add(pruebas, `${h.id}_prueba`, h.prueba); }
    // Siempre
    if (!variante) add(no_determina, "sin_ficha", "No hay una ficha técnica verificada para este carro: los fusibles y relés hay que tomarlos de la etiqueta de la tapa.");
    add(no_determina, "limite_obd", "El ELM327 no puede revisar físicamente fusibles, relés, tierras ni cables: solo ve lo que reporta la computadora del motor.");
    return { sabe, sospecha, no_determina, pruebas, fusibles: evaluados, carga };
  };

  // ================================================================== casos simulados (para practicar y para las pruebas automáticas)
  S.CASOS_ELECTRICOS = {
    fusible_quemado: { nombre: "Fusible quemado", descripcion: "Los limpiaparabrisas delanteros dejaron de funcionar.", sintomas: [],
      inspeccion: { fusibles: { "INT-26": { estado: "quemado", metodo: "continuidad" } } }, mediciones: [{ prueba: "fusible_continuidad", componente: "INT-26", valor: "no" }],
      espera: { sabe: ["fusible_quemado:INT-26"], sospecha: [], no_determina: ["por_que_quemo:INT-26"], pruebas: ["reemplazar:INT-26"] } },
    fusible_ausente: { nombre: "Fusible ausente", descripcion: "No encienden las luces de reversa.", sintomas: [],
      inspeccion: { fusibles: { "INT-19": { estado: "ausente", metodo: "visual" } } }, mediciones: [],
      espera: { sabe: ["fusible_ausente:INT-19"], sospecha: [], no_determina: ["por_que_falta:INT-19"], pruebas: ["poner:INT-19"] } },
    fusible_amperaje: { nombre: "Fusible de amperaje incorrecto", descripcion: "En la posición del ventilador del radiador hay un fusible de 30 A.", sintomas: [],
      inspeccion: { fusibles: { "MOT-11": { estado: "bien", metodo: "visual", amperaje_obs: 30 } } }, mediciones: [],
      espera: { sabe: ["amperaje_distinto:MOT-11"], sospecha: ["falla_tapada:MOT-11"], no_determina: ["doc_aplica:MOT-11"], pruebas: ["amperaje_correcto:MOT-11"] } },
    rele_defectuoso: { nombre: "Relé defectuoso", descripcion: "El A/C no enfría; con otro relé idéntico el compresor engancha.", sintomas: [],
      inspeccion: { fusibles: { "INT-17": { estado: "bien", metodo: "voltaje" } }, reles: { "MOT-R-AC": { resultado: "mejora" } } }, mediciones: [{ prueba: "rele_intercambio", componente: "MOT-R-AC", valor: "mejora" }],
      espera: { sabe: ["rele_falla:MOT-R-AC"], sospecha: [], no_determina: ["rele_pos:MOT-R-AC"], pruebas: ["cambiar_rele:MOT-R-AC"] } },
    tierra_deficiente: { nombre: "Tierra deficiente", descripcion: "Arranque lento; la caída en la tierra del motor es alta.", sintomas: ["arranque_lento"],
      mediciones: [{ prueba: "caida_tierra", circuito: "arranque", valor: 0.9 }, { prueba: "caida_positivo", circuito: "arranque", valor: 0.2 }],
      espera: { sabe: [], sospecha: ["medicion_guia:caida_tierra:", "carga:conexiones"], no_determina: ["sin_spec:caida_tierra"], pruebas: [] } },
    bateria_baja: { nombre: "Batería baja", descripcion: "En reposo marca 12.0 V; con el motor encendido carga normal.", sintomas: ["arranque_lento"],
      obd: { resumen: { voltaje_encendido: { n: 30, prom: 14.1 } } }, mediciones: [{ prueba: "voltaje_bornes", condicion: "reposo", valor: 12.0 }],
      espera: { sabe: ["carga_hecho:bateria_descargada"], sospecha: ["carga:bateria"], no_determina: ["bateria_interna"], pruebas: ["carga_sig:bateria"] } },
    alternador_defectuoso: { nombre: "Alternador que no carga", descripcion: "Con el motor a 2000 rpm y cargas, los bornes marcan 12.4 V; cables bien.", sintomas: ["luz_carga"],
      obd: { codigos: [], resumen: { voltaje_encendido: { n: 30, prom: 12.3 } } },
      mediciones: [{ prueba: "voltaje_bornes", condicion: "2000_cargas", valor: 12.4 }, { prueba: "caida_positivo", circuito: "carga", valor: 0.1 }, { prueba: "caida_tierra", circuito: "carga", valor: 0.1 }],
      espera: { sabe: ["carga_hecho:no_carga"], sospecha: ["carga:alternador"], no_determina: [], pruebas: ["carga_sig:alternador"] } },
    cable_interrumpido: { nombre: "Cable interrumpido", descripcion: "Código P0118 y el sensor de temperatura marca −40 °C; el cable de señal no tiene continuidad.", sintomas: [],
      obd: { codigos: [{ codigo: "P0118", tipo: "almacenado" }] }, componentes: { ect: { continuidad_senal: "no" } },
      mediciones: [{ prueba: "continuidad_cable", componente: "ect", valor: "no" }],
      espera: { sabe: ["componente:ect:cable_abierto", "codigo:P0118"], sospecha: ["codigo_circ:P0118"], no_determina: [], pruebas: ["reparar_cable:ect"] } },
    cortocircuito: { nombre: "Cortocircuito", descripcion: "El fusible del vidrio trasero izquierdo se quema cada vez; hay continuidad a tierra con el motor desconectado.", sintomas: ["fusible_se_quema"],
      inspeccion: { fusibles: { "INT-7": { estado: "quemado", metodo: "continuidad", veces_quemado: 3 } } }, mediciones: [{ prueba: "corto_tierra", componente: "INT-7", valor: "si" }],
      espera: { sabe: ["se_quema:INT-7", "medicion_fuera:corto_tierra:INT-7"], sospecha: ["corto:INT-7"], no_determina: [], pruebas: ["ubicar_corto:INT-7"] } },
    sensor_sin_alimentacion: { nombre: "Sensor sin alimentación", descripcion: "Códigos P0107 y P0122; el MAP y el TPS no tienen referencia.", sintomas: [],
      obd: { codigos: [{ codigo: "P0107", tipo: "almacenado" }, { codigo: "P0122", tipo: "almacenado" }] }, componentes: { map: { alimentacion: 0.0 }, tps: { alimentacion: 0.0 } },
      mediciones: [{ prueba: "alimentacion_componente", componente: "map", valor: 0.0 }],
      espera: { sabe: ["componente:map:sin_alimentacion", "componente:tps:sin_alimentacion"], sospecha: ["causa_comun_electrica"], no_determina: [], pruebas: ["componente_sig:map"] } },
    resistencia_fuera: { nombre: "Resistencia fuera de especificación", descripcion: "Un sensor mide fuera del valor (EJEMPLO del caso simulado: no es un valor real de ningún carro).", sintomas: [],
      componentes: { ect: { alimentacion: null, tierra: 0.05, continuidad_senal: "si", resistencia: 95000, resistencia_spec: { min: 2000, max: 3000, fuente: "Valor de EJEMPLO del caso simulado" } } },
      mediciones: [{ prueba: "resistencia_componente", componente: "ect", valor: 95000, spec: { min: 2000, max: 3000, fuente: "Valor de EJEMPLO del caso simulado" } }],
      espera: { sabe: ["componente:ect:componente", "medicion_fuera:resistencia_componente:ect"], sospecha: [], no_determina: [], pruebas: ["componente_sig:ect"] } },
    conector_defectuoso: { nombre: "Conector defectuoso", descripcion: "La temperatura salta al mover el conector; hay sulfato.", sintomas: ["falla_intermitente"],
      componentes: { ect: { conector: "mal" } }, mediciones: [{ prueba: "conector", componente: "ect", conector: { sulfato: true, movimiento: true } }],
      espera: { sabe: ["componente:ect:conector", "medicion_fuera:conector:ect"], sospecha: [], no_determina: [], pruebas: ["componente_sig:ect"] } },
  };
  /** Corre un caso simulado contra una variante (por defecto, la del Honda CR-V 2000). */
  S.correrCasoElectrico = function (id, variante) {
    const c = S.CASOS_ELECTRICOS[id];
    if (!c) throw new Error("Caso desconocido");
    const v = variante || (S.FICHAS_TECNICAS && S.FICHAS_TECNICAS[0] && S.FICHAS_TECNICAS[0].variantes[0]) || null;
    return S.diagnosticoElectrico({ variante: v, inspeccion: c.inspeccion || {}, mediciones: c.mediciones || [], obd: c.obd || {}, sintomas: c.sintomas || [], componentes: c.componentes || {} });
  };

  // ================================================================== fotos (IA)
  S.PROMPT_FOTO_ELECTRICA = `Sos un asistente que mira fotos de cajas de fusibles, fusibles, relés, conectores, cableado y etiquetas de tapas de un carro.
Respondé SOLO con JSON válido, sin texto antes ni después, con esta forma:
{"que_se_ve":"","etiqueta_tapa":[{"posicion":"","amperaje":null,"texto":"","certeza":"confirmada|probable|insuficiente"}],
 "elementos":[{"posicion":"","tipo":"fusible|rele|conector|cable|otro","amperaje_visto":null,"color_visto":"","estado_visual":"sin_dano_visible|filamento_cortado_visible|derretido_o_quemado|sulfato|flojo_o_fuera_de_lugar|no_se_ve","certeza":"confirmada|probable|insuficiente|requiere_fisica","nota":""}],
 "comparacion":[{"posicion":"","documentado":"","visto":"","coincide":null,"certeza":"confirmada|probable|insuficiente"}],
 "limitaciones":[""],"siguiente":""}
Reglas:
1. "confirmada" solo si el número de posición o el amperaje se LEE con claridad en la foto. Si lo deducís por el color o la forma, es "probable". Si no se ve bien, "insuficiente".
2. Nunca digas que un fusible está quemado solo por la foto. Si se ve claramente el filamento cortado, usá "filamento_cortado_visible" con certeza "requiere_fisica" y pedí confirmarlo con multímetro o probador.
3. La documentación que te paso puede NO corresponder a la variante del carro. Si la etiqueta de la tapa dice otra cosa, la etiqueta manda: decilo en "comparacion".
4. No inventes posiciones, amperajes, colores de cable ni componentes que no se vean.
5. Nunca recomiendes un fusible de mayor amperaje ni puentear fusibles.
6. No sugieras medir en circuitos de bolsas de aire (SRS, conectores amarillos).`;

  /** Texto de contexto para la IA: qué documentación hay para esa caja (con su nivel de verificación). */
  S.contextoFotoElectrica = function ({ ficha, variante, caja, que }) {
    const c = variante && (variante.cajas || []).find((x) => x.id === caja);
    let t = `Carro: ${ficha ? `${ficha.marca} ${ficha.modelo} ${ficha.anios}` : "sin ficha técnica"}. Variante supuesta: ${variante ? variante.nombre : "desconocida"}.\n`;
    t += `Qué muestra la foto (según el usuario): ${que || "no lo dijo"}.\n`;
    if (c) {
      t += `Documentación de "${c.nombre}" (${c.ubicacion}). NO está confirmada con la tapa de este carro:\n`;
      for (const f of c.fusibles || []) t += `- ${f.numero}: ${f.amperaje ? f.amperaje + " A" : "sin uso"} · ${f.nombre} [${(S.VERIFICACION[f.verificacion] || {}).nombre || f.verificacion}]\n`;
    } else t += "No hay documentación para esa caja: describí solo lo que se ve.\n";
    return t + "\nMirá la foto y respondé con el JSON.";
  };

  const CERTEZAS_FOTO = ["confirmada", "probable", "insuficiente", "requiere_fisica"];
  /** Normaliza la respuesta de la IA: certezas válidas, nunca 'quemado confirmado' por una foto. */
  S.interpretarFotoElectrica = function (texto) {
    let d = {};
    try { d = typeof texto === "string" ? JSON.parse(String(texto).replace(/^[^{]*/, "").replace(/[^}]*$/, "")) : texto || {}; } catch (e) { return { error: "La IA no devolvió un JSON válido.", elementos: [], etiqueta_tapa: [], comparacion: [], limitaciones: ["Respuesta ilegible: volvé a intentar con otra foto."] }; }
    const cert = (c, def = "insuficiente") => (CERTEZAS_FOTO.includes(c) ? c : def);
    const elementos = (Array.isArray(d.elementos) ? d.elementos : []).map((e) => {
      const x = { posicion: String(e.posicion || ""), tipo: String(e.tipo || "otro"), amperaje_visto: e.amperaje_visto != null && !isNaN(Number(e.amperaje_visto)) ? Number(e.amperaje_visto) : null,
        color_visto: String(e.color_visto || ""), estado_visual: String(e.estado_visual || "no_se_ve"), certeza: cert(e.certeza), nota: String(e.nota || "") };
      if (/quemad|cortad|derretid/.test(x.estado_visual) && x.certeza === "confirmada") x.certeza = "requiere_fisica";
      return x;
    });
    return {
      que_se_ve: String(d.que_se_ve || ""),
      etiqueta_tapa: (Array.isArray(d.etiqueta_tapa) ? d.etiqueta_tapa : []).map((e) => ({ posicion: String(e.posicion || ""), amperaje: e.amperaje != null && !isNaN(Number(e.amperaje)) ? Number(e.amperaje) : null, texto: String(e.texto || ""), certeza: cert(e.certeza) })),
      elementos,
      comparacion: (Array.isArray(d.comparacion) ? d.comparacion : []).map((e) => ({ posicion: String(e.posicion || ""), documentado: String(e.documentado || ""), visto: String(e.visto || ""), coincide: e.coincide === true ? true : e.coincide === false ? false : null, certeza: cert(e.certeza) })),
      limitaciones: (Array.isArray(d.limitaciones) ? d.limitaciones : []).map(String),
      siguiente: String(d.siguiente || ""),
    };
  };

  /** Sugerencias para la inspección a partir de la foto (el dueño las acepta o no). Nunca marca un fusible como quemado confirmado. */
  S.sugerenciasDeFoto = function (resultado, variante, caja) {
    const docs = (S.fusiblesDe ? S.fusiblesDe(variante) : []).filter((f) => !caja || f.caja === caja);
    const out = [];
    for (const e of (resultado && resultado.elementos) || []) {
      if (e.tipo !== "fusible" || e.certeza === "insuficiente") continue;
      const num = Number(String(e.posicion).replace(/\D/g, ""));
      const doc = docs.find((f) => f.numero === num);
      if (!doc) continue;
      const s = { id: doc.id, certeza: e.certeza, cambios: { metodo: "foto_ia" }, texto: "" };
      if (e.amperaje_visto != null) { s.cambios.amperaje_obs = e.amperaje_visto; s.texto += `Se ve ${e.amperaje_visto} A. `; }
      if (/cortad|quemad|derretid/.test(e.estado_visual)) { s.cambios.estado = "quemado"; s.texto += "Parece quemado (confirmalo con multímetro). "; }
      else if (e.estado_visual === "sin_dano_visible") { s.cambios.estado = "bien"; s.texto += "Sin daño visible. "; }
      if (e.estado_visual === "sulfato" || e.estado_visual === "flojo_o_fuera_de_lugar") { s.cambios.falso_contacto = true; s.texto += "Sulfato o terminal flojo. "; }
      if (Object.keys(s.cambios).length > 1) out.push(s);
    }
    return out;
  };

  // ================================================================== búsqueda
  /** Busca por componente, circuito, fusible o código de falla en la ficha y en los diagramas del dueño. */
  S.buscarElectrico = function ({ variante, consulta, diagramas = [], ficha }) {
    const q = norm(consulta).trim();
    if (!q) return [];
    const res = [];
    const cod = q.toUpperCase().match(/^[PBCU][0-9A-F]{4}$/);
    if (cod) {
      const c = S.clasificarCodigoElectrico(cod[0]);
      res.push({ tipo: "codigo", id: c.codigo, titulo: `${c.codigo}${c.descripcion ? " · " + c.descripcion : ""}`, detalle: c.explicacion || "Sin relación eléctrica directa conocida." });
      if (c.componente) res.push({ tipo: "componente", id: c.componente, titulo: S.COMPONENTES_ELECTRICOS[c.componente].nombre, detalle: S.COMPONENTES_ELECTRICOS[c.componente].tipo });
      for (const f of S.fusiblesParaCodigo(variante, c.codigo)) res.push({ tipo: "fusible", id: f.id, titulo: `${f.id} · ${f.amperaje ? f.amperaje + " A · " : ""}${f.nombre}`, detalle: `Relación posible por el nombre del circuito (no confirmada). ${f.caja_nombre}.` });
    }
    const numero = q.replace(/^(f|fusible|int-|mot-|abs-)\s*/, "");
    for (const f of S.fusiblesDe ? S.fusiblesDe(variante) : []) {
      const txt = norm(`${f.id} ${f.nombre} ${f.circuito} ${(f.componentes || []).join(" ")} ${(f.sintomas || []).join(" ")}`);
      if (txt.includes(q) || (/^\d+$/.test(numero) && String(f.numero) === numero)) res.push({ tipo: "fusible", id: f.id, titulo: `${f.id} · ${f.amperaje ? f.amperaje + " A · " : ""}${f.nombre}`, detalle: `${f.caja_nombre}: ${f.circuito}` });
    }
    for (const r of S.relesDe ? S.relesDe(variante) : []) if (norm(`${r.id} ${r.nombre} ${r.nota}`).includes(q)) res.push({ tipo: "rele", id: r.id, titulo: r.nombre, detalle: `${r.caja_nombre}. ${r.nota || ""}` });
    for (const [id, cmp] of Object.entries(S.COMPONENTES_ELECTRICOS)) if (norm(`${id} ${cmp.nombre} ${cmp.tipo}`).includes(q)) res.push({ tipo: "componente", id, titulo: cmp.nombre, detalle: cmp.tipo });
    for (const cm of (ficha && ficha.componentes_motor) || []) if (norm(`${cm.id} ${cm.nombre} ${cm.nota || ""}`).includes(q)) res.push({ tipo: "ficha", id: cm.id, titulo: cm.nombre, detalle: cm.nota || "Componente de la ficha del carro." });
    for (const d of diagramas) if (norm(`${d.titulo} ${d.tipo} ${(d.etiquetas || []).join(" ")} ${d.notas || ""}`).includes(q)) res.push({ tipo: "diagrama", id: d.id, titulo: d.titulo, detalle: `${d.tipo || "Diagrama"} · ${d.fuente || "sin fuente"}` });
    const vistos = new Set();
    return res.filter((x) => { const k = x.tipo + x.id; if (vistos.has(k)) return false; vistos.add(k); return true; });
  };

  S.TIPOS_DIAGRAMA = ["Alimentación", "Arranque", "Carga", "Encendido", "Inyección", "Sensores", "Tierras", "Fusibles", "Relés", "Comunicación entre módulos", "Otro"];

  // ================================================================== informe eléctrico
  S.informeElectrico = function ({ carro, ficha, variante, inspeccion, mediciones, diagramas, componentes, obd, sintomas, pruebas, simulado }) {
    const d = S.diagnosticoElectrico({ variante, inspeccion, mediciones, obd, sintomas, pruebas, carro, componentes });
    const docs = S.fusiblesDe ? S.fusiblesDe(variante) : [];
    const ev = d.fusibles;
    const revisados = ev.filter((x) => x.insp && x.insp.estado && x.insp.estado !== "no_se");
    const incorrectos = ev.filter((x) => ["amperaje", "tipo", "ausente"].includes(x.e.estado) && (x.e.verificacion === "dueno" || x.e.verificacion === "oem"));
    const posibles = ev.filter((x) => ["amperaje", "tipo", "ausente", "quemado", "quemado_probable", "contacto", "desconocida"].includes(x.e.estado));
    const pendientes = docs.filter((f) => !f.libre && !revisados.some((x) => x.id === f.id)).map((f) => f.id);
    const reles = Object.entries((inspeccion && inspeccion.reles) || {}).map(([id, r]) => ({ id, ...r }));
    const malo = d.sabe.some((x) => /^(fusible_quemado|fusible_ausente|se_quema|rele_falla|medicion_fuera|componente|carga_hecho|amperaje_distinto)/.test(x.id));
    return {
      fecha: new Date().toISOString(), simulado: !!simulado,
      carro: carro ? { marca: carro.marca, modelo: carro.modelo, anio: carro.anio, motor: carro.motor } : null,
      ficha: ficha ? { id: ficha.id, nombre: `${ficha.marca} ${ficha.modelo} ${ficha.anios}`, variante: variante && variante.nombre } : null,
      estado_general: malo ? "Hay fallas eléctricas confirmadas" : d.sospecha.length ? "Hay sospechas por confirmar" : revisados.length || (mediciones || []).length ? "Sin fallas encontradas en lo revisado" : "Sin revisar",
      fusibles_revisados: revisados.map((x) => ({ id: x.id, nombre: x.doc && x.doc.nombre, estado: x.e.nombre_estado, metodo: x.insp.metodo, amperaje_obs: x.insp.amperaje_obs ?? null, mensajes: x.e.mensajes })),
      fusibles_pendientes: pendientes,
      fusibles_incorrectos_confirmados: incorrectos.map((x) => x.id),
      fusibles_con_observaciones: posibles.map((x) => ({ id: x.id, estado: x.e.nombre_estado })),
      reles_revisados: reles,
      mediciones: (mediciones || []).map((m) => ({ ...m, evaluacion: S.evaluarMedicion(m, m.spec || S.especificacionPara({ variante, carro, prueba: m.prueba, componente: m.componente, condicion: m.condicion })) })),
      componentes_afectados: [...new Set(d.sabe.concat(d.sospecha).map((x) => (x.id.match(/^componente:([a-z0-9_]+)/) || [])[1]).filter(Boolean))],
      diagramas_consultados: (diagramas || []).map((x) => ({ titulo: x.titulo, tipo: x.tipo, fuente: x.fuente, mercado: x.mercado, anio: x.anio, motor: x.motor, version: x.version })),
      fallas_confirmadas: d.sabe, sospechas: d.sospecha, no_determinado: d.no_determina, pruebas_recomendadas: d.pruebas,
      fuentes_tecnicas: ficha ? ficha.fuentes.map((f) => ({ nombre: f.nombre, url: f.url, tipo: f.tipo, uso: f.uso })) : [],
      limitaciones: ["El ELM327 no revisa fusibles, relés, tierras ni cables: esos datos vienen de tu inspección y tus mediciones.", "Los datos de la ficha no reemplazan la etiqueta de la tapa ni el manual de servicio de tu carro."],
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
