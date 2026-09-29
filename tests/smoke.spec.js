// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
// Smoke tests against the production build (`vite preview`), through public HTTP routes only.
import { expect, test } from '@playwright/test';

/** Mark the age gate as accepted so it doesn't cover the page. */
async function acceptAgeGate(page) {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('mayorDeEdad', 'true');
		} catch (e) {
			/* ignore */
		}
	});
}

/** Parses XML in the browser and returns the parser error text, if any. */
async function xmlError(page, xml) {
	return page.evaluate((text) => {
		const doc = new DOMParser().parseFromString(text, 'application/xml');
		const err = doc.getElementsByTagName('parsererror')[0];
		return err ? err.textContent : null;
	}, xml);
}

/** Minimal RFC 5545 reader: unfolds lines and returns the VEVENTs as property maps. */
function parseIcs(text) {
	const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(Boolean);
	const events = [];
	let current = null;
	const stack = [];
	for (const line of lines) {
		const i = line.indexOf(':');
		if (i < 0) throw new Error(`Invalid ICS line: ${line}`);
		const name = line.slice(0, i).split(';')[0];
		const value = line.slice(i + 1);
		if (name === 'BEGIN') {
			stack.push(value);
			if (value === 'VEVENT') current = {};
		} else if (name === 'END') {
			if (stack.pop() !== value) throw new Error(`Unbalanced END:${value}`);
			if (value === 'VEVENT') events.push(current), (current = null);
		} else if (current) {
			current[name] = value;
		}
	}
	if (stack.length) throw new Error(`Unclosed: ${stack.join(',')}`);
	return { lines, events };
}

/** 20261003T183000Z -> ms */
const icsDate = (v) =>
	Date.parse(v.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/, '$1-$2-$3T$4:$5:$6$7'));

const MAIN_ROUTES = [
	// The home <h1> is a hidden h-card (microformats), so check the first visible section title.
	{ path: '/', title: /^KinkyVibe\.ar$/, heading: 'Talleres y eventos', level: 2 },
	{ path: '/calendario', title: /Calendario/ },
	{ path: '/material', title: /Artículos, links y descargables/ },
	{ path: '/amigues', title: /Emprendimientos y profesionales/ },
	{ path: '/wiki', title: /Kinkipedia/, heading: 'Kinkipedia' },
	{ path: '/todo', title: /KinkyVibe/ },
	{ path: '/calendario/someter-2026-09', title: /Someter/, heading: /Someter/ },
	{ path: '/material/6-tips-para-tops', title: /6 tips para tops/, heading: '6 tips para tops' },
	{ path: '/amigues/AUCH', title: /AUCH/, heading: /AUCH/ },
	{ path: '/wiki/BDSM', title: /BDSM/ }
];

test.describe('rutas principales', () => {
	for (const route of MAIN_ROUTES) {
		test(`${route.path} responde 200 y renderiza`, async ({ page }) => {
			await acceptAgeGate(page);
			const res = await page.goto(route.path);
			expect(res?.status()).toBe(200);
			await expect(page).toHaveTitle(route.title);
			if (route.heading)
				await expect(
					page.getByRole('heading', { level: route.level ?? 1, name: route.heading })
				).toBeVisible();
		});
	}

	test('/login muestra el botón de GitHub', async ({ page }) => {
		const res = await page.goto('/login');
		expect(res?.status()).toBe(200);
		await expect(page.getByRole('button', { name: /GitHub/ })).toBeVisible();
	});
});

