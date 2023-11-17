<script>
	// @ts-nocheck
	import { format } from 'date-fns';
	import es from 'date-fns/locale/es';
	import { cubicInOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	/**@type {{path: string, meta: AnyPostData}[]}*/
	export let posts;
	let index = 0;
	$: post = posts[index];
	const defaultCombos = [
		['var(--1)', 'white'],
		['var(--2)', 'white'],
		['var(--3)', 'white']
	];
	let currDefaultCombo = 0;
	$: slideColors = posts.map((p) => {
		if (p.meta.carrousel_background) {
			return [
				p.meta.carrousel_background,
				p.meta.carrousel_color ?? 'white',
				p.meta.carrousel_accent_text ?? p.meta.carrousel_color ?? 'white',
				p.meta.carrousel_accent_bg ?? p.meta.carrousel_background
			];
		} else {
			currDefaultCombo = currDefaultCombo == defaultCombos.length - 1 ? 0 : currDefaultCombo + 1;
			// alert(defaultCombos[currDefaultCombo])
			return defaultCombos[currDefaultCombo];
		}
	});
	$: currBackground = slideColors[index][0];
	$: currColor = slideColors[index][1];
	$: currAccent = slideColors[index]?.[2] ?? currColor ?? 'white';
	$: currAccentBg = slideColors[index]?.[3] ?? currBackground;
	/**
	 * @param {HTMLElement} node
	 * @param {{ delay?: number, duration?: number, easing?: (t: number) => number }} params
	 * @param {{direction: 'in'|'out'|'both'}} options
	 * @return {{ delay?: number, duration?: number, easing?: (t: number) => number, css?: (t: number, u: number) => string, tick?: (t: number, u: number) => void }}
	 */
	function spin(node, params, { direction }) {
		const existingTransform = getComputedStyle(node).transform.replace('none', '');
		const d = direction === 'in' ? 1 : -1;
		return {
			delay: params.delay || 0,
			duration: params.duration || 400,
			easing: params.easing || cubicInOut,
			css: (t, u) => `
				transform: ${existingTransform} rotate(${-d * u * 360}deg);
				opacity: ${t};
			`
		};
	}
	let clicked = false;
	let autoslide = setInterval(() => {
		if (clicked) {
			clearInterval(autoslide);
		} else {
			index != posts.length - 1 ? index++ : (index = 0);
		}
	}, 10000);
</script>
<div
	id="carrousel"
	style:--currBackground={currBackground}
	style:--currColor={currColor}
	style:--currAccent={currAccent}
	style:--currAccentBg={currAccentBg}
	out:fade
>
	<button
		on:click={() => {
			index != 0 ? index-- : (index = posts.length - 1);
			clicked = true;
		}}>&lt;</button
	>
	{#key index}
		<div class="slide">
            <div class="img-wrapper">
                <img
                    in:spin={{ duration: 1500 }}
                    out:spin={{ duration: 1500 }}
                    src={(post.meta.logo ?? post.meta.featured) + ''}
                    alt=""
                />
            </div>
			<div class="details" in:fade={{ delay: 1100 }} out:fade>
				<h2>
					{format(new Date(post.meta.start), 'EEEE dd', { locale: es })} - {@html (
						post.meta.location_name ?? 'Online'
					).replaceAll(' ', '&nbsp;')}
				</h2>
				<p>{post.meta.summary}</p>
				<a href={post.path}>Saber más</a>
			</div>
		</div>
	{/key}
	<button
		on:click={() => {
			index != posts.length - 1 ? index++ : (index = 0);
			clicked = true;
		}}>&gt;</button
	>
</div>

<style>
	#carrousel {
		color: var(--currColor);
		height: 20rem;
		min-height: fit-content;
		display: flex;
		overflow: visible;
		max-width: 100vw;
		padding: 0;
		margin: 0;
		position: relative;
		margin-bottom: 3em;
		transition: 1500ms;
		/* z-index: -2; */
	}
	#carrousel::before,
	#carrousel::after {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		display: block;
		content: ' ';
		pointer-events: none;
	}
	#carrousel::before {
		z-index: -2;
		background-color: var(--currBackground);
		transition: 1000ms;
	}
	#carrousel::after {
		z-index: -1;
		background: linear-gradient(
			to right,
			transparent,
			color-mix(in srgb, transparent 70%, black) 100%
		);
	}
	.slide {
		/* display: flex; */
		gap: 4em;
        display: grid;
		align-items: center;
        grid-template-columns: min(20em,40%) auto;

		height: 100%;
		min-height: 0;
		max-height: 100%;

		width: 90rem;
		max-width: 100vw;
		min-width: 0;
		padding: 0;
		margin: 0 auto;

		position: absolute;
		left: 3em;
		right: 3em;

		font-size: var(--step-1);
	}
	.details {
		/* color: var(--currColor); */
		/* text-shadow: 0 0 1em black; */
		/* max-height: 100%; */
		max-width: 100%;
		min-width: 0;
		margin-right: 7em;
		width: auto;
		z-index: 1;
		max-height: 100%;
	}
	h2 {
		text-transform: uppercase;
		margin-block: 0;
		font-size: var(--step-0);
	}
	p {
		margin-block: 0;
		text-overflow: ellipsis;
		/* white-space: pre-wrap; */
		max-height: 20%;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}
	.details a {
		background: var(--currAccentBg);
		color: var(--currAccent);
		padding: 0.3em 0.6em;
		display: block;
		text-align: center;
		max-width: max-content;
		margin-left: auto;
		margin-top: 0.2em;
		scale: 1;
		transition: background 1000ms 1000ms, color 1000ms 100ms, scale 200ms;
		text-decoration: none;
		border-radius: 0.3em;
	}
	.details a:hover {
		color: var(--currAccent);
		scale: 1.1;
	}
	button {
		position: absolute;
		top: 0;
		bottom: 0;
		z-index: 1;
		background: color-mix(in srgb, var(--currBackground) 70%, white);
		outline: 0;
		border: 0;
		color: var(--currColor);
		width: 3rem;
		transition: 1000ms;
		/* pointer-events: all; */
		/* cursor: pointer; */
	}
	button:first-child {
		left: 0;
	}
	button:last-child {
		right: 0;
	}
    .img-wrapper {
        max-height: 100%;
        min-width: 0;
        min-height: 0;
        height: 100%;
        /* width: 40em; */
        display: flex;
        justify-content: center;
    }
	img {
        padding: 0;
        margin: 0;
        scale: 1.1;
        /* box-shadow: 0 0 0.1em var(--currBackground); */
        border-radius: 0.3em;
        z-index: 2;
        transition: 1000ms;
        max-width: 100%;
        min-height: 0;
        max-height: 100%;
        object-fit: contain;
	}
    @media (max-width: 900px) {
        #carrousel {
            height: 40rem;
        }
        .slide {
            grid-template-columns: 1fr;
            width: 100%;
            max-width: 100%;
            left: 0;
            padding-inline: 2.5em;
        }
        .img-wrapper {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            height: 20rem;
        }
        .details {
            margin-right: 0;
        }
        img {
            pointer-events: none;
        }
    }
</style>
