# kinkyvibe-cron

> **Se va con la migración a Workers.** Cuando el sitio corra como Worker (ver
> [`docs/workers-migracion.md`](../../docs/workers-migracion.md)), los recordatorios los dispara el
> cron del propio sitio (`wrangler.toml` → `worker/index.js`) y este Worker aparte se borra (paso
> «Borrar el Worker viejo del cron» de esa guía), junto con esta carpeta. Hasta entonces sigue
> funcionando igual que siempre: no tocarlo.

Worker de Cloudflare que cada 15 minutos llama a `POST https://kinkyvibe.ar/api/cron/recordatorios`
para que el sitio mande los recordatorios por mail de las entradas (ver `docs/tickets.md`,
"Recordatorios"). No tiene lógica propia: el sitio decide qué mandar y no repite envíos.

## Deploy (una vez, y cada vez que cambie este código)

1. Elegir un secreto largo y al azar (por ejemplo `openssl rand -hex 32`). **No commitearlo.**
2. En el proyecto del sitio en Cloudflare (**Workers & Pages → kinkyvibe → Settings → Variables
   and Secrets**), agregar `CRON_SECRET` como _Secret_ con ese valor, y volver a deployar el sitio.
3. En esta carpeta:

   ```sh
   cd workers/cron
   npx wrangler login              # si hace falta
   npx wrangler deploy
   npx wrangler secret put CRON_SECRET   # pegar el MISMO secreto
   ```

4. Revisar en **Workers & Pages → kinkyvibe-cron → Logs** que las corridas respondan
   `{"sent":…,"failed":…}`. Si responde 401, los secretos no coinciden; 503, falta
   `CRON_SECRET` en el sitio.

`SITE_URL` está en `wrangler.toml` (para un deploy de prueba, cambiarlo ahí o con
`npx wrangler deploy --var SITE_URL:https://…`).

## Probar

```sh
curl -X POST https://kinkyvibe.ar/api/cron/recordatorios -H "x-cron-secret: $CRON_SECRET"
```

En local: `npx wrangler dev --test-scheduled` y abrir `http://localhost:8787/__scheduled`.
