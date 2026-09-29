-- Migration number: 0006 	 Entradas: porcentaje del Fondo KinkyVibe usado en cada orden.
--
-- El descuento del Fondo pasa a ser automático (porcentaje del mes de fondo.kinkyvibe.ar, ver
-- src/lib/server/tickets/fondo.js). Cada orden guarda el porcentaje con el que se calculó su
-- precio (NULL: órdenes anteriores, tipos a la gorra o eventos sin fondo; si un tipo fija `fondo`
-- en pesos, ese monto manda y este porcentaje es solo el del evento), para poder
-- explicar después por qué pagó lo que pagó aunque el porcentaje haya cambiado.
ALTER TABLE orders ADD COLUMN fondo_percent INTEGER CHECK (fondo_percent IS NULL OR fondo_percent BETWEEN 0 AND 100);
