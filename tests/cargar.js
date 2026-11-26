/* Carga la lógica de ScanIA (sin interfaz) en Node, en el mismo orden que construir.py */
const path = require("node:path");
const LOGICA = ["codigos", "codigos_extra", "datos", "unidades", "simulador", "analizador", "ia", "elm327", "adaptador_virtual", "vin",
  "fabricantes", "informes", "pruebas", "perfiles", "fichas", "electrico", "almacen"];
for (const f of LOGICA) require(path.join(__dirname, "..", "src", f + ".js"));
module.exports = globalThis.ScanIA;
