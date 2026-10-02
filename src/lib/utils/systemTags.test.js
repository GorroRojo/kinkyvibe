import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import hardcodedTags from './hardcodedTags.js';
import { eventTagGroups } from './adminTags.js';
import { KINKYVIBE_TAG as TIP_TAG } from './propinas.js';
import { SERIES_PARENT } from './series.js';
import { KINKYVIBE_TAG as TICKETS_TAG } from './ticketsEditor.js';
import { SYSTEM_TAGS, isSystemTag, systemTagMessage } from './systemTags.js';
import { applyTagOps, planTagChange } from './tagConfig.js';

const SOURCE = readFileSync(new URL('./hardcodedTags.js', import.meta.url), 'utf8');
const entries = () =>
	JSON.parse(JSON.stringify(hardcodedTags)).map((/** @type {any} */ value) => ({ value }));

describe('SYSTEM_TAGS', () => {
	it('includes the tag names other modules export as constants', () => {
		for (const id of [SERIES_PARENT, TIP_TAG, TICKETS_TAG, eventTagGroups().kinkyvibe])
			expect(isSystemTag(id)).toBe(true);
	});

	it('every system tag exists in the tag file, with a reason', () => {
		const ids = new Set(hardcodedTags.filter((t) => !('aliasOf' in t)).map((t) => t.id));
		for (const [id, reason] of Object.entries(SYSTEM_TAGS)) {
			expect(ids.has(id), id).toBe(true);
			expect(reason.length).toBeGreaterThan(10);
		}
	});

	it('exact ids only', () => {
		expect(isSystemTag('KinkyVibe')).toBe(true);
		expect(isSystemTag('kinkyvibe')).toBe(false);
		expect(isSystemTag('toString')).toBe(false);
		expect(isSystemTag(undefined)).toBe(false);
	});

	it('the message says what and why, in Spanish', () => {
		expect(systemTagMessage('Online', 'rename')).toMatch(/«Online» es una etiqueta del sistema/);
		expect(systemTagMessage('Online', 'merge')).toMatch(/no se puede fusionar con otra/);
	});
});

describe('applyTagOps guard (shared by the file and the database editors)', () => {
	it.each(Object.keys(SYSTEM_TAGS))('«%s» cannot be renamed or merged away', (id) => {
		for (const keepAlias of [true, false]) {
			expect(() =>
				applyTagOps(entries(), [{ type: 'rename', from: id, to: `${id} nueva`, keepAlias }])
			).toThrow(/no se puede renombrar/);
		}
		expect(() => applyTagOps(entries(), [{ type: 'merge', from: id, into: 'bondage' }])).toThrow(
			/no se puede fusionar/
		);
	});

	it('nor after other ops in the same batch', () => {
		expect(() =>
			applyTagOps(entries(), [
				{ type: 'update', id: 'Online', set: { icon: '💻' } },
				{ type: 'rename', from: 'Online', to: 'Virtual' }
			])
		).toThrow(/etiqueta del sistema/);
	});

	it('other edits to system tags still work, and other tags can merge into them', () => {
		const out = applyTagOps(entries(), [
			{ type: 'update', id: 'evento recurrente', set: { visible_name: 'Series' } },
			{ type: 'create', id: 'Etiqueta De Prueba', parent: 'calendario' },
			{ type: 'merge', from: 'Etiqueta De Prueba', into: 'KinkyVibe' }
		]);
		expect(out.find((e) => e.value.id === 'evento recurrente')?.value.visible_name).toBe('Series');
	});

	it('file mode: planTagChange refuses before touching any file', () => {
		expect(() =>
			planTagChange({
				source: SOURCE,
				sourcePath: 'src/lib/utils/hardcodedTags.js',
				posts: [],
				ops: [{ type: 'rename', from: 'KinkyVibe', to: 'Kinky Vibe' }]
			})
		).toThrow(/«KinkyVibe» es una etiqueta del sistema/);
	});
});
