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

  // ================================================================== escala única de evidencia
  /** Toda conclusión del módulo eléctrico lleva uno de estos niveles. */
  S.NIVELES_EVIDENCIA = {
    confirmado: { nombre: "Confirmado", detalle: "Medido o comprobado físicamente, sin contradicciones." },
    probable: { nombre: "Probable", detalle: "Lo indica una observación (a ojo o por foto) o una fuente secundaria; falta confirmarlo." },
    sospechoso: { nombre: "Sospechoso", detalle: "Hipótesis apoyada por evidencia indirecta (códigos, síntomas, voltaje OBD)." },
    no_verificable: { nombre: "No verificable", detalle: "Los datos se contradicen o son imposibles: hay que repetir la medición." },
    requiere_medicion: { nombre: "Requiere medición física", detalle: "Hace falta medir con multímetro o revisar en persona." },
    requiere_documentacion: { nombre: "Requiere documentación técnica", detalle: "Hace falta el manual de servicio o la etiqueta de la tapa de tu caja." },
  };

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
    } else if (insp.estado === "ausente" && doc && doc.opcional) {
      estado = "libre";
      mensajes.push(`Posición de equipo opcional (${nombre}): si tu carro no trae ese equipo, es normal que esté vacía.`);
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
    // Amperaje leído en una foto: nunca cuenta como observado; solo pide mirarlo en persona.
    const deFoto = insp.amperaje_foto != null && insp.amperaje_foto !== "" ? Number(insp.amperaje_foto) : null;
    if (obs == null && deFoto != null && amp && deFoto !== amp) {
      mensajes.push(`La foto sugiere ${deFoto} A (sin confirmar) donde la documentación dice ${amp} A. Mirá el fusible en persona y anotá su amperaje.`);
      if (estado === "correcto" || estado === "pendiente") estado = "desconocida";
    }
    const posibles = doc && doc.amperajes_posibles;
    if (obs != null && posibles && posibles.includes(obs) && obs !== amp) {
      if (estado === "correcto" || estado === "pendiente") estado = "desconocida";
      mensajes.push(`Tiene ${obs} A, que coincide con una de las fuentes (${posibles.join(" A / ")} A). ${PEND()}: confirmalo con la etiqueta de tu tapa.`);
    } else if (obs != null && amp && obs !== amp) {
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
    if (insp.tipo_obs && doc && doc.tipo && norm(insp.tipo_obs) !== norm(doc.tipo)) {
      if (estado === "correcto" || estado === "pendiente") estado = "tipo";
      mensajes.push(`Tipo observado: ${insp.tipo_obs}; documentado: ${doc.tipo}.`);
    } else if (insp.tipo_obs && doc && !doc.tipo) mensajes.push(`Tipo observado: ${insp.tipo_obs}. El tipo de esta posición no está documentado: no se puede comparar.`);

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

    if (doc && doc.opcional && estado !== "libre") mensajes.push("Posición de equipo opcional: solo existe si tu carro trae ese equipo.");
    const e = S.ESTADOS_FUSIBLE[estado];
    const NIVEL = { correcto: metodoFisico ? "confirmado" : "probable", quemado: "confirmado", ausente: "confirmado", quemado_probable: "probable", amperaje: v === "dueno" || v === "oem" ? "confirmado" : "probable",
      tipo: "probable", contacto: "probable", desconocida: "requiere_documentacion", pendiente: "requiere_medicion", libre: "probable" };
    return { estado, nombre_estado: e.nombre, color: e.color, mensajes, acciones, verificacion: v, se_quema: seQuema, nivel: NIVEL[estado] || "requiere_medicion" };
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
    entrada = entrada == null ? null : Number(entrada); salida = salida == null ? null : Number(salida);
    const vb = Number(bateria) > 6 ? Number(bateria) : 12.0;
    const hay = (v) => v != null && v >= 0.8 * vb, nada = (v) => v != null && v < 0.5;
    if (entrada == null || salida == null) return { resultado: "incompleto", texto: "Faltan los dos voltajes." };
    // No importa cuál lado se anotó primero: se ordenan (el lado con voltaje es la entrada).
    [entrada, salida] = [Math.max(entrada, salida), Math.min(entrada, salida)];
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
      referencia_texto: "Criterio general (físico): un cable sano tiene continuidad. Sin continuidad (OL) = cable abierto. Si marca claramente más que con las puntas juntas, hay resistencia de más: hacé una caída de voltaje. Ojo: la continuidad con el multímetro pasa por pocos hilos sanos; un cable casi cortado puede pitar y fallar con carga.",
      causas_fuera: ["Cable cortado o quebrado por dentro", "Terminal suelto o sulfatado en un conector", "Reparación vieja mal hecha"], siguiente_ok: "El cable está bien: revisá el componente o la alimentación.", siguiente_mal: "Ubicá el corte (mové el arnés midiendo) y reparalo. No cambies el sensor ni la computadora por esto." },
    { id: "corto_tierra", nombre: "Corto a tierra", para: "cable", herramienta: "Multímetro en continuidad y en ohmios", energizado: false,
      aislar: AISLAR_RES.concat(["Sacá el fusible del circuito.", "Desconectá TODAS las cargas que alimenta ese fusible (según el diagrama) y apagá sus switches: un bombillo o un motor conectado mide pocos ohmios a tierra y parece un corto."]),
      donde: "Entre el cable del circuito (o el lado de salida del fusible) y tierra (metal limpio).", entrada: "continuidad", invertida: true, referencia: "fisica",
      referencia_texto: "Criterio físico: con TODAS las cargas del fusible desconectadas NO debe haber continuidad a tierra. Si la hay, el cable toca metal en algún punto. Si no sabés qué cargas comparte el fusible, el resultado es solo 'probable'.",
      causas_fuera: ["Cable pelado tocando la carrocería", "Arnés aplastado o rozado (bisagras, bordes)", "Componente en corto (si quedó conectado)"], siguiente_ok: "No hay corto en el cable: si el fusible se quema, revisá el componente (motor trabado, consumo alto).", siguiente_mal: "Mové el arnés por tramos mientras medís para encontrar el punto del corto." },
    { id: "resistencia_componente", nombre: "Resistencia de un sensor, actuador o resistencia", para: "componente", herramienta: "Multímetro en ohmios (y termómetro si es un sensor de temperatura)", energizado: false, aislar: AISLAR_RES.concat(["Desconectá el conector del componente y medí en los terminales del COMPONENTE."]),
      donde: "Entre los terminales del componente que indique el manual.", entrada: "numero", unidad: "Ω", referencia: "fabricante",
      referencia_texto: "Hace falta el valor del manual de servicio para ese componente (y la temperatura para sensores de temperatura).",
      causas_fuera: ["Componente dañado (abierto, en corto o fuera de valor)", "Medición en terminales equivocados", "Temperatura distinta a la del valor del manual"], siguiente_ok: "El componente mide bien: revisá alimentación, tierra y cables.", siguiente_mal: "Antes de cambiarlo, confirmá que mediste los terminales correctos y a la temperatura indicada; revisá también su alimentación y tierra." },
    { id: "alimentacion_componente", nombre: "Alimentación de un componente o sensor", para: "componente", herramienta: "Multímetro en voltios DC", energizado: true, aislar: ["Es VOLTAJE: llave en ON. Mejor por detrás del conector CONECTADO y con el circuito funcionando (sin perforar cables): desconectado, un cable con resistencia de más igual marca el voltaje completo.",
        "Algunos circuitos solo tienen voltaje unos segundos o en ciertas condiciones (por ejemplo, la bomba al poner la llave): 0 V fuera de ese momento puede ser normal."],
      donde: "Entre el terminal de alimentación (o de referencia) del conector y una buena tierra (el borne negativo).", entrada: "numero", unidad: "V", referencia: "fabricante", fisica_cero: true,
      referencia_texto: "El valor correcto (por ejemplo, una referencia de 5 V o voltaje de batería) depende del fabricante y del componente. Criterio físico: 0 V = no llega alimentación.",
      causas_fuera: ["Fusible o relé del circuito", "Cable de alimentación abierto", "Referencia en corto por otro sensor que la comparte", "Computadora sin alimentación"], siguiente_ok: "Llega alimentación: revisá la tierra y la señal.", siguiente_mal: "Revisá fusible, relé y el cable de alimentación. No cambies el componente." },
    { id: "tierra_componente", nombre: "Tierra de un componente (caída de voltaje)", para: "conexion", herramienta: "Multímetro en voltios DC", energizado: true, aislar: ["Es VOLTAJE con el circuito funcionando."],
      donde: "Punta roja en el terminal de tierra del componente; punta negra en el borne negativo de la batería.", entrada: "numero", unidad: "V", referencia: "fabricante", fisica_abierta: true,
      referencia_texto: "Debe ser muy baja; el límite exacto depende del fabricante. Criterio físico: si se acerca al voltaje que alimenta ese circuito (batería, o la referencia de ~5 V en sensores), la tierra está abierta.",
      causas_fuera: ["Punto de tierra flojo, oxidado o pintado", "Cable de tierra dañado"], siguiente_ok: "La tierra está bien.", siguiente_mal: "Limpiá y apretá el punto de tierra; repetí la medición." },
    { id: "caida_positivo", nombre: "Caída de voltaje en el positivo", para: "conexion", herramienta: "Multímetro en voltios DC (y un ayudante si es el arranque)", energizado: true, aislar: ["Es VOLTAJE con el circuito funcionando (por ejemplo, mientras el ayudante da arranque). Manos lejos de piezas que giran."],
      donde: "Entre el borne positivo de la batería (el poste) y el terminal positivo del componente (por ejemplo, el terminal grueso del motor de arranque o la salida del alternador).", entrada: "numero", unidad: "V", referencia: "guia",
      guia: { arranque: 0.5, carga: 0.5 }, referencia_texto: "Valor del fabricante si existe. Si no, guía general de taller (orientativa, no del fabricante; varía entre guías, de ~0.2 a 0.5 V): menos de ~0.5 V en el cable positivo del arranque o de la carga.",
      causas_fuera: ["Borne o terminal sulfatado o flojo", "Cable dañado por dentro"], siguiente_ok: "El cable positivo está bien.", siguiente_mal: "Limpiá/apretá bornes y terminales; si sigue alta, cambiá el cable." },
    { id: "caida_tierra", nombre: "Caída de voltaje en la tierra", para: "conexion", herramienta: "Multímetro en voltios DC (y un ayudante si es el arranque)", energizado: true, aislar: ["Es VOLTAJE con el circuito funcionando. Manos lejos de piezas que giran."],
      donde: "Entre el borne negativo de la batería (el poste) y el bloque del motor o el punto de tierra del componente.", entrada: "numero", unidad: "V", referencia: "guia",
      guia: { arranque: 0.3, carga: 0.3 }, referencia_texto: "Valor del fabricante si existe. Si no, guía general de taller (orientativa, varía entre guías): menos de ~0.3 V en la tierra del arranque o de la carga.",
      causas_fuera: ["Cable de tierra del motor o de la carrocería flojo/oxidado", "Correa de tierra rota"], siguiente_ok: "La tierra está bien.", siguiente_mal: "Limpiá y apretá la tierra; repetí la medición." },
    { id: "conector", nombre: "Inspección de conector y prueba de movimiento", para: "conexion", herramienta: "Vista, linterna y el escáner en 'En vivo'", energizado: true, aislar: ["La inspección se hace desconectado; la prueba de movimiento, con el motor en ralentí mirando el dato en vivo (manos lejos de piezas que giran)."],
      donde: "En el conector del componente sospechoso.", entrada: "conector", referencia: "fisica",
      referencia_texto: "Criterio físico: sin sulfato, pines firmes y rectos, sello sano; el dato en vivo no debe saltar al mover el conector y los cables.",
      causas_fuera: ["Sulfato (polvo verde o blanco)", "Pines abiertos o flojos", "Cable quebrado cerca del conector"], siguiente_ok: "El conector está bien.", siguiente_mal: "Limpiá con limpiador de contactos, ajustá o cambiá los terminales. No cambies el sensor todavía." },
    { id: "consumo_parasito", nombre: "Consumo con el carro apagado (fuga de corriente)", para: "bateria", herramienta: "Multímetro en amperios (escala de 10 A) en serie con el borne negativo", energizado: true,
      aislar: ["Carro apagado, puertas cerradas (traba el switch de la puerta), sin llave. El multímetro va EN SERIE entre el borne negativo y su cable.",
        "Soltar el borne despierta los módulos y el radio Honda puede pedir su código: anotalo antes. Esperá a que los módulos 'se duerman' (el tiempo depende del carro).",
        "Empezá en la escala de 10 A. Cambiar de escala abre el circuito un instante y puede despertar los módulos otra vez.",
        "Nunca des arranque ni enciendas luces con el multímetro en serie: se quema su fusible interno."],
      donde: "Entre el borne negativo de la batería y el cable negativo desconectado.", entrada: "numero", unidad: "mA", unidades: ["mA", "A"], referencia: "fabricante",
      referencia_texto: "El consumo aceptable lo define el fabricante. Si es alto, sacá los fusibles uno por uno mirando el amperímetro: el que lo hace bajar señala el circuito.",
      causas_fuera: ["Luz que queda encendida (guantera, maletero)", "Radio o accesorio mal instalado", "Relé pegado", "Alternador con diodo en fuga"], siguiente_ok: "No hay consumo anormal: si la batería se descarga, revisá la batería y la carga.", siguiente_mal: "Sacá fusibles uno por uno para encontrar el circuito." },
    { id: "rele_intercambio", nombre: "Relé: intercambio con uno idéntico", para: "rele", herramienta: "Otro relé con el MISMO número de parte", energizado: false, aislar: ["Llave en LOCK para sacar y poner relés."],
      donde: "En la caja de relés: cambiá el relé sospechoso por uno idéntico de un circuito que puedas probar.", entrada: "rele", referencia: "fisica",
      referencia_texto: "Criterio práctico: si el síntoma se va con el otro relé (y aparece en el otro circuito), el relé original falla.",
      causas_fuera: ["Relé defectuoso (contactos o bobina)"], siguiente_ok: "El relé no era el problema: revisá su alimentación (fusible), la señal que lo activa y el componente.", siguiente_mal: "Cambiá el relé por uno del mismo número de parte." },
    { id: "rele_bobina", nombre: "Resistencia de la bobina de un relé", para: "rele", herramienta: "Multímetro en ohmios", energizado: false, aislar: ["Sacá el relé de la caja."],
      donde: "Entre los terminales de la bobina del relé (según el diagrama impreso en el relé o el manual).", entrada: "numero", unidad: "Ω", referencia: "fabricante",
      referencia_texto: "El valor depende del relé: hace falta su especificación. Abierto (OL) = bobina cortada (criterio físico).", fisica_abierto: true,
      causas_fuera: ["Bobina abierta o en corto"], siguiente_ok: "La bobina mide bien. Los contactos se prueban con el intercambio. La prueba de banco (12 V a la bobina) solo con el diagrama del relé y un cable con fusible: si el relé tiene diodo, invertir la polaridad lo pone en corto.", siguiente_mal: "Cambiá el relé." },
    { id: "voltaje_bornes", nombre: "Voltaje en los bornes de la batería", para: "bateria", herramienta: "Multímetro en voltios DC", energizado: true, aislar: ["Es VOLTAJE: no hace falta desconectar nada."],
      donde: "Directo en los postes de plomo de la batería (no en las abrazaderas).", entrada: "numero", unidad: "V", referencia: "guia", condiciones: ["reposo", "ralenti", "2000_cargas"],
      referencia_texto: "Reposo (1 h o más sin uso, ~25 °C), referencia general de baterías de plomo-ácido: ~12.6 V cargada, ~12.4 V media, menos de 12.2 V descargada. Con el motor encendido: el valor de carga del fabricante (si lo anotaste en 'Datos del manual'); como guía general, 13.5–14.7 V. Algunos Honda con detector de carga (ELD) cargan menos a propósito.",
      causas_fuera: ["Batería descargada o vieja", "Alternador, regulador, faja o conexiones"], siguiente_ok: "Voltaje normal en esa condición.", siguiente_mal: "Seguí con la evaluación de batería y carga." },
  ];
  S.pruebaCircuito = (id) => S.PRUEBAS_CIRCUITO.find((p) => p.id === id) || null;

  /**
   * Rangos FÍSICOS posibles de cada medición en un carro de 12 V (no son especificaciones: sirven para detectar
   * mediciones imposibles, escala equivocada o puntas invertidas).
   */
  const RANGO_FISICO = { V: [-0.3, 20], "Ω": [0, Infinity], mA: [0, 10000] };
  S.validarMedicion = function (m) {
    const p = S.pruebaCircuito(m && m.prueba);
    if (!p) return { ok: false, texto: "Prueba desconocida." };
    const mal = (texto) => ({ ok: false, texto });
    const num = (x) => (x == null || x === "" ? null : Number(x));
    if (p.entrada === "voltaje_fusible") {
      for (const [k, n] of [["entrada", "lado 1"], ["salida", "lado 2"], ["bateria", "batería"]]) {
        const v = num(m[k]);
        if (v == null) continue;
        if (isNaN(v) || v < -0.3) return mal(`Voltaje negativo en ${n}: puntas invertidas o medición imposible. Repetila (punta negra a tierra).`);
        if (v > 20) return mal(`${v} V en ${n} es imposible en un carro de 12 V: revisá la escala del multímetro.`);
      }
      const vb = num(m.bateria);
      if (vb != null && (num(m.entrada) > vb + 1 || num(m.salida) > vb + 1)) return mal("Un lado del fusible marca más que la batería: medición inconsistente. Repetila.");
      return { ok: true };
    }
    if (p.entrada === "continuidad") {
      const v = norm(m.valor), ohm = m.ohm != null && String(m.ohm).trim().toUpperCase() === "OL" ? Infinity : num(m.ohm);
      if (ohm != null && isNaN(ohm)) return mal("El valor en ohmios no es un número (ni OL).");
      if (ohm != null && ohm < 0) return mal("Resistencia negativa: medición imposible. Revisá las puntas y la escala.");
      if (v === "si" && ohm != null && ohm >= 1000) return mal(`Marcaste continuidad pero mide ${ohm === Infinity ? "OL (abierto)" : ohm + " Ω"}: datos contradictorios. Repetí la medición.`);
      if (v === "no" && ohm != null && ohm < 1) return mal(`Marcaste 'sin continuidad' pero mide ${ohm} Ω: datos contradictorios. Repetí la medición.`);
      return { ok: true };
    }
    if (p.entrada !== "numero") return { ok: true };
    let v = num(m.valor);
    if (m.valor != null && String(m.valor).trim().toUpperCase() === "OL") return { ok: true };
    if (v == null) return { ok: true };
    if (isNaN(v)) return mal("El valor no es un número.");
    if (p.id === "consumo_parasito" && m.unidad_consumo === "A") v *= 1000;
    const r = RANGO_FISICO[p.unidad];
    if (r && (v < r[0] || v > r[1])) {
      if (p.unidad === "V" && v < r[0]) return mal("Voltaje negativo: puntas invertidas. Repetí la medición con la punta roja en el lado positivo.");
      if (p.unidad === "Ω") return mal("Resistencia negativa: medición imposible. Revisá las puntas y la escala.");
      if (p.unidad === "mA") return mal("Más de 10 A con el carro apagado es imposible de medir así (el multímetro no lo soporta): revisá la escala y la unidad.");
      return mal(`${v} ${p.unidad} es imposible en un carro de 12 V: revisá la escala del multímetro.`);
    }
    if (p.id === "voltaje_bornes") {
      if (m.condicion === "reposo" && v > 13.2) return mal(`${v} V no es un voltaje de reposo: el motor estaba encendido, el carro se acababa de usar (carga superficial) o la condición está mal elegida. Repetí con 1 h o más sin uso.`);
      if (v < 3) return mal(`${v} V en los bornes de una batería de 12 V: revisá la escala del multímetro o que estés midiendo en los postes.`);
    }
    if ((p.id === "caida_positivo" || p.id === "caida_tierra") && num(m.bateria) != null && v > num(m.bateria)) return mal("La caída no puede ser mayor que el voltaje de la batería: revisá dónde pusiste las puntas.");
    return { ok: true };
  };

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
    const val0 = S.validarMedicion(m);
    if (!val0.ok) return { veredicto: "invalida", nivel: "no_verificable", texto: val0.texto, causas: [], siguiente: "Repetí la medición.", referencia: p.referencia_texto };
    const base = { referencia: spec ? `${spec.fuente || "Especificación"}${spec.min != null || spec.max != null ? `: ${spec.min ?? "—"} a ${spec.max ?? "—"} ${spec.unidad || p.unidad || ""}` : spec.valor != null ? `: ${spec.valor} ${spec.unidad || p.unidad || ""}` : ""}` : p.referencia_texto };
    const NIV = { dentro: "confirmado", fuera: "confirmado", sin_referencia: "requiere_documentacion", orientativo_ok: "probable", orientativo_alto: "probable", incompleto: "requiere_medicion" };
    const res = (veredicto, texto, malo) => ({ ...base, veredicto, nivel: NIV[veredicto] || "requiere_medicion", texto, causas: malo ? p.causas_fuera : [], siguiente: malo ? p.siguiente_mal : veredicto === "sin_referencia" ? "Buscá el valor en el manual de servicio de tu carro y anotalo para poder comparar." : p.siguiente_ok });

    if (p.entrada === "continuidad") {
      const v = norm(m.valor);
      if (!["si", "no", "dudoso"].includes(v)) return res("incompleto", "Anotá si hay continuidad (sí / no / dudoso).");
      if (v === "dudoso") return res("fuera", "Lectura dudosa: hay continuidad pero con resistencia de más. Hacé una caída de voltaje con el circuito funcionando.", true);
      const bien = p.invertida ? v === "no" : v === "si";
      if (p.id === "corto_tierra" && !bien && m.cargas_desconectadas !== true) {
        return { ...base, veredicto: "probable", nivel: "probable", texto: `Hay continuidad a tierra${m.ohm != null ? ` (${m.ohm} Ω)` : ""}, pero no confirmaste que TODAS las cargas de ese fusible estén desconectadas: puede ser un bombillo o un motor, no un corto.`,
          causas: p.causas_fuera, siguiente: "Con el diagrama, desconectá todas las cargas de ese fusible y repetí. Si no tenés el diagrama, el resultado no se puede confirmar." };
      }
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
    const esOL = m.valor != null && String(m.valor).trim().toUpperCase() === "OL";
    let val = esOL ? Infinity : Number(m.valor);
    if (!esOL && (m.valor == null || m.valor === "" || isNaN(val))) return res("incompleto", "Anotá el valor medido.");
    if (p.id === "consumo_parasito" && m.unidad_consumo === "A") val *= 1000;
    const vb = Number(m.bateria) > 6 ? Number(m.bateria) : null;
    const vCirc = Number(m.voltaje_circuito) > 0 ? Number(m.voltaje_circuito) : vb;
    if (p.fisica_abierto && val >= 1e6) return res("fuera", "Abierto (OL): la bobina está cortada.", true);
    if (esOL && p.unidad === "Ω") return res("fuera", "Abierto (OL): no hay continuidad a través del componente.", true);
    if (p.fisica_cero && val < 0.5) return res("fuera", "Prácticamente 0 V: no llega alimentación EN ESE MOMENTO (criterio físico). Confirmá que el circuito debía estar activo (llave en ON, switch encendido).", true);
    if (p.fisica_abierta && vCirc && val >= 0.8 * vCirc) return res("fuera", `La caída en la tierra es casi el voltaje del circuito (${r2(vCirc)} V): la tierra está abierta (criterio físico).`, true);
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
    else pendiente.push("Revisar el conector del componente (sulfato, pines flojos): una mala conexión cambia la resistencia y la señal");
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
          const faltan = [usaAlim && med.alimentacion == null ? "alimentación" : null, med.tierra == null ? "tierra" : null, med.conector !== "bien" ? "conector" : null].filter(Boolean);
          const verificado = [usaAlim ? "alimentación" : null, "tierra", "conector"].filter(Boolean).join(", ");
          return out("componente", `${d.nombre}: resistencia fuera de especificación (${r2(med.resistencia)} Ω; ${s.fuente || "manual"}).`, faltan.length ? "sospecha" : "confirmada",
            faltan.length ? `Antes de cambiarlo, verificá: ${faltan.join(", ")}.` : `Cambiá el componente (${verificado} ya verificados).`, faltan.length ? `Todavía no: falta verificar ${faltan.join(", ")}.` : "");
        }
        descartado.push(`Componente (resistencia dentro de especificación: ${r2(med.resistencia)} Ω)`);
      }
    } else if (d.circuitos.includes("senal") || d.circuitos.includes("control")) pendiente.push("Resistencia del componente desconectado (con el valor del manual)");
    if (med.senal_ok === false && !pendiente.length && med.conector === "bien" && med.corto_tierra === "no") return out("computadora", `Alimentación, tierra, cables y componente verificados, pero la señal sigue mal: posible problema en la computadora o en un dato de especificación.`, "sospecha", "Confirmá con el manual de servicio antes de condenar la computadora (es lo último).", "La computadora sin una prueba del taller.");
    if (med.senal_ok === false && med.corto_tierra !== "no") pendiente.push("Corto a tierra del cable de señal (con todas las cargas desconectadas)");
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

  // ================================================================== hipótesis por síntomas e inspección
  /**
   * Relaciona síntomas e inspección con causas comunes que el OBD no ve (relé principal, fusible principal o de encendido,
   * cortos, falsos contactos, instalaciones agregadas). Todo queda como "sospechoso" hasta medir.
   */
  S.hipotesisElectricas = function ({ sintomas = [], variante = null, inspeccion = {}, evaluados = [] } = {}) {
    const sint = new Set(sintomas || []), out = [];
    const fus = (re) => (S.fusiblesDe ? S.fusiblesDe(variante) : []).filter((f) => re.test(norm(`${f.nombre} ${f.circuito}`)));
    const lista = (fs) => fs.map((f) => `${f.id} (${f.amperaje ? f.amperaje + " A, " : ""}${f.nombre})`).join("; ");
    const rele = (S.relesDe ? S.relesDe(variante) : []).find((r) => /pgm-fi|principal/i.test(r.nombre));
    if (sint.has("arranca_no_enciende") || sint.has("se_apaga_marcha")) {
      const f = fus(/bomba|bobina|ign coil|computadora|fi e\/m/);
      out.push({ id: "hip_rele_principal", nivel: "sospechoso", urgencia: sint.has("se_apaga_marcha") ? "pronto" : "programar",
        titulo: `Falta de alimentación a la computadora, la bomba o el encendido${rele ? ` (incluido el ${rele.nombre})` : " (relé principal)"}`,
        evidencia: [sint.has("arranca_no_enciende") ? "Síntoma: da arranque pero no enciende" : null, sint.has("se_apaga_marcha") ? "Síntoma: se apaga de golpe en marcha" : null].filter(Boolean),
        siguiente: `Durante la falla (no después), con la llave en ON: medí voltaje en ambos lados de ${f.length ? lista(f) : "los fusibles de la computadora, la bomba y el encendido"}. Si los fusibles tienen voltaje, falta medir la salida del relé principal: eso requiere sus terminales (manual de servicio).`,
        falta: rele && !rele.terminales ? `Terminales y prueba del ${rele.nombre} (no documentados)` : null,
        nota: rele && (rele.fuentes || []).includes("go_parts_crv") ? "Publicaciones secundarias lo señalan como sospechoso en este modelo, sobre todo en caliente; no es un dato del fabricante." : "" });
    }
    if (sint.has("varios_sistemas") || (sint.has("no_da_arranque") && sint.has("varios_sistemas"))) {
      const pr = (S.fusiblesDe ? S.fusiblesDe(variante) : []).filter((f) => f.principal);
      out.push({ id: "hip_alimentacion_general", nivel: "sospechoso", urgencia: "pronto",
        titulo: "Causa común de alimentación: fusible principal o de encendido, switch de encendido, borne o tierra principal",
        evidencia: ["Síntoma: varios sistemas eléctricos fallan a la vez", sint.has("no_da_arranque") ? "Síntoma: no da arranque" : null].filter(Boolean),
        siguiente: `Voltaje en los bornes; voltaje en ambos lados de ${pr.length ? lista(pr) : "los fusibles principales"} con la llave en ON; caída de voltaje en la tierra principal.` });
    }
    const seQuema = evaluados.filter((x) => x.e && x.e.se_quema);
    if (sint.has("fusible_se_quema") || seQuema.length) out.push({ id: "hip_corto", nivel: "sospechoso", urgencia: "pronto",
      titulo: "Corto a tierra o consumo excesivo en el circuito del fusible que se quema",
      evidencia: [sint.has("fusible_se_quema") ? "Síntoma: un fusible se vuelve a quemar" : null, ...seQuema.map((x) => `${x.id} se ha quemado ${x.insp.veces_quemado} veces`)].filter(Boolean),
      siguiente: "Prueba 'Corto a tierra' con el fusible fuera y TODAS sus cargas desconectadas. Nunca pongas un fusible más grande." });
    if (sint.has("olor_quemado")) out.push({ id: "hip_sobrecalentamiento", nivel: "sospechoso", urgencia: "detener",
      titulo: "Olor a cable quemado: posible cable o conector recalentado",
      evidencia: ["Síntoma: olor a cable quemado"],
      siguiente: "No sigas usando el carro. Si hay humo o llamas, alejate y pedí ayuda. Sin humo: con el carro apagado, buscá plástico derretido en cajas, conectores y arneses; que lo revise un electricista antes de usarlo." });
    if (sint.has("falla_intermitente")) out.push({ id: "hip_falso_contacto", nivel: "sospechoso", urgencia: "programar",
      titulo: "Falso contacto: conector, tierra, fusible flojo o relé",
      evidencia: ["Síntoma: algo eléctrico funciona y deja de funcionar"],
      siguiente: "Prueba de movimiento (mové conectores y arneses mirando el síntoma o el dato en vivo) y caída de voltaje con el circuito funcionando." });
    // Instalaciones agregadas o modificadas
    const evMod = [];
    for (const x of evaluados) {
      if (x.doc && x.doc.libre && !x.doc.opcional && x.insp && (x.insp.estado === "bien" || x.insp.estado === "quemado")) evMod.push(`Hay un fusible en ${x.id}, documentada como 'no usada'`);
      if (x.doc && x.doc.amperaje && x.insp && Number(x.insp.amperaje_obs) > x.doc.amperaje) evMod.push(`${x.id} tiene ${x.insp.amperaje_obs} A (documentado ${x.doc.amperaje} A)`);
      if (x.insp && /empalme|agregad|alarma|radio nuevo|cable extra|fusible en l[ií]nea/i.test(x.insp.notas || "")) evMod.push(`Nota en ${x.id}: ${x.insp.notas}`);
    }
    if (evMod.length) out.push({ id: "hip_modificacion", nivel: "sospechoso", urgencia: sint.has("bateria_se_descarga") ? "programar" : "vigilar",
      titulo: "Circuito modificado o instalación agregada (alarma, radio, luces)",
      evidencia: [...evMod, sint.has("bateria_se_descarga") ? "Síntoma: la batería amanece descargada" : null].filter(Boolean),
      siguiente: "Buscá cables que no sean de fábrica (empalmes, cinta, fusibles en línea) y medí el consumo con el carro apagado sacando fusibles uno por uno." });
    return out;
  };

  // ================================================================== contradicciones
  /** Lo que dicen la inspección, las mediciones y las fotos sobre cada fusible; si se contradicen, no se concluye nada. */
  S.contradiccionesFusibles = function (inspFusibles = {}, mediciones = []) {
    const porFusible = {};
    const anotar = (id, estado, origen) => { (porFusible[id] = porFusible[id] || []).push({ estado, origen }); };
    for (const [id, i] of Object.entries(inspFusibles)) {
      if (!i || !i.estado || !METODO_FISICO.includes(i.metodo)) continue;
      if (i.estado === "bien") anotar(id, "bien", `inspección (${S.METODOS_INSPECCION[i.metodo]})`);
      if (i.estado === "quemado") anotar(id, "abierto", `inspección (${S.METODOS_INSPECCION[i.metodo]})`);
    }
    for (const m of mediciones) {
      if (!m.componente) continue;
      if (m.prueba === "fusible_continuidad") { const v = norm(m.valor); if (v === "si") anotar(m.componente, "bien", "medición de continuidad"); if (v === "no") anotar(m.componente, "abierto", "medición de continuidad"); }
      if (m.prueba === "fusible_voltaje") { const r = S.evaluarVoltajeFusible(m).resultado; if (r === "bien") anotar(m.componente, "bien", "voltaje en ambos lados"); if (r === "abierto") anotar(m.componente, "abierto", "voltaje en ambos lados"); }
    }
    const out = [];
    for (const [id, l] of Object.entries(porFusible)) {
      const estados = new Set(l.map((x) => x.estado));
      if (estados.size > 1) out.push({ id, texto: `${id}: los datos se contradicen (${l.map((x) => `${x.origen}: ${x.estado}`).join("; ")}). Repetí la medición antes de concluir.` });
    }
    return out;
  };

  // ================================================================== diagnóstico eléctrico integrado
  /**
   * ctx: { variante, inspeccion:{fusibles:{}, reles:{}}, mediciones:[], obd:{codigos:[{codigo,tipo}], resumen}, sintomas:[], pruebas:[], carro, componentes:{id: med}, conexion }
   * Devuelve qué se sabe, qué se sospecha, qué no se puede determinar y qué prueba hace falta; cada elemento con su nivel de evidencia.
   */
  S.diagnosticoElectrico = function (ctx = {}) {
    const sabe = [], sospecha = [], no_determina = [], pruebas = [];
    const NIV_DEF = new Map([[sabe, "confirmado"], [sospecha, "sospechoso"], [no_determina, "requiere_documentacion"], [pruebas, "requiere_medicion"]]);
    const add = (l, id, texto, extra = {}) => { if (!l.some((x) => x.id === id)) l.push({ id, texto, nivel: NIV_DEF.get(l), ...extra }); };
    const variante = ctx.variante, insp = (ctx.inspeccion && ctx.inspeccion.fusibles) || {};
    const docs = S.fusiblesDe ? S.fusiblesDe(variante) : [];
    const docDe = (id) => docs.find((f) => f.id === id) || null;
    const contradicciones = S.contradiccionesFusibles(insp, ctx.mediciones || []);
    const contradictorio = new Set(contradicciones.map((c) => c.id));
    for (const c of contradicciones) { add(no_determina, `contradiccion:${c.id}`, c.texto, { nivel: "no_verificable" }); add(pruebas, `repetir:${c.id}`, `Repetir la medición de ${c.id} (continuidad con el fusible fuera y voltaje en ambos lados).`); }
    const evaluados = [];
    for (const [id, i] of Object.entries(insp)) {
      const doc = docDe(id), e = S.evaluarFusible(doc, i);
      evaluados.push({ id, doc, insp: i, e });
      if (contradictorio.has(id)) continue;
      const nombre = doc ? `${id} (${doc.nombre})` : id;
      if (e.estado === "quemado") { add(sabe, `fusible_quemado:${id}`, `El fusible ${nombre} está abierto.`); add(no_determina, `por_que_quemo:${id}`, `Por qué se quemó ${nombre}: el fusible solo muestra el efecto.`, { nivel: "requiere_medicion" }); add(pruebas, `reemplazar:${id}`, `Reemplazar ${id} por uno del mismo amperaje${doc && doc.amperaje ? ` (${doc.amperaje} A)` : ""} y probar el circuito.`); }
      if (e.estado === "quemado_probable") { add(sospecha, `fusible_quemado_probable:${id}`, `El fusible ${nombre} parece quemado (sin confirmar).`, { nivel: "probable" }); add(pruebas, `confirmar_fusible:${id}`, `Confirmar ${id} con continuidad (fuera) o voltaje en ambos lados.`); }
      if (e.estado === "ausente") { add(sabe, `fusible_ausente:${id}`, `Falta el fusible ${nombre}.`); add(no_determina, `por_que_falta:${id}`, `Si lo sacaron a propósito (por ejemplo, porque se quemaba).`, { nivel: "no_verificable" }); add(pruebas, `poner:${id}`, `Confirmar el amperaje con la tapa y poner el fusible ${id}.`); }
      if (e.estado === "amperaje") {
        add(sabe, `observado:${id}`, `En ${nombre} hay un fusible de ${i.amperaje_obs} A (lo anotaste vos).`);
        add(e.nivel === "confirmado" ? sabe : sospecha, `amperaje_distinto:${id}`, `${id}: ${i.amperaje_obs} A donde la documentación (${(S.VERIFICACION[e.verificacion] || {}).nombre || e.verificacion}) dice ${doc && doc.amperaje} A.`, { nivel: e.nivel });
        if (e.verificacion !== "dueno" && e.verificacion !== "oem") add(no_determina, `doc_aplica:${id}`, `Si la documentación de ${id} corresponde a tu variante (no está confirmada con la tapa).`);
        if (Number(i.amperaje_obs) > (doc && doc.amperaje)) add(sospecha, `falla_tapada:${id}`, `Alguien pudo poner un fusible más grande porque el original se quemaba: posible falla en ${doc ? doc.circuito : "ese circuito"}.`);
        add(pruebas, `amperaje_correcto:${id}`, `Confirmar con la tapa y poner el amperaje documentado en ${id} (nunca uno más grande).`);
      }
      if (e.estado === "desconocida") add(no_determina, `config:${id}`, `${PEND()} (${nombre}).`);
      if (e.estado === "contacto") { add(sospecha, `falso_contacto:${id}`, `Posible falso contacto en la posición ${id}.`, { nivel: "probable" }); add(pruebas, `caida_fusible:${id}`, `Medir la caída de voltaje a través de ${id} con el circuito funcionando.`); }
      if (e.se_quema) { add(sabe, `se_quema:${id}`, `${nombre} se ha quemado ${i.veces_quemado} veces.`); add(sospecha, `corto:${id}`, `Corto a tierra o consumo excesivo en ${doc ? doc.circuito : "ese circuito"}.`); add(pruebas, `corto_tierra:${id}`, `Prueba 'Corto a tierra' en el circuito de ${id} con el fusible fuera y TODAS sus cargas desconectadas.`); }
      if (i.amperaje_foto != null && i.amperaje_obs == null && doc && doc.amperaje && Number(i.amperaje_foto) !== doc.amperaje) add(sospecha, `foto_amperaje:${id}`, `La foto sugiere ${i.amperaje_foto} A en ${id} (documentado ${doc.amperaje} A): sin confirmar.`, { nivel: "probable" });
    }
    for (const x of S.detectarIntercambios(variante, insp)) add(sospecha, `intercambio:${x.a}:${x.b}`, x.texto, { nivel: "probable" });
    // Relés
    for (const [id, r] of Object.entries((ctx.inspeccion && ctx.inspeccion.reles) || {})) {
      const rel = (S.relesDe ? S.relesDe(variante) : []).find((x) => x.id === id);
      const nombre = rel ? rel.nombre : id;
      const rdoc = ((ctx.inspeccion && ctx.inspeccion.reles_doc) || {})[id] || {};
      if (r.resultado === "mejora") { add(sabe, `rele_falla:${id}`, `${nombre}: con un relé idéntico el sistema funciona; el original falla.`); add(pruebas, `cambiar_rele:${id}`, `Cambiar ${nombre} por uno del mismo número de parte.`); }
      if (r.resultado === "igual") add(sabe, `rele_ok:${id}`, `${nombre}: con un relé idéntico sigue igual; el relé no parece la causa.`);
      if (rel && !rel.posicion && !rdoc.ubicacion_dueno) add(no_determina, `rele_pos:${id}`, `La posición exacta de ${nombre} (no está documentada).`);
      if (rel && !rel.terminales && !(rdoc.terminales && rdoc.terminales.length && rdoc.fuente)) add(no_determina, `rele_term:${id}`, `Los terminales y valores de ${nombre} (requieren el manual de servicio).`);
    }
    // Mediciones
    for (const m of ctx.mediciones || []) {
      const p = S.pruebaCircuito(m.prueba);
      if (!p) continue;
      if (m.componente && contradictorio.has(m.componente)) continue;
      const e = S.evaluarMedicion(m, m.spec || S.especificacionPara({ variante, carro: ctx.carro, prueba: m.prueba, componente: m.componente, condicion: m.condicion }));
      const donde = m.componente ? ` (${m.componente})` : "";
      if (e.veredicto === "invalida") { add(no_determina, `medicion_invalida:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`, { nivel: "no_verificable" }); add(pruebas, `repetir_med:${m.prueba}:${m.componente || ""}`, `Repetir '${p.nombre}'${donde}.`); continue; }
      if (e.veredicto === "probable") { add(sospecha, `medicion_probable:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`, { nivel: "probable" }); add(pruebas, `cargas:${m.componente || ""}`, e.siguiente); add(no_determina, `cargas_fusible:${m.componente || ""}`, `Qué cargas comparte ese fusible (requiere el diagrama).`); continue; }
      if (e.veredicto === "fuera") {
        add(sabe, `medicion_fuera:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`);
        if (p.id === "alimentacion_componente") add(sospecha, `alim:${m.componente}`, `Falta alimentación en ${m.componente}: fusible, relé, cable o referencia compartida.`);
        if (p.id === "corto_tierra") add(pruebas, `ubicar_corto:${m.componente || ""}`, "Mover el arnés por tramos midiendo para ubicar el corto.");
        if (p.id === "continuidad_cable") add(pruebas, `reparar_cable:${m.componente || ""}`, "Ubicar y reparar el cable abierto; no cambiar el componente por esto.");
      } else if (e.veredicto === "dentro") add(sabe, `medicion_ok:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`);
      else if (e.veredicto === "orientativo_alto") { add(sospecha, `medicion_guia:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${e.texto}`, { nivel: "probable" }); add(no_determina, `sin_spec:${m.prueba}`, `El límite exacto del fabricante para '${p.nombre}' (se usó una guía general).`); }
      else if (e.veredicto === "sin_referencia") { add(no_determina, `sin_spec:${m.prueba}:${m.componente || ""}`, `${p.nombre}${donde}: ${SIN_REF()}.`); }
    }
    // Componentes (sensor / actuador)
    for (const [comp, med] of Object.entries(ctx.componentes || {})) {
      const r = S.diferenciarFalla(comp, med);
      const nombre = (S.COMPONENTES_ELECTRICOS[comp] || {}).nombre || comp;
      if (r.certeza === "confirmada") add(sabe, `componente:${comp}:${r.id}`, r.texto); else if (r.id !== "pendiente" && r.id !== "sin_falla") add(sospecha, `componente:${comp}:${r.id}`, r.texto);
      if (r.pendiente.length) add(no_determina, `componente_pend:${comp}`, `${nombre}: falta ${r.pendiente.join("; ")}.`, { nivel: "requiere_medicion" });
      if (r.siguiente) add(pruebas, `componente_sig:${comp}`, r.siguiente);
      if (r.no_cambiar) add(no_determina, `no_cambiar:${comp}`, `No cambiar todavía: ${r.no_cambiar}`, { nivel: "requiere_medicion" });
    }
    // Códigos OBD
    const codigos = ((ctx.obd && ctx.obd.codigos) || []).map((c) => ({ ...S.clasificarCodigoElectrico(c.codigo || c), tipo: c.tipo }));
    for (const c of codigos.filter((x) => x.electrico)) {
      add(sabe, `codigo:${c.codigo}`, `La computadora reporta ${c.codigo}${c.descripcion ? ` (${c.descripcion})` : ""}${c.tipo === "pendiente" ? " como pendiente" : ""}.`);
      if (c.explicacion) add(sospecha, `codigo_circ:${c.codigo}`, `${c.codigo}: ${c.explicacion}`);
      const fus = variante ? S.fusiblesParaCodigo(variante, c.codigo) : [];
      if (fus.length) add(pruebas, `fusible_codigo:${c.codigo}`, `Revisar ${fus.map((f) => `${f.id} (${f.nombre})`).join(", ")}: relación posible por el nombre del circuito, no confirmada.`);
      else add(no_determina, `fusible_codigo:${c.codigo}`, `Qué fusible alimenta el circuito de ${c.codigo}: la tabla de fusibles no lo identifica; requiere el diagrama eléctrico.`);
      if (c.componente) add(pruebas, `flujo:${c.componente}`, `Seguir el flujo de ${S.COMPONENTES_ELECTRICOS[c.componente].nombre}: conector → alimentación → tierra → cable → componente.`);
    }
    // Batería y carga
    const carga = S.evaluarSistemaCarga({ resumen: ctx.obd && ctx.obd.resumen, mediciones: (ctx.mediciones || []).filter((m) => S.validarMedicion(m).ok), pruebas: ctx.pruebas, sintomas: ctx.sintomas, carro: ctx.carro, variante, historialVoltajes: ctx.historialVoltajes });
    for (const h of carga.hechos) add(sabe, `carga_hecho:${h.id}`, h.texto);
    for (const h of carga.hipotesis.filter((x) => x.apoyo.length)) {
      add(sospecha, `carga:${h.id}`, `${h.titulo} (${h.certeza}): ${h.apoyo.join("; ")}.`);
      add(pruebas, `carga_sig:${h.id}`, h.siguiente);
      if (h.nota) add(no_determina, `carga_obd:${h.id}`, `${h.titulo}: ${h.nota}`, { nivel: "requiere_medicion" });
    }
    if (carga.hipotesis.some((h) => h.id === "bateria" && h.apoyo.length)) add(no_determina, "bateria_interna", "El estado interno de la batería (necesita un probador de carga o de conductancia).", { nivel: "requiere_medicion" });
    // Hipótesis por síntomas e inspección
    for (const h of S.hipotesisElectricas({ sintomas: ctx.sintomas, variante, inspeccion: ctx.inspeccion, evaluados })) {
      add(sospecha, h.id, `${h.titulo}. Evidencia: ${h.evidencia.join("; ")}.${h.nota ? " " + h.nota : ""}`, { urgencia: h.urgencia });
      add(pruebas, `${h.id}_prueba`, h.siguiente);
      if (h.falta) add(no_determina, `${h.id}_falta`, h.falta);
    }
    // Causa común
    const cc = []; const Hs = (id, g, t, d, ev, x) => ({ id, gravedad: g, titulo: t, detalle: d, evidencia: ev, ...x });
    reglaCausaComun({ resumen: (ctx.obd && ctx.obd.resumen) || {}, lectura: { codigos: (ctx.obd && ctx.obd.codigos) || [] }, extra: { conexion: ctx.conexion }, H: Hs }, cc);
    for (const h of cc) { add(sospecha, h.id, h.titulo, { causas: h.causas }); add(pruebas, `${h.id}_prueba`, h.prueba); }
    // Siempre
    if (!variante) add(no_determina, "sin_ficha", "No hay una ficha técnica verificada para este carro: los fusibles y relés hay que tomarlos de la etiqueta de la tapa.");
    else if (!(variante.circuitos || []).length && !(ctx.circuitos || []).length) add(no_determina, "sin_circuitos", "El cableado de este carro (colores, terminales, conectores, tierras): ScanIA no tiene circuitos documentados con fuente.");
    add(no_determina, "limite_obd", "El ELM327 no puede revisar físicamente fusibles, relés, tierras ni cables: solo ve lo que reporta la computadora del motor.", { nivel: "requiere_medicion" });
    return { sabe, sospecha, no_determina, pruebas, fusibles: evaluados, carga, contradicciones };
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
      espera: { sabe: ["observado:MOT-11"], sospecha: ["amperaje_distinto:MOT-11", "falla_tapada:MOT-11"], no_determina: ["doc_aplica:MOT-11"], pruebas: ["amperaje_correcto:MOT-11"] } },
    rele_defectuoso: { nombre: "Relé defectuoso", descripcion: "El A/C no enfría; con otro relé idéntico el compresor engancha.", sintomas: [],
      inspeccion: { fusibles: { "INT-17": { estado: "bien", metodo: "voltaje" } }, reles: { "MOT-R-AC": { resultado: "mejora" } } }, mediciones: [{ prueba: "rele_intercambio", componente: "MOT-R-AC", valor: "mejora" }],
      espera: { sabe: ["rele_falla:MOT-R-AC"], sospecha: [], no_determina: ["rele_term:MOT-R-AC"], pruebas: ["cambiar_rele:MOT-R-AC"] } },
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
      inspeccion: { fusibles: { "INT-7": { estado: "quemado", metodo: "continuidad", veces_quemado: 3 } } }, mediciones: [{ prueba: "corto_tierra", componente: "INT-7", valor: "si", ohm: 0.3, cargas_desconectadas: true }],
      espera: { sabe: ["se_quema:INT-7", "medicion_fuera:corto_tierra:INT-7"], sospecha: ["corto:INT-7"], no_determina: [], pruebas: ["ubicar_corto:INT-7"] } },
    sensor_sin_alimentacion: { nombre: "Sensor sin alimentación", descripcion: "Códigos P0107 y P0122; el MAP y el TPS no tienen referencia.", sintomas: [],
      obd: { codigos: [{ codigo: "P0107", tipo: "almacenado" }, { codigo: "P0122", tipo: "almacenado" }] }, componentes: { map: { alimentacion: 0.0 }, tps: { alimentacion: 0.0 } },
      mediciones: [{ prueba: "alimentacion_componente", componente: "map", valor: 0.0 }],
      espera: { sabe: ["componente:map:sin_alimentacion", "componente:tps:sin_alimentacion"], sospecha: ["causa_comun_electrica"], no_determina: [], pruebas: ["componente_sig:map"] } },
    resistencia_fuera: { nombre: "Resistencia fuera de especificación", descripcion: "Un sensor mide fuera del valor (EJEMPLO del caso simulado: no es un valor real de ningún carro).", sintomas: [],
      componentes: { ect: { alimentacion: null, tierra: 0.05, continuidad_senal: "si", conector: "bien", resistencia: 95000, resistencia_spec: { min: 2000, max: 3000, fuente: "Valor de EJEMPLO del caso simulado" } } },
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
      if (e.amperaje_visto != null) { s.cambios.amperaje_foto = e.amperaje_visto; s.texto += `La foto sugiere ${e.amperaje_visto} A (miralo en persona). `; }
      if (/cortad|quemad|derretid/.test(e.estado_visual)) { s.cambios.estado = "quemado"; s.texto += "Parece quemado (confirmalo con multímetro). "; }
      else if (e.estado_visual === "sin_dano_visible") { s.cambios.estado = "bien"; s.texto += "Sin daño visible. "; }
      if (e.estado_visual === "sulfato" || e.estado_visual === "flojo_o_fuera_de_lugar") { s.cambios.falso_contacto = true; s.texto += "Sulfato o terminal flojo. "; }
      if (Object.keys(s.cambios).length > 1) out.push(s);
    }
    return out;
  };

  // ================================================================== modelo de circuitos (sin datos inventados)
  /**
   * Un circuito documentado es una lista de tramos "desde → hasta", cada uno con el tipo de nodo, su referencia
   * (por ejemplo el id de un fusible o el nombre del conector), el terminal y el color del cable cuando el documento los da.
   * Sin fuente no se acepta. ScanIA no trae circuitos del CR-V: se cargan desde el manual de servicio del dueño.
   */
  S.TIPOS_NODO = { bateria: "Batería", fusible: "Fusible", rele: "Relé", switch: "Switch", conector: "Conector", empalme: "Empalme", componente: "Componente", computadora: "Computadora (pin)", tierra: "Tierra" };
  S.validarCircuito = function (c) {
    const e = [];
    if (!c || !c.nombre) e.push("falta el nombre");
    if (!c || !c.fuente || !String(c.fuente).trim()) e.push("falta la fuente (manual, página)");
    if (!c || !Array.isArray(c.tramos) || !c.tramos.length) e.push("no tiene tramos");
    for (const [i, t] of ((c && c.tramos) || []).entries()) {
      for (const lado of ["desde", "hasta"]) {
        const n = t[lado];
        if (!n || !S.TIPOS_NODO[n.tipo]) e.push(`tramo ${i + 1}: tipo de nodo inválido en '${lado}'`);
        else if (!String(n.ref || "").trim()) e.push(`tramo ${i + 1}: falta la referencia en '${lado}'`);
      }
    }
    return e;
  };
  const textoNodo = (n) => `${S.TIPOS_NODO[n.tipo] || n.tipo} ${n.ref}${n.terminal ? ` (terminal ${n.terminal})` : ""}`;
  /** Texto legible de un circuito: "Batería + → [BLK/YEL] → Fusible MOT-13 → …". */
  S.textoCircuito = function (c) {
    if (!c || !c.tramos || !c.tramos.length) return "";
    return [textoNodo(c.tramos[0].desde), ...c.tramos.map((t) => `${t.color ? `[${t.color}] ` : ""}${textoNodo(t.hasta)}`)].join(" → ");
  };

  /** Qué falta para diagnosticar un relé con multímetro (según lo documentado). */
  S.faltaParaRele = function (rel, doc) {
    const d = { ...(rel || {}), ...(doc || {}) };
    const falta = [];
    if (!d.posicion && !d.ubicacion_dueno) falta.push("ubicación física");
    if (!d.terminales || !d.terminales.length) falta.push("numeración de terminales (bobina y contactos)");
    if (!d.bobina_spec) falta.push("resistencia de la bobina (valor del manual)");
    if (!d.alimentacion) falta.push("qué terminal del zócalo debe tener voltaje y en qué condición");
    if (!d.control) falta.push("qué terminal activa la computadora o el switch");
    if (d.diodo == null) falta.push("si tiene diodo (polaridad)");
    return falta;
  };

  /** Avisos si un diagrama no corresponde al carro (mercado, año, motor). */
  S.compararDiagrama = function (diag, carro, variante) {
    const av = [];
    if (!diag) return av;
    const anio = Number(carro && carro.anio), dAnio = String(diag.anio || "");
    if (anio && dAnio) {
      const m = dAnio.match(/(\d{4})(?:\s*[-–]\s*(\d{4}))?/);
      if (m) { const a = Number(m[1]), b = Number(m[2] || m[1]); if (anio < a || anio > b) av.push(`El diagrama es de ${dAnio} y tu carro es ${anio}.`); }
    }
    if (carro && carro.motor && diag.motor && !norm(carro.motor).includes(norm(diag.motor)) && !norm(diag.motor).includes(norm(carro.motor))) av.push(`Motor del diagrama: ${diag.motor}; tu carro: ${carro.motor}.`);
    if (variante && diag.mercado && variante.mercado) {
      const dm = norm(diag.mercado), vm = norm(variante.mercado);
      const claves = ["ee. uu", "eeuu", "usa", "canada", "europa", "japon", "jdm", "latinoamerica", "mexico", "honduras"];
      const kd = claves.filter((k) => dm.includes(k)), kv = claves.filter((k) => vm.includes(k));
      if (kd.length && kv.length && !kd.some((k) => kv.includes(k))) av.push(`Mercado del diagrama: ${diag.mercado}; variante en uso: ${variante.mercado.split(".")[0]}.`);
    }
    return av;
  };

  // ================================================================== búsqueda
  /** Busca por componente, circuito, fusible o código de falla en la ficha y en los diagramas del dueño. */
  S.buscarElectrico = function ({ variante, consulta, diagramas = [], ficha, circuitos = [], carro = null }) {
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
    for (const d of diagramas) if (norm(`${d.titulo} ${d.tipo} ${(d.etiquetas || []).join(" ")} ${d.notas || ""}`).includes(q)) {
      const av = S.compararDiagrama(d, carro, variante);
      res.push({ tipo: "diagrama", id: d.id, titulo: d.titulo, detalle: `${av.length ? "⚠ " + av.join(" ") + " " : ""}${d.tipo || "Diagrama"} · ${d.fuente || "sin fuente"}` });
    }
    for (const c of [...((variante && variante.circuitos) || []), ...circuitos]) {
      const txt = S.textoCircuito(c);
      if (norm(`${c.nombre} ${c.sistema || ""} ${txt}`).includes(q)) res.push({ tipo: "circuito", id: c.id, titulo: c.nombre, detalle: `${txt} · Fuente: ${c.fuente}` });
    }
    const vistos = new Set();
    return res.filter((x) => { const k = x.tipo + x.id; if (vistos.has(k)) return false; vistos.add(k); return true; });
  };

  S.TIPOS_DIAGRAMA = ["Alimentación", "Arranque", "Carga", "Encendido", "Inyección", "Sensores", "Tierras", "Fusibles", "Relés", "Comunicación entre módulos", "Otro"];

  // ================================================================== informe eléctrico
  S.informeElectrico = function ({ carro, ficha, variante, inspeccion, mediciones, diagramas, componentes, obd, sintomas, pruebas, simulado, circuitos, varianteConfirmada }) {
    const d = S.diagnosticoElectrico({ variante, inspeccion, mediciones, obd, sintomas, pruebas, carro, componentes, circuitos });
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
      contradicciones: d.contradicciones, niveles: S.NIVELES_EVIDENCIA, variante_confirmada: !!varianteConfirmada,
      circuitos_documentados: [...((variante && variante.circuitos) || []), ...(circuitos || [])].map((c) => ({ nombre: c.nombre, fuente: c.fuente, recorrido: S.textoCircuito(c) })),
      fuentes_tecnicas: ficha ? ficha.fuentes.map((f) => ({ nombre: f.nombre, url: f.url, tipo: f.tipo, uso: f.uso })) : [],
      limitaciones: ["El ELM327 no revisa fusibles, relés, tierras ni cables: esos datos vienen de tu inspección y tus mediciones.", "Los datos de la ficha no reemplazan la etiqueta de la tapa ni el manual de servicio de tu carro.",
        "ScanIA no conoce el cableado del carro salvo los circuitos que cargues con su fuente.", varianteConfirmada ? "Variante confirmada por el dueño con la etiqueta de la tapa." : "Variante de la ficha SIN confirmar con la etiqueta de la tapa de este carro."],
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
