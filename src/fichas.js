/* ScanIA · fichas técnicas por vehículo (cajas de fusibles, fusibles, relés, componentes, diagramas y fuentes)
 *
 * Reglas de esta base de datos:
 *  - Cada dato dice de qué FUENTE sale y qué tan VERIFICADO está. Nada se presenta como "de fábrica" si no lo es.
 *  - Las variantes (mercado, versión, equipamiento) no se mezclan: cada caja pertenece a una variante.
 *  - Si las fuentes no coinciden, el dato queda "en conflicto" y la app pide confirmarlo con la etiqueta de la tapa.
 *  - No se guardan diagramas inventados: solo referencias a documentos con su fuente, o los que el dueño sube de su manual.
 *  - Para ampliar a otra marca o modelo: S.registrarFicha({...}) con sus fuentes.
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  /** Niveles de verificación de un dato (de más a menos confiable). */
  S.VERIFICACION = {
    dueno: { nombre: "Confirmado en tu carro", detalle: "Lo confirmaste con la etiqueta de la tapa o con el manual de tu carro." },
    oem: { nombre: "Documentación del fabricante", detalle: "Sale de un documento del fabricante para esta variante." },
    secundaria_coincidente: { nombre: "Fuentes secundarias que coinciden", detalle: "Varias publicaciones que reproducen el manual coinciden, pero no se comparó con el documento original ni con tu caja." },
    una_fuente: { nombre: "Una sola fuente secundaria", detalle: "Solo una publicación lo dice. Confirmalo antes de usarlo." },
    conflicto: { nombre: "Fuentes en conflicto", detalle: "Las publicaciones no coinciden. Configuración del fusible pendiente de verificación." },
    desconocido: { nombre: "Sin información", detalle: "No hay una fuente verificable. Configuración del fusible pendiente de verificación." },
  };
  S.PENDIENTE_FUSIBLE = "Configuración del fusible pendiente de verificación";
  S.SIN_REFERENCIA = "Valor de referencia no disponible: requiere documentación técnica";

  const fichas = [];
  S.FICHAS_TECNICAS = fichas;

  /** Valida y agrega una ficha. Lanza error si falta la fuente de algún dato. */
  S.registrarFicha = function (f) {
    if (!f || !f.id || !f.marca || !f.modelo || typeof f.coincide !== "function") throw new Error("Ficha inválida: faltan id, marca, modelo o coincide()");
    if (fichas.some((x) => x.id === f.id)) throw new Error("Ya existe una ficha con ese id");
    const fuentes = new Set((f.fuentes || []).map((x) => x.id));
    if (!fuentes.size) throw new Error("La ficha debe declarar sus fuentes");
    for (const v of f.variantes || []) {
      if (!v.id || !v.mercado) throw new Error("Cada variante necesita id y mercado");
      for (const c of v.cajas || []) {
        for (const x of [...(c.fusibles || []), ...(c.reles || [])]) {
          if (!x.fuentes || !x.fuentes.length) throw new Error(`${x.id}: falta la fuente`);
          for (const id of x.fuentes) if (!fuentes.has(id)) throw new Error(`${x.id}: fuente desconocida ${id}`);
          if (!S.VERIFICACION[x.verificacion]) throw new Error(`${x.id}: nivel de verificación inválido`);
          if (x.amperaje != null && !(x.amperaje > 0)) throw new Error(`${x.id}: amperaje inválido`);
        }
      }
      for (const d of v.diagramas || []) if (!d.fuente || !fuentes.has(d.fuente)) throw new Error(`Diagrama ${d.id}: falta la fuente`);
      for (const r of v.valores_referencia || []) if (!r.fuente || !fuentes.has(r.fuente)) throw new Error(`Valor ${r.id}: falta la fuente`);
    }
    fichas.push(f);
    return f;
  };

  /** Ficha que aplica a un carro (o null). */
  S.fichaDe = function (carro, info) {
    const datos = { ...(carro || {}), vin: (carro && carro.vin) || (info && info.vin) || "" };
    return fichas.find((f) => { try { return f.coincide(datos); } catch (e) { return false; } }) || null;
  };

  /** Variante elegida (o la primera documentada). */
  S.varianteDe = function (ficha, idVariante) {
    if (!ficha) return null;
    return (ficha.variantes || []).find((v) => v.id === idVariante) || (ficha.variantes || [])[0] || null;
  };

  /** Todos los fusibles de una variante, con su caja. */
  S.fusiblesDe = function (variante) {
    if (!variante) return [];
    return (variante.cajas || []).flatMap((c) => (c.fusibles || []).map((f) => ({ ...f, caja: c.id, caja_nombre: c.nombre })));
  };
  S.relesDe = function (variante) {
    if (!variante) return [];
    return (variante.cajas || []).flatMap((c) => (c.reles || []).map((r) => ({ ...r, caja: c.id, caja_nombre: c.nombre }))).concat((variante.reles_sueltos || []).map((r) => ({ ...r, caja: null, caja_nombre: r.ubicacion || "Ubicación por verificar" })));
  };

  // ================================================================== Honda CR-V 2000 (1ra generación, B20Z)
  const FUENTES_CRV = [
    { id: "honda_om_2000", tipo: "oem", nombre: "Honda — 2000 CR-V Online Reference Owner's Manual (índice en techinfo.honda.com, CR0000)",
      url: "https://techinfo.honda.com/rjanisis/pubs/om/CR0000/CR0000MAINIDX.pdf", uso: "Existencia del manual oficial. Las páginas de fusibles no se pudieron consultar directamente." },
    { id: "manualowl_267", tipo: "reproduccion_oem", nombre: "2000 Honda CR-V Owner's Manual, pág. 267 (reproducción en manualowl.com)",
      url: "https://www.manualowl.com/am/Honda/2000-CR-V/Manual/6985?page=267", uso: "Ubicación de las cajas: interior debajo del tablero del lado del conductor; caja bajo el capó; caja del ABS (si tiene) del lado del pasajero." },
    { id: "fuse_box_info", tipo: "secundaria", nombre: "fuse-box.info — Honda CR-V (1995-2001), tablas de 2000–2001",
      url: "https://fuse-box.info/?p=12669", uso: "Tablas de fusibles interior, bajo el capó y ABS." },
    { id: "fuseboxinfo_com", tipo: "secundaria", nombre: "fuseboxinfo.com — Honda CR-V 2000",
      url: "https://fuseboxinfo.com/index.php/cars/29-honda/1634-honda-cr-v-2000-fuses", uso: "Tablas de fusibles interior y bajo el capó." },
    { id: "autogenius", tipo: "secundaria", nombre: "autogenius.info — Honda CR-V (2000–2001)",
      url: "https://www.autogenius.info/honda-cr-v-2000-2001-fuse-box-diagram", uso: "Tablas de fusibles. Difiere en las posiciones 4 y 5 de la caja bajo el capó." },
    { id: "startmycar", tipo: "secundaria", nombre: "startmycar.com — 2000 Honda CR-V fuse box (usa numeración propia)",
      url: "https://www.startmycar.com/us/honda/cr-v/info/fusebox/2000", uso: "Nombres de los relés de la caja bajo el capó y del ABS (sin posición confirmada)." },
    { id: "fuseandrelay", tipo: "secundaria", nombre: "fuseandrelay.com — Honda CR-V 1ra generación (mercado no identificado)",
      url: "https://fuseandrelay.com/?p=15260", uso: "Muestra una distribución DISTINTA (otro mercado). Se usa solo para advertir que hay variantes y para nombres de relés." },
  ];

  // Interior (debajo del tablero, lado del conductor). Tres fuentes secundarias coinciden en número, amperaje y circuito.
  const F3 = ["fuse_box_info", "fuseboxinfo_com", "autogenius"];
  const fi = (n, a, nombre, circuito, componentes = [], sintomas = [], extra = {}) => ({
    id: `INT-${n}`, numero: n, amperaje: a, nombre, circuito, componentes, sintomas, fuentes: extra.fuentes || F3,
    verificacion: extra.verificacion || "secundaria_coincidente", nota: extra.nota || "", libre: !a, repuesto: !!extra.repuesto, condicion: extra.condicion || "",
  });
  const INTERIOR = [
    fi(1, null, "No usado", "—"), fi(2, null, "No usado", "—"),
    fi(3, 10, "Limpiaparabrisas y lavador trasero", "Limpiaparabrisas trasero y su lavador", ["Motor del limpiaparabrisas trasero", "Bomba del lavador"], ["No funciona el limpiaparabrisas trasero"]),
    fi(4, 10, "Luz alta derecha", "Faro derecho, luz alta", ["Bombillo de luz alta derecha"], ["No enciende la luz alta derecha"]),
    fi(5, 10, "Luz alta izquierda", "Faro izquierdo, luz alta", ["Bombillo de luz alta izquierda"], ["No enciende la luz alta izquierda"]),
    fi(6, 10, "Toma de corriente trasera", "Toma de accesorios trasera", ["Toma de corriente trasera"], ["No funciona la toma trasera"]),
    fi(7, 20, "Vidrio eléctrico trasero izquierdo", "Motor del vidrio trasero izquierdo", ["Motor y switch del vidrio"], ["No sube/baja ese vidrio"]),
    fi(8, 20, "Vidrio eléctrico trasero derecho", "Motor del vidrio trasero derecho", ["Motor y switch del vidrio"], ["No sube/baja ese vidrio"]),
    fi(9, 15, "Bobina de encendido (IGN COIL)", "Alimentación de la bobina de encendido", ["Bobina de encendido", "Módulo de encendido (en el B20, en el distribuidor — verificar)"], ["El motor da arranque pero no enciende (sin chispa)", "Se apaga de golpe"]),
    fi(10, 20, "Vidrio eléctrico delantero del pasajero", "Motor del vidrio del pasajero", ["Motor y switch del vidrio"], ["No sube/baja ese vidrio"]),
    fi(11, 20, "Vidrio eléctrico delantero del conductor", "Motor del vidrio del conductor", ["Motor y switch del vidrio"], ["No sube/baja ese vidrio"]),
    fi(12, 7.5, "Direccionales", "Luces direccionales", ["Relé/destellador de direccionales", "Switch de direccionales"], ["No funcionan las direccionales"]),
    fi(13, 15, "Bomba de gasolina / unidad SRS", "Bomba de gasolina (a través del relé principal PGM-FI) y unidad SRS", ["Relé principal PGM-FI", "Bomba de gasolina", "Unidad SRS"], ["El motor da arranque pero no enciende (sin gasolina)", "Luz de SRS encendida"],
      { nota: "Las fuentes lo escriben 'Fuel Pump (SRS Unit)'. Una fuente de otro mercado lo describe como relé principal PGM-FI + bomba + unidad SRS." }),
    fi(14, 7.5, "Control de crucero", "Control de velocidad crucero", ["Unidad del crucero"], ["No funciona el crucero"]),
    fi(15, 7.5, "Alternador (señal IG) y sensor de velocidad", "Señal de encendido del alternador (ACG) y sensor de velocidad (SP SENSOR)", ["Alternador (señal de excitación)", "Sensor de velocidad del vehículo"], ["Luz de carga encendida / batería que se descarga", "Velocímetro en cero", "Código P0500"],
      { nota: "Una fuente de otro mercado le atribuye además el detector de carga eléctrica (ELD), EVAP y sensores de oxígeno: no confirmado para esta variante." }),
    fi(16, 7.5, "ABS", "Unidad de control del ABS", ["Unidad de control del ABS"], ["Luz de ABS encendida"]),
    fi(17, 7.5, "Relés de calefacción y A/C", "Bobinas de los relés de calefacción y aire acondicionado", ["Relé del soplador", "Relé del compresor A/C", "Relés de ventiladores"], ["No funciona el soplador o el A/C"]),
    fi(18, 7.5, "Relé de luces de circulación diurna", "Luces diurnas (DRL)", ["Relé de DRL"], ["No encienden las luces diurnas"], { condicion: "Solo modelo canadiense" }),
    fi(19, 7.5, "Luces de reversa", "Luces de reversa", ["Switch de posición de la palanca", "Bombillos de reversa"], ["No encienden las luces de reversa"]),
    fi(20, 7.5, "Luces de circulación diurna", "Luces diurnas (DRL)", ["Bombillos/unidad DRL"], ["No encienden las luces diurnas"], { condicion: "Solo modelo canadiense" }),
    fi(21, 10, "Luz baja derecha", "Faro derecho, luz baja", ["Bombillo de luz baja derecha"], ["No enciende la luz baja derecha"]),
    fi(22, 10, "Luz baja izquierda", "Faro izquierdo, luz baja", ["Bombillo de luz baja izquierda"], ["No enciende la luz baja izquierda"]),
    fi(23, 10, "SRS (bolsas de aire)", "Unidad SRS", ["Unidad SRS"], ["Luz de SRS encendida"], { nota: "Sistema de bolsas de aire: solo inspección visual del fusible; cualquier prueba en el circuito es para personal capacitado." }),
    fi(24, 7.5, "Relé de vidrios eléctricos", "Bobina del relé de vidrios eléctricos", ["Relé de vidrios eléctricos"], ["No funciona ningún vidrio eléctrico"]),
    fi(25, 7.5, "Tablero de instrumentos", "Medidores e indicadores del tablero", ["Tablero de instrumentos"], ["Agujas o testigos del tablero sin funcionar"]),
    fi(26, 20, "Limpiaparabrisas y lavador delantero", "Limpiaparabrisas y lavador delanteros", ["Motor del limpiaparabrisas", "Bomba del lavador"], ["No funcionan los limpiaparabrisas delanteros"]),
    fi(27, 10, "Toma de corriente delantera", "Encendedor / toma de accesorios delantera", ["Toma de corriente delantera"], ["No funciona la toma delantera (cargador del teléfono)"]),
    fi(28, 10, "Radio", "Radio (alimentación con llave)", ["Radio"], ["El radio no enciende"]),
    fi(29, null, "No usado", "—"),
    fi(30, 7.5, "Iluminación del tablero", "Luces del tablero y mandos", ["Iluminación de instrumentos"], ["No se ilumina el tablero de noche"]),
    fi(31, 7.5, "Señal de arranque", "Señal de arranque (STARTER SIGNAL)", ["Circuito de arranque", "Computadora (señal de arranque)"], ["No da arranque o arranca con dificultad"]),
    fi(32, 7.5, "Luz de placa y luces traseras", "Luces de posición traseras y de placa", ["Bombillos traseros y de placa"], ["No encienden las luces traseras"]),
    fi(33, 7.5, "Unidad de bloqueo (interlock)", "Bloqueo de la palanca y de la llave", ["Unidad interlock", "Solenoide de bloqueo de palanca"], ["La palanca no sale de P", "La llave no sale"]),
    fi(34, 7.5, "Repuesto", "Fusible de repuesto", [], [], { repuesto: true }), fi(35, 10, "Repuesto", "Fusible de repuesto", [], [], { repuesto: true }),
    fi(36, 15, "Repuesto", "Fusible de repuesto", [], [], { repuesto: true }), fi(37, 20, "Repuesto", "Fusible de repuesto", [], [], { repuesto: true }),
    fi(38, null, "No usado", "—"),
  ];

  // Bajo el capó. Dos fuentes coinciden en todo; una tercera difiere en las posiciones 4 y 5.
  const F2 = ["fuse_box_info", "fuseboxinfo_com"];
  const fm = (n, a, nombre, circuito, componentes = [], sintomas = [], extra = {}) => ({
    id: `MOT-${n}`, numero: n, amperaje: a, nombre, circuito, componentes, sintomas, principal: !!extra.principal,
    fuentes: extra.fuentes || [...F2, "autogenius"], verificacion: extra.verificacion || "secundaria_coincidente", nota: extra.nota || "",
    tipo_fusible: extra.tipo || "", condicion: "",
  });
  const MOTOR = [
    fm(1, 100, "Principal de batería", "Alimentación general desde la batería", ["Batería", "Caja de fusibles interior", "Todos los circuitos"], ["Nada eléctrico funciona", "El carro está 'muerto'"], { principal: true, tipo: "Fusible principal grande" }),
    fm(2, 40, "Principal de encendido y arranque", "Circuito del switch de encendido y arranque", ["Switch de encendido", "Relé/solenoide de arranque", "Circuitos con llave"], ["No da arranque y el tablero no enciende con la llave", "Varios sistemas sin alimentación a la vez"], { principal: true }),
    fm(3, 20, "Desempañador trasero", "Resistencia del vidrio trasero", ["Desempañador trasero", "Relé del desempañador"], ["No desempaña el vidrio trasero"]),
    fm(4, 40, "Vidrios eléctricos", "Alimentación principal de los vidrios eléctricos", ["Relé de vidrios", "Fusibles 7, 8, 10, 11 interiores"], ["No funciona ningún vidrio"],
      { fuentes: [...F2, "autogenius"], verificacion: "conflicto", nota: "fuse-box.info y fuseboxinfo.com: 40 A vidrios eléctricos. autogenius.info: 40 A 'Option'." }),
    fm(5, 40, "Opcional (option)", "Circuito opcional / accesorio", [], [],
      { fuentes: [...F2, "autogenius"], verificacion: "conflicto", nota: "fuse-box.info y fuseboxinfo.com: 40 A 'Option'. autogenius.info: 30 A motor del soplador." }),
    fm(6, 30, "Faros", "Alimentación de los faros", ["Switch de luces", "Fusibles 4, 5, 21, 22 interiores"], ["No enciende ningún faro"]),
    fm(7, 40, "Motor del soplador (calefacción)", "Motor del ventilador de la cabina", ["Motor del soplador", "Relé del soplador", "Resistencia de velocidades"], ["No sale aire por las rejillas"]),
    fm(8, 10, "Luces de emergencia", "Intermitentes de emergencia", ["Switch de emergencia", "Destellador"], ["No funcionan las luces de emergencia"]),
    fm(9, 15, "Claxon y luces de freno", "Claxon y luces de freno", ["Relé del claxon", "Switch de luces de freno"], ["No suena el claxon", "No encienden las luces de freno"]),
    fm(10, 20, "Seguros eléctricos", "Unidad de seguros eléctricos", ["Unidad de seguros", "Motores de seguros"], ["No funcionan los seguros eléctricos"]),
    fm(11, 20, "Ventilador del radiador", "Motor del ventilador del radiador", ["Relé del ventilador", "Motor del ventilador", "Switch/sensor de temperatura del ventilador"], ["El ventilador no enciende y el motor se calienta en el tráfico"]),
    fm(12, 20, "Ventilador del condensador", "Motor del ventilador del condensador (A/C)", ["Relé del ventilador del condensador", "Motor del ventilador"], ["El A/C enfría poco detenido", "Calentamiento con A/C encendido"]),
    fm(13, 15, "Computadora del motor (FI E/M, ECM/PCM)", "Alimentación de la inyección y la computadora", ["Computadora del motor (PCM)", "Relé principal PGM-FI"], ["El motor no enciende", "El escáner no conecta con la computadora", "Se apaga en marcha"]),
    fm(14, 7.5, "Memoria (radio)", "Alimentación permanente de memoria", ["Radio (memorias)", "Reloj"], ["El radio pierde las emisoras"]),
    fm(15, 7.5, "Luz interior", "Luces de cabina", ["Luz de techo", "Switches de puertas"], ["No enciende la luz de cabina"]),
  ];
  const RELES_MOTOR = [
    { id: "MOT-R-VENT", nombre: "Relé del ventilador del radiador", posicion: null, fuentes: ["startmycar", "fuseandrelay"], verificacion: "una_fuente", nota: "Mencionado en la caja bajo el capó; la posición exacta no está confirmada." },
    { id: "MOT-R-COND", nombre: "Relé del ventilador del condensador", posicion: null, fuentes: ["startmycar", "fuseandrelay"], verificacion: "una_fuente", nota: "Posición no confirmada." },
    { id: "MOT-R-AC", nombre: "Relé del embrague del compresor A/C", posicion: null, fuentes: ["startmycar", "fuseandrelay"], verificacion: "una_fuente", nota: "Posición no confirmada. Es una falla conocida en esta generación según publicaciones de repuestos." },
    { id: "MOT-R-SOPL", nombre: "Relé del motor del soplador", posicion: null, fuentes: ["startmycar", "fuseandrelay"], verificacion: "una_fuente", nota: "Posición no confirmada." },
  ];
  const ABS = [
    { id: "ABS-1", numero: 1, amperaje: 7.5, nombre: "Revisión del motor del ABS (motor check)", circuito: "Monitoreo del motor de la bomba del ABS", componentes: ["Unidad del ABS"], sintomas: ["Luz de ABS encendida"], fuentes: ["fuse_box_info", "autogenius"], verificacion: "secundaria_coincidente", nota: "" },
    { id: "ABS-2", numero: 2, amperaje: 20, nombre: "ABS +B", circuito: "Alimentación de la unidad del ABS", componentes: ["Unidad del ABS"], sintomas: ["Luz de ABS encendida"], fuentes: ["fuse_box_info", "autogenius"], verificacion: "secundaria_coincidente", nota: "" },
    { id: "ABS-3", numero: 3, amperaje: 40, nombre: "Motor de la bomba del ABS", circuito: "Motor de la bomba del ABS", componentes: ["Bomba del ABS", "Relé del motor del ABS"], sintomas: ["Luz de ABS encendida"], fuentes: ["fuse_box_info", "autogenius"], verificacion: "secundaria_coincidente", nota: "" },
  ];

  S.registrarFicha({
    id: "honda_crv_2000_b20z",
    marca: "Honda", modelo: "CR-V", anios: "2000–2001 (1ra generación, RD1)", motor: "B20Z 2.0 L DOHC (verificar código en el bloque)",
    transmision: "Automática de 4 velocidades (también existió manual)", traccion: "4x4 Real Time (también existió 4x2)",
    sistema_electrico: "12 V, negativo a tierra",
    protocolo: "OBD-II no CAN (lo vio ScanIA en la primera prueba real; se esperaba ISO 9141-2)",
    equipamiento_nota: "A/C, dirección hidráulica, ABS opcional según versión (LX/EX/SE). La caja del ABS solo existe si el carro tiene ABS.",
    perfil: "honda_crv_1g",
    coincide({ marca, modelo, anio }) {
      const m = String(marca || "").toLowerCase(), mo = String(modelo || "").toLowerCase().replace(/[\s-]/g, "");
      const a = Number(anio);
      return m.includes("honda") && mo.startsWith("crv") && (a === 2000 || a === 2001);
    },
    advertencias: [
      "No todas las CR-V 2000 tienen la misma caja: cambia por mercado (EE. UU., Canadá, Europa, Japón, Latinoamérica) y equipamiento (ABS, DRL).",
      "Antes de usar cualquier asignación, comparala con la etiqueta impresa en la tapa de tu caja. Cuando coincida, marcala como 'confirmada en mi carro'.",
      "Existe al menos una distribución publicada distinta para otro mercado (ver fuente fuseandrelay.com).",
      "Nunca pongas un fusible de más amperaje que el original: el fusible protege el cable; uno más grande puede causar un incendio.",
    ],
    fuentes: FUENTES_CRV,
    variantes: [{
      id: "us_ca_2000_2001",
      nombre: "EE. UU. / Canadá 2000–2001 (según el manual del propietario reproducido por fuentes secundarias)",
      mercado: "EE. UU. y Canadá. En Honduras muchos CR-V de esta generación vienen importados de EE. UU.: confirmalo con la tapa.",
      cajas: [
        { id: "interior", nombre: "Caja interior", ubicacion: "Debajo del tablero, lado del conductor. La tapa se baja y se saca de sus bisagras.", fuente_ubicacion: "manualowl_267",
          tipo_fusible: "Fusibles de hoja (tamaño por verificar: una fuente los lista como 'mini' y un vendedor de cajas usadas como 'estándar')",
          columnas: 6, fusibles: INTERIOR, reles: [
            { id: "INT-R-VIDRIOS", nombre: "Relé de vidrios eléctricos", posicion: null, fuentes: F3, verificacion: "secundaria_coincidente", nota: "Su alimentación es el fusible 24; la posición del relé no está confirmada." },
            { id: "INT-R-CALEF", nombre: "Relé de calefacción / A/C", posicion: null, fuentes: F3, verificacion: "secundaria_coincidente", nota: "El fusible 17 alimenta su bobina; posición no confirmada." },
          ] },
        { id: "motor", nombre: "Caja del compartimiento del motor", ubicacion: "En el compartimiento del motor. Se abre empujando la pestaña.", fuente_ubicacion: "manualowl_267",
          tipo_fusible: "Fusibles grandes (100/40/30 A) y de hoja; en Honda de esa época los grandes se revisan por la ventanita y pueden ir atornillados — verificar en tu caja",
          columnas: 5, fusibles: MOTOR, reles: RELES_MOTOR },
        { id: "abs", nombre: "Caja del ABS", ubicacion: "Compartimiento del motor, lado del pasajero. Solo en carros con ABS.", fuente_ubicacion: "manualowl_267",
          tipo_fusible: "Por verificar", columnas: 3, fusibles: ABS, reles: [
            { id: "ABS-R-MOTOR", nombre: "Relé del motor de la bomba del ABS", posicion: null, fuentes: ["startmycar", "fuseandrelay"], verificacion: "una_fuente", nota: "Posición no confirmada." },
          ] },
      ],
      reles_sueltos: [
        { id: "R-PGMFI", nombre: "Relé principal PGM-FI (alimenta la computadora y la bomba de gasolina)", posicion: null, ubicacion: "Ubicación por verificar (una publicación lo ubica detrás de la guantera, lado del pasajero; otras, debajo del tablero)",
          fuentes: ["fuseandrelay"], verificacion: "una_fuente", nota: "En Honda de esa época es una causa conocida de 'da arranque pero no enciende', sobre todo con calor. Confirmá ubicación y prueba con el manual de servicio." },
      ],
      diagramas: [],
      valores_referencia: [],
    }],
    componentes_motor: [
      { id: "map", nombre: "Sensor MAP (presión del múltiple)", nota: "El B20 usa MAP en lugar de MAF (confirmado por lo que reporta el carro)." },
      { id: "ect", nombre: "Sensor de temperatura del refrigerante (ECT)" },
      { id: "iat", nombre: "Sensor de temperatura del aire de admisión (IAT)" },
      { id: "tps", nombre: "Sensor de posición del acelerador (TPS)" },
      { id: "o2", nombre: "Sensores de oxígeno (antes y después del catalizador)" },
      { id: "vss", nombre: "Sensor de velocidad del vehículo (VSS)", nota: "Comparte el fusible 15 interior con la señal del alternador (según las tablas)." },
      { id: "ckp", nombre: "Sensores de giro/posición (CKP/TDC/CYP)", nota: "En motores Honda B de la época suelen ir dentro del distribuidor: verificar." },
      { id: "inyector", nombre: "Inyectores (4)" }, { id: "bobina", nombre: "Bobina de encendido (una, del distribuidor)" },
      { id: "iac", nombre: "Válvula de control de ralentí (IAC)" },
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);
