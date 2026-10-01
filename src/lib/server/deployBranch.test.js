import { describe, expect, it } from 'vitest';
import { deployBranchFromEnv } from './deployBranch.js';
import { isPreviewDeploy } from './deploy.js';

describe('deployBranchFromEnv', () => {
	it('Workers Builds: WORKERS_CI_BRANCH', () => {
		expect(deployBranchFromEnv({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe('main');
		expect(deployBranchFromEnv({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'claude/algo' })).toBe(
			'claude/algo'
		);
	});

	it('Cloudflare Pages: CF_PAGES_BRANCH (mientras siga en Pages)', () => {
		expect(deployBranchFromEnv({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' })).toBe('main');
		expect(deployBranchFromEnv({ CF_PAGES: '1', CF_PAGES_BRANCH: 'rama' })).toBe('rama');
	});

	it('Workers Builds manda si están las dos', () => {
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: 'main', CF_PAGES_BRANCH: 'rama' })).toBe(
			'main'
		);
	});

	it("local, tests o deploy a mano: '' (producción, sin modo demo)", () => {
		expect(deployBranchFromEnv({})).toBe('');
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: '', CF_PAGES_BRANCH: '' })).toBe('');
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: '  ' })).toBe('');
	});
});

describe('isPreviewDeploy con la rama de cada plataforma', () => {
	/** @param {Record<string, string>} env */
	const preview = (env) => isPreviewDeploy(deployBranchFromEnv(env));

	it('producción en Workers y en Pages: no es preview', () => {
		expect(preview({ WORKERS_CI_BRANCH: 'main' })).toBe(false);
		expect(preview({ CF_PAGES_BRANCH: 'main' })).toBe(false);
		expect(preview({})).toBe(false);
	});

	it('otra rama en Workers o en Pages: preview', () => {
		expect(preview({ WORKERS_CI_BRANCH: 'claude/fase1-workers' })).toBe(true);
		expect(preview({ CF_PAGES_BRANCH: 'claude/fase1-workers' })).toBe(true);
	});
});
