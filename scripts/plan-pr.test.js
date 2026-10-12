import { describe, expect, it } from 'vitest';
import { checkPrBody, isBot, parsePlanLine } from './plan-pr.js';

const ids = new Set(['bot-busquedas-vacias', 'plan-unico', 'lanzamiento-mails']);
const human = { login: 'alguien', type: 'User' };
const pr = (body, user = human) => ({ number: 1, body, user });

describe('parsePlanLine', () => {
	it('reads one or several ids', () => {
		expect(parsePlanLine('Arregla algo.\n\nPlan: plan-unico')).toEqual(['plan-unico']);
		expect(parsePlanLine('Plan: plan-unico, bot-busquedas-vacias')).toEqual([
			'plan-unico',
			'bot-busquedas-vacias'
		]);
	});

	it('accepts lists, bold, any case, CRLF and comments in parentheses', () => {
		expect(parsePlanLine('- **Plan:** plan-unico')).toEqual(['plan-unico']);
		expect(parsePlanLine('intro\r\nplan: `plan-unico`\r\n')).toEqual(['plan-unico']);
		expect(parsePlanLine('Plan: ninguno (solo docs)')).toEqual(['ninguno']);
		expect(parsePlanLine('Plan: Ninguno.')).toEqual(['ninguno']);
	});

	it('returns null without a Plan: line, and does not match prose that only mentions a plan', () => {
		expect(parsePlanLine('')).toBeNull();
		expect(parsePlanLine(null)).toBeNull();
		expect(parsePlanLine('The plan: do things')).toBeNull();
		expect(parsePlanLine('Plan for this PR: none')).toBeNull();
	});
});

describe('isBot', () => {
	it('recognizes bot accounts', () => {
		expect(isBot({ login: 'dependabot[bot]', type: 'Bot' })).toBe(true);
		expect(isBot({ login: 'renovate[bot]' })).toBe(true);
		expect(isBot(human)).toBe(false);
		expect(isBot(undefined)).toBe(false);
	});
});

describe('checkPrBody', () => {
	it('passes with known ids or «ninguno»', () => {
		expect(checkPrBody(pr('Plan: plan-unico, lanzamiento-mails'), ids)).toEqual({
			skip: false,
			problems: []
		});
		expect(checkPrBody(pr('Plan: ninguno'), ids).problems).toEqual([]);
	});

	it('fails without a Plan: line, saying what to add', () => {
		const { problems } = checkPrBody(pr('Sin línea'), ids);
		expect(problems).toEqual([expect.stringMatching(/falta la línea «Plan:».*Plan: ninguno/)]);
		expect(checkPrBody(pr(null), ids).problems[0]).toMatch(/falta la línea/);
	});

	it('fails on an empty Plan: line', () => {
		expect(checkPrBody(pr('Plan:'), ids).problems[0]).toMatch(/está vacía/);
	});

	it('fails on ids that are not in the plan, naming them', () => {
		const { problems } = checkPrBody(pr('Plan: plan-unico, no-existe, otro'), ids);
		expect(problems).toEqual([
			expect.stringMatching(/no existen en docs\/plan.md: no-existe, otro/)
		]);
	});

	it('fails when «ninguno» comes with ids', () => {
		expect(checkPrBody(pr('Plan: ninguno, plan-unico'), ids).problems[0]).toMatch(/no lleva ids/);
	});

	it('skips bot authors', () => {
		expect(checkPrBody(pr('Bumps x', { login: 'dependabot[bot]', type: 'Bot' }), ids)).toEqual({
			skip: true,
			problems: []
		});
	});
});
