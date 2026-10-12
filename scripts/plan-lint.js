#!/usr/bin/env node
// Chequea docs/plan.md (el plan único) y que las fases de src/lib/admin/nav.js coincidan con él.
//
// Uso: `node scripts/plan-lint.js` (lo corre la CI en el job `plan`). Sin dependencias: lee los dos
// archivos como texto. Sale con 1 y la lista de problemas si algo está mal.
//
// Formato de un ítem (ver «Reglas» en docs/plan.md), una línea que empieza con «- `»:
//   - `id-corto` · fase N · estado · área · qué es (depende de: a, b) · nav: x · links
// Los ítems viven en las secciones «## Fase N» (la fase de la línea tiene que ser la de la
// sección) y en «## Descartado» (solo con estado `descartado`).
//
// nav.js ↔ plan.md: cada sección de nav.js con `phase` (las «Próximamente») tiene que tener
// exactamente un ítem con `nav: <id de la sección>`, en la misma fase; y cada `nav:` del plan tiene
// que nombrar una sección de nav.js con `phase`.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ESTADOS = ['hecho', 'en curso', 'sigue', 'espera gorrite', 'algún día', 'descartado'];
export const FASES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEP = ' · ';

/**
 * @typedef {{
 *   id: string,
 *   phase: number | null,
 *   estado: string,
 *   area: string,
 *   text: string,
 *   deps: string[],
 *   nav: string | null,
 *   line: number,
 *   section: string,
 *   sectionPhase: number | null
 * }} PlanItem
 */

/**
 * Lee los ítems del plan. No valida (eso es {@link lintPlan}), salvo lo que impide leer la línea.
 * @param {string} text contenido de docs/plan.md
 * @returns {{ items: PlanItem[], errors: string[] }}
 */
export function parsePlan(text) {
	/** @type {PlanItem[]} */
	const items = [];
	const errors = [];
	let section = '';
	/** @type {number | null} */
	let sectionPhase = null;
	let inItems = false;

	text.split('\n').forEach((raw, i) => {
		const lineNo = i + 1;
		const h2 = raw.match(/^## (.+?)\s*$/);
		if (h2) {
			section = h2[1];
			const fase = section.match(/^Fase (\d+)$/);
			sectionPhase = fase ? Number(fase[1]) : null;
			inItems = Boolean(fase) || section === 'Descartado';
			return;
		}
		if (!inItems || !raw.startsWith('- ')) return;

		const m = raw.match(/^- `([^`]*)`(.*)$/);
		if (!m) {
			errors.push(`línea ${lineNo}: ítem sin id (tiene que empezar con «- \`id\`»)`);
			return;
		}
		const parts = m[2].split(SEP);
		// parts[0] es lo que hay entre el id y el primer « · » (tiene que estar vacío)
		if (parts[0].trim() !== '') {
			errors.push(`línea ${lineNo}: después del id va « · » («${m[1]}»)`);
		}
		const [faseRaw = '', estado = '', area = '', ...rest] = parts.slice(1).map((p) => p.trim());
		const fase = faseRaw.match(/^fase (\d+)$/);
		const body = rest.join(SEP);
		const deps = body.match(/depende de: ([a-z0-9, -]+)/);
		const nav = body.match(/(?:^|\s)nav: ([a-z0-9-]+)/);
		items.push({
			id: m[1],
			phase: fase ? Number(fase[1]) : null,
			estado,
			area,
			text: body,
			deps: deps
				? deps[1]
						.split(',')
						.map((d) => d.trim())
						.filter(Boolean)
				: [],
			nav: nav ? nav[1] : null,
			line: lineNo,
			section,
			sectionPhase
		});
	});
	return { items, errors };
}

/**
 * Las secciones de nav.js que tienen `phase`, leídas del código fuente (sin importarlo: nav.js
 * importa componentes de Svelte). La prueba compara esto con el NAV de verdad.
 * @param {string} source contenido de src/lib/admin/nav.js
 * @returns {Map<string, number>} id → fase
 */
export function navPhases(source) {
	/** @type {Map<string, number>} */
	const phases = new Map();
	// Cada ítem de NAV es un objeto `{ id: '...', ... }`: se corta el texto en cada `id: '...'` y se
	// busca un `phase: N` antes del próximo.
	const re = /\bid:\s*'([^']+)'/g;
	const starts = [...source.matchAll(re)];
	starts.forEach((m, i) => {
		const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
		const chunk = source.slice(/** @type {number} */ (m.index), end);
		const phase = chunk.match(/\bphase:\s*(\d+)/);
		if (phase) phases.set(m[1], Number(phase[1]));
	});
	return phases;
}

