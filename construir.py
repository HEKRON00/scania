"""
Arma la app web de ScanIA a partir de src/:
  index.html, manifest.webmanifest, sw.js, icon-*.png  (en la raíz del repositorio: GitHub Pages los publica tal cual)
  dist/ScanIA.html                                     (la app completa en un solo archivo, para usar sin internet en la laptop)

    python3 construir.py

Requiere Python 3 con Pillow (pip install pillow) solo para dibujar los íconos.
"""

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent
SRC = RAIZ / "src"
DIST = RAIZ / "dist"
WEB = RAIZ   # GitHub Pages publica la raíz de la rama main

ORDEN_JS = ["codigos", "codigos_extra", "datos", "unidades", "simulador", "analizador", "ia", "elm327", "adaptador_virtual", "vin",
            "fabricantes", "informes", "pruebas", "perfiles", "almacen", "ui_base", "ui_conexion", "ui_pruebas", "ui_ia", "ui_carros", "ui_mas", "app"]

# Silueta del motor del logo (mismo trazo que el SVG, en una caja de 48x48)
MOTOR = [(8, 30), (8, 22), (12, 22), (15, 17), (26, 17), (29, 20), (34, 20), (34, 17), (38, 17), (38, 23),
         (41, 23), (41, 20), (44, 20), (44, 33), (41, 33), (41, 30), (38, 30), (38, 35), (32, 35), (29, 38),
         (16, 38), (13, 35), (8, 35)]


def icono(tamano, margen_seguro=False):
    s = 4  # sobremuestreo para bordes suaves
    t = tamano * s
    img = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if margen_seguro:
        d.rectangle([0, 0, t, t], fill="#0d0f13")
    else:
        d.rounded_rectangle([0, 0, t - 1, t - 1], radius=int(t * 0.22), fill="#0d0f13")
    escala = (0.62 if margen_seguro else 0.78) * t / 36       # el motor mide 36 de ancho
    cx, cy = 26, 27.5                                          # centro del motor en la caja original
    puntos = [((x - cx) * escala + t / 2, (y - cy) * escala + t / 2) for x, y in MOTOR]
    d.polygon(puntos, fill="#f5a524")
    return img.resize((tamano, tamano), Image.LANCZOS)


def construir():
    css = (SRC / "estilos.css").read_text(encoding="utf-8")
    js = "\n".join((SRC / f"{n}.js").read_text(encoding="utf-8") for n in ORDEN_JS)
    if "</script" in js.lower():
        raise SystemExit("El JavaScript contiene '</script': no se puede incrustar.")
    html = (SRC / "plantilla.html").read_text(encoding="utf-8")
    html = html.replace("/*CSS*/", css).replace("/*JS*/", js)

    version = hashlib.sha1(html.encode()).hexdigest()[:10]
    DIST.mkdir(exist_ok=True)
    viejo = DIST / "web"
    if viejo.exists():
        shutil.rmtree(viejo)

    # Solo la versión publicada es instalable (manifiesto + service worker); ScanIA.html funciona suelto
    web = html.replace("</head>", '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-192.png">\n</head>', 1)
    (WEB / "index.html").write_text(web, encoding="utf-8")
    (DIST / "ScanIA.html").write_text(html, encoding="utf-8")

    manifiesto = {
        "name": "ScanIA · Diagnóstico OBD2",
        "short_name": "ScanIA",
        "description": "Escáner OBD2 con diagnóstico por inteligencia artificial para adaptadores ELM327.",
        "lang": "es",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "orientation": "any",
        "background_color": "#0d0f13",
        "theme_color": "#0d0f13",
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (WEB / "manifest.webmanifest").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8")

    sw = f"""/* ScanIA · service worker: permite abrir la app sin internet. Versión {version} */
const CACHE = "scania-{version}";
const ARCHIVOS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (e) => {{
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
}});
self.addEventListener("activate", (e) => {{
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
}});
self.addEventListener("fetch", (e) => {{
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;  // la IA va directo a internet
  // Primero internet (para recibir actualizaciones); si no hay, la copia guardada
  e.respondWith(
    fetch(e.request)
      .then((r) => {{ if (r.ok) {{ const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }} return r; }})
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
}});
"""
    (WEB / "sw.js").write_text(sw, encoding="utf-8")

    icono(192).save(WEB / "icon-192.png")
    icono(512).save(WEB / "icon-512.png")
    icono(512, margen_seguro=True).save(WEB / "icon-maskable-512.png")
    print(f"Listo: index.html y dist/ScanIA.html ({len(html) // 1024} KB, versión {version})")


if __name__ == "__main__":
    construir()
