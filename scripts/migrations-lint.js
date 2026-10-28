#!/usr/bin/env node
// Chequea migrations/ (docs/datos.md, «Agregar una migración»): las migraciones son append-only.
//
// Falla (exit 1) si:
// - un PR modifica, borra o renombra una migración que ya estaba en la base de comparación (wrangler
//   las registra por nombre: una aplicada que cambia de nombre se vuelve a aplicar, y una editada no
//   se vuelve a aplicar nunca);
// - dos archivos de migrations/ tienen el mismo número (salvo los de ALLOWED_DUPLICATES).
//
// Uso:
//   node scripts/migrations-lint.js                 # contra origin/main (también lo sin commitear)
//   node scripts/migrations-lint.js --base HEAD^1   # en la CI: el merge del PR contra su base
// La base real es el merge-base entre `--base` y HEAD, así que una rama atrasada no ve como
// «borradas» las migraciones que main sumó después. Sin dependencias: solo git.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = 'migrations';

/**
 * Números repetidos que se aceptan: solo si las dos ya se aplicaron en alguna base remota (renombrar
 * una aplicada es peor que el número repetido; docs/datos.md). Clave: el número; valor: los nombres.
 * @type {Record<string, string[]>}
 */
export const ALLOWED_DUPLICATES = {};

/** @param {string[]} args */
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * Lo que cambió en migrations/ entre la base y el árbol de trabajo que no sea agregar un archivo.
 * @param {string} nameStatus salida de `git diff --name-status -M`
 * @returns {string[]} una línea por problema
 */
export function changedExisting(nameStatus) {
	const problems = [];
	for (const line of nameStatus.split('\n')) {
		if (!line.trim()) continue;
		const [status, ...paths] = line.split('\t');
		const kind = status[0];
		if (kind === 'M') problems.push(`modificada: ${paths[0]}`);
		else if (kind === 'D') problems.push(`borrada: ${paths[0]}`);
		else if (kind === 'R') problems.push(`renombrada: ${paths[0]} → ${paths[1]}`);
		else if (kind === 'T') problems.push(`cambió de tipo: ${paths[0]}`);
	}
	return problems;
}

/**
 * Números de migración repetidos.
 * @param {string[]} files nombres de archivo de migrations/
 * @param {Record<string, string[]>} [allowed]
 * @returns {string[]} una línea por número repetido
 */
export function duplicateNumbers(files, allowed = ALLOWED_DUPLICATES) {
	/** @type {Map<string, string[]>} */
	const byNumber = new Map();
	for (const file of files) {
		const match = /^(\d+)_/.exec(file);
		if (!match || !file.endsWith('.sql')) continue;
		const list = byNumber.get(match[1]) ?? [];
		list.push(file);
		byNumber.set(match[1], list);
	}
	const problems = [];
	for (const [number, list] of byNumber) {
		if (list.length < 2) continue;
		const ok = allowed[number];
		if (ok && list.every((f) => ok.includes(f)) && list.length === ok.length) continue;
		problems.push(`número repetido ${number}: ${list.sort().join(', ')}`);
	}
	return problems;
}

/** @param {string[]} argv */
function main(argv) {
	const baseIndex = argv.indexOf('--base');
	const baseRef = baseIndex >= 0 ? argv[baseIndex + 1] : 'origin/main';
	let base;
	try {
		base = git(['merge-base', baseRef, 'HEAD']);
	} catch {
		console.error(
			`migrations-lint: no encuentro «${baseRef}» (¿falta \`git fetch origin main\`?).`
		);
		process.exit(2);
	}
	const diff = git(['diff', '--name-status', '-M', base, '--', `${DIR}/`]);
	const files = readdirSync(join(process.cwd(), DIR));
	const problems = [...changedExisting(diff), ...duplicateNumbers(files)];
	if (problems.length === 0) {
		console.log(`migrations-lint: ${files.length} migraciones, todo en orden.`);
		return;
	}
	for (const p of problems) console.error(`::error::migrations-lint: ${p}`);
	console.error(
		'\nLas migraciones son append-only: no se editan, borran ni renombran las que ya están en ' +
			'main; se agrega una nueva con el número siguiente. Si dos PRs tomaron el mismo número, ' +
			'renumerá la tuya solo si no se aplicó en ninguna base remota (docs/datos.md).'
	);
	process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
