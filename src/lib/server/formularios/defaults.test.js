/**
 * «Cómo salen por defecto» (defaults.js) y los textos del mail (email.js): sin nada guardado, o con
 * algo roto, vale lo de siempre, campo por campo; lo guardado manda; los textos del mail usan las
 * variables y el formato seguro; el mail propio manda sobre el de por defecto.
 */
import { describe, expect, it } from 'vitest';
import {
	FORM_DEFAULTS,
	delayText,
	parseFormDefaults,
	surveyDelayMs,
	validateFormDefaults
} from './defaults.js';
import {
	FORM_MAIL_SUBJECT,
	SURVEY_MAIL_BODY,
	SURVEY_MAIL_SUBJECT,
	buildFormEmail,
	mailTextError,
	mailTexts
} from './email.js';

/** @param {Record<string, string>} fields */
const fd = (fields) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.append(k, v);
	return f;
};

describe('parseFormDefaults', () => {
	it('sin nada guardado (o con algo roto): lo de siempre', () => {
		expect(parseFormDefaults(undefined)).toEqual(FORM_DEFAULTS);
		expect(parseFormDefaults('no es json')).toEqual(FORM_DEFAULTS);
		expect(parseFormDefaults('[1, 2]')).toEqual(FORM_DEFAULTS);
		expect(FORM_DEFAULTS).toMatchObject({
			surveyAuto: true,
			surveyDelayDays: 1,
			surveyPrivacy: 'anonymous',
			surveyAudience: 'organizers',
			formAccess: 'link',
			formPrivacy: 'named'
		});
		expect(surveyDelayMs(FORM_DEFAULTS)).toBe(24 * 60 * 60 * 1000);
	});

	it('lo guardado manda, campo por campo; lo que no vale, lo de siempre', () => {
		const d = parseFormDefaults(
			JSON.stringify({
				surveyAuto: false,
				surveyDelayDays: 3,
				surveyPrivacy: 'choose',
				surveyAudience: 'nadie',
				formAccess: 'ticket',
				formPrivacy: 'anonymous',
				surveyMailSubject: 'Hola {{evento}}',
				surveyMailBody: '<b>HTML</b>'
			})
		);
		expect(d).toMatchObject({
			surveyAuto: false,
			surveyDelayDays: 3,
			surveyPrivacy: 'choose',
			// Lo que no vale vuelve a lo de siempre.
			surveyAudience: 'organizers',
			// «Quienes tenían entrada» necesita un evento: no puede ser lo de todos los nuevos.
			formAccess: 'link',
			formPrivacy: 'anonymous',
			surveyMailSubject: 'Hola {{evento}}',
			surveyMailBody: ''
		});
		expect(parseFormDefaults({ surveyDelayDays: 99 }).surveyDelayDays).toBe(1);
		expect(parseFormDefaults({ surveyDelayDays: 0 }).surveyDelayDays).toBe(0);
	});

	it('validateFormDefaults: marca lo que está mal; la casilla sin marcar es «no»', () => {
		const ok = validateFormDefaults(
			fd({
				surveyDelayDays: '2',
				surveyPrivacy: 'named',
				surveyAudience: 'admins',
				formAccess: 'account',
				formPrivacy: 'choose'
			})
		);
		expect(ok).toMatchObject({
			ok: true,
			value: { surveyAuto: false, surveyDelayDays: 2, formAccess: 'account' }
		});
		const bad = validateFormDefaults(
			fd({
				surveyAuto: 'on',
				surveyDelayDays: '15',
				surveyPrivacy: 'x',
				surveyAudience: 'admins',
				formAccess: 'ticket',
				formPrivacy: 'named',
				surveyMailBody: 'Hola {{nombre}}'
			})
		);
		expect(bad.ok).toBe(false);
		expect(Object.keys(/** @type {any} */ (bad).errors).sort()).toEqual([
			'formAccess',
			'surveyDelayDays',
			'surveyMailBody',
			'surveyPrivacy'
		]);
	});

	it('delayText', () => {
		expect(delayText(0)).toBe('apenas termina el evento');
		expect(delayText(1)).toBe('un día después del evento');
		expect(delayText(4)).toBe('4 días después del evento');
	});
});

describe('el mail con el link', () => {
	const base = {
		formTitle: '¿Cómo la pasaste?',
		eventTitle: 'Fiesta de ejemplo',
		questions: 5,
		anonymous: true,
		url: 'https://kinkyvibe.example/calendario/fiesta/encuesta#1.abc',
		origin: 'https://kinkyvibe.example'
	};

	it('sin textos propios: los de siempre (el asunto de la encuesta sin el evento)', () => {
		const m = buildFormEmail({ ...base, survey: true });
		expect(m.subject).toBe(SURVEY_MAIL_SUBJECT);
		expect(m.text).toContain('¡Gracias por venir a Fiesta de ejemplo!');
		expect(m.text).toContain('Son 5 preguntas cortas y es anónima');
		expect(m.html).toContain('<strong>Fiesta de ejemplo</strong>');
		expect(m.text).toContain(`Contestar la encuesta: ${base.url}`);
	});

	it('con textos propios: las variables se completan y el HTML no pasa', () => {
		const m = buildFormEmail({
			...base,
			survey: true,
			subject: '{{evento}}: contanos',
			body: '**Hola** <i>vos</i>\n\n{{preguntas}}. [Link]({{link}})'
		});
		expect(m.subject).toBe('Fiesta de ejemplo: contanos');
		expect(m.html).toContain('<strong>Hola</strong> &lt;i&gt;vos&lt;/i&gt;');
		expect(m.html).toContain(`href="${base.url}"`);
		expect(m.text).toContain(`Link (${base.url})`);
	});

	it('mailTexts: el propio, si no el de por defecto, si no el de siempre', () => {
		const defaults = {
			...FORM_DEFAULTS,
			surveyMailSubject: 'Por defecto',
			formMailBody: 'Cuerpo por defecto'
		};
		expect(mailTexts({ kind: 'survey' })).toEqual({
			subject: SURVEY_MAIL_SUBJECT,
			body: SURVEY_MAIL_BODY
		});
		expect(mailTexts({ kind: 'survey' }, defaults).subject).toBe('Por defecto');
		expect(mailTexts({ kind: 'survey', mailSubject: 'Propio' }, defaults).subject).toBe('Propio');
		expect(mailTexts({ kind: 'form' }, defaults)).toEqual({
			subject: FORM_MAIL_SUBJECT,
			body: 'Cuerpo por defecto'
		});
	});

	it('mailTextError: sin HTML, solo esas variables, el asunto en una línea', () => {
		expect(mailTextError('', 'subject')).toBeNull();
		expect(mailTextError('Hola {{evento}}', 'subject')).toBeNull();
		expect(mailTextError('Hola\nchau', 'subject')).toBe('El asunto va en una sola línea.');
		expect(mailTextError('Hola {{dni}}', 'body')).toMatch(/no existe/);
		expect(mailTextError('<b>x</b>', 'body')).toMatch(/HTML/);
		expect(mailTextError('x'.repeat(151), 'subject')).toMatch(/Hasta 150/);
	});
});
