/* ScanIA · decodificar el VIN (marca, modelo, año, motor) */
(function (raiz) {
  const S = (raiz.ScanIA = raiz.ScanIA || {});

  // Fabricantes más comunes (primeros caracteres del VIN = WMI)
  const WMI = [
    ["JT", "Toyota (Japón)"], ["2T", "Toyota (Canadá)"], ["4T", "Toyota (EE. UU.)"], ["5T", "Toyota (EE. UU.)"], ["MR0", "Toyota (Tailandia)"], ["MHF", "Toyota (Indonesia)"],
    ["8AJ", "Toyota (Argentina)"], ["9BR", "Toyota (Brasil)"], ["3TM", "Toyota (México)"], ["JTD", "Toyota (Japón)"],
    ["JH", "Honda (Japón)"], ["1HG", "Honda (EE. UU.)"], ["2HG", "Honda (Canadá)"], ["3HG", "Honda (México)"], ["5FN", "Honda (EE. UU.)"], ["5J6", "Honda (EE. UU.)"],
    ["JN", "Nissan (Japón)"], ["1N", "Nissan (EE. UU.)"], ["3N", "Nissan (México)"], ["5N1", "Nissan (EE. UU.)"],
    ["KMH", "Hyundai (Corea)"], ["5NP", "Hyundai (EE. UU.)"], ["KM8", "Hyundai (Corea)"], ["KNA", "Kia (Corea)"], ["KND", "Kia (Corea)"], ["5XY", "Kia (EE. UU.)"],
    ["JM", "Mazda (Japón)"], ["JS", "Suzuki (Japón)"], ["MA3", "Suzuki (India)"], ["JA", "Mitsubishi (Japón)"], ["MMB", "Mitsubishi (Tailandia)"], ["JF", "Subaru (Japón)"], ["4S", "Subaru (EE. UU.)"],
    ["JAA", "Isuzu (Japón)"], ["MP", "Isuzu (Tailandia)"], ["WVW", "Volkswagen (Alemania)"], ["3VW", "Volkswagen (México)"], ["1VW", "Volkswagen (EE. UU.)"], ["9BW", "Volkswagen (Brasil)"],
    ["1G", "General Motors (EE. UU.)"], ["2G", "General Motors (Canadá)"], ["3G", "General Motors (México)"], ["KL", "GM Daewoo / Chevrolet (Corea)"],
    ["1F", "Ford (EE. UU.)"], ["2F", "Ford (Canadá)"], ["3F", "Ford (México)"], ["1C", "Chrysler / Jeep / Dodge (EE. UU.)"], ["2C", "Chrysler (Canadá)"], ["3C", "Chrysler (México)"],
    ["WBA", "BMW (Alemania)"], ["WDD", "Mercedes-Benz (Alemania)"], ["WDB", "Mercedes-Benz (Alemania)"], ["WAU", "Audi (Alemania)"], ["VF", "Peugeot / Renault (Francia)"],
    ["LS", "China (varias marcas)"], ["LG", "China (varias marcas)"], ["LV", "China (varias marcas)"],
  ];
  const ANIOS = "ABCDEFGHJKLMNPRSTVWXY123456789";

  S.vinValido = (vin) => /^[A-HJ-NPR-Z0-9]{17}$/.test(String(vin || "").toUpperCase());

  /** Decodificación sin internet: fabricante y año del modelo. */
  S.decodificarVINLocal = function (vin) {
    vin = String(vin || "").toUpperCase();
    if (!S.vinValido(vin)) return null;
    const f = WMI.find(([p]) => vin.startsWith(p));
    const i = ANIOS.indexOf(vin[9]);
    let anio = null;
    if (i >= 0) {
      const actual = new Date().getFullYear() + 1;
      // el ciclo de 30 años se repite: se elige el año más reciente que no sea del futuro
      anio = 1980 + i;
      while (anio + 30 <= actual) anio += 30;
    }
    return { fabricante: f ? f[1] : null, anio: anio ? String(anio) : null };
  };

  /** Decodificación completa con la base gratuita de la NHTSA (necesita internet). */
  S.decodificarVIN = async function (vin) {
    vin = String(vin || "").toUpperCase().trim();
    const local = S.decodificarVINLocal(vin);
    if (!local) throw new Error("El VIN debe tener 17 caracteres (sin I, O ni Q).");
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: ctl.signal });
      clearTimeout(timer);
      const d = ((await r.json()).Results || [])[0] || {};
      const v = (k) => (d[k] && String(d[k]).trim() && d[k] !== "Not Applicable" ? String(d[k]).trim() : "");
      const cap = (t) => t.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
      const res = {
        marca: v("Make") ? cap(v("Make")) : "", modelo: v("Model"), anio: v("ModelYear") || local.anio || "",
        cilindrada: v("DisplacementL") ? String(Math.round(parseFloat(v("DisplacementL")) * 10) / 10) : "",
        cilindros: v("EngineCylinders"), codigo_motor: v("EngineModel"), combustible: { Gasoline: "Gasolina", Diesel: "Diésel", Electric: "Eléctrico" }[v("FuelTypePrimary")] || v("FuelTypePrimary"),
        transmision: v("TransmissionStyle"), traccion: v("DriveType"), carroceria: v("BodyClass"), version: v("Trim"),
        pais: v("PlantCountry"), fabricante: local.fabricante, fuente: "NHTSA",
      };
      if (!res.marca && !res.modelo) return { ...local, anio: local.anio || "", fuente: "local" };
      return res;
    } catch (e) {
      return { marca: "", modelo: "", anio: local.anio || "", fabricante: local.fabricante, fuente: "local (sin internet)" };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
