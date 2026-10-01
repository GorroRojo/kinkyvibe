-- Migration number: 0022 	 A dónde va cada propina: "Para KinkyVibe" o "Para el Fondo".
--
-- Lo elige quien deja la propina (por defecto, KinkyVibe). La plata entra igual a la misma cuenta
-- de Mercado Pago; solo cambia cómo se cuenta: las de `fondo` aprobadas suman a los aportes al
-- Fondo KinkyVibe en el panel, como el aporte de una entrada solidaria. Ver docs/propinas.md.
--
-- Solo agrega una columna (las propinas que ya existen quedan como `kinkyvibe`) y un índice.
-- No edita 0019_propinas.sql, que ya está aplicada.
ALTER TABLE tips ADD COLUMN destination TEXT NOT NULL DEFAULT 'kinkyvibe' CHECK (destination IN ('kinkyvibe','fondo'));

-- Para sumar las propinas al Fondo aprobadas por fecha (los aportes del mes en el Inicio).
CREATE INDEX IF NOT EXISTS tips_destination_approved ON tips (destination, status, approved_at);
