/**
 * ScanIA · servidor de IA (Cloudflare Worker)
 *
 * La clave de Anthropic vive SOLO aquí, como secreto del Worker (variable de entorno). La app nunca la ve.
 *
 * Secretos (wrangler secret put ... o en el panel de Cloudflare → Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY   clave de console.anthropic.com
 *   CODIGO_FAMILIAR     código que se pone en la app (mínimo 8 caracteres)
 * Variables normales (opcionales):
 *   ORIGENES            sitios permitidos separados por coma. Ej: https://hekron00.github.io
 *                       (agregá "null" si abrís ScanIA.html como archivo en la laptop)
 *   MODELOS             modelos permitidos separados por coma (por defecto: claude-sonnet-5-5,claude-opus-5-5)
 *   LIMITE_POR_MINUTO   solicitudes por minuto por dirección IP (por defecto 8)
 *   LIMITE_POR_DIA      solicitudes por día en total (por defecto 120)
 * Protección extra: 6 códigos equivocados desde la misma IP en 15 min la bloquean 15 min; máximo 6 fotos por consulta,
 * 8,000 tokens de respuesta y 5 búsquedas web por consulta (control de costos).
 * Opcional: un espacio KV llamado LIMITES para que el límite diario sea exacto entre servidores.
 *
 * Rutas:
 *   POST /v1/probar      → comprueba el código familiar (no gasta IA)
 *   POST /v1/mensajes    → reenvía la consulta a Claude con las reglas de abajo
 */

const MODELOS_POR_DEFECTO = ["claude-sonnet-5-5", "claude-opus-5-5"];
const MAX_TOKENS = 8000;
const MAX_CUERPO = 9 * 1024 * 1024;     // fotos incluidas
const MAX_MENSAJES = 40;
const MAX_SISTEMA = 30000;
const MAX_IMAGENES = 6;
const MAX_FALLOS = 6;                   // códigos equivocados por IP antes de bloquear
const VENTANA_FALLOS = 15 * 60000;      // 15 minutos

const porMinuto = new Map();            // ip -> [marcas de tiempo]  (memoria del servidor, aproximado)
const porDia = { fecha: "", cuenta: 0 };
const fallos = new Map();               // ip -> [marcas de tiempo de códigos equivocados]

function bloqueada(ip) {
  const ahora = Date.now();
  const l = (fallos.get(ip) || []).filter((t) => ahora - t < VENTANA_FALLOS);
  fallos.set(ip, l);
  return l.length >= MAX_FALLOS;
}
function anotarFallo(ip) {
  const l = fallos.get(ip) || [];
  l.push(Date.now());
  fallos.set(ip, l);
  if (fallos.size > 5000) fallos.clear();
}

function igualSeguro(a, b) {
  a = String(a || ""); b = String(b || "");
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0;
}

function respuesta(cuerpo, status, cors) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors } });
}

function corsPara(origen, env) {
  const permitidos = String(env.ORIGENES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = !permitidos.length || permitidos.includes(origen);
  return {
    ok,
    headers: ok ? {
      "access-control-allow-origin": origen || "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-codigo-familiar",
      "access-control-max-age": "86400",
      vary: "Origin",
    } : {},
  };
}

async function limiteDiario(env, limite) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (env.LIMITES && env.LIMITES.get) {
    const k = "dia:" + hoy;
    const n = Number((await env.LIMITES.get(k)) || 0);
    if (n >= limite) return false;
    await env.LIMITES.put(k, String(n + 1), { expirationTtl: 172800 });
    return true;
  }
  if (porDia.fecha !== hoy) { porDia.fecha = hoy; porDia.cuenta = 0; }
  if (porDia.cuenta >= limite) return false;
  porDia.cuenta++;
  return true;
}

function limiteMinuto(ip, limite) {
  const ahora = Date.now();
  const lista = (porMinuto.get(ip) || []).filter((t) => ahora - t < 60000);
  if (lista.length >= limite) { porMinuto.set(ip, lista); return false; }
  lista.push(ahora);
  porMinuto.set(ip, lista);
  if (porMinuto.size > 5000) porMinuto.clear();
  return true;
}

