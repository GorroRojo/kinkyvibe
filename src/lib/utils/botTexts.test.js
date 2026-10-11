/**
 * «Textos del bot»: los originales, el formato (escapado para el HTML de Telegram, negrita, links,
 * variables) y la validación del panel (variables desconocidas, formato roto, límites de Telegram).
 */
import { describe, expect, it } from 'vitest';
import {
	BOT_TEXT_DEFAULTS,
	BOT_TEXT_FIELDS,
	BOT_TEXT_LIMITS,
	BOT_TEXT_SECTIONS,
	botTextError,
	botTextField,
	byteLength,
	cleanBotTextOverrides,
	isFormattedKind,
	renderBotText,
	renderBotTextPlain,
	validateBotTexts
} from './botTexts.js';

/** @param {string} key */
const field = (key) => {
	const f = botTextField(key);
	if (!f) throw new Error(key);
	return f;
};

describe('los originales', () => {
	it('cada clave es única, de una sección conocida y empieza con su sección', () => {
		const keys = BOT_TEXT_FIELDS.map((f) => f.key);
		expect(new Set(keys).size).toBe(keys.length);
		const sections = new Set(BOT_TEXT_SECTIONS.map((s) => s.id));
		for (const f of BOT_TEXT_FIELDS) {
			expect(sections.has(f.section), f.key).toBe(true);
			expect(f.key.startsWith(`${f.section}.`), f.key).toBe(true);
			expect(f.label.length, f.key).toBeGreaterThan(0);
		}
	});

	it('todas las secciones tienen textos', () => {
		for (const s of BOT_TEXT_SECTIONS) {
			expect(
				BOT_TEXT_FIELDS.some((f) => f.section === s.id),
				s.id
			).toBe(true);
		}
	});

	it('cada original pasa su propia validación y entra en los límites de Telegram', () => {
		for (const f of BOT_TEXT_FIELDS) {
			expect(botTextError(f, f.value), f.key).toBeNull();
			expect(f.max, f.key).toBeLessThanOrEqual(BOT_TEXT_LIMITS[f.kind]);
		}
		for (const f of BOT_TEXT_FIELDS.filter((x) => x.kind === 'button'))
			expect(byteLength(f.value), f.key).toBeLessThanOrEqual(64);
		for (const f of BOT_TEXT_FIELDS.filter((x) => x.kind === 'command'))
			expect(f.value.length, f.key).toBeLessThanOrEqual(256);
		for (const f of BOT_TEXT_FIELDS.filter((x) => x.kind === 'toast'))
			expect(f.value.length, f.key).toBeLessThanOrEqual(200);
	});

	it('las variables con HTML ya armado solo van en textos con formato', () => {
		for (const f of BOT_TEXT_FIELDS)
			for (const v of f.vars) if (v.html) expect(isFormattedKind(f.kind), f.key).toBe(true);
	});

	it('BOT_TEXT_DEFAULTS es el original de cada clave', () => {
		expect(Object.keys(BOT_TEXT_DEFAULTS)).toHaveLength(BOT_TEXT_FIELDS.length);
		expect(BOT_TEXT_DEFAULTS['inicio.boton_inicio']).toBe('🏠 Inicio');
	});
});

