import { escapeHtml } from '$lib/utils/escape.js';

/**
 * The HTML description of a calendar event.
 * @param {string} postPath absolute URL of the event page
 * @param {unknown} summary
 */
export function eventHtml(postPath, summary) {
	const link = escapeHtml(postPath);
	return `<!DOCTYPE html><html><body><p><a href="${link}">${link}</a></p><p>${escapeHtml(summary)}</p></body></html>`;
}
