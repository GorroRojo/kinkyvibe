import { describe, expect, it } from 'vitest';
import { planRelated } from './test-related.js';

const all = () => true;

describe('planRelated', () => {
	it('sin cambios no corre nada', () => {
		expect(planRelated([], all)).toEqual({ mode: 'none' });
		expect(planRelated(['', '  '], all)).toEqual({ mode: 'none' });
	});

	it('saca los archivos borrados y los repetidos', () => {
		const exists = (/** @type {string} */ f) => f !== 'src/lib/viejo.js';
		expect(
			planRelated(['src/lib/a.js', 'src/lib/viejo.js', 'src/lib/a.js', 'docs/x.md'], exists)
		).toEqual({ mode: 'related', files: ['docs/x.md', 'src/lib/a.js'] });
	});

	it('si solo se borraron archivos, no corre nada', () => {
		expect(planRelated(['src/lib/viejo.js'], () => false)).toEqual({ mode: 'none' });
	});

	it('la configuración, las dependencias, las migraciones o el setup corren todas', () => {
		for (const f of [
			'package.json',
			'package-lock.json',
			'vite.config.js',
			'migrations/0099_algo.sql',
			'src/tests/setup.js',
			'scripts/vitest/durations.json'
		]) {
			expect(planRelated(['src/lib/a.js', f], all)).toEqual({ mode: 'all', reason: f });
		}
	});

	it('los .svelte, .md y otros no-JS van tal cual: vitest los busca en el grafo de imports', () => {
		expect(planRelated(['src/lib/components/Boton.svelte', 'README.md'], all)).toEqual({
			mode: 'related',
			files: ['README.md', 'src/lib/components/Boton.svelte']
		});
	});
});