describe('renderBotText', () => {
	it('sin nada cambiado, el original (en HTML de Telegram los mensajes)', () => {
		expect(renderBotText('inicio.texto')).toBe(
			'<b>Hola, soy el bot de Kinky Vibe</b> 🖤\n\n' +
				'Podés pedirme lo que hay hoy, esta semana o el finde: tocá un botón o escribí un comando ' +
				'(/semana, /proximos, /evento &lt;nombre&gt;). Para todo lo demás, /ayuda.'
		);
		expect(renderBotText('inicio.boton_buscar')).toBe('🔎 Buscar');
	});

	it('lo cambiado reemplaza al original; vacío o de otra clave, no', () => {
		const texts = { 'inicio.boton_buscar': '🔍 Buscá', 'inicio.boton_fondo': '' };
		expect(renderBotText('inicio.boton_buscar', {}, texts)).toBe('🔍 Buscá');
		expect(renderBotText('inicio.boton_fondo', {}, texts)).toBe('💗 Fondo');
		expect(renderBotText('inicio.boton_ayuda', {}, texts)).toBe('❓ Ayuda');
	});

	it('las variables: escapadas en los mensajes, tal cual en los botones', () => {
		expect(renderBotText('eventos.sin_resultados', { busqueda: '<b>&"' })).toBe(
			'No encontré nada para «&lt;b&gt;&amp;&quot;» entre los próximos eventos.'
		);
		expect(renderBotText('eventos.boton_ver', { evento: 'A <b> & C' })).toBe('Ver: A <b> & C');
	});

	it('las variables con HTML ya armado van sin escapar', () => {
		expect(
			renderBotText('inicio.fondo_actualizado', { fecha: '<tg-time unix="1">x</tg-time>' })
		).toBe('Actualizado: <tg-time unix="1">x</tg-time>');
	});

	it('el texto escrito se escapa; **negrita** y [links](https://…) se vuelven HTML', () => {
		const texts = {
			'vincular.desvinculado':
				'Listo & <chau>: **desconectado**. Mirá [el sitio](https://ejemplo.test/?a=1&b=2).'
		};
		expect(renderBotText('vincular.desvinculado', {}, texts)).toBe(
			'Listo &amp; &lt;chau&gt;: <b>desconectado</b>. Mirá <a href="https://ejemplo.test/?a=1&amp;b=2">el sitio</a>.'
		);
	});

	it('un link a una variable usa su valor; uno inseguro queda como texto', () => {
		const texts = {
			'vincular.listo': 'Entrá a [tu rincón]({link}). O [esto](javascript:alert(1)).'
		};
		expect(
			renderBotText('vincular.listo', { link: 'https://ejemplo.test/mi-rincon/sigo' }, texts)
		).toBe(
			'Entrá a <a href="https://ejemplo.test/mi-rincon/sigo">tu rincón</a>. O [esto](javascript:alert(1)).'
		);
	});

	it('el valor de una variable nunca se vuelve formato', () => {
		expect(renderBotText('eventos.resultado_uno', { busqueda: '**x** [a](https://b.c)' })).toBe(
			'<b>Encontré esto para «**x** [a](https://b.c)»</b>'
		);
	});

	it('una clave que no existe tira (así un error de tipeo no pasa callado)', () => {
		expect(() => renderBotText('inicio.no_existe')).toThrow(/desconocido/);
	});
});

describe('renderBotTextPlain (solo para comparar texto)', () => {
	const key = 'eventos.buscar';
	it('lo que ve quien lee, desde lo escrito: sin ** ni links, sin HTML', () => {
		expect(renderBotTextPlain(key)).toBe(
			'🔎 Escribí qué buscás: un nombre, «sábado», «15/10», una dirección… Respondé a este mensaje.'
		);
		expect(
			renderBotTextPlain(key, {}, { [key]: '**¿Qué buscás?** Mirá [el sitio](https://x.y).' })
		).toBe('¿Qué buscás? Mirá el sitio.');
	});

	it('lo escrito queda tal cual: ni entidades ni etiquetas se interpretan', () => {
		expect(renderBotTextPlain(key, {}, { [key]: 'Buscá &lt;script&gt; &amp; más' })).toBe(
			'Buscá &lt;script&gt; &amp; más'
		);
		expect(renderBotTextPlain(key, {}, { [key]: 'Buscá <<b>script> acá' })).toBe(
			'Buscá <<b>script> acá'
		);
	});

	it('las variables van tal cual y nunca se vuelven formato', () => {
		expect(renderBotTextPlain('eventos.resultado_uno', { busqueda: '**x** <y>' })).toBe(
			'Encontré esto para «**x** <y>»'
		);
		expect(renderBotTextPlain('inicio.boton_sitio', { sitio: 'a.b' })).toBe('Abrir a.b ↗');
	});
});

