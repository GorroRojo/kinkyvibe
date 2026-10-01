// Importa las fichas de amigues (src/lib/posts/amigues/*.md) a perfiles en la base D1 LOCAL
// (la de `npm run dev`). Idempotente: se puede correr las veces que haga falta (ver
// src/lib/server/amigues/importer.js y docs/amigues.md).
//
//   npm run amigues:import            # importa
//   npm run amigues:import -- --dry   # solo muestra qué haría
//
// Para las bases remotas (preview y producción) NO se usa este script: se usa el botón del panel
// (Contenido → Amigues → Importar y clasificar), que corre lo mismo dentro del Worker contra la
// base de ese entorno. Así nadie necesita credenciales de Cloudflare en su compu.
import process from 'node:process';
import {
	SCRIPT_ACTOR,
	importAmigues,
	summarizeImport
} from '../src/lib/server/amigues/importer.js';
import { readAmigueFiles } from '../src/lib/server/amigues/files.js';
import { openLocalD1 } from './local-d1.js';

const dryRun = process.argv.includes('--dry');
const files = await readAmigueFiles();

const { db, dispose } = await openLocalD1();
try {
	const results = await importAmigues(db, files, { actor: SCRIPT_ACTOR, dryRun });
	for (const r of results) {
		const extra = [r.message, ...r.warnings].filter(Boolean).join('; ');
		console.log(
			`${r.action.padEnd(16)} ${r.kind.padEnd(8)} ${r.legacySlug}${extra ? `  (${extra})` : ''}`
		);
	}
	const s = summarizeImport(results);
	console.log(
		`\n${dryRun ? '[vista previa] ' : ''}${s.created} nuevas, ${s.updated} actualizadas, ${s.unchanged} sin cambios, ` +
			`${s.skipped_edited} editadas en el panel, ${s.skipped_deleted} borradas, ${s.error} con error.`
	);
	if (s.error) process.exitCode = 1;
} finally {
	await dispose();
}
