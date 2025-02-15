export const hardcodedTags = [
	{ id: 'KinkyVibe', icon: '⚫︎ ', color: 'var(--1)' },
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
			'neurodivergencia',
			'vincularidad'
		]
	},
	{ id: 'idioma', icon: '🌐', children: ['español', 'LSA', 'inglés'], color: 'darkblue' },
	{ id: 'español', icon: '🇪🇸' },
	{ id: 'LSA', icon: '🇦🇷' },
	{ id: 'inglés', icon: '🇬🇧' },
	{
		id: 'lugar',
		icon: '📍',
		children: ['Online', 'Presencial'],
		color: 'darkblue'
	},
	{ id: 'Online', icon: '🖥️' },
	{ id: 'Presencial', icon: '👥', children: ['Argentina', 'Uruguay', 'Chile'] },
	{ id: 'Argentina', icon: '🇦🇷', children: ['AMBA', 'Córdoba', 'Santa Cruz'] },
	{ id: 'AMBA', icon: '𓉶' },
	{ id: 'Córdoba', icon: '♜' },
	{ id: 'Santa Cruz', icon: '⛰️' },
	{ id: 'Uruguay', icon: '🇺🇾', children: ['Montevideo'] },
	{ id: 'Chile', icon: '🇨🇱' },
	{ id: 'precio', icon: '💸', children: ['pago', 'a la gorra', 'gratis'], color: 'darkblue' },
	{ id: 'pago', icon: '💲' },
	{ id: 'a la gorra', icon: '🧢' },
	{ id: 'gratis', icon: '🆓' },
	{
		id: 'calendario',
		icon: '📆',
		children: ['tipo de evento', 'evento recurrente'],
		color: 'var(--3-dark)'
	},
	{
		id: 'tipo de evento',
		children: [
			'cabaret',
			'charla debate',
			'cine',
			'concurso de drag',
			'entrevista',
			'evento',
			'exposición de arte',
			'feria',
			'fiesta',
			'grupo',
			'jam de cuerdas',
			'laboratorio',
			'perfo',
			'poesía',
			'rancheadita',
			'sesión en vivo',
			'taller'
		]
	},
	{ id: 'cabaret', icon: '🎀' },
	{ id: 'charla debate', icon: '📢' },
	{ id: 'cine', icon: '🍿' },
	{ id: 'concurso de drag', icon: '👨‍🎤' },
	{ id: 'entrevista', icon: '🎙️' },
	{ id: 'evento', icon: '🔥' },
	{ id: 'exposición de arte', icon: '🖼️' },
	{ id: 'feria', icon: '🏮' },
	{ id: 'fiesta', icon: '🎉' },
	{ id: 'grupo', icon: '🫂' },
	{ id: 'jam de cuerdas', icon: '🪢' },
	{ id: 'laboratorio', icon: '🧪' },
	{ id: 'perfo', icon: '🤹‍♂️' },
	{ id: 'poesía', icon: '✍️'},
	{ id: 'rancheadita', icon: '🧺' },
	{ id: 'sesión en vivo', icon: '🏇' },
	{ id: 'taller', icon: '🎓' },
	{ id: 'evento recurrente', children: ['Picantearla', 'Cine para Sucixs'] },
	{ id: 'Picantearla', icon: '🔥' },
	{ id: 'Cine para Sucixs', icon: '🎞️' },
	{
		id: 'material',
		icon: '📖',
		color: 'var(--3-dark)',
		children: ['tipo de material', 'formato de material']
	},
	{ id: 'tipo de material', children: ['online', 'descargable', 'interactivo'] },
	{ id: 'online', icon: '🛜' },
	{ id: 'descargable', icon: '📥' },
	{ id: 'interactivo', icon: '🖱️' },
	{
		id: 'formato de material',
		children: ['guía', 'artículo', 'libro', 'fanzine', 'checklist', 'video']
	},
	{ id: 'guía', icon: '🧭' },
	{ id: 'artículo', icon: '📰' },
	{ id: 'libro', icon: '📕' },
	{ id: 'fanzine', icon: '📔' },
	{ id: 'checklist', icon: '📋' },
	{ id: 'video', icon: '▶️' },
	{ id: 'amigues', icon: '❤️', children: ['tipo de perfil', 'servicio'], color: 'var(--3-dark)' },
	{ id: 'tipo de perfil', children: ['emprendimiento', 'profesional'] },
	{ id: 'emprendimiento', icon: '👥' },
	{ id: 'profesional', icon: '👤' },
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
			'terapia',
			'editorial'
		]
	},
	{ id: 'arte', icon: '🎨' },
	{ id: 'clases', icon: '👩‍🏫' },
	{ id: 'comida vegana', icon: '🥕' },
	{ id: 'comunidad', icon: '👥' },
	{ id: 'eventos', icon: '🗓️' },
	{ id: 'productos', icon: '🛒' },
	{ id: 'sesiones', icon: '🔥' },
	{ id: 'terapia', icon: '🗨️' },
	{ id: 'editorial', icon: '📚' },
	{
		icon: '❤️',
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
			'sadomasoquismo',
			'24/7'
		]
	},
	{
		id: 'negociación',
		icon: '🤝',
		description:
			'Los momentos previos a la práctica [[bdsm]], donde buscamos compartir y discernir cuáles son nuestros intereses, intensiones, deseos, niveles de comodidad, y [[límites]], así como cuidados necesarios.'
	},
	{ id: 'consentimiento', icon: '✅', children: ['RACK', 'SSC', 'CCCC'] },
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
		icon: '😭',
		aka: ['drop', 'bajón'],
		description:
			'El estado mental físico psicoemocional en el cual estamos después de una experiencia intensa pero positiva.',
		related: ['cuidados posteriores']
	},
	{
		id: 'cuidados posteriores',
		icon: '🫂',
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
	{ icon: '🕕', id: '24/7' },
	{
		id: 'prácticas',
		children: [
			'top',
			'bottom',
			'disciplina',
			'protocolo',
			'cnc',
			'hablar sucio',
			'roles',
			'impacto',
			'sensaciones',
			'bondage',
			'predicamento',
			'privación sensorial',
			'intercambio de poder',
			'cuchillos',
			'dolor',
			'humillación',
			'asfixia',
			'miedo',
			'adoración de pies',
			'chemsex',
			'cera',
			'comida',
			'sadomasoquismo en pechos',
			'lluvias',
			'edging',
			'pegging',
			'fisting',
			'rimming'
		],
		color: '#ff4444'
	},
	{
		id: 'implementos',
		icon: '🛠️',
		color: '#ff4444',
		children: ['paleta', 'palmeta', 'látigo', 'fusta', 'cuerdas', 'cuchillos']
	},
	{
		icon: '🏏',
		id: 'paleta',
		description:
			'Implemento de [[impacto]] generalmente plano y rectangular. Similar a las [[palmeta]]s pero con mayor peso y rigidez. Suele venir de madera, acrílico o plástico rígido, etc'
	},
	{
		icon: '🥍',
		id: 'palmeta',
		description:
			'Implemento de [[impacto]] generalmente plano y rectangular, comúnmente flexible y de cuero/ina. Pueden venir con calados, peluches o tachas para distintas [[sensaciones]].'
	},
	{
		id: 'látigo',
		aka: ['whip'],
		children: ['cola de dragón', 'flogger'],
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
		id: 'flogger',
		children: ['florentino'],
		description:
			'Implemento de [[impacto]] y [[sensaciones]] formado por un mango y múltiples tiras/colas que impactan en la piel. Produce diferentes sensaciones según el grosor, cantidad de colas y material con el que esté confeccionado'
	},
	{
		id: 'florentino',
		description:
			'Tipo específico de [[flogger]] articulado y sin mango rígido. Suelen venir en pares para utilizarse en, justamente, la técnica de azote florentina'
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
		icon: '💦',
		id: 'squirt',
		visible_name: 'Eyaculación vaginal',
		aka: ['squirt', 'eyaculación prostática'],
		description:
			'Expulsión de fluidos liberados por las glándulas de Anarcha (ex glándula de Skene) durante la estimulación genital de personas que nacieron con agujero frontal/canal vaginal.'
	},
	{ icon: '⚖️', id: 'antipunitivismo', color: 'var(--2)' },
	{ icon: '⚕️', id: 'despatologización', color: 'var(--2)' },
	{ icon: '♾️', id: 'neurodivergencia', color: 'var(--2)' },
	{ icon: '💞', id: 'vincularidad', children: ['no monogamia', 'celos'], color: 'var(--2)' },
	{ id: '', color: '#ff4444' },
	{ id: 'queer', icon: '🏳️‍🌈', children: ['furry', 'género', 'asexualidad', 'drag'] },
	{
		id: 'asexualidad',
		aka: ['ace', 'espectro asexual'],
		description:
			'Orientación sexual caracterizada por no sentir atracción sexual hacía otras personas.'
	},
	{ icon: '⬆️', id: 'top', description: 'Comúnmente, la persona que "da" una [[práctica]].' },
	{
		icon: '⬇️',
		id: 'bottom',
		description:
			'Comúnmente, la persona que "recibe" una [[práctica]]. Hay múltiples formas y sabores de bottom: [[conejite de cuerdas]], [[power bottom]], [[Dom]] bottom, [[brat]] bottom, etc...'
	},
	{
		id: 'disciplina',
		icon: '📏',
		related: ['bondage', 'brat'],
		description:
			'Enseñarle a le [[bottom]] y/o [[sub]] a obedecer órdenes, o a seguir las reglas que le Dom establezca a través de premios y/o castigos. También puede incluir modificación del comportamiento.'
	},
	{
		icon: '📝',
		id: 'protocolo',
		related: ['intercambio de poder'],
		description:
			'Serie de normas consensuadas, generalmente entre Doms y Subs que pautan comportamientos, reglas, simbolismos y valores dentro de una dinámica D/s'
	},
	{
		icon: '🍆',
		id: 'pegging',
		description:
			'Históricamente usado para referirse a el acto de que una mujer cis penetre analmente con un strap on/cinturonga a un hombre cis. Hoy en día es utilizado por algunas personas para referirse a cualquier persona que use un strap-on para sexo anal, aunque suele circular más con ese nombre cuando se usa sobre hombres cis.'
	},
	{
		id: 'roles',
		icon: '🎭',
		aka: ['role play', 'rolplay'],
		visible_name: 'Juegos de roles',
		children: ['edad', 'primal', 'mascota', 'brat', 'cnc', 'cazadore-presa'],
		description:
			'Donde las partes acuerdan "actuar" roles (enfermera/médicx, profesore/alumne, Dueño/mascota, etc), algunas veces incluye [[intercambio de poder]].'
	},
	{
		icon: '😤',
		id: 'primal',
		visible_name: 'Juegos primales',
		aka: ['primal play'],
		related: ['mascota', 'cazadore-presa'],
		description: 'Juego de roles en donde se toman características asociadas a lo animalístico no-humano. Algunos ejemplos serían: rasguñar, gruñir, morder, etc.'
	},
	{
		icon: '🐕‍🦺',
		id: 'mascota',
		visible_name: 'Juegos de mascotas',
		aka: ['pet'],
		related: ['primal']
	},
	{
		icon: '😈',
		id: 'brat',
		aka: ['malcriade'],
		related: ['disciplina'],
		description:
			'Un rol donde se toma actitud rebelde y provocadora a través de acciones o palabras. En caso de ser sumi, usualmente es buscando un castigo como consecuencia.'
	},
	{
		icon: '🟢',
		id: 'cnc',
		visible_name: 'No-consenso consensuado',
		aka: ['cnc', 'consensual non-consent'],
		description:
			'Juego de roles donde se forcejea y finge una falta de consentimiento. Puede encontrarse como parte de otros roles y dinámicas.'
	},
	{ icon: '🗣️', id: 'hablar sucio' },
	{
		id: 'cazadore-presa',
		icon: '🏹',
		visible_name: 'Cazadore / presa',
		aka: ['Hunter/prey', 'H/p', 'C/p'],
		related: ['primal'],
		description: 'Donde las partes adoptan esos roles, que pueden ser tanto humanos como no-humanos'
	},
	{
		id: 'edad',
		icon: '🍭',
		children: ['pequeñe', 'middle', 'cuidadore', 'grande', 'ddlg', 'abdl'],
		aka: ['age play'],
		description:
			'Un término paraguas para referirse a cualquier tipo de juego en donde alguna persona adulta pretenda tener una edad diferente a la que tiene en la actualidad.'
	},
	{
		icon: '👶',
		id: 'pequeñe',
		aka: ['peque', 'little'],
		description:
			'Suele ser como se le llama a las personas adultas que juegan a tener menos edad que su edad cronológica en juegos con la [[edad]].'
	},
	{
		icon: '🤟',
		id: 'middle',
		aka: ['lolite'],
		description:
			'Personas adultas que disfrutan de tomar roles relacionados a la adolescencia / pubertad en juegos con la [[edad]]. También "lolites".'
	},
	{
		icon: '🧑‍🍼',
		id: 'cuidadore',
		aka: ['caregiver', 'caretaker'],
		description:
			'Refiere a personas que quieren jugar a cuidar / compartir con [[pequeñe]]s sin tomar algún rol especifico.'
	},
	{
		icon: '💼',
		id: 'grande',
		description:
			'En los juegos con la [[edad]], son personas que juegan a tener más edad que su edad cronológica y / o son les [[cuidadore]]s.'
	},
	{
		icon: '👨‍👧',
		id: 'ddlg',
		visible_name: 'Papi Dom / niña pequeña',
		aka: ['Daddy Dom/little girl', 'DD/lg'],
		description:
			'Es un tipo de dinámica relacional y juego con la edad en donde una persona toma el rol parental de "[[daddy]]" o "papi" y otre le de la "pequeña". En general es un vínculo masc/fem'
	},
	{
		id: 'abdl',
		icon: '🩲',
		visible_name: 'Bebé Adulte Amante de los Pañales',
		aka: ['ABDL', 'Adult Baby Diaper Lover'],
		description:
			'Mezcla de juegos con la [[edad]] y [[fetiche de pañales]] (usarlos, tenerlos puestos bajo la ropa y que los mismos sean cambiados). Se disfruta de tomar características asociadas a la edad infantil (llorar, usar pañales, ropa de bebé).'
	},
	{
		id: 'impacto',
		icon: '💢',
		visible_name: 'Juegos de Impacto',
		children: ['calentamiento', 'nalgueadas', 'caning', 'golpes', 'bastinado'],
		description:
			'[[práctica]] variada que consiste en impactar físicamente sobre zonas del cuerpo con fines eróticos/sensuales/catárticos.',
		related: ['sensaciones', 'juego de roles', 'miedo', 'dolor', 'calentamiento']
	},
	{
		id: 'predicamento',
		icon: '⚖️',
		description:
			'Colocar a le [[bottom]] en una situación donde tenga que elegir entre dos posiciones que son incómodas o dolorosas de distintas formas, frecuentemente hecho con [[bondage]].',
		related: ['sadomasoquismo']
	},
	{
		icon: '♨️',
		id: 'calentamiento',
		description:
			'Práctica de impacto de baja intensidad para preparar una zona del cuerpo a ser impactada con mayor fuerza. Típicamente se hace como comienzo de una sesión de impacto. Reduce las chances de generar moretones.'
	},
	{ id: 'golpes', icon: '🤜', description: 'Práctica de impacto utilizando los puños' },
	{
		icon: '🍑',
		id: 'nalgueadas',
		aka: ['spanking'],
		description: 'Práctica de impactar con las manos sobre las nalgas de une misme u otre'
	},
	{
		icon: '🦯',
		id: 'bastinado',
		description:
			'Práctica de impacto realizada específicamente sobre la planta del pie, clásicamente con una varilla.'
	},
	{
		id: 'sensaciones',
		icon: '🪶',
		visible_name: 'Juegos de sensaciones',
		children: ['temperatura', 'electro'],
		aka: ['sensation play'],
		description:
			'Donde se busca crear sensaciones físicas placenteras o displacenteras sobre una persona. Se puede usar hielo, seda, [cera] caliente, texturas, etc. Se suele hacer con le [[bottom]] cegade.'
	},
	{
		id: 'cuchillos',
		icon: '🗡️',
		visible_name: 'Juegos con cuchillos',
		aka: ['knife play'],
		description:
			'Donde se involucran el uso de cuchillos, con o sin filo, para generar [[sensaciones]], [[miedo]], [[dolor]] o [[cortes]] como parte de un juego de [[roles]].'
	},
	{
		id: 'electro',
		icon: '⚡️',
		visible_name: 'Juegos con electricidad',
		aka: ['electro play'],
		description:
			'[[práctica]] que involucra el uso de electricidad para generar sensaciones en el cuerpo. Se considera un tipo de [[edge]] play.',
		related: ['sensaciones', 'miedo']
	},
	{
		id: 'temperatura',
		icon: '🌡️',
		visible_name: 'Juegos con la temperatura',
		children: ['fuego'],
		aka: ['temperature play'],
		description:
			'Una forma de juego de [[sensaciones]] donde se usan objetos o sustancias que estimulan los neuroreceptores del cuerpo con calor y frío para generar placer.'
	},
	{
		id: 'fuego',
		icon: '🔥',
		visible_name: 'Juegos con fuego',
		description:
			'[[práctica]]s que involucran el uso de fuego o de llamas. Por ejemplo el uso de alcohol para generar una llama breve y rápidamente extinguirla. Considerado un tipo de [[edge]] play.',
		aka: ['fire play']
	},
	{
		icon: '⛓️',
		id: 'bondage',
		children: ['cuerdas', 'momificación', 'restricción mental'],
		aka: ['juegos con restricciones'],
		description: 'Las [[prácticas]] de restricción física.',
		related: ['humillación', 'objetificación', 'privación sensorial', 'disciplina', 'predicamento']
	},
	{
		id: 'cuerdas',
		icon: '🪢',
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
		icon: '🐇',
		aka: ['conejite de cuerdas', 'rope bunny'],
		description: 'La persona que es atada en el [[shibari]]'
	},
	{
		id: 'momificación',
		icon: '🧻',
		aka: ['mummification'],
		description:
			'Restringir la movilidad de un cuerpo parcial o totalmente, típicamente utilizando film, tela o yeso.'
	},
	{
		id: 'restricción mental',
		description:
			'Retringir el movimiento únicamente mediante órdenes y obediencia, en un [[intercambio de poder]]'
	},
	{ id: 'privación sensorial', icon: '🥽' },
	{
		id: 'dolor',
		aka: ['juegos con el dolor', 'pain play'],
		description:
			'Cualquier [[práctica]] donde una persona inflige dolor consensuadamente para generar placer.',
		related: ['impacto', 'electro', 'sadomasoquismo']
	},
	{
		id: 'intercambio de poder',
		icon: '🧎',
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
		icon: '🤌',
		description:
			'Meter 4 o más dedos en el canal vaginal/agujero frontal o en el ano, muchas veces llegando a meter la mano entera y cerrándola en un puño.'
	},
	{
		icon: '🛞',
		id: 'rimming',
		aka: ['anilingus'],
		description: 'practicar sexo oral a un ano'
	},
	{
		id: 'adoración de pies',
		icon: '🦶',
		aka: ['feet worship', 'feet kink', 'feet fetish'],
		description: 'Contemplar, acariciar, masajear, oler, lamer o besar pies, entre otras.'
	},
	{
		icon: '🫣',
		id: 'humillación',
		visible_name: 'Humillación erótica',
		aka: ['erotic humilliation'],
		related: ['sadomasoquismo', 'bondage'],
		description:
			'Tomar acciones, objetos, palabras que en el "mundo exterior" (subjetivo de cada persona) parecerían "humillantes" y re contextualizarlas en un marco erótico a través de un lente de apreciación, cuidado, aceptación y disfrute.'
	},
	{
		id: 'asfixia',
		icon: '😶‍🌫️',
		children: ['headscissors'],
		description:
			'Reducir la cantidad de oxígeno que llega al cerebro de le [[bottom]] para generar distintas [[sensaciones]] o como muestra de un [[intercambio de poder]] mediante [[estrangulación]] o juegos con la [[respiración]]'
	},
	{ icon: '😨', id: 'miedo' },
	{
		id: 'respiración',
		icon: '🫁',
		visible_name: 'Juegos con la Respiración',
		aka: ['breath play'],
		description:
			'Restricción intencional del aire que inspira mediante [[control]], [[implementos]] o [[dominación]] física'
	},
	{
		id: 'estrangulación',
		icon: '🫶',
		aka: ['choking'],
		description:
			'Restricción del flujo normal de sangre al cerebro mediante la presión de las arterias carótidas del cuello.'
	},
	{
		id: 'headscissors',
		icon: '🦵',
		description: '[[estrangulación]] generada rodeando el cuello con los muslos.'
	},
	{
		icon: '💊',
		id: 'chemsex',
		visible_name: 'Juego con drogas',
		aka: ['PNP', 'Party and Play', 'chemsex'],
		related: ['intox'],
		description:
			'Prácticas sexuales o [[sadomasoquista]]s hechas consicentemente bajo el uso de sustancias psicoactivas/drogas recreacionales. Usualmente en fiestas. Considerado un tipo de [[juego límite]]'
	},
	{
		icon: '😫',
		id: 'edging',
		visible_name: 'Edgear',
		aka: ['edging', 'tease and denial'],
		description: 'Estimular los genitales hasta casi llegar al [[orgasmo]] y luego parar.'
	},
	{
		id: 'cera',
		icon: '🕯️',
		visible_name: 'Juegos con Cera',
		aka: ['wax play', 'velas', 'juegos con velas'],
		description:
			'Verter cera caliente de velas sobre un cuerpo. Puede implicar dolor o [[sensaciones]] suaves dependiendo del material, la distancia, y la técnica.'
	},
	{ id: 'lluvias', icon: '🌧️', children: ['lluvia dorada'] },
	{
		id: 'lluvia dorada',
		aka: ['golden shower', 'watersports', 'piss play', 'juegos con pis'],
		description: 'Orinar sobre el cuerpo de le [[bottom]]'
	},
	{ id: 'comida', icon: '🍰', children: ['enchastre'] },
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
