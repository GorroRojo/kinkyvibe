-- Migration number: 0057 	 2026-10-12T19:18:36.518Z
-- Estadísticas de uso del bot de Telegram (pedido de gorrite, 12/10; decisión 0045,
-- docs/telegram.md «Estadísticas de uso»). Detrás del interruptor `telegram_estadisticas`, apagado.
--
-- Solo agrega dos tablas y un índice; no toca ninguna tabla que ya exista, así que anda con el
-- código de `main` (decisión 0028).
--
-- Regla: **nunca se puede saber qué miró o buscó una persona**. Por eso son dos tablas que no
-- comparten ninguna clave ni ninguna hora fina:
--
-- - `telegram_uso_personas`: quién usa el bot y cuánto (un número por persona y por día). Nada de
--   qué hizo: ni tipo de acción, ni búsqueda, ni dirección, ni hora más fina que el día.
-- - `telegram_uso_totales`: para qué se usa, sumado por semana. Ni id de nadie, ni día, ni hora.
--
-- Las dos son WITHOUT ROWID: no queda ni el orden en que se insertaron las filas.

-- Una fila por persona (id de usuario de Telegram) y por día (hora de Argentina). Se borran a los
-- 180 días (el cron de cada 15 minutos).
CREATE TABLE IF NOT EXISTS telegram_uso_personas (
	-- El id del usuario de Telegram (un número de hasta 52 bits, guardado como texto, como
	-- `telegram_chats.chat_id` y `telegram_admin_links.telegram_user_id`).
	telegram_id TEXT NOT NULL CHECK (length(telegram_id) BETWEEN 1 AND 32),
	-- El día, en hora de Argentina: 'AAAA-MM-DD'.
	dia TEXT NOT NULL CHECK (length(dia) = 10),
	-- Cuántos updates de esa persona manejó el bot ese día (mensajes, comandos, botones, consultas
	-- inline, resultados inline elegidos, aperturas de la Mini App).
	interacciones INTEGER NOT NULL DEFAULT 0 CHECK (interacciones >= 0),
	-- Cómo se llama en Telegram (lo que el bot ya recibe en cada update): el nombre y el @usuario.
	nombre TEXT NOT NULL DEFAULT '' CHECK (length(nombre) <= 64),
	usuario TEXT NOT NULL DEFAULT '' CHECK (length(usuario) <= 32),
	PRIMARY KEY (telegram_id, dia)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS telegram_uso_personas_dia ON telegram_uso_personas (dia);

-- Contadores por semana ISO (hora de Argentina), tipo y clave. Sin id de nadie ni día.
CREATE TABLE IF NOT EXISTS telegram_uso_totales (
	-- La semana ISO: 'AAAA-Wss'.
	semana TEXT NOT NULL CHECK (length(semana) = 8),
	-- 'pantalla', 'comando', 'busqueda', 'inline', 'objeto', 'inline_elegido', 'miniapp',
	-- 'seguir', 'vincular', 'desvincular' (src/lib/server/telegram/uso.js).
	tipo TEXT NOT NULL CHECK (length(tipo) BETWEEN 1 AND 32),
	-- La pantalla, el comando, lo buscado (normalizado, hasta 60 caracteres) o la cosa pública
	-- ('evento:<dirección>'…).
	clave TEXT NOT NULL CHECK (length(clave) <= 200),
	n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
	PRIMARY KEY (semana, tipo, clave)
) WITHOUT ROWID;
