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
	const lines = text
		.replace(/\r?\n[ \t]/g, '')
		.split(/\r?\n/)
		.filter(Boolean);
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
			if (value === 'VEVENT') (events.push(current), (current = null));
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
	{ path: '/', title: /^Kinky Vibe$/, heading: 'Talleres y eventos', level: 2 },
	{ path: '/calendario', title: /^Calendario · Kinky Vibe$/ },
	{ path: '/material', title: /Artículos, links y descargables/ },
	{ path: '/amigues', title: /Emprendimientos y profesionales/ },
	{ path: '/wiki', title: /Kinkipedia/, heading: 'Kinkipedia' },
	{ path: '/todo', title: /^Kinky Vibe$/ },
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
	// Without ?viewdate the page opens on today's month (or the next one), so what it lists
	// depended on the date the test ran: since October 2026 the repo's .md posts have no listed
	// upcoming events (the October ones are `force_unlisted`) and the month it opens on is empty.
	// A fixed month with known events (September 2026, `someter-2026-09` among them), with past
	// events shown, checks the same thing every day.
	test('lista eventos', async ({ page }) => {
		await acceptAgeGate(page);
		await page.goto('/calendario?viewdate=2026-09', { waitUntil: 'networkidle' });
		await page.locator('#show-past-events').getByText('Mostrar').click();
		const links = page.locator('#posts a[href^="/calendario/"]');
		await expect(links.first()).toBeVisible();
		await expect(page.locator('#posts a[href="/calendario/someter-2026-09"]')).toBeVisible();
		expect(await links.count()).toBeGreaterThan(1);
	});

	// «Mostrar/Ocultar eventos pasados» solo cuando el mes que se ve tiene eventos pasados.
	test('el botón de eventos pasados aparece solo si el mes tiene eventos pasados', async ({
		page
	}) => {
		await acceptAgeGate(page);
		await page.goto('/calendario?viewdate=2026-09', { waitUntil: 'networkidle' });
		await expect(page.locator('#show-past-events')).toBeVisible();
		// Un mes sin ningún evento (y por lo tanto sin pasados).
		await page.goto('/calendario?viewdate=2030-01', { waitUntil: 'networkidle' });
		await expect(page.locator('.month').first()).toContainText('Enero');
		await expect(page.locator('#show-past-events')).toHaveCount(0);
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
		// Always 24-hour Argentina time, whatever the browser's ICU data (it used to print
		// "7:30 p. m.hs" where es-AR defaults to a 12-hour clock), and no «hs» (UI review).
		await expect(start).toHaveText('viernes 11 de septiembre de 2026, 19:30');
		await context.close();
	});

	// Regression test: SSR used to format event times in the server's timezone (UTC on
	// Cloudflare), so crawlers/link previews saw 22:30 for a 19:30 -03:00 event.
	test('el HTML del servidor muestra la hora del evento en hora argentina', async ({ request }) => {
		const html = await (await request.get('/calendario/someter-2026-09')).text();
		expect(html).toMatch(/class="dt-start[^"]*"[^>]*>[^<]*de 2026, 19:30</);
	});

	// Regression test: the viewed month used to live in a module-level store, so one
	// request's ?viewdate leaked into the SSR of later requests served by the same isolate.
	test('el mes de ?viewdate no se filtra a otros pedidos', async ({ browser }) => {
		// Sin JavaScript: lo que se ve es exactamente el HTML que armó el servidor.
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		const month = async (/** @type {string} */ url) => {
			await page.goto(url);
			const text = await page.locator('.month').first().textContent();
			return text?.replace(/\s+/g, ' ').trim();
		};
		expect(await month('/calendario?viewdate=2024-01')).toBe('Enero 2024');
		const plain = await month('/calendario');
		expect(plain).toBeTruthy();
		expect(plain).not.toContain('2024');
		await context.close();
	});

	test('los botones de mes cambian ?viewdate y el botón atrás vuelve', async ({ page }) => {
		await acceptAgeGate(page);
		await page.goto('/calendario');
		const month = page.locator('.header .month');
		const first = (await month.innerText()).trim();
		// changing month is client-only: the loads don't read the query string
		const dataRequests = [];
		page.on('request', (r) => r.url().includes('__data.json') && dataRequests.push(r.url()));
		await page.getByRole('button', { name: 'Next Month' }).click();
		await expect(page).toHaveURL(/[?&]viewdate=\d{4}-\d{2}/);
		await expect(month).not.toHaveText(first);
		await page.getByRole('button', { name: 'Previous Month' }).click();
		await expect(month).toHaveText(first);
		await expect(page).not.toHaveURL(/viewdate/);
		await page.goBack();
		await expect(month).not.toHaveText(first);
		await page.goBack();
		await expect(month).toHaveText(first);
		expect(dataRequests).toEqual([]);
	});

	test('/calendario.ics es un iCalendar válido con VEVENTs', async ({ request }) => {
		const res = await request.get('/calendario.ics');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/calendar');
		expect(res.headers()['content-type']).toContain('charset=utf-8');
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

	// Ends past midnight written with the start's date are rolled forward by eventEnd(). The two
	// events below have a genuinely wrong end *date* in their frontmatter (content typos for the
	// organizers to fix); remove them from this list once fixed.
	test('todos los VEVENT terminan después de empezar', async ({ request }) => {
		const knownContentTypos = [
			'https://kinkyvibe.ar/calendario/cine-para-sucixs-octubre-2023',
			'https://kinkyvibe.ar/calendario/grupo-de-apoyo-y-discusion-para-doms-noviembre-2023'
		];
		const { events } = parseIcs(await (await request.get('/calendario.ics')).text());
		const bad = events
			.filter((e) => icsDate(e.DTEND) < icsDate(e.DTSTART))
			.map((e) => e.URL)
			.filter((url) => !knownContentTypos.includes(url));
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

	// Regression test: titles like "Troles & Tableros" used to be interpolated unescaped.
	test('/rss es XML bien formado', async ({ page, request }) => {
		const xml = await (await request.get('/rss')).text();
		expect(await xmlError(page, xml)).toBeNull();
	});

	// Regression test: /sitemap.xml used to 500 on listed posts without a date.
	test('/sitemap.xml es XML bien formado', async ({ page, request }) => {
		const res = await request.get('/sitemap.xml');
		expect(res.status()).toBe(200);
		const xml = await res.text();
		expect(await xmlError(page, xml)).toBeNull();
		expect(xml).toContain('<loc>https://kinkyvibe.ar/calendario</loc>');
		expect(xml).toContain('<loc>https://kinkyvibe.ar/wiki/BDSM</loc>');
		expect(xml).not.toContain('Invalid Date');
		expect(xml.match(/<url>/g)?.length).toBe(xml.match(/<\/url>/g)?.length);
	});
});

test.describe('errores', () => {
	test('/wiki/<término inexistente> no rompe', async ({ request }) => {
		const res = await request.get('/wiki/esto-no-existe-xyz');
		expect(res.status()).toBeLessThan(500);
	});

	// Regression test: missing posts used to bubble up as a 500 instead of a 404.
	for (const path of ['/calendario/no-existe', '/material/no-existe', '/amigues/no-existe']) {
		test(`${path} devuelve 404`, async ({ request }) => {
			const res = await request.get(path);
			expect(res.status()).toBe(404);
		});
	}

	// La galería de componentes solo existe en previews y en dev (docs/estilo.md): este build no
	// tiene rama de deploy, como producción.
	test('/estilo (galería de componentes) devuelve 404 fuera de un preview', async ({ request }) => {
		const res = await request.get('/estilo');
		expect(res.status()).toBe(404);
	});

	test('/estilo/evento/<opcion> (maquetas del evento) devuelve 404 fuera de un preview', async ({
		request
	}) => {
		for (const opcion of ['actual', 'a', 'b', 'c']) {
			const res = await request.get(`/estilo/evento/${opcion}`);
			expect(res.status()).toBe(404);
		}
	});
});

test.describe('auth', () => {
	test('/admin redirige a /login sin sesión', async ({ request }) => {
		const res = await request.get('/admin', { maxRedirects: 0 });
		expect([302, 303, 307]).toContain(res.status());
		expect(res.headers()['location']).toMatch(/\/login\?redirectTo=(\/|%2F)admin$/);
	});

	test('/edit redirige a /login sin sesión', async ({ request }) => {
		const res = await request.get('/edit/material/6-tips-para-tops', { maxRedirects: 0 });
		expect([302, 303, 307]).toContain(res.status());
		expect(res.headers()['location']).toMatch(/\/login/);
	});

	// Regression test for the cookie-trust auth bypass (fixed by the security PR): identity must
	// come from GitHub's answer for the token, never from client-writable cookies.
	// Note: in sandboxes whose egress proxy injects GitHub credentials, any token resolves to a
	// real account, so this can only be trusted in CI / production-like networks.
	test('cookies falsificadas NO dan acceso a /admin', async ({ request }) => {
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
			// Third-party resources (fonts, analytics, embeds) fail or are CORS-blocked depending
			// on the network; the error is logged against the page URL, so check the message's
			// resource URL instead (the first URL in the message, e.g. "Access to font at '<url>'
			// from origin '<ours>'...") and skip it when that is on another origin.
			const url = msg.location()?.url ?? '';
			const resource = msg.text().match(/https?:\/\/[^\s'")]+/)?.[0];
			const own = (/** @type {string} */ u) => !!baseURL && u.startsWith(baseURL);
			if (url && !own(url)) return;
			if (resource && !own(resource)) return;
			errors.push(`console: ${msg.text()} (${url})`);
		});
		await acceptAgeGate(page);
		await page.goto('/', { waitUntil: 'networkidle' });
		await expect(page.getByRole('heading', { level: 2, name: 'Talleres y eventos' })).toBeVisible();
		expect(errors).toEqual([]);
	});
});
