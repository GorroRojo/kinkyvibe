import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	clearContentPullCache,
	contentPullItems,
	contentPullStatus,
	openContentPullStatuses,
	pullStatus
} from './contentPulls.js';

/** @param {string | null} rollup @param {Record<string, any>} [extra] */
const node = (rollup, extra = {}) => ({
	number: 7,
	title: 'Contenido: edita Fiesta',
	url: 'https://github.com/GorroRojo/kinkyvibe/pull/7',
	headRefName: 'contenido/calendario-fiesta-20260930-120000',
	state: 'OPEN',
	mergeable: 'MERGEABLE',
	createdAt: '2026-09-30T15:00:00Z',
	autoMergeRequest: { enabledAt: '2026-09-30T15:00:01Z' },
	commits: { nodes: [{ commit: { statusCheckRollup: rollup ? { state: rollup } : null } }] },
	...extra
});

describe('pullStatus', () => {
	it('tells pending, published, failed, conflicting, manual and closed apart', () => {
		expect(pullStatus(node('PENDING'))).toBe('pendiente');
		expect(pullStatus(node(null))).toBe('pendiente');
		expect(pullStatus(node('SUCCESS', { state: 'MERGED' }))).toBe('publicado');
		expect(pullStatus(node('FAILURE'))).toBe('fallo');
		expect(pullStatus(node('ERROR'))).toBe('fallo');
		expect(pullStatus(node('PENDING', { mergeable: 'CONFLICTING' }))).toBe('conflicto');
		expect(pullStatus(node('SUCCESS', { autoMergeRequest: null }))).toBe('abierto');
		expect(pullStatus(node('SUCCESS', { state: 'CLOSED' }))).toBe('cerrado');
	});
});

describe('contentPullItems', () => {
	it('lists failures first, with a link to the PR', () => {
		const items = contentPullItems([
			{
				...node('PENDING'),
				number: 1,
				status: 'pendiente',
				branch: 'b',
				title: 'Contenido: edita A'
			},
			{ ...node('FAILURE'), number: 2, status: 'fallo', branch: 'b', title: 'Contenido: crea B' }
		]);
		expect(items.map((i) => i.id)).toEqual(['pr-2', 'pr-1']);
		expect(items[0]).toMatchObject({
			tone: 'bad',
			icon: 'pr',
			title: 'No se publicó: falló una prueba del contenido: crea B'
		});
		expect(items[1]).toMatchObject({ tone: 'info', title: 'Publicándose: edita A' });
		expect(items[1].text).toContain('PR #1');
	});
});

describe('GitHub queries', () => {
	const realFetch = globalThis.fetch;
	/** @type {any[]} */
	let bodies;
	/** @type {any} */
	let data;
	beforeEach(() => {
		bodies = [];
		clearContentPullCache();
		// @ts-ignore
		globalThis.fetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
			expect(url).toBe('https://api.github.com/graphql');
			bodies.push(JSON.parse(init.body));
			return new Response(JSON.stringify({ data }), { status: 200 });
		};
	});
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	it('reads one content PR and ignores other PRs', async () => {
		data = { repository: { pullRequest: node('FAILURE') } };
		expect(await contentPullStatus('t', 7)).toMatchObject({ number: 7, status: 'fallo' });
		expect(bodies[0].variables).toMatchObject({ n: 7 });
		data = { repository: { pullRequest: node('FAILURE', { headRefName: 'claude/x' }) } };
		expect(await contentPullStatus('t', 7)).toBeNull();
	});

	it('lists open content PRs, cached for a minute', async () => {
		data = {
			repository: {
				pullRequests: { nodes: [node('PENDING'), node('SUCCESS', { headRefName: 'claude/x' })] }
			}
		};
		const list = await openContentPullStatuses('t', { now: 1000 });
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ number: 7, status: 'pendiente' });
		await openContentPullStatuses('t', { now: 30_000 });
		expect(bodies).toHaveLength(1);
		await openContentPullStatuses('t', { now: 70_000 });
		expect(bodies).toHaveLength(2);
	});
});
