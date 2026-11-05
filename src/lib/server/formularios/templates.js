/**
 * Las plantillas de formularios (docs/formularios.md): se copian y se editan en Comunidad ›
 * Formularios. Viven en la base como cualquier formulario (`kind = 'template'`, nunca se
 * publican); estas son las que se crean la primera vez que hacen falta ({@link ensureTemplates}),
 * así una plantilla editada no se pisa y una borrada a mano vuelve.
 *
 * La de la encuesta es la que copia cada evento para su encuesta: las 5 preguntas del prototipo
 * (#566). No hay plantilla de inscripción a eventos gratis (para eso están las preguntas de
 * inscripción de cada evento).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** La plantilla que copia cada evento para su encuesta. */
export const SURVEY_TEMPLATE_SLUG = 'plantilla-encuesta';
/** @typedef {import('$lib/utils/formularios.js').Question} Question */

/**
 * @type {readonly { slug: string, title: string, intro: string, access: string, privacy: string,
 *   audience: string, questions: Question[] }[]}
 */
export const FORM_TEMPLATES = Object.freeze([
	{
		slug: SURVEY_TEMPLATE_SLUG,
		title: '¿Cómo la pasaste?',
		intro: 'Son 5 preguntas cortas, todas opcionales. Es anónima: no guardamos quién contestó qué.',
		access: 'link',
		privacy: 'anonymous',
		audience: 'organizers',
		questions: [
			{
				id: 'p1',
				kind: 'rating',
				label: '¿Cómo la pasaste?',
				required: false,
				options: [],
				low: 'Mal',
				high: 'Re bien'
			},
			{ id: 'p2', kind: 'text', label: '¿Qué te gustó?', required: false, options: [] },
			{ id: 'p3', kind: 'text', label: '¿Qué podríamos mejorar?', required: false, options: [] },
			{
				id: 'p4',
				kind: 'choice',
				label: '¿Volverías a venir?',
				required: false,
				options: ['Sí', 'Tal vez', 'No']
			},
			{
				id: 'p5',
				kind: 'text',
				label: '¿Algo más que nos quieras contar?',
				required: false,
				options: [],
				help: 'Si querés que te respondamos, dejá tu contacto acá (si no, queda anónima).'
			}
		]
	},
	{
		slug: 'plantilla-propuesta',
		title: 'Proponé un taller o una colaboración',
		intro:
			'Si tenés una idea para un taller o querés hacer algo con nosotres, contanos. Te respondemos por mail.',
		access: 'account',
		privacy: 'named',
		audience: 'admins',
		questions: [
			{
				id: 'p1',
				kind: 'choice',
				label: '¿Qué nos querés proponer?',
				required: true,
				options: ['Un taller', 'Una colaboración', 'Otra cosa']
			},
			{ id: 'p2', kind: 'text', label: 'Contanos de qué se trata', required: true, options: [] },
			{ id: 'p3', kind: 'text', label: '¿Quiénes lo harían?', required: false, options: [] },
			{ id: 'p4', kind: 'text', label: '¿Cuándo te viene bien?', required: false, options: [] },
			{ id: 'p5', kind: 'text', label: '¿Algo más?', required: false, options: [] }
		]
	},
	{
		slug: 'plantilla-beca',
		title: 'Pedido de beca',
		intro:
			'Si el precio de una entrada te deja afuera, pedinos una beca. Lo que escribas lo leen solo les admins.',
		access: 'link',
		privacy: 'named',
		audience: 'admins',
		questions: [
			{ id: 'p1', kind: 'text', label: '¿Para qué evento o taller?', required: true, options: [] },
			{
				id: 'p2',
				kind: 'text',
				label: 'Contanos por qué te sirve una beca',
				required: true,
				options: []
			},
			{
				id: 'p3',
				kind: 'choice',
				label: '¿Podés aportar algo?',
				required: false,
				options: ['Nada', 'Una parte', 'Prefiero no decir']
			},
			{
				id: 'p4',
				kind: 'checkbox',
				label: 'Me pueden escribir para coordinar',
				required: false,
				options: []
			}
		]
	},
	{
		slug: 'plantilla-comentarios',
		title: 'Contanos qué te parece',
		intro: 'Es corto.',
		access: 'link',
		privacy: 'choose',
		audience: 'admins',
		questions: [
			{
				id: 'p1',
				kind: 'rating',
				label: '¿Qué te parece Kinky Vibe?',
				required: false,
				options: [],
				low: 'Nada bien',
				high: 'Re bien'
			},
			{ id: 'p2', kind: 'text', label: '¿Qué te gusta?', required: false, options: [] },
			{ id: 'p3', kind: 'text', label: '¿Qué cambiarías?', required: false, options: [] },
			{ id: 'p4', kind: 'text', label: '¿Algo más?', required: false, options: [] }
		]
	}
]);

/**
 * Crea las plantillas que falten (por su dirección). Las que ya están no se tocan.
 *
 * @param {D1Database} db
 * @param {number} [now]
 */
export async function ensureTemplates(db, now = Date.now()) {
	await db.batch(
		FORM_TEMPLATES.map((t) =>
			db
				.prepare(
					`INSERT INTO forms (slug, kind, title, intro, questions, access, privacy, audience, open,
						created_at, updated_at, updated_by)
					VALUES (?1, 'template', ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?8, 'sistema')
					ON CONFLICT (slug) DO NOTHING`
				)
				.bind(
					t.slug,
					t.title,
					t.intro,
					JSON.stringify(t.questions),
					t.access,
					t.privacy,
					t.audience,
					now
				)
		)
	);
}
