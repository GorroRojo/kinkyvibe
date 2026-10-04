// El informe de impacto visual como HTML (ui-impacto/index.html) y como resumen en Markdown
// (para $GITHUB_STEP_SUMMARY). Puro: recibe el resultado de summarize() (./compare.js) y
// devuelve texto. Las imágenes van en la misma carpeta, con rutas relativas.
import { formatRatio } from './compare.js';

/** @typedef {ReturnType<typeof import('./compare.js').summarize>} Summary */
/**
 * @typedef {{
 *   base: string,
 *   nuevo: string,
 *   generatedAt?: string,
 *   simulatedNow?: string,
 *   durationMs?: number,
 *   skipped?: { base?: string[], nuevo?: string[] }
 * }} Meta
 */

/** @param {unknown} s */
export function esc(s) {
	return String(s ?? '').replace(
		/[&<>"']/g,
		(c) =>
			/** @type {Record<string, string>} */ ({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			})[c]
	);
}

const STATUS_LABEL = /** @type {Record<import('./compare.js').Status, string>} */ ({
	cambio: 'cambió',
	igual: 'igual',
	nueva: 'solo en el cambio',
	quitada: 'solo en la base',
	error: 'no se pudo capturar'
});

const VIEWPORT_LABEL = /** @type {Record<string, string>} */ ({
	celu: 'Celu (390 × 844)',
	compu: 'Compu (1280 × 800)'
});

/**
 * Frase del resumen: «Cambiaron 3 de 44 capturas (2 de 22 páginas).»
 * @param {Summary} s
 */
export function headline(s) {
	const pages = s.pages.length;
	const changedPages = s.pages.filter((p) =>
		['cambio', 'nueva', 'quitada'].includes(p.status)
	).length;
	if (!s.total) return 'No se sacó ninguna captura.';
	if (!s.changed) return `No cambió ninguna de las ${s.total} capturas (${pages} páginas).`;
	const verb = s.changed === 1 ? 'Cambió' : 'Cambiaron';
	return `${verb} ${s.changed} de ${s.total} capturas (${changedPages} de ${pages} páginas).`;
}

/**
 * @param {string | null | undefined} src
 * @param {string} caption
 * @param {string} [extra]
 */
function figure(src, caption, extra = '') {
	if (!src)
		return `<figure class="missing"><div>—</div><figcaption>${esc(caption)}</figcaption></figure>`;
	return `<figure${extra}><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(caption)}" loading="lazy"></a><figcaption>${esc(caption)}</figcaption></figure>`;
}

/** @param {import('./compare.js').Shot} shot */
function shotRow(shot) {
	const vp = VIEWPORT_LABEL[shot.viewport] ?? shot.viewport;
	const ratio = shot.status === 'cambio' ? ` · ${formatRatio(shot.ratio)} de la imagen` : '';
	const errors = [
		shot.errors?.base && `base: ${shot.errors.base}`,
		shot.errors?.nuevo && `cambio: ${shot.errors.nuevo}`
	]
		.filter(Boolean)
		.map((e) => `<p class="err">${esc(e)}</p>`)
		.join('');
	const head = `<h4>${esc(vp)} <span class="badge ${shot.status}">${esc(STATUS_LABEL[shot.status])}</span>${esc(ratio)}</h4>`;
	if (shot.status === 'igual') {
		return `<div class="shot igual">${head}<div class="figs one">${figure(shot.nuevo, 'igual en los dos')}</div></div>`;
	}
	return `<div class="shot ${shot.status} vp-${esc(shot.viewport)}">${head}${errors}<div class="figs">${figure(shot.base, 'base')}${figure(shot.nuevo, 'nuevo')}${figure(shot.diff, 'diferencias (en magenta)', ' class="diff"')}</div></div>`;
}

/** @param {import('./compare.js').PageResult} p */
function pageSection(p) {
	const path = p.path ? ` <code>${esc(p.path)}</code>` : '';
	const ratio = p.status === 'cambio' ? ` · hasta ${formatRatio(p.maxRatio)}` : '';
	return `<section class="page ${p.status}" id="p-${esc(p.pageId)}"><h3>${esc(p.title)}${path} <span class="badge ${p.status}">${esc(STATUS_LABEL[p.status])}</span>${esc(ratio)}</h3>${p.shots.map(shotRow).join('')}</section>`;
}

const CSS = `
:root{--bg:#f6f4f8;--card:#fff;--text:#1f1a24;--muted:#6b6274;--line:#e3dde9;--accent:#a3127f;--ok:#1f7a4d;--warn:#9a5b00;--bad:#b3261e;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17131b;--card:#221c27;--text:#f1ecf5;--muted:#b3a8bd;--line:#3a3141;--accent:#f27fd4;--ok:#6fd3a0;--warn:#f0b85a;--bad:#ff8a80;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#17131b;--card:#221c27;--text:#f1ecf5;--muted:#b3a8bd;--line:#3a3141;--accent:#f27fd4;--ok:#6fd3a0;--warn:#f0b85a;--bad:#ff8a80;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1400px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:32px 0 12px}h3{font-size:1.05rem;margin:0 0 12px}h4{font-size:.9rem;margin:16px 0 8px;color:var(--muted);font-weight:600}
.lead{font-size:1.25rem;font-weight:700;margin:12px 0}.meta{color:var(--muted);font-size:.85rem;margin:0}.meta code{font-size:.8rem}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.chips a{color:inherit}
.badge{display:inline-block;font-size:.75rem;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid currentColor;vertical-align:middle}
.badge.cambio{color:var(--accent)}.badge.igual{color:var(--ok)}.badge.nueva,.badge.quitada{color:var(--warn)}.badge.error{color:var(--bad)}
.page{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px}
.figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}.figs.one{grid-template-columns:minmax(0,320px)}
.vp-celu .figs{grid-template-columns:repeat(3,minmax(0,300px))}
figure{margin:0}figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff}
figure.missing div{display:grid;place-items:center;min-height:120px;border:1px dashed var(--line);border-radius:6px;color:var(--muted)}
figcaption{font-size:.8rem;color:var(--muted);margin-top:4px}
.err{color:var(--bad);font-size:.85rem;margin:4px 0;white-space:pre-wrap;word-break:break-word}
details{margin-top:24px}summary{cursor:pointer;font-weight:600}details .page{margin-top:12px}
ul.list{margin:8px 0;padding-left:20px}a{color:var(--accent)}h3 code{font-size:.85rem;font-weight:400;color:var(--muted);word-break:break-all}
@media (max-width:700px){.figs,.vp-celu .figs{grid-template-columns:minmax(0,1fr)}}
`;

/**
 * El informe completo, autocontenido (CSS en línea, imágenes relativas).
 * @param {Summary} s
 * @param {Meta} meta
 */
export function renderHtml(s, meta) {
	const changed = s.pages.filter((p) => p.status !== 'igual');
	const same = s.pages.filter((p) => p.status === 'igual');
	const chips = Object.entries(s.counts)
		.filter(([, n]) => n > 0)
		.map(
			([st, n]) =>
				`<span class="badge ${st}">${esc(STATUS_LABEL[/** @type {import('./compare.js').Status} */ (st)])}: ${n}</span>`
		)
		.join('');
	const list = changed.length
		? `<ul class="list">${changed.map((p) => `<li><a href="#p-${esc(p.pageId)}">${esc(p.title)}</a> — ${esc(STATUS_LABEL[p.status])}${p.status === 'cambio' ? ` (hasta ${esc(formatRatio(p.maxRatio))})` : ''}</li>`).join('')}</ul>`
		: '';
	const skipped = ['base', 'nuevo']
		.map((side) => {
			const items = meta.skipped?.[/** @type {'base' | 'nuevo'} */ (side)] ?? [];
			return items.length
				? `<p class="meta">Datos que no se pudieron cargar en ${side === 'base' ? 'la base' : 'el cambio'}: ${esc(items.join(', '))}.</p>`
				: '';
		})
		.join('');
	const duration = meta.durationMs ? ` · tardó ${Math.round(meta.durationMs / 1000)} s` : '';
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Impacto visual</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Impacto visual</h1>
<p class="meta">Base: <code>${esc(meta.base)}</code> · Nuevo: <code>${esc(meta.nuevo)}</code></p>
<p class="meta">${meta.generatedAt ? `Generado ${esc(meta.generatedAt)}` : ''}${meta.simulatedNow ? ` · «hoy» simulado: ${esc(meta.simulatedNow)}` : ''}${esc(duration)}</p>
${skipped}
<p class="lead">${esc(headline(s))}</p>
<div class="chips">${chips}</div>
${list}
${changed.length ? `<h2>Para mirar</h2>${changed.map(pageSection).join('')}` : ''}
${same.length ? `<details${changed.length ? '' : ' open'}><summary>${same.length} ${same.length === 1 ? 'página sin cambios' : 'páginas sin cambios'}</summary>${same.map(pageSection).join('')}</details>` : ''}
</main>
</body>
</html>
`;
}

/**
 * Resumen corto en Markdown (para $GITHUB_STEP_SUMMARY o un comentario).
 * @param {Summary} s
 * @param {Meta & { artifact?: string }} meta
 */
export function renderMarkdown(s, meta) {
	const lines = [
		`### Impacto visual`,
		'',
		`**${headline(s)}**`,
		'',
		`Base \`${meta.base}\` → nuevo \`${meta.nuevo}\`.`
	];
	const changed = s.pages.filter((p) => p.status !== 'igual');
	if (changed.length) {
		lines.push('', '| Página | Estado | Celu | Compu |', '| --- | --- | --- | --- |');
		for (const p of changed) {
			const cell = (/** @type {string} */ vp) => {
				const shot = p.shots.find((x) => x.viewport === vp);
				if (!shot) return '—';
				return shot.status === 'cambio' ? formatRatio(shot.ratio) : STATUS_LABEL[shot.status];
			};
			lines.push(
				`| ${p.title}${p.path ? ` (\`${p.path}\`)` : ''} | ${STATUS_LABEL[p.status]} | ${cell('celu')} | ${cell('compu')} |`
			);
		}
	}
	const skipped = [
		...(meta.skipped?.base ?? []).map((x) => `base: ${x}`),
		...(meta.skipped?.nuevo ?? []).map((x) => `nuevo: ${x}`)
	];
	if (skipped.length) lines.push('', `Datos que no se pudieron cargar: ${skipped.join(', ')}.`);
	if (meta.artifact) lines.push('', meta.artifact);
	return lines.join('\n') + '\n';
}
