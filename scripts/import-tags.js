// Importa las etiquetas (src/lib/utils/hardcodedTags.js) y los textos de la wiki
// (src/lib/posts/wiki/*.md) a objetos `etiqueta` en la base D1 LOCAL (la de `npm run dev`).
// Idempotente: se puede correr las veces que haga falta (ver src/lib/server/etiquetas/importer.js
// y docs/etiquetas.md).
//
//   npm run tags:import            # importa
//   npm run tags:import -- --dry   # solo muestra qué haría
//
// Para las bases remotas (preview y producción) NO se usa este script: se usa el panel
// (Etiquetas → Importar etiquetas), que corre lo mismo dentro del Worker contra la base de ese
// entorno.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import hardcodedTags from '../src/lib/utils/hardcodedTags.js';
import {
	SCRIPT_ACTOR,
	importTags,
	summarizeTagImport
} from '../src/lib/server/etiquetas/importer.js';
import { openLocalD1 } from './local-d1.js';

const dryRun = process.argv.includes('--dry');
const wikiDir = path.resolve('src/lib/posts/wiki');
const names = (await readdir(wikiDir)).filter((f) => f.endsWith('.md')).sort();
const wikiFiles = await Promise.all(
	names.map(async (name) => ({
		name: name.slice(0, -3),
		raw: await readFile(path.join(wikiDir, name), 'utf8')
	}))
);

const { db, dispose } = await openLocalD1();
try {
	const { results, warnings } = await importTags(
		db,
		{ rawTags: hardcodedTags, wikiFiles },
		{ actor: SCRIPT_ACTOR, dryRun }
	);
	for (const w of warnings) console.log(`aviso: ${w}`);
	for (const r of results) {
		const extra = [r.message, ...r.warnings].filter(Boolean).join('; ');
		const kind = r.alias ? 'alias ' : '      ';
		console.log(`${r.action.padEnd(16)} ${kind}${r.key}${extra ? `  (${extra})` : ''}`);
	}
	const s = summarizeTagImport(results);
	console.log(
		`\n${dryRun ? '[vista previa] ' : ''}${s.created} nuevas, ${s.updated} actualizadas, ` +
			`${s.unchanged} sin cambios, ${s.skipped_edited} editadas en el panel, ` +
			`${s.skipped_deleted} borradas, ${s.skipped_panel} creadas en el panel, ${s.error} con error.`
	);
	if (s.error) process.exitCode = 1;
} finally {
	await dispose();
}
