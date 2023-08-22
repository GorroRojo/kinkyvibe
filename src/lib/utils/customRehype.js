import { SKIP, visit } from 'unist-util-visit';
import { headingRank } from 'hast-util-heading-rank';
import { hasProperty } from 'hast-util-has-property';
import { findAndReplace } from 'hast-util-find-and-replace';
import { h } from 'hastscript';

const cornerRightUpIcon = {
	// <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-corner-right-up">
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
		class: 'lucide lucide-corner-right-up'
	},
	children: [
		// <polyline points="10 9 15 4 20 9"/>
		{
			type: 'element',
			tagName: 'polyline',
			properties: {
				points: '10 9 15 4 20 9'
			},
			children: []
		},
		// <path d="M4 20h7a4 4 0 0 0 4-4V4"/>
		{
			type: 'element',
			tagName: 'path',
			properties: {
				d: 'M4 20h7a4 4 0 0 0 4-4V4'
			},
			children: []
		}
	]
};
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
 * Plugin to add `id`s to headings.
 *
 * @type {import('unified').Plugin<[import('rehype-slug').Options?]|Array<void>, import('rehype-slug').Root>}
 */
export default function customRehype() {
	return (tree) => {
		// eslint-disable-next-line no-unused-vars
		visit(tree, 'element', (node, _index, _parent) => {
			if (headingRank(node) && hasProperty(node, 'id')) {
				node.children.unshift({
					type: 'element',
					tagName: 'a',
					properties: { href: '#' + node.properties?.id, class: 'linktothis' },
					// @ts-ignore
					children: [linkIcon]
				});
				node.children.push({
					type: 'element',
					tagName: 'a',
					properties: { href: '#title', class: 'backtotop' },
					// @ts-ignore
					children: [cornerRightUpIcon]
				});
				return [SKIP];
			}
		});
		// visit(tree, 'text', (node, index, parent) => {
		// 	if (
		// 		!node.value ||
		// 		!parent ||
		// 		!index ||
		// 		typeof node.value !== 'string' ||
		// 		!node.value.includes('[')
		// 	)
		// 		return [CONTINUE];
		// 	console.log(typeof node.value !== 'string');
		// 	// console.log(node.value);
		// 	const regex = /\[\[([^\]]*)\]\]/g;
		// 	const pieces = node.value.split('[');
		// 	console.log(node.value.trim());
		// 	console.log(
		// 		parent.children.reduce((/**@type string*/ acc, /**@type Node*/ n) => acc + n.value, '')
		// 	);
		// 	if (pieces.length == 1) return [SKIP];
		// 	// node.value = pieces.join(' °°°° ');
		// 	// .map((piece, index) => (index % 2 == 0 ? piece : '<a>' + piece + '</a>'))
		// 	// .join('');
		// 	return [SKIP];
		// 	// : h('a', { href: '/wiki/' + piece.replaceAll(' ', '-') }, piece)
		// 	// // @ts-expect-error
		// 	// parent.children.splice(index, 1, insert);
		// });
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
					// console.log({
					// 	original,
					// 	link,
					// 	lit,
					// 	previous: previous,
					// 	next: next,
					// 	foundInParent,
					// 	index,
					// 	c: { lastCharOfPreviousNode, firstCharOfNextNode }
					// });
					// console.log(parent.children);
					if (lastCharOfPreviousNode == '[' && firstCharOfNextNode == ']') {
						// console.log('wrap detected!');
						// foundInParent++;
						previous.value = previous.value.slice(0, -1);
						next.value = next.value.slice(1);
						return h(
							'a.wikilink',
							{
								href: '/wiki/' + link.trim().replaceAll(' ', '-')
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
				/(?<![\w\d])(\\?)@(\S+)/g,
				(_, escape, user) => {
					// const parent = stack[stack.length - 2];
					// parent.children[index].value = parent.children[index].value + space;
					if (escape) return '@' + user;
					return h('a.mention', { href: '/' + user }, '@' + user);
				}
			]
		]);
		// /**@type Node*/ h('a', { href: '/wiki/' + value.replaceAll(' ', '-'), children: value })
		// (/**@type string */ value) =>
	};
}
