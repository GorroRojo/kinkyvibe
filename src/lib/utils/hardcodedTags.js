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
			'implementos',
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
			'consentimiento',
			'dinámicas',
			'caída',
			'cuidados posteriores',
			'sadomasoquismo'
		]
	},
	{
		id: 'negociación',
		description:
			'Los momentos previos a la práctica [[bdsm]], donde buscamos compartir y discernir cuáles son nuestros intereses, intensiones, deseos, niveles de comodidad, y [[límites]], así como cuidados necesarios.'
	},
	{ id: 'consentimiento', children: ['RACK', 'SSC', 'CCCC'] },
	{
		id: 'RACK',
		aka: ['Risk-Aware Consensual Kink'],
		description:
			'Fetiche consensuado con conciencia de riesgo, propuesta ética y filosófica para pensar las sexualidades y prácticas [[BDSM]], formulada en 1999 por Gary Switch para la comunidad estadounidense.'
	},
	{
		id: 'SSC',
		aka: ['Safe Sane and Consensual', 'Sano Seguro y Consensuado', 'Sensato Seguro y Consensuado'],
		description:
			"Sano Seguro y consensuado (safe sane and consensual) acrónimo propuesto por David Stein, es un código de conducta ética para la comunidad BDSM usado durante los 80's en Estados Unidos"
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
			'Prácticas de cuidado que suceden después de un intercambio fetichista o [[sesión]], con el fin de procesar la [[escena]] y transicionar hacia la cotidianeidad.',
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
			'disciplina',
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
			'miedo',
			'adoración de pies',
			'chemsex',
			'edging',
			'cera',
			'lluvias',
			'comida',
			'sadomasoquismo en pechos'
		],
		color: '#ff4444'
	},
	{ id: 'implementos', color: '#ff4444', children: ['paleta', 'palmeta', 'látigo', 'fusta'] },
	{
		id: 'paleta',
		description:
			'Implemento de [[impacto]] generalmente plano y rectangular. Similar a las [[palmeta]]s pero con mayor peso y rigidez. Suele venir de madera, acrílico o plástico rígido, etc'
	},
	{
		id: 'palmeta',
		description:
			'Implemento de [[impacto]] generalmente plano y rectangular, comúnmente flexible y de cuero/ina. Pueden venir con calados, peluches o tachas para distintas [[sensaciones]].'
	},
	{
		id: 'látigo',
		aka: ['whip'],
		children: ['cola de dragón'],
		description:
			'Implemento de [[impacto]] formado por un mango rígido, sumado a una o más tiras largas y flexibles llamadas colas. Existen muchas variantes que provocarán distintas sensaciones en le bottom dependiendo de su forma, peso y material.'
	},
	{
		id: 'cola de dragón',
		aka: ['dragon tail'],
		description:
			'Tipo de látigo compuesto por un mango rígido sumado a una pieza de cuero/ina, enrollada y con terminación en la punta.'
	},
	{
		id: 'fusta',
		aka: ['riding crop'],
		description:
			'Implemento de [[impacto]] que consiste en una varilla con una pieza de cuero o cuerina en el extremo donde impacta, y un mango para sostenerla del otro lado'
	},
	{
		id: 'género y salud sexual',
		children: ['queer', 'materiales', 'porno', 'squirt', 'feminismo', 'salud'],
		color: '#ff4444'
	},
	{
		id: 'squirt',
		visible_name: 'Eyaculación vaginal',
		aka: ['squirt', 'eyaculación prostática'],
		description:
			'Expulsión de fluidos liberados por las glándulas de Anarcha (ex glándula de Skene) durante la estimulación genital de personas que nacieron con agujero frontal/canal vaginal.'
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
		id: 'disciplina',
		related: ['bondage'],
		description:
			'Enseñarle a le [[bottom]] y/o [[sub]] a obedecer órdenes, o a seguir las reglas que le Dom establezca a través de premios y/o castigos. También puede incluir modificación del comportamiento.'
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
		children: ['pequeñe', 'middle', 'cuidadore', 'grande', 'abdl'],
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
		id: 'abdl',
		visible_name: 'Bebé Adulte Amante de los Pañales',
		aka: ['ABDL', 'Adult Baby Diaper Lover'],
		description:
			'Mezcla de juegos con la [[edad]] y [[fetiche de pañales]] (usarlos, tenerlos puestos bajo la ropa y que los mismos sean cambiados). Se disfruta de tomar características asociadas a la edad infantil (llorar, usar pañales, ropa de bebé).'
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
		visible_name: 'Restricciones',
		children: ['cuerdas', 'momificación'],
		aka: ['bondage'],
		description: 'Las [[prácticas]] de restricción física.',
		related: [
			'humillación',
			'objetificación',
			'privación sensorial',
			'restricción mental',
			'disciplina'
		]
	},
	{
		id: 'cuerdas',
		children: ['shibari', 'atadore', 'bottom de cuerdas'],
		description:
			'Elemento compuesto de sogas trenzadas, por lo general de algodón o yute, utilizado en [[shibari]] y/o [[bondage]]',
		color: '#ff4444'
	},
	{
		id: 'shibari',
		aka: ['bondage japonés', 'bondage con cuerdas', 'rope bondage', 'kinbaku'],
		description:
			'[[práctica]] erótica de origen japonés que consiste en restringir la movilidad de una persona usando cuerdas.'
	},
	{
		id: 'atadore',
		aka: ['top de cuerdas', 'rigger'],
		description: 'La persona [[top]] en el [[shibari]] que ata a le [[bottom de cuerdas]]'
	},
	{
		id: 'bottom de cuerdas',
		aka: ['conejite de cuerdas', 'rope bunny'],
		description: 'La persona que es atada en el [[shibari]]'
	},
	{
		id: 'momificación',
		aka: ['mummification'],
		description:
			'Restringir la movilidad de un cuerpo parcial o totalmente, típicamente utilizando film, tela o yeso.'
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
	{
		id: 'fisting',
		description:
			'Meter 4 o más dedos en el canal vaginal/agujero frontal o en el ano, muchas veces llegando a meter la mano entera y cerrándola en un puño.'
	},
	{
		id: 'adoración de pies',
		aka: ['feet worship', 'feet kink', 'feet fetish'],
		description: 'Contemplar, acariciar, masajear, oler, lamer o besar pies, entre otras.'
	},
	{
		id: 'humillación',
		visible_name: 'Humillación erótica',
		aka: ['erotic humilliation'],
		related: ['sadomasoquismo', 'bondage'],
		description:
			'Tomar acciones, objetos, palabras que en el "mundo exterior" (subjetivo de cada persona) parecerían "humillantes" y re contextualizarlas en un marco erótico a través de un lente de apreciación, cuidado, aceptación y disfrute.'
	},
	{ id: 'asfixia', children: ['respiración', 'estrangulación', 'headscissors'] },
	{
		id: 'respiración',
		visible_name: 'Juegos con la Respiración',
		aka: ['breath play'],
		description:
			'Restricción intencional del oxígeno que llega al cerebro mediante [[control]], [[implementos]] o [[dominación]] física'
	},
	{
		id: 'estrangulación',
		aka: ['choking'],
		description:
			'Restricción del flujo normal de sangre al cerebro mediante la presión de las arterias carótidas del cuello.'
	},
	{
		id: 'headscissors',
		description: '[[estrangulación]] generada rodeando el cuello con los muslos.'
	},
	{
		id: 'chemsex',
		visible_name: 'Juego con drogas',
		aka: ['PNP', 'Party and Play', 'chemsex'],
		related: ['intox'],
		description:
			'Prácticas sexuales o [[sadomasoquista]]s hechas consicentemente bajo el uso de sustancias psicoactivas/drogas recreacionales. Usualmente en fiestas. Considerado un tipo de [[juego límite]]'
	},
	{
		id: 'edging',
		visible_name: 'Edgear',
		aka: ['edging', 'tease and denial'],
		description: 'Estimular los genitales hasta casi llegar al [[orgasmo]] y luego parar.'
	},
	{
		id: 'cera',
		visible_name: 'Juegos con Cera',
		aka: ['wax play', 'velas', 'juegos con velas'],
		description:
			'Verter cera caliente de velas sobre un cuerpo. Puede implicar dolor o [[sensaciones]] suaves dependiendo del material, la distancia, y la técnica.'
	},
	{ id: 'lluvias', children: ['lluvia dorada'] },
	{
		id: 'lluvia dorada',
		aka: ['golden shower', 'watersports', 'piss play', 'juegos con pis'],
		description: 'Orinar sobre el cuerpo de le [[bottom]]'
	},
	{ id: 'comida', children: ['enchastre'] },
	{
		id: 'enchastre',
		aka: ['sploshing', 'wet and messy', 'WAM'],
		description:
			'Desparramar sustancias o alimentos, típicamente líquidos, densos y/o pegajosos, sobre el cuerpo une misme u otre'
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
