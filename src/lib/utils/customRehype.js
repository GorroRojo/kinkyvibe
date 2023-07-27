import { SKIP, visit } from 'unist-util-visit';
import { headingRank } from 'hast-util-heading-rank';
import { hasProperty } from 'hast-util-has-property';

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
export default function customRehype(options = {}) {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (headingRank(node) && hasProperty(node, 'id')) {
				node.children.unshift({
					type: 'element',
					tagName: 'a',
					properties: { href: '#' + node.properties?.id, class: 'linktothis' },
					children: [linkIcon]
				});
				node.children.push({
					type: 'element',
					tagName: 'a',
					properties: { href: '#title', class: 'backtotop' },
					children: [cornerRightUpIcon]
				});
				return [SKIP];
			}
		});
	};
}
