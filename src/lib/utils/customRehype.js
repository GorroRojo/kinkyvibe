import { SKIP, visit } from 'unist-util-visit';
import { headingRank } from 'hast-util-heading-rank';
import { hasProperty } from 'hast-util-has-property';
import { findAndReplace } from 'hast-util-find-and-replace';
import { h } from 'hastscript';

//<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
const linkIcon = {
	type: 'element',
	tagName: 'svg',
	properties: {
		xmlns: 'http://www.w3.org/2000/svg',
		width: '24',
		height: '24',
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': '2',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		class: 'lucide lucide-link'
	},
	children: [
		{
			type: 'element',
			tagName: 'path',
			properties: {
				d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'
			},
			children: []
		},
		{
			type: 'element',
			tagName: 'path',
			properties: {
				d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
			},
			children: []
		}
	]
};
/**
 * Plugin to add `id`s to headings: a «link to this section» anchor before each one. «Volver
 * arriba» is no longer one per heading (an extra Tab stop each): the pages put a single one at
 * the end of the text (VolverArriba.svelte).
 *
 * @type {import('unified').Plugin<[import('rehype-slug').Options?]|Array<void>, import('rehype-slug').Root>}
 */
export default function customRehype() {
	return (tree) => {
		// eslint-disable-next-line no-unused-vars
		visit(tree, 'element', (node, _index, _parent) => {
			// hast-util-heading-rank 3 tipa con @types/hast 3 y el resto del pipeline (rehype 12)
			// sigue en hast 2: el nodo es el mismo, solo difieren los tipos (en hast 2
			// `properties` es opcional). Mirar solo `tagName` no cambia entre versiones.
			if (headingRank(/** @type {any} */ (node)) && hasProperty(node, 'id')) {
				node.children.unshift({
					type: 'element',
					tagName: 'a',
					properties: {
						href: '#' + node.properties?.id,
						class: 'linktothis',
						'aria-label': 'Enlace a esta sección'
					},
					// @ts-ignore
					children: [linkIcon]
				});
				return [SKIP];
			}
		});
		let foundInParent = 0;
		/**
		 * @type {any}
		 */
		let prevParent;
		findAndReplace(tree, [
			[
				/\[([^\]:]+)( : [^\]]+)?\]/g,
				(original, link, lit, { stack }) => {
					const parent = stack[stack.length - 2];
					const index =
						parent.children.findIndex(
							(/**@type **/ c) => c?.value && c?.value?.includes(original)
						) - 1;
					if (prevParent !== parent) {
						foundInParent = 0;
						prevParent = parent;
					}
					const previous = parent.children[index + foundInParent];
					const next = parent.children[index + 2 + foundInParent];
					const lastCharOfPreviousNode = previous?.value?.slice(-1) ?? '';
					const firstCharOfNextNode = next?.value[0] ?? '';
					if (lastCharOfPreviousNode == '[' && firstCharOfNextNode == ']') {
						previous.value = previous.value.slice(0, -1);
						next.value = next.value.slice(1);
						return h(
							'a.wikilink',
							{
								href: '/wiki/' + link.trim().replaceAll(' ', '-').toLowerCase()
							},
							lit ? lit.slice(3) : link
						);
					} else {
						return original;
					}
				}
			],
			[
				// eslint-disable-next-line no-useless-escape
				/(?<![\w\d])(\\?)@([\p{L}\p{N}_.-]*[\p{L}\p{N}_])/gu,
				(_, escape, user, { stack }) => {
					if (escape) return '@' + user;
					// Don't nest a mention link inside an existing link: `<a>` inside `<a>` is invalid
					// HTML (Svelte 5 refuses to compile it) and browsers would split the outer link.
					if (stack.some((/** @type {any} */ node) => node.tagName === 'a')) return false;
					const href = '/amigues/' + user;
					return h('a.mention', { href }, '@' + user);
				}
			]
		]);
	};
}
