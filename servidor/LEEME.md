# Servidor de IA de ScanIA (Cloudflare Worker, gratis)

La clave de Anthropic **no se guarda nunca en la app, ni en el teléfono, ni en GitHub**. Vive solo como secreto en este pequeño servidor. La app le habla al servidor con un **código familiar**, y el servidor:

- revisa el código familiar,
- solo acepta pedidos de tu página (la de GitHub Pages),
- limita las consultas por minuto y por día,
- solo permite los modelos que vos digás,
- y reenvía la consulta a Claude con tu clave.

El plan gratis de Cloudflare Workers alcanza de sobra para uso familiar.

## Opción A: desde el navegador (sin instalar nada)

1. Creá una cuenta en https://dash.cloudflare.com (gratis).
2. Andá a **Workers & Pages → Create → Create Worker**. Ponele de nombre `scania-ia` y dale **Deploy**.
3. Tocá **Edit code**, borrá todo lo que trae, pegá el contenido de `worker.js` y dale **Deploy**.
4. Andá a **Settings → Variables and Secrets** y agregá:
   - `ANTHROPIC_API_KEY` → tipo **Secret** → tu clave de console.anthropic.com
   - `CODIGO_FAMILIAR` → tipo **Secret** → un código de al menos 8 caracteres (ej. `Catracho-2026-carros`)
   - `ORIGENES` → tipo **Text** → `https://hekron00.github.io` (agregá `,null` si también usás `ScanIA.html` como archivo en la laptop)
5. Copiá la dirección del Worker (algo como `https://scania-ia.TU-CUENTA.workers.dev`).
6. En ScanIA: **⚙ Ajustes → Servidor de IA**. Pegá la dirección y el código familiar y tocá **Probar**.

## Opción B: con la terminal

```bash
cd servidor
npx wrangler login
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put CODIGO_FAMILIAR
```

`ORIGENES` ya viene con `https://hekron00.github.io` en `wrangler.toml`; cambialo si publicás la app en otro sitio.

## Seguridad

- Nunca subás la clave ni el código familiar a GitHub. `wrangler.toml` no los contiene.
- Si alguien se entera del código familiar, cambialo en Cloudflare: todos los teléfonos tienen que poner el nuevo.
- Para limitar el gasto, en console.anthropic.com podés poner un **límite de gasto mensual**.
- El límite por minuto es aproximado (se guarda en memoria). Para un límite diario exacto, creá un KV namespace llamado `LIMITES` y conectalo al Worker.
