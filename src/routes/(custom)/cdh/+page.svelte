<script>
	import './cust.css';
	import books from './byn-books_1f4da.png';
	import crown from './byn-crown_1f451.png';
	import fox from './byn-fox-face_1f98a.png';
	import star from './byn-glowing-star_1f31f.png';
	import skull from './byn-skull-and-crossbones_2620-fe0f.png';
	import hat from './galera-02.png';
	import logo from './titulo copia.svg';
	/**
	 * @type {Record<string, string>}
	 */
	let emoji_map = {
		r: 'hs',
		n: 'hm',
		t: 'hb',
		e: 'hf',
		d: 'hc',
		c: 'sm',
		l: 'sb',
		y: 'sf',
		a: 'sc',
		u: 'mb',
		j: 'mf',
		b: 'mc',
		h: 'bf',
		o: 'bc',
		s: 'fc'
	};
	/**
	 * @type {Record<string, string>}
	 */
	let emoji_image_map = {
		h: hat,
		c: crown,
		f: fox,
		m: star,
		s: skull,
		b: books
	};

	let alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

	let emoji_letters = Object.keys(emoji_map).map((l) => l.toUpperCase());

	let extra_letters = alphabet.filter((l) => !Object.keys(emoji_map).includes(l.toLowerCase()));

	let msg = 'hay un tesoro oculto abajo de la barra';

	let msg_words = msg.split(' ');

	let longest_word = msg_words.reduce((a, b) => (a.length > b.length ? a : b), '').length;

	let msg_words_emoji = msg_words.map((w) =>
		w
			.split('')
			.map((c) => emoji_map[c] || c)
			.join('')
	);
</script>

<main>
	{#each [0, 1, 2, 3, 4, 5, 6, 7] as card_index}
		{@const options = [...emoji_letters, ...extra_letters].sort(() => Math.random() - 0.5)}
		<div class="card">
			<div class="table">
				<h2>
					<img src={logo} id="logo" alt="Bingo" />
					-  ¡Bingo!
				</h2>
				{#each [0, 1, 2, 3, 4] as row}
					{#each [0, 1, 2, 3, 4] as col}
						{@const value = options.shift() ?? ''}
						<div class="cell" class:mark={(row + col) % 2 == 0}>
							{value}
						</div>
					{/each}
				{/each}
			</div>
			<div class="emojis">
				{#each msg_words_emoji[card_index].split('').map((c) => emoji_image_map[c] || c) as word}
					<img src={word} alt={word} style="width: 1em; height: 1em; margin-left: 0.2em;" />
				{/each}
			</div>
		</div>
	{/each}
</main>

<style lang="scss">
	main {
		display: grid;
		width: 100vw;
		height: 100vh;
		grid-template-columns: repeat(2, 1fr);
		grid-template-rows: repeat(4, 1fr);
		gap: 0;
		* {
			min-width: 0;
			min-height: 0;
			opacity: 1;
		}
		filter: grayscale(100%);
		background: transparent;
		&::before {
			content: '';
			position: absolute;
			inset: 0;
			z-index: -1;
			--pattern-size: 1rem;
			--bg-color: black;
			--max-dot-size: 4px;
			filter: contrast(21) brightness(200%);
			opacity: 0.1;
			background: 
			repeating-linear-gradient(
					45deg,
					#fff,
					#999,
					#fff 20%
				),
				radial-gradient(circle at 75% 75%, var(--bg-color) 0px, transparent var(--max-dot-size)) 0 /
					var(--pattern-size) var(--pattern-size),
				radial-gradient(circle at 25% 25%, var(--bg-color) 0px, transparent var(--max-dot-size)) 0 /
					var(--pattern-size) var(--pattern-size);
			background-blend-mode: multiply;
			background-color: white;
		}
	}
	#logo {
		height: 1em;
		scale: 1.4;
		display: inline-block;
		margin-right: .3em;
		/* height: 100%; */
		/* position: absolute; */
		left:0;
		top:-0.3rem;
		/* left:-1.3rem; */
		/* top:-1rem; */
		z-index:10;
	}
	.emojis {
		margin: 0;
		/* margin-top: 0.4rem; */
		font-size: 1rem;
		height: 0;
		position: absolute;
		left: 0;
		right: 0;
		/* display:none; */
		bottom: 1.5rem;
	}
	.cell.mark {
		background: #eee;
	}
	.card {
		--border: 0.5px solid #ccc;
		/* border: 0.5px solid #ccc; */
		width: 100%;
		padding: 0.1rem 1.7rem;
		text-align: center;
		height: 100%;
		border-bottom: var(--border);
		position: relative;
	}
	.card:nth-child(odd) {
		border-right: var(--border);
	}
	.card:nth-child(7),
	.card:nth-child(8) {
		border-bottom: none;
	}

	.table {
		--round: 1rem;
		--outline: 4px solid black;
		margin-top: 3.4rem;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0rem;
		height: 70%;
		/* outline: var(--outline); */
		border: var(--outline);
		border-radius: 0 0 var(--round) var(--round);
		position: relative;
		/* z-index: 2; */
		h2 {
			/* z-index: -1; */
			position: absolute;
			background: black;
			color: white;
			padding: 0.2rem;
			letter-spacing: 0.2rem;
			border-radius: var(--round) var(--round) 0 0;
			outline: var(--outline);
			/* border: var(--outline); */
			top: -4.3rem;
			left: 0;
			right: 0;
			font-size: 1.7rem;
			/* margin: 0.5rem; */
			font-weight: normal;
		}
	}
	.cell {
		/* border: 1px solid black; */
		/* aspect-ratio: 1 / 1; */
		z-index:3;
		display: grid;
		place-items: center;
		background: white;
		font-size: 1.4rem;
		display: grid;
		--adjusted-round: calc(var(--round) - 0.2rem);
		&:nth-child(22) {
			border-bottom-left-radius: var(--adjusted-round);
		}
		&:nth-child(26) {
			border-bottom-right-radius: var(--adjusted-round);
		}
	}
</style>
