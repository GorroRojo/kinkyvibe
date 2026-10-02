import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTar } from './tar.js';

describe('makeTar', () => {
	it('arma un .tar que `tar` abre, con los textos tal cual (también con tildes)', () => {
		const files = [
			{
				name: 'calendario/fiesta-inventada.md',
				content: '---\ntitle: Fiesta Inventada\n---\n\nHolá ñandú\n'
			},
			{ name: 'material/guia-inventada.md', content: 'x'.repeat(1000) }
		];
		const tar = makeTar(files, { mtime: Date.parse('2026-10-01T12:00:00Z') });
		expect(tar.length % 512).toBe(0);
		const dir = mkdtempSync(join(tmpdir(), 'tar-prueba-'));
		try {
			writeFileSync(join(dir, 'a.tar'), tar);
			execFileSync('tar', ['-xf', 'a.tar'], { cwd: dir });
			for (const f of files) expect(readFileSync(join(dir, f.name), 'utf8')).toBe(f.content);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('no acepta nombres raros', () => {
		expect(() => makeTar([{ name: '../afuera.md', content: '' }])).toThrow();
		expect(() => makeTar([{ name: '/raiz.md', content: '' }])).toThrow();
		expect(() => makeTar([{ name: 'a'.repeat(101), content: '' }])).toThrow();
	});
});
