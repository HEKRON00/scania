/* ScanIA · arquitectura para diagnóstico por fabricante
 *
 * IMPORTANTE (y honesto): el OBD2 genérico solo da acceso estandarizado a la computadora del motor y,
 * en muchos carros, a la de la transmisión. ABS, bolsas de aire (SRS), dirección eléctrica, carrocería (BCM)
 * y funciones avanzadas usan direcciones, comandos y tablas PROPIAS de cada marca.
 *
 * Este archivo NO inventa comandos propietarios. Define:
 *   1) Qué marcas reconoce la app (por el VIN o por lo que escribiste).
 *   2) Qué funciona hoy con OBD2 genérico en cada computadora.
 *   3) Qué se necesitaría (hardware y documentación) para lo demás.
 *   4) Un punto de extensión (S.registrarExtension) para agregar funciones validadas en el futuro,
 *      una por marca y computadora, sin tocar el resto del código.
 */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  const GENERICO = "Funciona con OBD2 genérico";
  const MODULOS_BASE = {
    motor: { nombre: "Motor (ECM/PCM)", estado: "disponible", detalle: `${GENERICO}: códigos (03/07/0A), datos en vivo (01), freeze frame (02), pruebas internas (06), VIN y calibración (09).` },
    transmision: { nombre: "Transmisión (TCM)", estado: "parcial", detalle: "Muchos carros CAN reportan los códigos de la transmisión por OBD2 genérico (la app los marca como 'Transmisión'). Datos propios (temperatura del aceite, presiones, adaptaciones) requieren comandos del fabricante." },
    abs: { nombre: "Frenos ABS / control de estabilidad", estado: "no_disponible", detalle: "No es parte del OBD2 genérico." },
    srs: { nombre: "Bolsas de aire (SRS)", estado: "no_disponible", detalle: "No es parte del OBD2 genérico. Además, por seguridad, ScanIA nunca enviará comandos a este módulo." },
    eps: { nombre: "Dirección eléctrica (EPS)", estado: "no_disponible", detalle: "No es parte del OBD2 genérico." },
    bcm: { nombre: "Carrocería (BCM)", estado: "no_disponible", detalle: "No es parte del OBD2 genérico." },
  };

  const REQUISITO_CAN = "Para leer estos módulos se necesita: (1) la dirección CAN de cada módulo y la lista de servicios/identificadores del fabricante (manual de servicio o software oficial), (2) validarlo en el carro real, y (3) un adaptador que permita cambiar encabezados de forma confiable (ELM327 v1.5 bueno, OBDLink, vLinker).";

  S.FABRICANTES = {
    toyota: { nombre: "Toyota / Lexus / Scion", wmi: ["JT", "2T", "4T", "5T", "MR0", "MHF", "8AJ", "9BR", "3TM"],
      nota: "Muchos Toyota usan sensores A/F (banda ancha) antes del catalizador; ScanIA los lee como λ. El software oficial es Techstream.",
      requisitos: REQUISITO_CAN + " En modelos anteriores a ~2008, ABS y bolsas de aire usan línea K y protocolos propios." },
    honda: { nombre: "Honda / Acura", wmi: ["JH", "1HG", "2HG", "3HG", "5FN", "5J6", "19X", "SHH"],
      nota: "Los códigos P1xxx y P2646/P2647 (VTEC) son comunes. El software oficial es HDS.",
      requisitos: REQUISITO_CAN + " Varios Honda anteriores a ~2006 usan un protocolo propio para ABS/SRS que un ELM327 no soporta." },
    nissan: { nombre: "Nissan / Infiniti", wmi: ["JN", "1N", "3N", "5N1", "VSK"], nota: "El software oficial es CONSULT.", requisitos: REQUISITO_CAN },
    hyundai: { nombre: "Hyundai", wmi: ["KMH", "5NP", "KM8", "MAL"], nota: "El software oficial es GDS.", requisitos: REQUISITO_CAN },
    kia: { nombre: "Kia", wmi: ["KNA", "KND", "5XY", "U5Y"], nota: "Comparte plataforma con Hyundai. El software oficial es GDS.", requisitos: REQUISITO_CAN },
    mazda: { nombre: "Mazda", wmi: ["JM", "3MZ", "MM"], nota: "Comparte protocolos con Ford en varios modelos.",
      requisitos: REQUISITO_CAN + " Algunos módulos van en una red CAN de velocidad media (pines 3 y 11) que requiere un adaptador con conmutador MS-CAN." },
    mitsubishi: { nombre: "Mitsubishi", wmi: ["JA", "MMB", "4A3", "ML3"], nota: "El software oficial es MUT.", requisitos: REQUISITO_CAN },
    ford: { nombre: "Ford / Lincoln", wmi: ["1F", "2F", "3F", "WF0", "MAJ"],
      nota: "Muchos módulos de carrocería van en la red MS-CAN (pines 3 y 11 del conector).",
      requisitos: REQUISITO_CAN + " Para MS-CAN hace falta un adaptador con conmutador HS/MS-CAN (por ejemplo OBDLink MX+ o ELM327 modificado)." },
    chevrolet: { nombre: "Chevrolet / GM", wmi: ["1G", "2G", "3G", "KL", "9BG", "8AG"],
      nota: "Varios módulos de GM usan CAN de un solo cable (pin 1).",
      requisitos: REQUISITO_CAN + " Para la red de un solo cable (SW-CAN, pin 1) hace falta un adaptador que la soporte (por ejemplo OBDLink MX+)." },
    volkswagen: { nombre: "Volkswagen / Audi / Seat / Skoda", wmi: ["WVW", "3VW", "1VW", "9BW", "WAU", "TMB", "VSS"],
      nota: "El grupo VW usa su propio protocolo de diagnóstico para módulos no legislados.", requisitos: REQUISITO_CAN },
    suzuki: { nombre: "Suzuki", wmi: ["JS", "MA3", "TSM"], requisitos: REQUISITO_CAN },
    subaru: { nombre: "Subaru", wmi: ["JF", "4S"], requisitos: REQUISITO_CAN },
    isuzu: { nombre: "Isuzu", wmi: ["JAA", "MP"], requisitos: REQUISITO_CAN },
  };

  const EXTENSIONES = [];
  /**
   * Agrega una función validada para una marca y módulo. Ejemplo (futuro):
   *   S.registrarExtension({ marca: "toyota", modulo: "transmision", id: "temp_atf", nombre: "Temperatura del ATF",
   *     validado: true, fuente: "manual de servicio ...", leer: async (elm) => {...} })
   * Solo se muestran en la app las que tengan validado: true.
   */
  S.registrarExtension = function (ext) {
    if (!ext || !S.FABRICANTES[ext.marca] || !MODULOS_BASE[ext.modulo] || !ext.id || typeof ext.leer !== "function") throw new Error("Extensión inválida");
    // Una función marcada como validada debe decir de dónde salen sus comandos (manual, documentación oficial, prueba en el carro)
    if (ext.validado === true && !String(ext.fuente || "").trim()) throw new Error("Una extensión validada debe indicar su fuente");
    // Solo lectura: ScanIA no acciona componentes ni modifica sistemas de seguridad
    if (ext.escribe || ext.actuador) throw new Error("Las extensiones solo pueden leer datos");
    EXTENSIONES.push(ext);
  };
  S.extensiones = (marca) => EXTENSIONES.filter((e) => e.marca === marca && e.validado === true);

  /** Detecta la marca por el VIN (WMI) o por el texto que escribió el usuario. */
  S.detectarFabricante = function ({ vin, marca } = {}) {
    const v = String(vin || "").toUpperCase();
    if (v.length >= 3) {
      let mejor = null;
      for (const [id, f] of Object.entries(S.FABRICANTES)) for (const p of f.wmi) if (v.startsWith(p) && (!mejor || p.length > mejor.p.length)) mejor = { id, p };
      if (mejor) return mejor.id;
    }
    const m = String(marca || "").toLowerCase();
    if (!m) return null;
    const alias = { lexus: "toyota", scion: "toyota", acura: "honda", infiniti: "nissan", lincoln: "ford", gmc: "chevrolet", gm: "chevrolet", audi: "volkswagen", vw: "volkswagen", seat: "volkswagen", skoda: "volkswagen" };
    for (const [a, id] of Object.entries(alias)) if (m.includes(a)) return id;
    for (const id of Object.keys(S.FABRICANTES)) if (m.includes(id)) return id;
    return null;
  };

  /** Qué se puede leer de cada computadora de esa marca hoy, y qué faltaría. */
  S.capacidades = function (fabricante) {
    const f = S.FABRICANTES[fabricante];
    const ext = fabricante ? S.extensiones(fabricante) : [];
    return Object.entries(MODULOS_BASE).map(([id, m]) => {
      const propias = ext.filter((e) => e.modulo === id);
      return {
        id, nombre: m.nombre, estado: propias.length ? "disponible" : m.estado,
        detalle: m.detalle + (propias.length ? ` Funciones propias de la marca: ${propias.map((e) => e.nombre).join(", ")}.` : ""),
        requiere: m.estado === "disponible" ? "" : f ? f.requisitos : REQUISITO_CAN,
      };
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
