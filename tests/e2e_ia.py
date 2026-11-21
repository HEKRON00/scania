"""Prueba de la pantalla de IA con un servidor de IA falso (no gasta nada ni usa claves).
Uso: python3 tests/e2e_ia.py"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
DIAG = {"resumen": "Hay fallos de encendido en el cilindro 2 con evidencia del contador interno.", "datos_suficientes": True, "que_falta": "",
  "urgencia": {"nivel": "pronto", "puede_manejar": True, "explicacion": "Evitá cargas pesadas: si la luz parpadea, no manejés."},
  "problemas": [{"problema": "Fallo de encendido en cilindro 2", "estado": "confirmado", "evidencias": ["P0302 almacenado", "41 fallos en modo 06"],
    "causas": [{"causa": "Bobina del cilindro 2", "confianza": "alta", "por_que": "Falla típica", "en_contra": ""}, {"causa": "Bujía gastada", "confianza": "media", "por_que": "", "en_contra": ""}],
    "alternativas": ["Inyector"], "prueba": {"descripcion": "Intercambiá la bobina 2 con la 3 y repetí la prueba de fallos.", "resultado_esperado": "Si el fallo pasa al 3, es la bobina.", "herramientas": ["llave 10 mm"], "donde": "casa", "riesgo": "bajo"},
    "no_reemplazar": "El catalizador ni la computadora."}],
  "siguiente_paso": "Intercambiar bobinas 2 y 3.", "evidencias_clave": ["P0302 almacenado", "P0420 del catalizador"], "limitaciones": ["Sin prueba de compresión."], "descartado": [], "datos_a_vigilar": ["Contador de fallos"], "preguntas": ["¿Cuándo cambiaste las bujías?"], "fallas_conocidas": [], "nota_seguridad": ""}
async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "--bind", "127.0.0.1"], cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    pedidos = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1280, "height": 900})
        err = []; pg.on("pageerror", lambda e: err.append(str(e)))
        async def ruta(route):
            req = route.request
            cuerpo = json.loads(req.post_data or "{}")
            pedidos.append({"url": req.url, "headers": req.headers, "body": cuerpo})
            if req.url.endswith("/v1/probar"):
                await route.fulfill(status=200, headers={"access-control-allow-origin": "*"}, body='{"ok":true}'); return
            texto = json.dumps(DIAG, ensure_ascii=False) if len(cuerpo.get("messages", [])) == 1 else "Sí: primero intercambiá las bobinas. Si el fallo se muda, cambiá la bobina."
            await route.fulfill(status=200, headers={"access-control-allow-origin": "*", "content-type": "application/json"},
                body=json.dumps({"content": [{"type": "text", "text": texto}], "stop_reason": "end_turn"}))
        await pg.route("https://ia.ejemplo.dev/**", ruta)
        await pg.goto("http://127.0.0.1:8767/")
        await pg.click("#btn-ajustes"); await pg.fill("#aj-servidor", "https://ia.ejemplo.dev"); await pg.fill("#aj-codigo", "codigo-familiar-123")
        await pg.click("#aj-probar"); await pg.wait_for_timeout(800); print("probar:", await pg.text_content("#aj-prueba"))
        await pg.click("#aj-guardar")
        # carro con VIN para verificar que NO se envía
        await pg.evaluate("""() => { const id = ScanIA.almacen.guardarCarro({marca:'Toyota', modelo:'Corolla', anio:'2012', vin:'1HGCM82633A004352', cilindrada:'1.8'}); ScanIA.almacen.elegirCarro(id); ScanIA.ui.emit('carro'); }""")
        await pg.click('#nav button[data-vista="escanear"]'); await pg.click('.pestana[data-modo="simulador"]')
        await pg.select_option("#sel-escenario", "misfire_cil2"); await pg.click("#btn-conectar-sim")
        await pg.wait_for_function("!document.querySelector('#btn-revision').classList.contains('cargando') && document.querySelector('#texto-conexion').textContent.startsWith('Simulador')", timeout=60000)
        await pg.click('#nav button[data-vista="ia"]')
        await pg.fill("#sintomas", "Tiembla en ralentí")
        await pg.uncheck("#ia-buscar")
        await pg.click("#btn-ia")
        await pg.wait_for_selector("#resultado-ia .problema-ia", timeout=20000)
        print("diag:", (await pg.inner_text("#resultado-ia"))[:300].replace("\n", " | "))
        await pg.fill("#chat-texto", "¿Qué hago primero?"); await pg.click("#chat-form button[type=submit]")
        await pg.wait_for_function("document.querySelectorAll('#chat-mensajes .burbuja.ia:not(.pensando)').length >= 1", timeout=20000)
        res = await pg.inner_text("#resultado-ia")
        print("verificación:", "P0420" in res and "NO está entre los leídos" in res, "| limitaciones:", "Sin prueba de compresión" in res)
        assert "P0420" in res and "NO está entre los leídos" in res, "ScanIA debe avisar si la IA cita un código que no se leyó"
        assert "Sin prueba de compresión" in res, "se muestran las limitaciones"
        print("chat:", await pg.inner_text("#chat-mensajes"))
        os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "capturas"), exist_ok=True)
        await pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "capturas", "ia.png"), full_page=True)
        d = pedidos[1]
        prim = d["body"]["messages"][0]["content"]
        prim = prim if isinstance(prim, str) else json.dumps(prim)
        print("cabecera código:", d["headers"].get("x-codigo-familiar"), "| sin clave anthropic:", "x-api-key" not in d["headers"])
        print("VIN enviado?:", "1HGCM82633A004352" in prim, "| VIN simulador enviado?:", "9SCANA0SMVL000001" in prim, "| dice SIMULADOR:", "SIMULADOR" in prim)
        print("modelo:", d["body"].get("model"), "tools:", d["body"].get("tools"))
        hist = await pg.evaluate("ScanIA.almacen.historial().map(h => [h.carroId, h.simulado, (h.chat||[]).length])")
        print("historial:", hist, "errores:", err)
        assert "1HGCM82633A004352" not in prim, "el VIN no debe salir sin permiso"
        assert "x-api-key" not in d["headers"], "la app nunca manda una clave de Anthropic"
        assert d["headers"].get("x-codigo-familiar") == "codigo-familiar-123"
        assert not err, err
        print("TODO BIEN")
        await b.close()
    srv.terminate()
asyncio.run(main())
