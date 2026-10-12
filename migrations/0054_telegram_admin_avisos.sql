-- Migration number: 0054 	 2026-10-12T02:52:06.000Z
-- Avisos para admins por Telegram (decisión 0041, docs/telegram.md «Estado y avisos para admins»):
-- qué avisos eligió recibir cada admin con el Telegram vinculado (migración 0050). Vienen todos
-- apagados: sin fila = apagado; una fila por admin y tipo de aviso prendido.
--
-- Solo agrega una tabla; no toca ninguna que ya exista, así que anda con el código de `main`
-- (decisión 0028). Los tipos los valida el código (adminData.js, NOTICE_KINDS): así sumar uno
-- más adelante no pide otra migración.
--
-- Por id de GitHub (como telegram_admin_links): volver a vincular el Telegram no borra lo elegido.
-- A quién se le manda se decide en cada envío con el vínculo y la lista ADMINS (auth.js): sacar a
-- alguien de ADMINS le corta los avisos aunque la fila siga acá.
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.

CREATE TABLE IF NOT EXISTS telegram_admin_notices (
	-- El id numérico de GitHub de le admin (no cambia).
	github_id INTEGER NOT NULL,
	-- El tipo de aviso (`resumen_diario`, `cada_venta`…).
	kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (github_id, kind)
) WITHOUT ROWID;
