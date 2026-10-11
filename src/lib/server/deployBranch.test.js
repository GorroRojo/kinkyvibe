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

	it("la variable de Cloudflare Pages (CF_PAGES_BRANCH) ya no se lee: '' (producción)", () => {
		expect(deployBranchFromEnv({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' })).toBe('');
		expect(deployBranchFromEnv({ CF_PAGES: '1', CF_PAGES_BRANCH: 'rama' })).toBe('');
	});

	it('con las dos, solo cuenta WORKERS_CI_BRANCH', () => {
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: 'main', CF_PAGES_BRANCH: 'rama' })).toBe(
			'main'
		);
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: '', CF_PAGES_BRANCH: 'rama' })).toBe('');
	});

	it("local, tests o deploy a mano: '' (producción, sin modo demo)", () => {
		expect(deployBranchFromEnv({})).toBe('');
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: '', CF_PAGES_BRANCH: '' })).toBe('');
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: '  ' })).toBe('');
	});
});

describe('isPreviewDeploy con la rama del build', () => {
	/** @param {Record<string, string>} env */
	const preview = (env) => isPreviewDeploy(deployBranchFromEnv(env));

	it('producción (main) o sin rama: no es preview', () => {
		expect(preview({ WORKERS_CI_BRANCH: 'main' })).toBe(false);
		expect(preview({})).toBe(false);
	});

	it('otra rama en Workers Builds: preview', () => {
		expect(preview({ WORKERS_CI_BRANCH: 'claude/fase1-workers' })).toBe(true);
	});

	it('CF_PAGES_BRANCH sola no prende el preview (ni el modo demo)', () => {
		expect(preview({ CF_PAGES_BRANCH: 'claude/fase1-workers' })).toBe(false);
	});
});
