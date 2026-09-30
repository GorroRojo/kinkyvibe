import { describe, expect, it } from 'vitest';
import {
	SHEET_CLOSE_MAX,
	SHEET_CLOSE_MIN,
	sheetCloseDistance,
	sheetDragOffset,
	shouldCloseSheet
} from './sheetDrag.js';

describe('sheetDragOffset', () => {
	it('sigue al dedo hacia abajo', () => {
		expect(sheetDragOffset(100, 180)).toBe(80);
	});
	it('hacia arriba no se mueve', () => {
		expect(sheetDragOffset(100, 40)).toBe(0);
		expect(sheetDragOffset(100, 100)).toBe(0);
	});
	it('ignora valores raros', () => {
		expect(sheetDragOffset(NaN, 10)).toBe(0);
	});
});

describe('sheetCloseDistance', () => {
	it('es un cuarto de la altura', () => {
		expect(sheetCloseDistance(400)).toBe(100);
	});
	it('tiene mínimo y máximo', () => {
		expect(sheetCloseDistance(100)).toBe(SHEET_CLOSE_MIN);
		expect(sheetCloseDistance(0)).toBe(SHEET_CLOSE_MIN);
		expect(sheetCloseDistance(2000)).toBe(SHEET_CLOSE_MAX);
	});
});

describe('shouldCloseSheet', () => {
	it('cierra si se arrastró lo suficiente', () => {
		expect(shouldCloseSheet({ offset: 100, height: 400 })).toBe(true);
		expect(shouldCloseSheet({ offset: 170, height: 800 })).toBe(true);
	});
	it('vuelve a su lugar si no llegó', () => {
		expect(shouldCloseSheet({ offset: 99, height: 400 })).toBe(false);
		expect(shouldCloseSheet({ offset: 0, velocity: 3, height: 400 })).toBe(false);
	});
	it('un tirón rápido cierra aunque sea corto', () => {
		expect(shouldCloseSheet({ offset: 30, velocity: 0.8, height: 600 })).toBe(true);
	});
	it('un tirón rápido pero mínimo (casi un toque) no cierra', () => {
		expect(shouldCloseSheet({ offset: 10, velocity: 2, height: 600 })).toBe(false);
	});
	it('un movimiento lento y corto no cierra', () => {
		expect(shouldCloseSheet({ offset: 40, velocity: 0.1, height: 600 })).toBe(false);
	});
});
