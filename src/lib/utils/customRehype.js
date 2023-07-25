import { SKIP, visit } from 'unist-util-visit';
import { headingRank } from 'hast-util-heading-rank';
import { hasProperty } from 'hast-util-has-property';


const cornerRightUp = {
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
					children: [{ type: 'text', value: Array(headingRank(node)).join('#') + '#' }]
				});
				node.children.push({
					type: 'element',
					tagName: 'a',
					properties: { href: '#title', class: 'backtotop' },
					children: [cornerRightUp]
				});
				return [SKIP];
			}
		});
	};
}
