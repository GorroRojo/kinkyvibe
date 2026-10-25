# 0049. Caché de 1 minuto para quien no tiene sesión

- Fecha: 2026-10-25
- Estado: Aceptada (gorrite, 25/10, en el chat).

## Contexto

Cada página pública se dibuja de nuevo en cada visita, y la base D1 está lejos (en el este de
EE. UU.): una página de evento hace varias consultas seguidas. La gran mayoría de las visitas son
de gente sin cuenta, que ve exactamente la misma página.

## Decisión

- **Las páginas públicas se guardan 1 minuto en la caché de Cloudflare para quien no tiene
  sesión.** Un cambio en el panel puede tardar hasta 1 minuto en verse para esas visitas (lo
  aceptó gorrite).
- **Quien tiene sesión (cuenta o admin) siempre ve la página recién hecha**, nunca una guardada.
- Va en `worker/index.js` (`src/lib/server/edgeCache.js`), no en los hooks: el adapter busca en
  su caché por URL antes de los hooks y le serviría la página anónima a quien tiene sesión.
- **Todo por lista de lo permitido**; lo que no está en la lista no usa la caché:
  - Pedido: `GET`, que pide HTML (`accept` con `text/html`), en `kinkyvibe.ar` por https, sin
    `Authorization`, sin headers `x-sveltekit-*`, sin cookies (o solo las de Cloudflare:
    `__cf_bm`, `cf_clearance`, `_cfuvid`) y con un query string hecho solo de parámetros conocidos
    (búsqueda, filtros, fecha del calendario, `utm_*`).
  - Rutas nunca guardadas (y lo de abajo): `/admin`, `/edit`, `/api`, `/entradas`, `/mi-rincon`,
    `/ingresar`, `/login`, `/logout`, `/callback`, `/mails`, `/avisos`, `/lista-de-espera`,
    `/propinas`, `/telegram`, `/auch`, `/errores`, `/imagenes`, `/media`, `/og`, y cualquier
    ruta con un segmento `entradas` (la página de compra de un evento) o `__data.json`.
  - Respuesta: 200, HTML, sin `Set-Cookie`, sin `cache-control` con `private`, `no-store` o
    `no-cache` (los eventos ocultos ya lo mandan) y sin `Vary` salvo `Accept-Encoding`.
- La clave lleva la versión del build: cada deploy empieza con la caché vacía.
- Los Previews y local nunca usan la caché.
- El header `x-kv-cache: HIT|MISS|BYPASS` dice qué pasó (para verificar).
- Se apaga sin deploy con la variable `KV_EDGE_CACHE = "off"` en el panel.

## Descartado

- **`s-maxage` desde los hooks** (`setHeaders`): el adapter guardaría por URL y le serviría la
  página sin sesión también a quien tiene sesión.
- **Guardar más de 1 minuto o borrar la caché al guardar en el panel**: más complejo; 1 minuto
  alcanza para aliviar la base.

## Consecuencias

- Una página nueva que muestre algo distinto según quién mira tiene que leer la sesión (cookie)
  como las de hoy: sin cookie, la página tiene que ser la misma para todes. Si depende de un
  parámetro nuevo del query string, no se guarda hasta sumarlo a la lista.
- Una cookie nueva del sitio hace que el pedido no use la caché (está fuera de la lista): es lo
  seguro.
- Cómo verificar y apagar: [workers-migracion.md](../workers-migracion.md#caché-de-1-minuto-para-quien-no-tiene-sesión).
