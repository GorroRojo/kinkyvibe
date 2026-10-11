/**
 * Textos de borrar y deshacer del panel, compartidos por la página de borrar y Actividad.
 */

/**
 * Aviso después de deshacer un borrado. `immediate`: ya está (un perfil que vive solo en la
 * base), no hay nada que publicar.
 * @param {{ mode: 'cancelled' | 'restored', title: string, immediate?: boolean }} undone
 */
export function undoneMessage({ mode, title, immediate = false }) {
	if (mode === 'cancelled')
		return `Listo: «${title}» no se borró (se canceló el cambio antes de publicarse).`;
	return immediate
		? `Listo: «${title}» vuelve a estar.`
		: `Listo: «${title}» vuelve a estar. Se publica en unos minutos.`;
}

/** Las filas de la biblioteca en «Recuperar» (ver `libraryPath` de src/lib/server/admin/deletions.js). */
const LIBRARY_ROW = /^objeto:(imagen|archivo):[1-9]\d*$/;
/** Las etiquetas y las series (ver `tagDeletionPath` de src/lib/server/admin/deletions.js). */
const TAG_ROW = /^objeto:(etiqueta|serie):[1-9]\d*$/;
/** El texto propio de un mail de un evento (ver `templateDeletionPath`). */
const TEMPLATE_ROW = /^plantilla:[^:]+:[a-z_]+$/;
/** Preguntas de inscripción, roles y notas internas (decisión 0033; ver `softDeletionStatement`). */
const FIELD_ROW = /^pregunta:[1-9]\d*$/;
const ROLE_ROW = /^rol:.+$/;
const NOTE_ROW = /^nota:[1-9]\d*$/;
/** El `slug` de una nota: el id corto de la persona, o `cuenta:<id>` (una cuenta borrada). */
const NOTE_PERSON = /^[0-9a-f]{16}$/;
const NOTE_ACCOUNT = /^cuenta:(.+)$/;

const KIND_LABELS = /** @type {Record<string, string>} */ ({
	calendario: 'Evento',
	material: 'Material',
	amigues: 'Amigues'
});

/**
 * Qué es cada borrado en «Borrados que podés recuperar»: «Evento», «Material», «Amigues»,
 * «Etiqueta», «Serie», «Mail del evento» (con la dirección del evento), «Pregunta de inscripción»,
 * «Rol», «Nota interna» o, para la biblioteca,
 * «Biblioteca · imagen» / «Biblioteca · archivo» (sin la dirección: es el hash del archivo).
 * @param {{ kind: string, path?: string }} row
 * @returns {{ label: string, library: boolean }}
 */
export function deletionLabel({ kind, path = '' }) {
	const m = LIBRARY_ROW.exec(path);
	if (m) return { label: `Biblioteca · ${m[1]}`, library: true };
	const tag = TAG_ROW.exec(path);
	if (tag) return { label: tag[1] === 'serie' ? 'Serie' : 'Etiqueta', library: false };
	if (TEMPLATE_ROW.test(path)) return { label: 'Mail del evento', library: false };
	if (FIELD_ROW.test(path)) return { label: 'Pregunta de inscripción', library: false };
	if (ROLE_ROW.test(path)) return { label: 'Rol', library: false };
	if (NOTE_ROW.test(path)) return { label: 'Nota interna', library: false };
	return { label: KIND_LABELS[kind] ?? kind, library: false };
}

/**
 * Dónde se ve un borrado de una pregunta, un rol o una nota (para el link de «Recuperar»), o
 * `null`: la pestaña Preguntas del evento (o Roles y preguntas, si es general), Roles y preguntas,
 * o la ficha de la persona (por su id corto, nunca el mail) o de la cuenta borrada.
 * @param {{ path?: string, slug?: string }} row
 * @returns {{ href: string, text: string } | null}
 */
export function deletionLink({ path = '', slug = '' }) {
	if (FIELD_ROW.test(path))
		return slug
			? { href: `/admin/eventos/${encodeURIComponent(slug)}/preguntas`, text: slug }
			: { href: '/admin/eventos/roles', text: 'pregunta general' };
	if (ROLE_ROW.test(path)) return { href: '/admin/eventos/roles', text: 'Roles y preguntas' };
	if (NOTE_ROW.test(path)) {
		if (NOTE_PERSON.test(slug))
			return { href: `/admin/comunidad/personas/${slug}`, text: 'ver la ficha' };
		const account = NOTE_ACCOUNT.exec(slug)?.[1];
		if (account)
			return {
				href: `/admin/comunidad/cuentas/${encodeURIComponent(account)}`,
				text: 'ver la ficha'
			};
	}
	return null;
}
