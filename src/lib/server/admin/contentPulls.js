/**
 * Estado de los PRs de contenido (ramas `contenido/*`, ver commitFiles en
 * $lib/server/eventos/github.js y docs/publicar-contenido.md): para el aviso «se publica cuando pasen las
 * pruebas» del editor y para deshacer un borrado. Consultas por GraphQL con el token de la persona
 * logueada; sin SvelteKit, así se prueba con un fetch falso. «Para revisar» ya no lista los PRs de
 * contenido (decisión 0030: el contenido vive solo en la base).
 */
import { CONTENT_BRANCH_PREFIX, REPO, graphql } from '../eventos/github.js';

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
