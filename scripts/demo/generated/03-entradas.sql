-- Agregados al seed del modo demo (agente D: entradas/mails/personas). SOLO kinkyvibe-preview.
-- Requiere las migraciones 0008_email_templates (PR #104) y 0009_person_notes (PR de personas).
-- Datos inventados.
DELETE FROM person_notes WHERE created_by = 'seed-demo';
DELETE FROM email_templates WHERE updated_by = 'seed-demo';
INSERT INTO person_notes (email, body, created_at, created_by) VALUES
 ('rio.prueba@example.invalid', 'Viene siempre con su pareja; prefiere que la reciban en la puerta (nota de prueba).', 1790766000000, 'seed-demo'),
 ('mora.prueba@example.invalid', 'Se ofreció a ayudar con la puerta en la próxima Picantearla (nota de prueba).', 1790766000000, 'seed-demo');
-- Una plantilla con texto propio, para que el editor muestre "texto propio".
INSERT OR REPLACE INTO email_templates (id, subject, heading, body, updated_at, updated_by) VALUES
 ('reminder', 'Recordatorio: {{evento}} {{cuando}}', '¡{{evento}} {{cuando}}!', 'Hola {{nombre}}, te recordamos que tenés {{entradas}} ({{tipo}}).

**Traé agua** y ganas de pasarla bien.', 1790766000000, 'seed-demo');