test.describe('calendario', () => {
	test('lista eventos', async ({ page }) => {
		await acceptAgeGate(page);
		await page.goto('/calendario');
		const links = page.locator('a[href^="/calendario/"]');
		await expect(links.first()).toBeVisible();
		expect(await links.count()).toBeGreaterThan(1);
	});

	test('la página de un evento muestra título y fecha', async ({ browser }) => {
		const context = await browser.newContext({ timezoneId: 'America/Argentina/Buenos_Aires' });
		const page = await context.newPage();
		await acceptAgeGate(page);
		await page.goto('/calendario/someter-2026-09');
		await expect(
			page.getByRole('heading', { level: 1, name: 'Someter: cómo dominar eróticamente un cuerpo' })
		).toBeVisible();
		const start = page.locator('time.dt-start').first();
		await expect(start).toHaveAttribute('datetime', '2026-09-11T19:30-03:00');
		await expect(start).toContainText('11 de septiembre de 2026');
		// After hydration the time is shown in the visitor's timezone (19:30 in Buenos Aires).
		await expect(start).toContainText('7:30');
		await context.close();
	});

	// BUG (reported, not fixed): the event time is formatted during SSR in the *server's*
	// timezone (UTC on Cloudflare), so the HTML says "10:30 p. m." for a 19:30 -03:00 event
	// until JS hydrates (crawlers, link previews, no-JS users see the wrong time).
	test.fixme('el HTML del servidor muestra la hora del evento en hora argentina', async ({
		request
	}) => {
		const html = await (await request.get('/calendario/someter-2026-09')).text();
		expect(html).toMatch(/class="dt-start"[^>]*>[^<]*7:30/);
	});

	test('/calendario.ics es un iCalendar válido con VEVENTs', async ({ request }) => {
		const res = await request.get('/calendario.ics');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/calendar');
		const text = await res.text();
		const { lines, events } = parseIcs(text);
		expect(lines[0]).toBe('BEGIN:VCALENDAR');
		expect(lines.at(-1)).toBe('END:VCALENDAR');
		expect(events.length).toBeGreaterThan(10);
		for (const ev of events) {
			expect(ev.SUMMARY, JSON.stringify(ev)).toBeTruthy();
			expect(ev.URL).toMatch(/^https:\/\/kinkyvibe\.ar\/calendario\//);
			expect(Number.isNaN(icsDate(ev.DTSTART)), ev.DTSTART).toBe(false);
			expect(Number.isNaN(icsDate(ev.DTEND)), ev.DTEND).toBe(false);
		}
		// Cancelled events are excluded from the feed.
		expect(events.some((e) => e.STATUS === 'CANCELLED')).toBe(false);
	});

	// Content bug (see src/tests/content-known-issues.json, code `end-before-start`): several
	// past events have `end` before `start` (after-midnight end with the same date), which
	// produces VEVENTs with DTEND < DTSTART. Enable once the content is fixed.
	test.fixme('todos los VEVENT terminan después de empezar', async ({ request }) => {
		const { events } = parseIcs(await (await request.get('/calendario.ics')).text());
		const bad = events.filter((e) => icsDate(e.DTEND) < icsDate(e.DTSTART)).map((e) => e.URL);
		expect(bad).toEqual([]);
	});
});

test.describe('feeds', () => {
	test('/rss responde con items', async ({ request }) => {
		const res = await request.get('/rss');
		expect(res.status()).toBe(200);
		const xml = await res.text();
		expect(xml).toMatch(/^<\?xml/);
		expect(xml).toContain('<rss');
		expect((xml.match(/<item>/g) ?? []).length).toBeGreaterThan(10);
	});

	// BUG (reported, not fixed): rss/+server.js interpolates titles without XML-escaping, so a
	// title like "Troles & Tableros" makes the whole feed invalid XML (feed readers reject it).
	test.fixme('/rss es XML bien formado', async ({ page, request }) => {
		const xml = await (await request.get('/rss')).text();
		expect(await xmlError(page, xml)).toBeNull();
	});

	// BUG (reported, not fixed): /sitemap.xml returns 500 (RangeError: Invalid time value)
	// because some listed posts have neither published_date nor updated_date and
	// `new Date('').toISOString()` throws. See code `listed-without-date` in
	// src/tests/content-known-issues.json. Enable once code or content is fixed.
	test.fixme('/sitemap.xml es XML bien formado', async ({ page, request }) => {
		const res = await request.get('/sitemap.xml');
		expect(res.status()).toBe(200);
		const xml = await res.text();
		expect(await xmlError(page, xml)).toBeNull();
		expect(xml).toContain('<loc>https://kinkyvibe.ar/calendario</loc>');
	});
});

test.describe('errores', () => {
	test('/wiki/<término inexistente> no rompe', async ({ request }) => {
		const res = await request.get('/wiki/esto-no-existe-xyz');
		expect(res.status()).toBeLessThan(500);
	});

	// BUG (reported, not fixed): fetchPost() does a dynamic import of the .md file and the
	// "Unknown variable dynamic import" error bubbles up as a 500 instead of a 404.
	for (const path of ['/calendario/no-existe', '/material/no-existe', '/amigues/no-existe']) {
		test.fixme(`${path} devuelve 404`, async ({ request }) => {
			const res = await request.get(path);
			expect(res.status()).toBe(404);
		});
	}
});

test.describe('auth', () => {
	test('/admin redirige a /login sin sesión', async ({ request }) => {
		const res = await request.get('/admin', { maxRedirects: 0 });
		expect([302, 303, 307]).toContain(res.status());
		expect(res.headers()['location']).toMatch(/\/login\?redirectTo=\/admin$/);
	});

	test('/edit redirige a /login sin sesión', async ({ request }) => {
		const res = await request.get('/edit/material/6-tips-para-tops', { maxRedirects: 0 });
		expect([302, 303, 307]).toContain(res.status());
		expect(res.headers()['location']).toMatch(/\/login/);
	});

	// KNOWN AUTH BYPASS on main (fix in progress on another branch): hooks.server.js trusts the
	// `userLogin` cookie whenever `userToken === prevToken`, so anyone can forge admin access.
	// Marked test.fail(): when the fix merges this starts passing and Playwright reports it as
	// "unexpectedly passed" — then remove the test.fail() line.
	test('cookies falsificadas NO dan acceso a /admin', async ({ request }) => {
		test.fail();
		const res = await request.get('/admin', {
			maxRedirects: 0,
			headers: { Cookie: 'userToken=x; prevToken=x; userLogin=GorroRojo' }
		});
		expect(res.status()).not.toBe(200);
		expect(res.headers()['location'] ?? '').toMatch(/\/login|^\/$|^http:\/\/[^/]+\/$/);
	});
});

test.describe('experiencia', () => {
	test('el aviso de +18 aparece en la primera visita y se puede cerrar', async ({ page }) => {
		await page.goto('/');
		const modal = page.getByRole('heading', { name: '¿Sos mayor de 18 años?' });
		await expect(modal).toBeVisible();
		await page.getByRole('button', { name: 'Sí' }).click();
		await expect(modal).toBeHidden();
		await page.reload();
		await expect(page.getByRole('heading', { level: 2, name: 'Talleres y eventos' })).toBeVisible();
		await expect(modal).toBeHidden();
	});

	test('la home no tira errores de consola', async ({ page, baseURL }) => {
		const errors = [];
		page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
		page.on('console', (msg) => {
			if (msg.type() !== 'error') return;
			// Third-party resources (fonts, embeds) may be blocked by the network in CI.
			const url = msg.location()?.url ?? '';
			if (url && baseURL && !url.startsWith(baseURL)) return;
			errors.push(`console: ${msg.text()} (${url})`);
		});
		await acceptAgeGate(page);
		await page.goto('/', { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { level: 2, name: 'Talleres y eventos' })).toBeVisible();
		expect(errors).toEqual([]);
	});
});
