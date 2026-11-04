/**
 * Escribe un archivo golden de mails (`UPDATE_EMAIL_GOLDEN=1`, docs/mails.md): JSON con tabs y
 * salto de línea final. Las claves que ya estaban quedan en el orden de antes (regenerar sin
 * cambios da un diff vacío); las nuevas van al final, en el orden de los casos; las que ya no
 * tienen caso se borran.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * @param {URL} file
 * @param {Record<string, unknown>} fresh lo que devuelve hoy cada caso
 */
export function writeGolden(file, fresh) {
	/** @type {Record<string, unknown>} */
	const before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
	const keys = [
		...Object.keys(before).filter((k) => k in fresh),
		...Object.keys(fresh).filter((k) => !(k in before))
	];
	const ordered = Object.fromEntries(keys.map((k) => [k, fresh[k]]));
	writeFileSync(file, JSON.stringify(ordered, null, '\t') + '\n');
}
