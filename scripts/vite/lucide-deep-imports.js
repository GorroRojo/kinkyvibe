/**
 * Plugin de Vite solo para los tests (vitest): cambia `import { CalendarRange } from '@lucide/svelte'`
 * por `import CalendarRange from '@lucide/svelte/icons/calendar-range'`.
 *
 * El barril de @lucide/svelte reexporta unos 4000 íconos. En el build eso no importa (tree
 * shaking), pero vitest no lo achica: cada archivo de test que toca un componente con íconos, o un
 * módulo del servidor que importa `$lib/admin/nav.js`, transforma y evalúa los 4000 módulos uno
 * por uno (~30 s la primera vez con la máquina cargada). Con los imports directos solo se cargan
 * los íconos que se usan. No se puede pre-empaquetar con `deps.optimizer` porque el paquete
 * empaquetado trae otra copia del runtime de Svelte y los componentes pierden el contexto.
 *
 * El mapa nombre → archivo sale de los propios archivos del barril (íconos y alias), así que no
 * adivina nombres. Si un import nombra algo que no es un ícono (`Icon`, `setLucideProps`…) se deja
 * tal cual.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const PKG = '@lucide/svelte';
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*(['"])@lucide\/svelte\2;?/g;

/**
 * Nombre exportado → nombre del archivo del ícono (sin extensión), leído del barril instalado.
 *
 * @param {string} distDir carpeta `dist` del paquete
 */
export function readIconMap(distDir) {
	/** @type {Map<string, string>} */
	const map = new Map();
	const files = [
		'icons/index.js',
		'aliases/aliases.js',
		'aliases/prefixed.js',
		'aliases/suffixed.js'
	];
	for (const file of files) {
		const src = readFileSync(path.join(distDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
		for (const m of src.matchAll(
			/default\s+as\s+(\w+)\s*\}\s*from\s*['"](?:\.\.\/icons\/|\.\/)([\w-]+)\.(?:svelte|js)['"]/g
		))
			map.set(m[1], m[2]);
	}
	return map;
}

/**
 * Reescribe los imports con nombre del barril. Devuelve `null` si no hay nada que cambiar.
 *
 * @param {string} code
 * @param {Map<string, string>} icons
 */
export function rewriteLucideImports(code, icons) {
	if (!code.includes(PKG)) return null;
	let changed = false;
	const out = code.replace(
		IMPORT_RE,
		(/** @type {string} */ whole, /** @type {string} */ specifiers) => {
			const parts = specifiers
				.split(',')
				.map((/** @type {string} */ s) => s.trim())
				.filter(Boolean)
				.map((/** @type {string} */ s) => {
					/** @type {string[]} */
					const names = s.split(/\s+as\s+/).map((x) => x.trim());
					const [imported, local = imported] = names;
					return { imported, local, file: icons.get(imported) };
				});
			if (!parts.length || parts.some((p) => !p.file)) return whole;
			changed = true;
			return parts.map((p) => `import ${p.local} from '${PKG}/icons/${p.file}';`).join(' ');
		}
	);
	return changed ? out : null;
}

/** @returns {import('vite').Plugin} */
export function lucideDeepImports() {
	/** @type {Map<string, string> | undefined} */
	let icons;
	return {
		name: 'kinkyvibe:lucide-deep-imports',
		enforce: 'post',
		transform(code, id) {
			if (id.includes('/node_modules/') || !/\.(svelte|js)(\?|$)/.test(id)) return null;
			if (!code.includes(PKG)) return null;
			if (!icons) {
				const require = createRequire(import.meta.url);
				icons = readIconMap(path.dirname(require.resolve(PKG)));
			}
			const out = rewriteLucideImports(code, icons);
			return out === null ? null : { code: out, map: null };
		}
	};
}
