<script>
	import svgData from '$lib/posts/material/media/donde-y-como-golpear-un-cuerpo/svgData.js';
	/**@type Record<string, Record<string, string>>*/
	const seguridad = {
		flogger: {
			genitales: 'maybe',
			pecho: 'maybe',
			omoplato: 'good',
			mejilla: 'bad',
			palma: 'bad',
			antebrazo: 'good',
			brazo: 'good',
			thigh: 'good',
			muslo: 'good',
			plantapie: 'maybe',
			pantorrilla: 'good'
		},
		fusta: {
			genitales: 'maybe',
			pecho: 'maybe',
			omoplato: 'maybe',
			mejilla: 'maybe',
			palma: 'maybe',
			antebrazo: 'good',
			brazo: 'good',
			thigh: 'good',
			muslo: 'good',
			plantapie: 'good',
			pantorrilla: 'good'
		},
		palmeta: {
			genitales: 'maybe',
			pecho: 'maybe',
			omoplato: 'maybe',
			mejilla: 'maybe',
			palma: 'maybe',
			antebrazo: 'good',
			brazo: 'good',
			thigh: 'good',
			muslo: 'good',
			plantapie: 'good',
			pantorrilla: 'good'
		},
		mano: {
			genitales: 'maybe',
			pecho: 'maybe',
			omoplato: 'good',
			mejilla: 'maybe',
			palma: 'maybe',
			antebrazo: 'good',
			brazo: 'good',
			thigh: 'good',
			muslo: 'good',
			plantapie: 'good',
			pantorrilla: 'good'
		},
		varilla: {
			genitales: 'maybe',
			pecho: 'bad',
			omoplato: 'bad',
			mejilla: 'bad',
			palma: 'bad',
			antebrazo: 'good',
			brazo: 'good',
			thigh: 'good',
			muslo: 'good',
			plantapie: 'good',
			pantorrilla: 'good'
		}
	};
	let implemento = 'palmeta';
	let bodypart = '';
	('title,desc,tipo de dolor, dificultad, marcas');
	/** @type Record<string,*>*/
	const text = {
		fusta: {
			title: 'Fusta',
			desc: 'Varilla con mango y con una punta de cuero o cuerina doblada en su otro extremo. Puede usarse para acariciar y dar toqueteos suaves o para impactar con fuerza.',
			dolor: 'Agudo',
			dificultad: 'Media',
			dificultad_det:
				'Hay que aprender a medir la fuerza. Con poca fuerza puede haber mucho dolor y de pegar mal se puede dañar.',
			marcas: 'Puede dejar moretones.'
		},
		flogger: {
			title: 'Flogger',
			desc: 'Mango con múltiples colas (látigo). Las mismas pueden tener distintas características. La cantidad, tamaño y material cambian su sensación. Puede usarse para sensaciones suaves o impactar con fuerza.',
			dolor: 'Variado depende del flogger',
			dificultad: 'Alta',
			dificultad_det:
				'Hay que aprender a usarlo y hay chance de producir mucho daño si se usa incorrectamente.',
			marcas: 'Puede dejar moretones y laceraciones.'
		},
		mano: {
			title: 'Mano',
			desc: 'Parte del cuerpo. Se puede impactar con la mano abierta y los dedos juntos o separados, con el reverso, entre otras.',
			dolor: 'Variado depende de cómo usemos la mano',
			dificultad: 'Baja',
			dificultad_det: 'Si nos limitamos a solo la mano abierta y dedos juntos o separados.',
			marcas: 'Puede dejar marcas rojas.'
		},
		varilla: {
			title: 'Varilla',
			desc: 'Mango con una varilla. Puede venir de distintos grosores y materiales. Mientras más fino y liviano más agudo, mientras más grueso y pesado más profundo.',
			dolor: 'Variado, tiende a ser agudo',
			dificultad: 'Alta',
			dificultad_det:
				'Con muy poco esfuerzo puede causar mucho dolor, puede dañar de ser usado incorrectamente.',
			marcas: 'Moretones, marcas rojas, posibilidad de sangrado.'
		},
		palmeta: {
			title: 'Palmeta',
			desc: 'Un mango y dos lados planos. Si son flexibles son palmetas, si son rígidas son paletas. Pueden ser de cuerina, cuero, madera, acrílico, con peluche, sin, etc.',
			dolor: 'Variado, tiende a ser profundo.',
			dificultad: 'Baja',
			dificultad_det: 'Es lo más similar a una mano y es fácil medir la intensidad.',
			marcas: 'Moretones, marcas rojas, y posibilidad de sangrado.'
		}
	};
	/**@param {string} name*/
	function toggleBodyPart(name) {
		if (!['rojo', 'lines'].includes(name)) {
			bodypart = name;
		}
	}
</script>

