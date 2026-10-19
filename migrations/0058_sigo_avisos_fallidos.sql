-- Migration number: 0058 	 2026-10-12T20:10:38.283Z
-- «Lo que sigo»: cuántos avisos fallaron (docs/lo-que-sigo.md, «Avisos que fallaron»). Hoy, si un
-- aviso no sale, se borra su fila de `follow_notifications` para reintentarlo en la próxima
-- corrida, y no queda nada. Esta tabla cuenta esos fallos sin tocar el reintento.
--
-- Es un contador por día, canal y motivo: **ningún dato de personas** (ni cuenta, ni mail, ni
-- chat, ni evento, ni el texto del error). Como mucho 4 filas por día (2 canales × 2 motivos).
--
-- Solo agrega una tabla; no toca ninguna que ya exista, así que anda con el código de `main`
-- (decisión 0028). El código que la usa no se rompe si todavía no está: el contador va en
-- try/catch y el panel muestra «sin datos».
--
--   day      `AAAA-MM-DD`, el día en hora de Argentina;
--   channel  `mail` o `telegram`;
--   reason   `error` (no salió: Resend o Telegram dijeron que no, o no se pudo llamar) o
--            `bloqueado` (Telegram dijo que el chat ya no recibe: bloqueó al bot o lo borró; ese
--            chat se desvincula y el aviso no se reintenta);
--   failures cuántos avisos fallaron así ese día.

CREATE TABLE IF NOT EXISTS follow_notification_failures (
	day TEXT NOT NULL CHECK (length(day) = 10),
	channel TEXT NOT NULL CHECK (channel IN ('mail', 'telegram')),
	reason TEXT NOT NULL CHECK (reason IN ('error', 'bloqueado')),
	failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
	PRIMARY KEY (day, channel, reason)
) WITHOUT ROWID;
