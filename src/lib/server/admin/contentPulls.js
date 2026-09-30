/**
 * Estado de los PRs de contenido (ramas `contenido/*`, ver commitFiles en
 * $lib/server/eventos/github.js y docs/publicar-contenido.md): para el aviso «se publica cuando pasen las
 * pruebas» del editor y para «Para revisar» en el Inicio del panel. Consultas por GraphQL con el
 * token de la persona logueada; sin SvelteKit, así se prueba con un fetch falso.
 */
import { BRANCH, CONTENT_BRANCH_PREFIX, REPO, graphql } from '../eventos/github.js';

/**
 * - `pendiente`: esperando las pruebas, se mergea solo;
 * - `publicado`: mergeado (el sitio se actualiza con el deploy de main);
 * - `fallo`: falló una prueba, no se publica;
 * - `conflicto`: choca con otro cambio en main;
 * - `abierto`: sin merge automático, alguien tiene que mergearlo a mano;
 * - `cerrado`: cerrado sin mergear.
 * @typedef {'pendiente'|'publicado'|'fallo'|'conflicto'|'abierto'|'cerrado'} ContentPullStatus
 */

/**
 * @typedef {object} ContentPullInfo
 * @prop {number} number
 * @prop {string} title
 * @prop {string} url
 * @prop {string} branch
 * @prop {string} createdAt
 * @prop {ContentPullStatus} status
 */

const FIELDS = `number title url headRefName state mergeable createdAt
	autoMergeRequest { enabledAt }
	commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`;

/**
 * @param {any} node a PullRequest from GraphQL
 * @returns {ContentPullStatus}
 */
export function pullStatus(node) {
	if (node.state === 'MERGED') return 'publicado';
	if (node.state === 'CLOSED') return 'cerrado';
	const checks = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
	if (checks === 'FAILURE' || checks === 'ERROR') return 'fallo';
	if (node.mergeable === 'CONFLICTING') return 'conflicto';
	return node.autoMergeRequest ? 'pendiente' : 'abierto';
}

/**
 * @param {any} node
 * @returns {ContentPullInfo}
 */
const toInfo = (node) => ({
	number: node.number,
	title: node.title,
	url: node.url,
	branch: node.headRefName,
	createdAt: node.createdAt,
	status: pullStatus(node)
});

/**
 * Un PR de contenido, o null si no existe o no es de contenido (el panel no consulta otros PRs).
 * @param {string} token
 * @param {number} number
 * @returns {Promise<ContentPullInfo | null>}
 */
export async function contentPullStatus(token, number) {
	const [owner, name] = REPO.split('/');
	const data = await graphql(
		token,
		`query($owner: String!, $name: String!, $n: Int!) {
			repository(owner: $owner, name: $name) { pullRequest(number: $n) { ${FIELDS} } }
		}`,
		{ owner, name, n: number },
		`PR #${number}`
	);
	const node = data?.repository?.pullRequest;
	if (!node || !String(node.headRefName).startsWith(CONTENT_BRANCH_PREFIX)) return null;
	return toInfo(node);
}

/** Los PRs abiertos cambian poco: una consulta por admin cada tanto alcanza para el Inicio. */
const CACHE_MS = 60 * 1000;
/** @type {Map<string, {at: number, list: ContentPullInfo[]}>} */
const cache = new Map();

/**
 * PRs de contenido abiertos, del más nuevo al más viejo (cache de un minuto por token).
 * @param {string} token
 * @param {{now?: number, fresh?: boolean}} [opts]
 * @returns {Promise<ContentPullInfo[]>}
 */
export async function openContentPullStatuses(token, { now = Date.now(), fresh = false } = {}) {
	const hit = cache.get(token);
	if (!fresh && hit && now - hit.at < CACHE_MS) return hit.list;
	const [owner, name] = REPO.split('/');
	const data = await graphql(
		token,
		`query($owner: String!, $name: String!, $base: String!) {
			repository(owner: $owner, name: $name) {
				pullRequests(states: OPEN, baseRefName: $base, first: 50,
					orderBy: {field: CREATED_AT, direction: DESC}) { nodes { ${FIELDS} } }
			}
		}`,
		{ owner, name, base: BRANCH },
		'PRs de contenido'
	);
	const list = (data?.repository?.pullRequests?.nodes ?? [])
		.filter((/** @type {any} */ n) => String(n?.headRefName).startsWith(CONTENT_BRANCH_PREFIX))
		.map(toInfo);
	cache.set(token, { at: now, list });
	if (cache.size > 50) cache.delete(String(cache.keys().next().value));
	return list;
}

/** Para los tests. */
export function clearContentPullCache() {
	cache.clear();
}

/** @type {Record<ContentPullStatus, {tone: 'info'|'warn'|'bad', title: string, text: string}>} */
const ITEM = {
	pendiente: {
		tone: 'info',
		title: 'Publicándose',
		text: 'se publica solo cuando pasen las pruebas'
	},
	fallo: {
		tone: 'bad',
		title: 'No se publicó: falló una prueba del contenido',
		text: 'revisá el PR o volvé a guardar con el error corregido'
	},
	conflicto: {
		tone: 'bad',
		title: 'No se publicó: choca con otro cambio',
		text: 'alguien tiene que resolver el conflicto en GitHub'
	},
	abierto: {
		tone: 'warn',
		title: 'Guardado sin publicar',
		text: 'no tiene el merge automático: hay que mergearlo en GitHub'
	},
	publicado: { tone: 'info', title: 'Publicado', text: '' },
	cerrado: { tone: 'warn', title: 'Cerrado sin publicar', text: '' }
};

/**
 * Ítems de «Para revisar» del Inicio: los PRs de contenido abiertos, los con problemas primero.
 * @param {ContentPullInfo[]} pulls
 * @returns {import('./inicio.js').ReviewItem[]}
 */
export function contentPullItems(pulls) {
	const order = { fallo: 0, conflicto: 1, abierto: 2, pendiente: 3, publicado: 4, cerrado: 5 };
	return [...pulls]
		.sort((a, b) => order[a.status] - order[b.status])
		.map((p) => {
			const item = ITEM[p.status];
			const what = p.title.replace(/^Contenido:\s*/, '');
			return {
				id: `pr-${p.number}`,
				tone: item.tone,
				icon: 'pr',
				title: `${item.title}: ${what}`,
				text: `PR #${p.number}${item.text ? ` · ${item.text}` : ''}`,
				action: 'Ver el PR',
				href: p.url
			};
		});
}
