/**
 * El seed de la demo (n3-personas.sql) corre sobre una base migrada (dos veces: se puede volver
 * a correr) y deja lo que promete: perfiles de ejemplo (el oculto no se muestra), el rol
 * agregado, el evento con `personas:` válidas y una orden con respuestas.
 */
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '$lib/server/db/testing.js';
import { listRoles } from '$lib/server/personas/roles.js';
import { resolvePersonas } from '$lib/server/personas/index.js';
import { answersByOrder, fieldsForEvent } from '$lib/server/tickets/signupFields.js';
import { splitMarkdown } from '$lib/utils/eventDraft.js';
import { validatePersonas } from '$lib/utils/personas.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	const sql = await readFile(new URL('./n3-personas.sql', import.meta.url), 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	for (let i = 0; i < 2; i++) await t.db.batch(statements.map((s) => t.db.prepare(s)));
}, 30_000);
afterAll(async () => {
	await t?.dispose();
});

const SLUG = 'demo-personas-2026-12';

describe('seed n3-personas', () => {
	it('evento con personas válidas; el perfil oculto no aparece', async () => {
		const row = await t.db
			.prepare('SELECT content FROM demo_files WHERE path = ?1')
			.bind(`src/lib/posts/calendario/${SLUG}.md`)
			.first();
		const meta = parseDocument(splitMarkdown(String(row?.content)).frontmatter).toJS();
		const roles = await listRoles(t.db);
		expect(roles).toContain('Cuida la puerta');
		expect(validatePersonas(meta.personas, roles).ok).toBe(true);
		const groups = await resolvePersonas(t.db, meta.personas, roles);
		expect(groups.map((g) => [g.rol, g.items.map((i) => i.title)])).toEqual([
			['Organiza', ['Colectivo de Prueba']],
			['Facilita', ['Persona de Prueba']]
		]);
	});

	it('preguntas del evento y una orden con respuestas', async () => {
		expect((await fieldsForEvent(t.db, SLUG)).map((f) => f.label)).toEqual([
			'¿Cómo te enteraste?',
			'¿Alguna restricción alimentaria?'
		]);
		const answers = await answersByOrder(t.db, SLUG);
		expect([...answers.values()][0].map((a) => a.value)).toEqual(['Una amistad', 'Sin gluten']);
		const n = await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'perfil'").first();
		expect(n?.n).toBe(3);
	});
});
