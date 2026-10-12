import { describe, expect, it } from 'vitest';
import { SITE_URL, siteOriginFrom } from './site.js';
import { SITE_URL as JSON_LD_SITE_URL } from './jsonLd.js';
import { SITE_ORIGIN } from './icsFeed.js';

describe('la dirección del sitio, en un solo lugar', () => {
	it('es la de producción y la usan el JSON-LD y los calendarios', () => {
		expect(SITE_URL).toBe('https://kinkyvibe.ar');
		expect(JSON_LD_SITE_URL).toBe(SITE_URL);
		expect(SITE_ORIGIN).toBe(SITE_URL);
	});

	it('siteOriginFrom: el primero que diga algo, sin espacios ni barra final', () => {
		expect(siteOriginFrom()).toBe(SITE_URL);
		expect(siteOriginFrom(undefined, null, '')).toBe(SITE_URL);
		expect(siteOriginFrom('  https://ejemplo.test/ ')).toBe('https://ejemplo.test');
		expect(siteOriginFrom('https://ejemplo.test//')).toBe('https://ejemplo.test');
		expect(siteOriginFrom('   ', 'https://otro.test')).toBe('https://otro.test');
		expect(siteOriginFrom(undefined, 'https://preview.test/')).toBe('https://preview.test');
		expect(siteOriginFrom('https://a.test', 'https://b.test')).toBe('https://a.test');
	});
});