<!-- <p>{bodypart}</p> -->
<!-- <p>{implemento}</p> -->
<div class="wrapper">
	<div class="implementos">
		{#each Object.keys(seguridad) as imp}
			<label class={bodypart ? seguridad[imp][bodypart] : ''}
				><input
					type="radio"
					name="seguridad"
					id="seguridad-{imp}"
					value={imp}
					bind:group={implemento}
				/>{imp}</label
			>
		{/each}
	</div>

	<svg class="diagrama" viewBox="0 0 130 160">
		{#each svgData as { d, name }}
			<path
				{d}
				class="{name} {seguridad[implemento][name]}"
				on:keydown={() => toggleBodyPart(name)}
				on:click={() => toggleBodyPart(name)}
				tabindex="0"
				role="button"
			/>
		{/each}
	</svg>

	<div class="texto">
		<h2>{text[implemento].title}</h2>
		<p>{text[implemento].desc}</p>
		<p>
			<strong>Dificultad {text[implemento].dificultad.toLowerCase()}</strong>. {text[implemento]
				.dificultad_det}
		</p>
		<p />
		<p>Dolor: <strong>{text[implemento].dolor}</strong></p>
		<p>Marcas: <strong>{text[implemento].marcas}</strong></p>
	</div>
	<legend>
		<ul>
			<li>
				<span class="good">&nbsp;</span>&ThickSpace;"Seguro"
			</li>
			<li>
				<span class="maybe">&nbsp;</span>&ThickSpace;Moderación
			</li>
			<li>
				<span class="bad">&nbsp;</span>&ThickSpace;Complicaciones de salud
			</li>
		</ul>
	</legend>
</div>

<style>
	.wrapper {
		margin-top: 3em;
		display: grid;
		grid-template-areas: 'implementos implementos' 'diagrama texto' 'legend legend';
		grid-template-rows: auto auto auto;
		align-items: center;
		gap: 0.5em;
		height: auto;
		min-height: 35em;
	}
	legend {
		grid-area: legend;
	}
	legend li {
		list-style: none;
	}
	legend span {
		--color: var(--1);
		display: inline-block;
		background: var(--color);
		border-radius: 0em;
		outline: 2px solid var(--color);
		--size: 1em;
		height: var(--size);
		width: var(--size);
		margin: 0.3em;
	}
	@media (max-width: 680px) {
		.wrapper {
			grid-template-areas: 'implementos' 'diagrama' 'legend' 'texto';
			grid-template-rows: auto auto auto auto;
		}
		.diagrama {
			max-height: 40vh;
		}
	}
	.wrapper > * {
		min-width: 0;
		min-height: 0;
	}
	.texto {
		grid-area: texto;
		align-self: start;
	}
	input {
		display: none;
	}
	.implementos {
		align-self: start;
		display: flex;
		flex-wrap: wrap;
		width: 100%;
		justify-content: center;
		gap: 1em;
		margin-bottom: 1em;
		grid-area: implementos;
	}
	label {
		font-size: var(--step-1);
		--color: var(--1);
		display: inline-block;
		padding: 0.4em 0.8em;
		background: color-mix(in srgb, var(--color) 20%, white);
		color: color-mix(in srgb, var(--color) 20%, black);
		cursor: pointer;
		border-radius: 1em;
		outline: 2px solid var(--color);
		transition: 100ms;
	}
	label:has(:checked) {
		outline: 3px solid color-mix(in srgb, var(--color) 50%, black);
		scale: 1.1;
	}
	svg,
	label,
	legend {
		--bad: #ff9799;
		--good: #5bf177;
		--maybe: #ffe666;
	}
	svg {
		width: 100%;
		height: auto;
		max-height: 80vh;
		grid-area: diagrama;
	}
	.bad {
		--color: var(--bad) !important;
	}
	.good {
		--color: var(--good) !important;
	}
	.maybe {
		--color: var(--maybe) !important;
	}
	path {
		transition: 200ms;
		stroke: none;
		stroke-width: 0px;
		fill: var(--color, var(--3));
		stroke: white;
	}
	path.rojo:hover,
	path.rojo:focus,
	path.rojo:active,
	path.lines:hover,
	path.lines:focus,
	path.lines:active {
		stroke-width: 0px;
		stroke: none;
		outline: none;
	}
	path:hover,
	path:focus,
	path:active {
		stroke-width: 1px;
		outline: none;
	}
	.lines {
		fill: #222;
	}
	.rojo {
		--color: var(--bad);
	}
	.genitales,
	.pecho,
	.omoplato,
	.mejilla,
	.palma {
		--color: var(--maybe);
	}
	.antebrazo,
	.brazo,
	.thigh,
	.muslo,
	.plantapie,
	.pantorrilla {
		--color: var(--good);
	}
</style>
