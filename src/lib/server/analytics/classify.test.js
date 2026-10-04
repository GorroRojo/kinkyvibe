import { describe, expect, it } from 'vitest';
import {
	countryCode,
	deviceClass,
	eventOfPath,
	isBot,
	isTrackedPath,
	normalizePath,
	referrerHost
} from './classify.js';

// User-Agents de ejemplo (públicos, de navegadores y bots conocidos).
const UA = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
	androidTablet:
		'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
	ipad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
	mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
	windows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
	instagram:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91',
	facebookApp:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]'
};

describe('isBot', () => {
	it.each([
		'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
		'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
		'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
		'WhatsApp/2.23.20.0 A',
		'TelegramBot (like TwitterBot)',
		'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
		'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
		'Twitterbot/1.0',
		'curl/8.4.0',
		'Wget/1.21',
		'python-requests/2.31.0',
		'Go-http-client/2.0',
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
		'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
		'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
		'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
		'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0 Mobile Safari/537.36 Chrome-Lighthouse',
		'UptimeRobot/2.0',
		''
	])('es bot: %s', (ua) => {
		expect(isBot(ua)).toBe(true);
	});

	it('sin User-Agent es bot', () => {
		expect(isBot(null)).toBe(true);
		expect(isBot(undefined)).toBe(true);
		expect(isBot('   ')).toBe(true);
	});

	it.each(Object.entries(UA))('no es bot: %s', (_name, ua) => {
		expect(isBot(ua)).toBe(false);
	});
});

describe('deviceClass', () => {
	it('celu, tablet o compu', () => {
		expect(deviceClass(UA.iphone)).toBe('phone');
		expect(deviceClass(UA.android)).toBe('phone');
		expect(deviceClass(UA.instagram)).toBe('phone');
		expect(deviceClass(UA.ipad)).toBe('tablet');
		expect(deviceClass(UA.androidTablet)).toBe('tablet');
		expect(deviceClass(UA.mac)).toBe('desktop');
		expect(deviceClass(UA.windows)).toBe('desktop');
		expect(deviceClass('')).toBe('desktop');
	});
});

describe('normalizePath', () => {
	it.each([
		['/', '/'],
		['', '/'],
		['/calendario/', '/calendario'],
		['/calendario/Fiesta-Rara', '/calendario/fiesta-rara'],
		['/calendario/fiesta-rara/__data.json', '/calendario/fiesta-rara'],
		['/__data.json', '/'],
		['//wiki///bdsm/', '/wiki/bdsm'],
		['/amigues?utm_source=ig&fbclid=abc', '/amigues'],
		['/material#arriba', '/material']
	])('%s → %s', (input, expected) => {
		expect(normalizePath(input)).toBe(expected);
	});

	it('corta las rutas muy largas', () => {
		expect(normalizePath(`/${'a'.repeat(500)}`)).toHaveLength(120);
	});
});

describe('isTrackedPath', () => {
	it.each(['/', '/calendario', '/calendario/fiesta-rara', '/wiki/bdsm', '/amigues', '/propinas'])(
		'cuenta %s',
		(p) => {
			expect(isTrackedPath(p)).toBe(true);
		}
	);
	it.each([
		'/admin',
		'/admin/estadisticas',
		'/edit/algo',
		'/api/visto',
		'/entradas/abc123/estado',
		'/entradas/t/token-falso',
		'/avisos/confirmar/token-falso',
		'/avisos/baja/token-falso',
		'/avisos/sigo/token-falso',
		'/propinas/id-falso',
		'/mi-rincon',
		'/ingresar',
		'/login',
		'/callback',
		'/_app/immutable/x.js'
	])('no cuenta %s', (p) => {
		expect(isTrackedPath(p)).toBe(false);
	});
	it('no confunde prefijos', () => {
		expect(isTrackedPath('/administracion-de-riesgos')).toBe(true);
		expect(isTrackedPath('/apis')).toBe(true);
	});
});

describe('eventOfPath', () => {
	it('página del evento, de compra y otras', () => {
		expect(eventOfPath('/calendario/fiesta-rara')).toEqual({ slug: 'fiesta-rara', step: 'evento' });
		expect(eventOfPath('/calendario/fiesta-rara/entradas')).toEqual({
			slug: 'fiesta-rara',
			step: 'abrio'
		});
		expect(eventOfPath('/calendario/fiesta-rara/compartir')).toEqual({
			slug: 'fiesta-rara',
			step: ''
		});
		expect(eventOfPath('/calendario')).toEqual({ slug: '', step: '' });
		expect(eventOfPath('/wiki/fiesta-rara')).toEqual({ slug: '', step: '' });
	});
});

describe('referrerHost', () => {
	it('solo el dominio, sin www, sin ruta ni query', () => {
		expect(referrerHost('https://www.instagram.com/p/abc?igsh=xyz', 'kinkyvibe.ar')).toBe(
			'instagram.com'
		);
		expect(referrerHost('https://l.facebook.com/l.php?u=algo', 'kinkyvibe.ar')).toBe(
			'l.facebook.com'
		);
		expect(referrerHost('android-app://com.google.android.gm/', 'kinkyvibe.ar')).toBe(
			'com.google.android.gm'
		);
	});
	it('interno, vacío o raro → vacío', () => {
		expect(referrerHost('https://kinkyvibe.ar/calendario', 'kinkyvibe.ar')).toBe('');
		expect(referrerHost('https://www.kinkyvibe.ar/', 'kinkyvibe.ar')).toBe('');
		expect(referrerHost('http://localhost:5173/x', 'localhost:5173')).toBe('');
		expect(referrerHost('', 'kinkyvibe.ar')).toBe('');
		expect(referrerHost(null, 'kinkyvibe.ar')).toBe('');
		expect(referrerHost('no es una url', 'kinkyvibe.ar')).toBe('');
		expect(referrerHost('javascript:alert(1)', 'kinkyvibe.ar')).toBe('');
	});
});

describe('countryCode', () => {
	it('dos letras o nada', () => {
		expect(countryCode('AR')).toBe('AR');
		expect(countryCode('T1')).toBe('T1');
		expect(countryCode('argentina')).toBe('');
		expect(countryCode(undefined)).toBe('');
	});
});