/** Limpia y valida lo que manda la app antes de reenviarlo a Anthropic. */
export function validarCuerpo(c, env) {
  if (!c || typeof c !== "object") throw new Error("Cuerpo inválido");
  const modelos = String(env.MODELOS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const permitidos = modelos.length ? modelos : MODELOS_POR_DEFECTO;
  if (!permitidos.includes(c.model)) throw new Error(`Modelo no permitido: ${c.model}`);
  if (!Array.isArray(c.messages) || !c.messages.length || c.messages.length > MAX_MENSAJES) throw new Error("Mensajes inválidos");
  let imagenes = 0;
  for (const m of c.messages) {
    if (!m || !["user", "assistant"].includes(m.role)) throw new Error("Rol inválido");
    if (typeof m.content !== "string" && !Array.isArray(m.content)) throw new Error("Contenido inválido");
    if (Array.isArray(m.content)) imagenes += m.content.filter((b) => b && b.type === "image").length;
  }
  if (imagenes > MAX_IMAGENES) throw new Error(`Demasiadas fotos (máximo ${MAX_IMAGENES})`);
  if (c.system != null && (typeof c.system !== "string" || c.system.length > MAX_SISTEMA)) throw new Error("Instrucciones inválidas");
  const limpio = {
    model: c.model,
    max_tokens: Math.min(Math.max(1, Number(c.max_tokens) || 1024), MAX_TOKENS),
    messages: c.messages,
  };
  if (c.system) limpio.system = c.system;
  // Solo se permite la herramienta de búsqueda web, con pocas búsquedas
  if (Array.isArray(c.tools)) {
    const t = c.tools.find((x) => x && x.type === "web_search_20250305");
    if (t) limpio.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: Math.min(Number(t.max_uses) || 3, 5),
      ...(t.user_location ? { user_location: t.user_location } : {}) }];
  }
  return limpio;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origen = request.headers.get("Origin") || "";
    const cors = corsPara(origen, env);
    if (request.method === "OPTIONS") return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    if (request.method !== "POST" || !["/v1/probar", "/v1/mensajes"].includes(url.pathname)) return respuesta({ error: { message: "No encontrado" } }, 404, cors.headers);
    if (!cors.ok) return respuesta({ error: { message: "Este sitio no está autorizado en el servidor de IA (revisá ORIGENES)." } }, 403, {});
    if (!env.ANTHROPIC_API_KEY || !env.CODIGO_FAMILIAR || String(env.CODIGO_FAMILIAR).length < 8) {
      return respuesta({ error: { message: "El servidor no está configurado: faltan ANTHROPIC_API_KEY o CODIGO_FAMILIAR (mínimo 8 caracteres)." } }, 500, cors.headers);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    // Después de varios códigos equivocados, esa dirección queda bloqueada un rato (evita adivinar el código)
    if (bloqueada(ip)) return respuesta({ error: { message: "Demasiados intentos con un código equivocado. Esperá 15 minutos." } }, 429, cors.headers);
    if (!igualSeguro(request.headers.get("x-codigo-familiar"), env.CODIGO_FAMILIAR)) {
      anotarFallo(ip);
      await new Promise((r) => setTimeout(r, 400));
      return respuesta({ error: { message: "Código familiar incorrecto." } }, 401, cors.headers);
    }
    if (url.pathname === "/v1/probar") return respuesta({ ok: true }, 200, cors.headers);

    if (!limiteMinuto(ip, Number(env.LIMITE_POR_MINUTO) || 8)) return respuesta({ error: { message: "Demasiadas consultas seguidas. Esperá un minuto." } }, 429, cors.headers);
    const largo = Number(request.headers.get("content-length") || 0);
    if (largo > MAX_CUERPO) return respuesta({ error: { message: "La consulta es demasiado grande (¿muchas fotos?)." } }, 413, cors.headers);

    let cuerpo;
    try {
      const texto = await request.text();
      if (texto.length > MAX_CUERPO) return respuesta({ error: { message: "La consulta es demasiado grande (¿muchas fotos?)." } }, 413, cors.headers);
      cuerpo = validarCuerpo(JSON.parse(texto), env);
    } catch (e) {
      return respuesta({ error: { message: "Consulta inválida: " + e.message } }, 400, cors.headers);
    }
    if (!(await limiteDiario(env, Number(env.LIMITE_POR_DIA) || 120))) return respuesta({ error: { message: "Se alcanzó el límite de consultas de hoy." } }, 429, cors.headers);

    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      return respuesta({ error: { message: "El servidor no pudo comunicarse con la IA." } }, 502, cors.headers);
    }
    const datos = await r.text();
    return new Response(datos, { status: r.status, headers: { "content-type": "application/json; charset=utf-8", ...cors.headers } });
  },
};
