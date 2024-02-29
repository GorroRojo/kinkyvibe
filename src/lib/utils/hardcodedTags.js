export const hardcodedTags = [
	{ id: 'KinkyVibe', color: 'var(--1)' },
	{
		id: 'root',
		children: [
			'KinkyVibe',
			'idioma',
			'lugar',
			'precio',
			'calendario',
			'material',
			'amigues',
			'BDSM',
			'prácticas',
			'género y salud sexual',
			'antipunitivismo',
			'despatologización',
			'vincularidad'
		]
	},
	{ id: 'idioma', children: ['español', 'LSA', 'inglés'], color: 'darkblue' },
	{
		id: 'lugar',
		children: ['Córdoba', 'AMBA', 'Santa Cruz', 'Chile', 'Online', 'Montevideo'],
		color: 'darkblue'
	},
	{ id: 'precio', children: ['pago', 'a la gorra', 'gratis'], color: 'darkblue' },
	{ id: 'calendario', children: ['tipo de evento', 'evento recurrente'], color: 'var(--3-dark)' },
	{
		id: 'tipo de evento',
		children: [
			'cabaret',
			'charla debate',
			'cine',
			'entrevista',
			'evento',
			'fiesta',
			'grupo',
			'jam de cuerdas',
			'laboratorio',
			'perfo',
			'rancheadita',
			'taller'
		]
	},
	{ id: 'evento recurrente', children: ['Picantearla', 'Cine para Sucixs'] },
	{ id: 'material', color: 'var(--3-dark)', children: ['tipo de material', 'formato de material'] },
	{ id: 'tipo de material', children: ['guía', 'artículo', 'libro', 'fanzine'] },
	{ id: 'formato de material', children: ['online', 'descargable', 'interactivo'] },
	{ id: 'amigues', children: ['tipo de perfil', 'servicio'], color: 'var(--3-dark)' },
	{ id: 'tipo de perfil', children: ['emprendimiento', 'profesional'] },
	{
		id: 'servicio',
		children: [
			'arte',
			'clases',
			'comida vegana',
			'comunidad',
			'eventos',
			'productos',
			'sesiones',
			'terapia'
		]
	},

	{
		id: 'BDSM',
		description:
			'Una conjunción de [[bondage]] y [[disciplina]], [[dominación]] y [[sumisión]], y [[sadismo]] y [[masoquismo]].',
		related: ['top', 'bottom', 'dominante', 'sumise'],
		color: '#ff4444',
		children: [
			'seguridad',
			'negociación',
			'dinámicas',
			'disciplina',
			'caída',
			'cuidados posteriores',
			'sadomasoquismo'
		]
	},
	{
		id: 'disciplina',
		description:
			'La [[práctica]] de enseñarle a le [[bottom]] y/o [[sub]] a obedecer órdenes, o a seguir las reglas que le Dom establezca.'
	},
	{
		id: 'caída',
		aka: ['drop', 'bajón'],
		description:
			'El estado mental físico psicoemocional en el cual estamos después de una experiencia intensa pero positiva.',
		related: ['cuidados posteriores']
	},
	{
		id: 'cuidados posteriores',
		aka: ['aftercare'],
		description:
			'Prácticas para después de un intercambio fetichista, con el fin de procesar la escena y transicionar hacia la cotidianeidad.',
		related: ['caída']
	},
	{
		id: 'sadomasoquismo',
		children: ['sadismo', 'masoquismo'],
		related: ['cosquillas', 'impacto', 'predicamento', 'tortura genital', 'dolor', 'humillación']
	},
	{
		id: 'sadismo',
		description:
			'Excitación que algunas personas experimentan al infligir dolor y/o sufrimiento de forma consensuada o al verlo ser infligido.'
	},
	{
		id: 'masoquismo',
		description:
			'Excitación que algunas personas experimentan al recibir dolor y/o sufrir de forma consensuada.'
	},
	{
		id: 'prácticas',
		children: [
			'top',
			'bottom',
			'cnc',
			'pegging',
			'hablar sucio',
			'roles',
			'impacto',
			'sensaciones',
			'bondage',
			'intercambio de poder',
			'cuchillos',
			'dolor',
			'humillación',
			'asfixia',
			'fisting',
			'miedo'
		],
		color: '#ff4444'
	},
	{
		id: 'género y salud sexual',
		children: ['queer', 'materiales', 'porno', 'squirt', 'feminismo', 'salud'],
		color: '#ff4444'
	},
	{ id: 'antipunitivismo', color: 'var(--2)' },
	{ id: 'despatologización', color: 'var(--2)' },
	{ id: 'vincularidad', color: 'var(--2)' },
	{ id: '', color: '#ff4444' },
	{ id: 'queer', children: ['furry', 'género', 'asexualidad'] },
	{
		id: 'asexualidad',
		aka: ['ace', 'espectro asexual'],
		description:
			'Orientación sexual caracterizada por no sentir atracción sexual hacía otras personas.'
	},
	{ id: 'top', description: 'Comúnmente, la persona que "da" una [[práctica]].' },
	{
		id: 'bottom',
		description:
			'Comúnmente, la persona que "recibe" una [[práctica]]. Hay múltiples formas y sabores de bottom: [[conejite de cuerdas]], [[power bottom]], [[Dom]] bottom, [[brat]] bottom, etc...'
	},
	{
		id: 'pegging',
		description:
			'Históricamente usado para referirse a el acto de que una mujer cis penetre analmente con un strap on/cinturonga a un hombre cis. Hoy en día es utilizado por algunas personas para referirse a cualquier persona que use un strap-on para sexo anal, aunque suele circular más con ese nombre cuando se usa sobre hombres cis.'
	},
	{ id: 'roles', visible_name: 'Juegos de roles', children: ['edad', 'primal', 'mascota'] },
	{
		id: 'primal',
		visible_name: 'Juegos primales',
		aka: ['juegos primales', 'primal play'],
		related: ['mascota']
	},
	{ id: 'mascota', visible_name: 'Juegos de mascotas', aka: ['pet'], related: ['primal'] },
	{
		id: 'edad',
		children: ['pequeñe', 'middle', 'cuidadore', 'grande'],
		aka: ['age play'],
		description:
			'Un término paraguas para referirse a cualquier tipo de juego en donde alguna persona adulta pretenda tener una edad diferente a la que tiene en la actualidad.'
	},
	{
		id: 'pequeñe',
		aka: ['peque', 'little'],
		description:
			'Suele ser como se le llama a las personas adultas que juegan a tener menos edad que su edad cronológica en juegos con la [[edad]].'
	},
	{
		id: 'middle',
		aka: ['lolite'],
		description:
			'Personas adultas que disfrutan de tomar roles relacionados a la adolescencia / pubertad en juegos con la [[edad]]. También "lolites".'
	},
	{
		id: 'cuidadore',
		aka: ['caregiver', 'caretaker'],
		description:
			'Refiere a personas que quieren jugar a cuidar / compartir con [[pequeñe]]s sin tomar algún rol especifico.'
	},
	{
		id: 'grande',
		description:
			'En los juegos con la [[edad]], son personas que juegan a tener más edad que su edad cronológica y / o son les [[cuidadore]]s.'
	},
	{
		id: 'impacto',
		visible_name: 'Juegos de Impacto',
		children: ['caning', 'golpes', 'nalgueadas'],
		description:
			'[[práctica]] variada que consiste en impactar físicamente sobre zonas del cuerpo con fines eróticos/sensuales/catárticos.',
		related: ['sensaciones', 'juego de roles', 'miedo', 'dolor', 'calentamiento']
	},
	{
		id: 'sensaciones',
		visible_name: 'Juegos de sensaciones',
		children: ['temperatura', 'electro'],
		aka: ['sensation play'],
		description:
			'Donde se busca crear sensaciones físicas placenteras o displacenteras sobre una persona. Se puede usar hielo, seda, [cera] caliente, texturas, etc. Se suele hacer con le [[bottom]] cegade.'
	},
	{
		id: 'cuchillos',
		visible_name: 'Juegos con cuchillos',
		aka: ['knife play'],
		description:
			'Donde se involucran el uso de cuchillos, con o sin filo, para generar [[sensaciones]], [[miedo]], [[dolor]] o [[cortes]] como parte de un juego de [[roles]].'
	},
	{
		id: 'electro',
		visible_name: 'Juegos con electricidad',
		aka: ['electro play'],
		description:
			'[[práctica]] que involucra el uso de electricidad para generar sensaciones en el cuerpo. Se considera un tipo de [[edge]] play.',
		related: ['sensaciones', 'miedo']
	},
	{
		id: 'temperatura',
		visible_name: 'Juegos con la temperatura',
		children: ['fuego'],
		aka: ['temperature play'],
		description:
			'Una forma de juego de [[sensaciones]] donde se usan objetos o sustancias que estimulan los neuroreceptores del cuerpo con calor y frío para generar placer.'
	},
	{
		id: 'fuego',
		visible_name: 'Juegos con fuego',
		description:
			'[[práctica]]s que involucran el uso de fuego o de llamas. Por ejemplo el uso de alcohol para generar una llama breve y rápidamente extinguirla. Considerado un tipo de [[edge]] play.',
		aka: ['fire play']
	},
	{
		id: 'bondage',
		visible_name: 'Juegos con las restricciones',
		children: ['cuerdas'],
		description: 'Palabra que encapsula a las [[prácticas]] de restricción física.',
		related: [
			'humillación',
			'objetificación',
			'momificación',
			'privación sensorial',
			'restricción mental',
			'disciplina',
			'shibari'
		]
	},
	{ id: 'cuerdas', children: ['shibari'], color: '#ff4444' },
	{
		id: 'shibari',
		aka: ['bondage japonés', 'bondage con cuerdas', 'rope bondage', 'kinbaku'],
		description:
			'[[práctica]] erótica de origen japonés que consiste en restringir la movilidad de una persona usando cuerdas.',
		related: ['bondage', 'atadore', 'conejite de cuerdas']
	},
	{
		id: 'dolor',
		aka: ['juegos con el dolor', 'pain play'],
		description:
			'Cualquier [[práctica]] donde una persona inflige dolor consensuadamente para generar placer.',
		related: ['impacto', 'electro', 'sadomasoquismo']
	},
	{
		id: 'intercambio de poder',
		children: ['dominación', 'dominante', 'sumisión', 'sumise'],
		description:
			'Un acuerdo entre varias partes, comunmente alguna [[dominante]] y alguna [[sumisa]], donde la parte [[sumisa]] le entrega poder sobre aspectos de sí misma a la [[dominante]].',
		related: ['dinámicas']
	},
	{
		id: 'dominante',
		description: 'Persona que tiene el poder en un [[intercambio de poder]].',
		related: ['dominación']
	},
	{ id: 'espanol', aliasOf: 'español' },
	{ id: 'ingles', aliasOf: 'inglés' },
	{ id: 'practica', aliasOf: 'prácticas' },
	{ id: 'práctica', aliasOf: 'prácticas' },
	{ id: 'practicas', aliasOf: 'prácticas' },
	{ id: 'negociacion', aliasOf: 'negociación' },
	{ id: 'guia', aliasOf: 'guía' },
	{ id: 'bdsm', aliasOf: 'BDSM' },
	{ id: 'Dominatrix', aliasOf: 'dominatrix' },
	{ id: 'articulo', aliasOf: 'artículo' },
	{ id: 'Shibari', aliasOf: 'shibari' },
	{ id: 'Kinkyvibe', aliasOf: 'KinkyVibe' },
	{ id: 'kinkyvibe', aliasOf: 'KinkyVibe' },
	{ id: 'D/s', aliasOf: 'intercambio de poder' }
];
export default hardcodedTags;
