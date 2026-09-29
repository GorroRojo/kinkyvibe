import { readdirSync, readFileSync } from 'node:fs';

const EVENTS_DIR = 'src/lib/posts/calendario';

/**
 * Un evento publicado real del repo para la prueba E2E (el contenido cambia, así que lo
 * buscamos). Las entradas se las agrega TICKETS_DEV_FIXTURE solo en `vite dev`.
 */
export function ticketsE2EEvent() {
	const file = readdirSync(EVENTS_DIR)
		.filter((f) => f.endsWith('.md') && !f.startsWith('_'))
		.sort()
		.find((f) => {
			const text = readFileSync(`${EVENTS_DIR}/${f}`, 'utf8');
			return (
				!/^force_unpublished:\s*true/m.test(text) &&
				!/^redirect:/m.test(text) &&
				!/^tickets:/m.test(text) &&
				/^start:/m.test(text)
			);
		});
	if (!file) throw new Error('No encontré un evento para la prueba de entradas');
	return file.replace(/\.md$/, '');
}
