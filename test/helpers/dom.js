import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

/** Loads a synthetic HTML fixture. These files are not captures of live pages. */
export function loadFixture(name, url) {
  const html = readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  return new JSDOM(html, { url }).window.document;
}
