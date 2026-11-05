/**
 * Guardia de los campos del panel (gorrite, 5/11: «otra vez los campos no tienen el estilo»): cada
 * `<input>`, `<textarea>` y `<select>` de las páginas del panel (`src/routes/(authed)`) y de sus
 * componentes (`src/lib/components/admin`) usa las piezas compartidas, no un campo armado a mano
 * con CSS propio. Vale cualquiera de estas (docs/panel.md, «Campos de formulario»):
 *
 * - el componente `<Field>` ($lib/components/ui/Field.svelte; un `<select>` propio va en su slot);
 * - dentro de un `.kv-field` o un `.kv-check` ($lib/admin/panel-forms.scss);
 * - con la clase `.kv-input` ($lib/admin/panel.scss);
 * - `type="hidden"`, `checkbox`, `radio` o `file` (casillas propias del panel; el `file` va
 *   escondido detrás de un botón).
 *
 * Lo que ya estaba antes de la guardia (formularios con su propio estilo, revisados de a uno)
 * queda en {@link ALLOWED}: archivo → cuántos campos sueltos tiene. La cuenta no puede subir; si
 * bajó (los pasaste a las piezas compartidas), bajala acá en el mismo PR. Un archivo nuevo no va
 * en la lista: usá las piezas compartidas.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const SCAN = [
	join(ROOT, 'src', 'routes', '(authed)'),
	join(ROOT, 'src', 'lib', 'components', 'admin')
];

/** Los componentes que ya ponen el estilo compartido a lo que llevan adentro. */
const SHARED_WRAPPERS = new Set(['Field']);
/** Las clases del estilo compartido, en el campo o en algo que lo rodea. */
const SHARED_CLASS = /(?:^|[\s"'{:])kv-(?:field|check|input)(?![\w-])/;
const EXEMPT_TYPES = new Set(['hidden', 'checkbox', 'radio', 'file']);
const CONTROLS = new Set(['input', 'textarea', 'select']);
const VOID = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr'
]);

/**
 * Campos sueltos que ya estaban en main el 5/11 (35 archivos, 119 campos; archivo relativo a
 * la raíz → cuántos). No sumes archivos.
 * @type {Record<string, number>}
 */
const ALLOWED = {
	// Componentes (los editores de eventos y de contenido los estilan con $lib/admin/panel-editor.scss;
	// la Puerta, la agenda y los buscadores, con su CSS propio).
	'src/lib/components/admin/ChipCombobox.svelte': 1,
	'src/lib/components/admin/ComboCodes.svelte': 3,
	'src/lib/components/admin/DayPicker.svelte': 2,
	'src/lib/components/admin/DoorLinksCard.svelte': 3,
	'src/lib/components/admin/DuplicateChooser.svelte': 1,
	'src/lib/components/admin/ImagePicker.svelte': 3,
	'src/lib/components/admin/LibraryLinkPicker.svelte': 3,
	'src/lib/components/admin/PartesEditor.svelte': 3,
	'src/lib/components/admin/PostEditor.svelte': 1,
	'src/lib/components/admin/SalesGoalField.svelte': 2,
	'src/lib/components/admin/TicketTiersEditor.svelte': 5,
	'src/lib/components/admin/TicketsEditor.svelte': 13,
	'src/lib/components/admin/WaitlistField.svelte': 1,
	'src/lib/components/admin/agenda/AgendaSheet.svelte': 7,
	'src/lib/components/admin/agenda/EventDetail.svelte': 1,
	'src/lib/components/admin/agenda/QuickAdd.svelte': 4,
	'src/lib/components/admin/content/ContentEditor.svelte': 2,
	'src/lib/components/admin/content/ContentList.svelte': 1,
	'src/lib/components/admin/door/DoorScreen.svelte': 13,
	'src/lib/components/admin/event-form/BodySection.svelte': 1,
	'src/lib/components/admin/event-form/FieldGrid.svelte': 8,
	'src/lib/components/admin/event-form/PersonasField.svelte': 2,
	'src/lib/components/admin/event-form/PlaceSection.svelte': 5,
	'src/lib/components/admin/event-form/ScheduleSection.svelte': 3,
	'src/lib/components/admin/panel/SearchBox.svelte': 1,
	// Páginas.
	'src/routes/(authed)/admin/comunidad/perfiles/importar/+page.svelte': 1,
	'src/routes/(authed)/admin/etiquetas/+page.svelte': 2,
	'src/routes/(authed)/admin/eventos/+page.svelte': 1,
	'src/routes/(authed)/admin/eventos/[slug]/+page.svelte': 1,
	'src/routes/(authed)/admin/eventos/[slug]/codigos/+page.svelte': 6,
	'src/routes/(authed)/admin/eventos/[slug]/mail/+page.svelte': 2,
	'src/routes/(authed)/admin/eventos/[slug]/mails/[id]/+page.svelte': 1,
	'src/routes/(authed)/admin/eventos/[slug]/ordenes/+page.svelte': 5,
	'src/routes/(authed)/admin/eventos/importar/+page.svelte': 8,
	'src/routes/(authed)/admin/eventos/nuevo/+page.svelte': 3
};

/** @param {string} dir @returns {string[]} */
function svelteFiles(dir) {
	/** @type {string[]} */
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
		else if (name.endsWith('.svelte')) out.push(p);
	}
	return out;
}

/**
 * Saca `<script>`, `<style>` y comentarios (con espacios, para no mover las líneas).
 * @param {string} src
 */
