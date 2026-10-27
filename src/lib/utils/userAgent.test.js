import { describe, expect, it } from 'vitest';
import { DEVICE_LABEL_MAX, deviceLabel } from './userAgent.js';

describe('deviceLabel', () => {
	it.each([
		['Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0', 'Firefox en Android'],
		[
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
			'Safari en iPhone'
		],
		[
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
			'Chrome en iPhone'
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
			'Chrome en Windows'
		],
		[
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
			'Edge en Windows'
		],
		[
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
			'Safari en Mac'
		],
		[
			'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
			'Samsung Internet en Android'
		],
		['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox en Linux'],
		[
			'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
			'Chrome en ChromeOS'
		]
	])('%s → %s', (ua, label) => {
		expect(deviceLabel(ua)).toBe(label);
	});

	it('con una sola parte, esa; sin nada reconocible o sin user agent, null', () => {
		expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) algo/1.0')).toBe('Windows');
		expect(deviceLabel('curl/8.5.0')).toBeNull();
		expect(deviceLabel('')).toBeNull();
		expect(deviceLabel(null)).toBeNull();
		expect(deviceLabel(undefined)).toBeNull();
	});

	it('nunca pasa del largo máximo', () => {
		const label = deviceLabel('Mozilla/5.0 (Android 14) Firefox/131.0');
		expect(label?.length).toBeLessThanOrEqual(DEVICE_LABEL_MAX);
	});
});
