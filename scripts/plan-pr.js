#!/usr/bin/env node
// Chequea que la descripción de un PR diga a qué ítems del plan corresponde.
//
// Cada PR lleva una línea `Plan: <id>[, <id>]` o `Plan: ninguno` (ver «Reglas» en docs/plan.md), y
// cada id tiene que existir en docs/plan.md tal como está en el PR. Los PRs de bots (Dependabot y
// otros) no la necesitan.
//
// Uso en la CI (job `plan-pr`, solo en pull_request): `node scripts/plan-pr.js`. Lee el evento de
// $GITHUB_EVENT_PATH (la descripción y le autore del PR) y docs/plan.md del checkout. Sale con 1 y
// lo que falta si no pasa. Sin dependencias.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planIds } from './plan-lint.js';

export const NINGUNO = 'ninguno';

const HOW =
	'Sumá a la descripción del PR una línea «Plan: <id>» (o «Plan: <id>, <id>») con los ids de ' +
	'docs/plan.md que toca, o «Plan: ninguno» si no corresponde a ningún ítem. Al editar la ' +
	'descripción la CI vuelve a correr.';

/**
 * ¿Es un PR abierto por un bot?
 * @param {{ login?: string, type?: string } | null | undefined} user `pull_request.user`
 */
export function isBot(user) {
	return user?.type === 'Bot' || /\[bot\]$/.test(user?.login ?? '');
}

/**
 * Lee las líneas `Plan:` de una descripción. Ignora mayúsculas en «Plan» y acepta la línea dentro
 * de una lista o con negrita («- **Plan:** a, b») y comentarios entre paréntesis.
 * @param {string | null | undefined} body
 * @returns {string[] | null} los ids (o `['ninguno']`), o null si no hay línea `Plan:`
 */
export function parsePlanLine(body) {
	const ids = [];
	let found = false;
	for (const raw of String(body ?? '').split(/\r?\n/)) {
		const line = raw.replace(/[*_`]/g, '').trim();
		const m = line.match(/^(?:[-+>]\s*)?plan:\s*(.*)$/i);
		if (!m) continue;
		found = true;
		// Lo que va entre paréntesis es un comentario: «Plan: ninguno (solo docs)».
		for (const id of m[1].replace(/\([^)]*\)/g, ' ').split(/[,\s]+/)) {
			const clean = id.trim().replace(/[.;]$/, '');
			if (clean) ids.push(clean.toLowerCase() === NINGUNO ? NINGUNO : clean);
		}
	}
	return found ? ids : null;
}

/**
 * Los problemas de la línea `Plan:` de un PR.
 * @param {{ body?: string | null, user?: { login?: string, type?: string } }} pr `pull_request` del evento
 * @param {Set<string>} ids los ids de docs/plan.md
 * @returns {{ skip: boolean, problems: string[] }}
 */
export function checkPrBody(pr, ids) {
	if (isBot(pr?.user)) return { skip: true, problems: [] };
	const found = parsePlanLine(pr?.body);
	if (found === null) return { skip: false, problems: [`falta la línea «Plan:». ${HOW}`] };
	if (found.length === 0) return { skip: false, problems: [`la línea «Plan:» está vacía. ${HOW}`] };
	if (found.includes(NINGUNO)) {
		return found.length === 1
			? { skip: false, problems: [] }
			: { skip: false, problems: ['«Plan: ninguno» no lleva ids al lado: elegí una de las dos.'] };
	}
	const unknown = found.filter((id) => !ids.has(id));
	if (unknown.length) {
		return {
			skip: false,
			problems: [
				`estos ids no existen en docs/plan.md: ${unknown.join(', ')}. Corregilos, o sumá el ítem ` +
					'al plan en este mismo PR.'
			]
		};
	}
	return { skip: false, problems: [] };
}

function main() {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) {
		console.error('Falta GITHUB_EVENT_PATH: este chequeo corre en la CI, en un pull_request.');
		process.exit(1);
	}
	const event = JSON.parse(readFileSync(eventPath, 'utf8'));
	const pr = event.pull_request;
	if (!pr) {
		console.log('No es un pull_request: no hay nada que chequear.');
		return;
	}
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const ids = planIds(readFileSync(join(root, 'docs/plan.md'), 'utf8'));
	const { skip, problems } = checkPrBody(pr, ids);
	if (skip) {
		console.log(`PR de un bot (${pr.user?.login}): no necesita la línea «Plan:».`);
		return;
	}
	if (problems.length) {
		for (const p of problems) console.error(`::error::PR #${pr.number}: ${p}`);
		process.exit(1);
	}
	console.log(`PR #${pr.number}: ${parsePlanLine(pr.body)?.join(', ')} — en orden.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
