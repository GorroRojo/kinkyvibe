// @vitest-environment jsdom
/**
 * El editor compartido de preguntas en el navegador (jsdom + @testing-library/svelte): ↑ ↓
 * cambian el orden de lo que se manda, «Duplicar» copia abajo, «Sacar» la saca, la vista previa muestra las preguntas y, en las de inscripción, no se ofrece el
 * puntaje. Y una guarda: los archivos del panel de formularios no arman inputs a mano (solo las
 * piezas compartidas del panel, más los `type="hidden"`).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import QuestionEditor from './QuestionEditor.svelte';

afterEach(cleanup);

const saved = [
	{ id: 'p1', kind: 'text', label: 'Primera', required: false, options: [] },
	{ id: 'p2', kind: 'rating', label: 'Segunda', required: false, options: [] }
];

/** Lo que se manda (el campo oculto). */
const payload = () =>
	JSON.parse(
		/** @type {HTMLInputElement} */ (document.querySelector('input[name="questions"]')).value
	);

describe('QuestionEditor', () => {
	it('↑ ↓ cambian el orden de lo que se manda', async () => {
		const { getByLabelText } = render(QuestionEditor, { props: { questions: saved } });
		expect(payload().map((/** @type {any} */ q) => q.id)).toEqual(['p1', 'p2']);
		await fireEvent.click(getByLabelText('Subir la pregunta 2'));
		expect(payload().map((/** @type {any} */ q) => q.id)).toEqual(['p2', 'p1']);
		expect(/** @type {HTMLButtonElement} */ (getByLabelText('Subir la pregunta 1')).disabled).toBe(
			true
		);
		await fireEvent.click(getByLabelText('Bajar la pregunta 1'));
		expect(payload().map((/** @type {any} */ q) => q.id)).toEqual(['p1', 'p2']);
	});

	it('duplicar copia abajo; sacar la saca de lo que se manda', async () => {
		const r = render(QuestionEditor, { props: { questions: saved } });
		await fireEvent.click(r.getByLabelText('Duplicar la pregunta 1'));
		expect(payload().map((/** @type {any} */ q) => q.label)).toEqual([
			'Primera',
			'Primera (copia)',
			'Segunda'
		]);
		await fireEvent.click(r.getByLabelText('Sacar la pregunta 1'));
		expect(payload().map((/** @type {any} */ q) => q.label)).toEqual([
			'Primera (copia)',
			'Segunda'
		]);
	});

	it('la vista previa muestra las preguntas; las de inscripción no ofrecen puntaje', () => {
		const r = render(QuestionEditor, {
			props: { questions: saved, kinds: ['text', 'choice', 'checkbox'], signup: true }
		});
		const preview = /** @type {HTMLElement} */ (document.querySelector('.q-preview'));
		expect(preview.textContent).toContain('Primera');
		expect(r.queryAllByText('Puntaje de 1 a 5')).toHaveLength(0);
		expect(r.getAllByText('Una vez por entrada (si compran 3, responden 3 veces)')).toHaveLength(2);
	});
});

describe('guarda: sin inputs a mano en el panel de formularios', () => {
	const ROOT = path.resolve(import.meta.dirname, '../../../../..');
	const DIRS = [
		'src/lib/components/admin/forms',
		'src/routes/(authed)/admin/comunidad/formularios',
		'src/routes/(authed)/admin/eventos/[slug]/encuesta'
	];

	it('solo las piezas compartidas (Field, Checkbox, Segmented…) y campos ocultos', () => {
		/** @type {string[]} */
		const offenders = [];
		for (const dir of DIRS) {
			let entries;
			try {
				entries = readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true });
			} catch {
				continue;
			}
			for (const e of entries) {
				if (!e.isFile() || !e.name.endsWith('.svelte')) continue;
				const src = readFileSync(path.join(e.parentPath, e.name), 'utf8');
				const blank = (/** @type {string} */ m) => m.replace(/[^\n]/g, ' ');
				const markup = src
					.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, blank)
					.replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, blank);
				for (const m of markup.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
					if (/type="hidden"/.test(m[0])) continue;
					offenders.push(
						`${path.join(dir, path.relative(path.join(ROOT, dir), path.join(e.parentPath, e.name)))}: ${m[0].slice(0, 60)}`
					);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