describe('botTextError', () => {
	it('variables desconocidas: dice cuáles y cuáles se pueden usar', () => {
		expect(botTextError(field('eventos.sin_resultados'), 'Nada para {busqueda} ni {nombre}')).toBe(
			'Esta variable no existe en este texto: {nombre}. Podés usar: {busqueda}.'
		);
		expect(botTextError(field('inicio.boton_hoy'), 'Hoy {fecha}')).toBe(
			'Esta variable no existe en este texto: {fecha}. Este texto no lleva variables.'
		);
	});

	it('llaves sueltas', () => {
		expect(botTextError(field('eventos.sin_resultados'), 'Nada para {busqueda')).toMatch(/llaves/);
	});

	it('las que tienen que estar', () => {
		expect(botTextError(field('eventos.boton_ver'), 'Ver')).toBe(
			'Tiene que llevar {evento}: ahí va lo que cambia.'
		);
	});

	it('formato roto o HTML en un mensaje', () => {
		expect(botTextError(field('inicio.texto'), '**Hola')).toMatch(/\*\* sin cerrar/);
		expect(botTextError(field('inicio.texto'), '<b>Hola</b>')).toMatch(/No se puede usar HTML/);
		expect(botTextError(field('inicio.texto'), 'Hola <a href="x">y</a>')).toMatch(/HTML/);
		expect(botTextError(field('inicio.texto'), '[sitio](javascript:alert(1))')).toMatch(/https/);
		// `<código>` no es HTML: sale tal cual
		expect(botTextError(field('inicio.texto'), 'Mandá /vincular <código>')).toBeNull();
	});

	it('formato en un botón, un aviso o un comando: no', () => {
		expect(botTextError(field('inicio.boton_hoy'), '**Hoy**')).toMatch(/texto solo/);
		expect(botTextError(field('errores.despacio'), '<b>Despacio</b>')).toMatch(/texto solo/);
		expect(botTextError(field('comandos.hoy'), 'Ver [hoy](https://x.y)')).toMatch(/texto solo/);
	});

	it('límites de Telegram: botones en bytes, avisos, comandos y mensajes', () => {
		expect(botTextError(field('inicio.boton_hoy'), 'a'.repeat(64))).toBeNull();
		expect(botTextError(field('inicio.boton_hoy'), 'a'.repeat(65))).toMatch(/64 bytes/);
		expect(botTextError(field('inicio.boton_hoy'), 'ñ'.repeat(33))).toMatch(/tiene 66/);
		expect(botTextError(field('errores.despacio'), 'a'.repeat(201))).toMatch(/200 caracteres/);
		expect(botTextError(field('comandos.hoy'), 'a'.repeat(256))).toBeNull();
		expect(botTextError(field('comandos.hoy'), 'a'.repeat(257))).toMatch(/256 caracteres/);
		expect(botTextError(field('inicio.texto'), 'a'.repeat(4097))).toMatch(/4096 caracteres/);
		// la segunda línea del aviso al seguir deja lugar para el nombre (#290: 200 en total)
		expect(botTextError(field('seguir.listo_telegram'), 'a'.repeat(151))).toMatch(/150/);
	});
});

describe('validateBotTexts', () => {
	it('guarda solo lo cambiado; vacío o igual al original = el original', () => {
		const r = validateBotTexts({
			...BOT_TEXT_DEFAULTS,
			'inicio.boton_hoy': '  Hoy   mismo ',
			'inicio.boton_semana': '',
			'inicio.texto': 'Hola\r\n\r\n\r\n\r\nchau  \n'
		});
		expect(r).toEqual({
			ok: true,
			value: { 'inicio.boton_hoy': 'Hoy mismo', 'inicio.texto': 'Hola\n\nchau' }
		});
	});

	it('con errores, devuelve lo escrito y un error por campo', () => {
		const r = validateBotTexts({ 'inicio.boton_hoy': 'x'.repeat(70), 'inicio.texto': '{nada}' });
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(Object.keys(r.errors).sort()).toEqual(['inicio.boton_hoy', 'inicio.texto']);
		expect(r.values['inicio.texto']).toBe('{nada}');
	});

	it('ignora claves que no existen', () => {
		expect(validateBotTexts({ 'otra.cosa': 'x' })).toEqual({ ok: true, value: {} });
	});
});

describe('cleanBotTextOverrides', () => {
	it('lo guardado roto o viejo nunca rompe el bot: se ignora', () => {
		expect(
			cleanBotTextOverrides({
				'inicio.boton_hoy': 'Hoy!',
				'inicio.boton_semana': 'x'.repeat(100),
				'inicio.texto': '<b>roto</b>',
				'no.existe': 'x',
				'inicio.boton_finde': 42
			})
		).toEqual({ 'inicio.boton_hoy': 'Hoy!' });
		expect(cleanBotTextOverrides(null)).toEqual({});
		expect(cleanBotTextOverrides('x')).toEqual({});
	});
});
