import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');

test('page loads the app module and contains the controls it drives', () => {
  assert.match(html, /<script type="module" src="app\.js"><\/script>/);
  assert.match(html, /<p id="pending">/);
  assert.match(html,
    /<section id="ready" hidden>[\s\S]*?<button type="button" id="open-button">Открыть в Obsidian<\/button>[\s\S]*?<\/section>/);
});

test('page has a hidden error alert for links that cannot be opened', () => {
  assert.match(html, /<section id="error" role="alert" hidden>[\s\S]*?<\/section>/);
});

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'none'",
  "worker-src 'none'", // would otherwise fall back to script-src 'self'
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');

const indexOf = (pattern) => {
  const index = html.search(pattern);
  assert.notEqual(index, -1, `missing ${pattern}`);
  return index;
};

test('a restrictive CSP and no-referrer policy apply before anything is loaded', () => {
  assert.equal(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1], CSP);
  const firstResource = Math.min(indexOf(/<link\b/), indexOf(/<script\b/));
  assert.equal(indexOf(/^<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n/), 0);
  assert.ok(indexOf(/<meta http-equiv="Content-Security-Policy"/) < firstResource);
  assert.ok(indexOf(/<meta name="referrer" content="no-referrer">/) < firstResource);
  assert.ok(indexOf(/<meta name="robots" content="noindex, nofollow">/) < firstResource);
});

test('no inline code or style and no external or third-party resources', () => {
  assert.doesNotMatch(html, /<script\b(?![^>]*\ssrc=)/, 'inline script');
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]/, 'script content');
  assert.doesNotMatch(html, /<style\b|\sstyle=/i, 'inline style');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'inline event handler');
  assert.doesNotMatch(html, /javascript:|\/\//i, 'script URL or absolute/protocol-relative URL');
  const references = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(references.sort(), ['app.js', 'style.css']);
  assert.equal(html.match(/<link\b/g).length, 1);
  assert.match(html, /<link rel="stylesheet" href="style\.css">/);
});

test('no hyperlinks at all: the note URI can never end up in an href', () => {
  assert.doesNotMatch(html, /<(?:a|area|form|iframe|frame|img|object|embed|base)\b/i);
});

test('scripts use no network, storage, logging, dynamic code or DOM-writing APIs', () => {
  const forbidden = [
    /\bfetch\b/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /\bimport\s*\(/,
    /localStorage|sessionStorage|indexedDB|\bcaches\b|serviceWorker|cookie/,
    /\bconsole\b/,
    /\beval\b|\bFunction\s*\(|setTimeout|setInterval/,
    /innerHTML|outerHTML|insertAdjacentHTML|document\.write|textContent|innerText|setAttribute|dataset/,
    /\.(?:href|src)\b/,
    /\bhistory\b|\bnavigator\b|postMessage|\.open\s*\(/,
    /https?:/,
  ];
  const imports = (source) => [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
  for (const file of ['app.js', 'obsidian-link.js']) {
    const source = read(file);
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
  assert.deepEqual(imports(read('app.js')), ['./obsidian-link.js']);
  assert.deepEqual(imports(read('obsidian-link.js')), []);
});

test('the stylesheet loads nothing', () => {
  assert.doesNotMatch(read('style.css'), /url\(|@import|\/\//i);
});

test('the published root holds only the site files and the known development files', () => {
  // GitHub Pages publishes the repository root: anything added here becomes public.
  const entries = readdirSync(new URL('../', import.meta.url)).filter((name) => name !== '.git').sort();
  assert.deepEqual(entries, [
    '.nojekyll', 'README.md', 'app.js', 'index.html', 'obsidian-link.js', 'package.json', 'style.css', 'test',
  ]);
});

const section = (id) => new RegExp(`<section id="${id}"[^>]*>([\\s\\S]*?)</section>`).exec(html)?.[1] ?? '';

test('Russian, mobile-friendly document that keeps zoom available', () => {
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.doesNotMatch(html, /user-scalable|maximum-scale/);
  assert.match(html, /<title>Открыть заметку в Obsidian<\/title>/);
  assert.match(html, /<h1>Открыть заметку в Obsidian<\/h1>/);
  assert.match(html, /<noscript><p>[^<]*JavaScript[^<]*<\/p><\/noscript>/);
});

test('ready state explains the fallback and gives iOS Safari and Telegram guidance', () => {
  const ready = section('ready');
  assert.match(ready, /<button type="button" id="open-button">Открыть в Obsidian<\/button>/);
  assert.match(ready, /нажмите кнопку/);
  assert.match(ready, /iPhone[^<]*Safari[^<]*«Открыть»/);
  assert.match(ready, /Telegram[^<]*встроенный браузер[^<]*Safari[^<]*ещё раз/);
});

test('the error state offers no way to open anything', () => {
  assert.match(section('error'), /Ссылка/);
  assert.doesNotMatch(section('error'), /<button|<a\b/);
});

test('wording is generic: no vault or file terms, no placeholders for note data', () => {
  assert.doesNotMatch(html, /vault|file|хранилищ|файл|\{\{|\$\{/i);
});

test('styles keep hidden states hidden, touch targets large and focus visible', () => {
  const css = read('style.css');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  const [, value, unit] = /#open-button\s*\{[^}]*min-height:\s*([\d.]+)(rem|px)/.exec(css) ?? [];
  assert.ok(Number(value) * (unit === 'rem' ? 16 : 1) >= 44, 'touch target of at least 44px');
  assert.match(css, /#open-button:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
});