/**
 * Todos los problemas del plan (y de nav.js contra el plan).
 * @param {string} planText
 * @param {string} [navSource] contenido de nav.js; sin él no se chequean las fases del menú
 * @returns {string[]}
 */
export function lintPlan(planText, navSource) {
	const { items, errors } = parsePlan(planText);
	const out = [...errors];
	const where = (/** @type {PlanItem} */ it) => `línea ${it.line} (\`${it.id}\`)`;

	if (items.length === 0) out.push('el plan no tiene ningún ítem');

	/** @type {Map<string, PlanItem>} */
	const byId = new Map();
	for (const it of items) {
		if (!ID_RE.test(it.id)) {
			out.push(`${where(it)}: id inválido (minúsculas, números y guiones)`);
		}
		const prev = byId.get(it.id);
		if (prev) out.push(`${where(it)}: id repetido (ya está en la línea ${prev.line})`);
		else byId.set(it.id, it);

		if (it.phase === null || !FASES.includes(it.phase)) {
			out.push(`${where(it)}: falta la fase («fase N», con N de 0 a 8)`);
		}
		if (!ESTADOS.includes(it.estado)) {
			out.push(
				`${where(it)}: estado «${it.estado}» inválido (tiene que ser uno de: ${ESTADOS.join(', ')})`
			);
		}
		if (!it.area) out.push(`${where(it)}: falta el área`);
		if (!it.text) out.push(`${where(it)}: falta qué es`);

		if (it.section === 'Descartado') {
			if (it.estado !== 'descartado') {
				out.push(`${where(it)}: en «Descartado» el estado tiene que ser «descartado»`);
			}
		} else {
			if (it.estado === 'descartado') {
				out.push(`${where(it)}: lo descartado va en la sección «Descartado»`);
			}
			if (it.phase !== null && it.phase !== it.sectionPhase) {
				out.push(`${where(it)}: dice fase ${it.phase} pero está en «${it.section}»`);
			}
		}
	}

	for (const it of items) {
		for (const dep of it.deps) {
			const target = byId.get(dep);
			if (!target) {
				out.push(`${where(it)}: depende de «${dep}», que no existe en el plan`);
			} else if (dep === it.id) {
				out.push(`${where(it)}: depende de sí mismo`);
			} else if (it.phase !== null && target.phase !== null && target.phase > it.phase) {
				out.push(
					`${where(it)}: depende de «${dep}», que está en una fase posterior ` +
						`(${target.phase} > ${it.phase})`
				);
			}
		}
	}

	if (navSource !== undefined) {
		const phases = navPhases(navSource);
		/** @type {Map<string, PlanItem>} */
		const byNav = new Map();
		for (const it of items) {
			if (!it.nav) continue;
			const other = byNav.get(it.nav);
			if (other) {
				out.push(`${where(it)}: «nav: ${it.nav}» ya lo usa la línea ${other.line}`);
				continue;
			}
			byNav.set(it.nav, it);
			const navPhase = phases.get(it.nav);
			if (navPhase === undefined) {
				out.push(
					`${where(it)}: «nav: ${it.nav}» no es una sección de src/lib/admin/nav.js con \`phase\``
				);
			} else if (navPhase !== it.phase) {
				out.push(
					`${where(it)}: nav.js dice \`phase: ${navPhase}\` para «${it.nav}» y el plan dice ` +
						`fase ${it.phase}: cambiá uno de los dos para que coincidan`
				);
			}
		}
		for (const [id, phase] of phases) {
			if (!byNav.has(id)) {
				out.push(
					`src/lib/admin/nav.js: la sección «${id}» tiene \`phase: ${phase}\` pero ningún ítem ` +
						`del plan dice «nav: ${id}»`
				);
			}
		}
	}

	return out;
}

/**
 * Los ids del plan (para el chequeo de la línea `Plan:` de los PRs).
 * @param {string} planText
 * @returns {Set<string>}
 */
export function planIds(planText) {
	return new Set(parsePlan(planText).items.map((it) => it.id));
}

function main() {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const plan = readFileSync(join(root, 'docs/plan.md'), 'utf8');
	const nav = readFileSync(join(root, 'src/lib/admin/nav.js'), 'utf8');
	const problems = lintPlan(plan, nav);
	if (problems.length) {
		console.error(`docs/plan.md tiene ${problems.length} problema(s):`);
		for (const p of problems) console.error(`- ${p}`);
		console.error('Formato y reglas: la sección «Reglas» de docs/plan.md.');
		process.exit(1);
	}
	console.log(`docs/plan.md: ${parsePlan(plan).items.length} ítems, todo en orden.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