function markupOf(src) {
	const blank = (/** @type {string} */ m) => m.replace(/[^\n]/g, ' ');
	return src
		.replace(/<!--[\s\S]*?--!?>/g, blank)
		.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, blank)
		.replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, blank);
}

/**
 * Dónde termina la etiqueta que empieza en `start` (respeta comillas y `{…}` de Svelte).
 * @param {string} s
 * @param {number} start
 */
function tagEnd(s, start) {
	let depth = 0;
	/** @type {string | null} */
	let quote = null;
	for (let i = start; i < s.length; i++) {
		const c = s[i];
		if (quote) {
			if (c === quote) quote = null;
			else if (c === '{') depth++;
			else if (c === '}') depth--;
			continue;
		}
		if (depth > 0) {
			if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (c === '"' || c === "'" || c === '`') {
				// una cadena dentro de una expresión: se saltea entera
				const close = s.indexOf(c, i + 1);
				if (close > 0) i = close;
			}
			continue;
		}
		if (c === '{') depth++;
		else if (c === '"' || c === "'") quote = c;
		else if (c === '>') return i;
	}
	return s.length - 1;
}

/** Lo que dice de clases una etiqueta (`class="…"`, `class={…}`, `class:x`). @param {string} tag */
function classesOf(tag) {
	const parts = [];
	for (const m of tag.matchAll(/\bclass=("[^"]*"|'[^']*'|\{[^}]*\})/g)) parts.push(m[1]);
	for (const m of tag.matchAll(/\bclass:([\w-]+)/g)) parts.push(` ${m[1]} `);
	return parts.join(' ');
}

/**
 * Los campos sueltos de un archivo: `{ line, tag }` de cada uno.
 * @param {string} src
 */
export function looseControls(src) {
	const s = markupOf(src);
	/** @type {{ name: string, shared: boolean }[]} */
	const stack = [];
	/** @type {{ line: number, tag: string }[]} */
	const found = [];
	const re = /<(\/?)([a-zA-Z][\w:.-]*)/g;
	let m;
	while ((m = re.exec(s))) {
		const [, closing, name] = m;
		const end = tagEnd(s, m.index);
		const tag = s.slice(m.index, end + 1);
		re.lastIndex = end + 1;
		if (closing) {
			const at = stack.map((x) => x.name).lastIndexOf(name);
			if (at >= 0) stack.length = at;
			continue;
		}
		const shared = SHARED_WRAPPERS.has(name) || SHARED_CLASS.test(classesOf(tag));
		if (CONTROLS.has(name)) {
			const type = tag.match(/\stype=["']([\w-]+)["']/)?.[1];
			const ok =
				shared ||
				(name === 'input' && type && EXEMPT_TYPES.has(type)) ||
				/\shidden(?=[\s/>])/.test(tag) ||
				stack.some((x) => x.shared);
			if (!ok) {
				found.push({
					line: s.slice(0, m.index).split('\n').length,
					tag: tag.replace(/\s+/g, ' ').slice(0, 80)
				});
			}
		}
		if (!VOID.has(name) && !tag.endsWith('/>')) stack.push({ name, shared });
	}
	return found;
}

describe('looseControls', () => {
	it('acepta las piezas compartidas', () => {
		const ok = `
			<Field label="Nombre" bind:value={x} />
			<Field label="Tipo" let:id><select {id}><option>a</option></select></Field>
			<label class="kv-field"><span>Nota</span><textarea bind:value={x}></textarea></label>
			<label class="kv-check"><input type="checkbox" /> Sí</label>
			<input class="kv-input search" type="search" />
			<input class:kv-input={true} />
			<input type="hidden" name="id" value={id} />
			<div class="kv-field wide" on:click={() => a > b}><input bind:value={x} /></div>
			<!-- <input> en un comentario no cuenta -->`;
		expect(looseControls(ok)).toEqual([]);
	});

	it('marca un campo armado a mano', () => {
		const bad = `<script>const s = '<input>';</script>
<div class="row">
	<input bind:value={alt} placeholder="Qué se ve" />
	<textarea class="mine"></textarea>
</div>
<label class="kv-field"><span>x</span></label><select></select>
<style>input { border: 0; }</style>`;
		expect(looseControls(bad).map((x) => x.line)).toEqual([3, 4, 6]);
	});
});

describe('campos del panel', () => {
	const files = SCAN.flatMap(svelteFiles);
	/** @type {Record<string, { line: number, tag: string }[]>} */
	const loose = {};
	for (const f of files) {
		const found = looseControls(readFileSync(f, 'utf8'));
		if (found.length) loose[relative(ROOT, f)] = found;
	}

	it('usan las piezas compartidas (Field, .kv-field, .kv-input)', () => {
		const problems = Object.entries(loose)
			.filter(([file, found]) => found.length > (ALLOWED[file] ?? 0))
			.map(
				([file, found]) =>
					`${file}: ${found.length} campo(s) suelto(s) (permitidos: ${ALLOWED[file] ?? 0})\n` +
					found.map((x) => `  línea ${x.line}: ${x.tag}`).join('\n')
			);
		expect(problems, 'usá <Field>, .kv-field o .kv-input (docs/panel.md)').toEqual([]);
	});

	it('la lista de permitidos no se queda vieja', () => {
		const stale = Object.entries(ALLOWED)
			.filter(([file, n]) => (loose[file]?.length ?? 0) < n)
			.map(([file, n]) => `${file}: ahora ${loose[file]?.length ?? 0}, permitidos ${n}`);
		expect(stale, 'bajá la cuenta en ALLOWED').toEqual([]);
	});
});
