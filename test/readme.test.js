import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readObsidianUri } from '../obsidian-link.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('README examples follow the link contract and are accepted by the page', () => {
  const examples = [...readme.matchAll(
    /^Vault: +(.+)\nFile: +(.+)\nObsidian URI: +(\S+)\nPage link: +(\S+)$/gm,
  )];
  assert.ok(examples.length >= 2, 'expected at least two documented examples');
  for (const [, vault, file, uri, pageLink] of examples) {
    assert.equal(uri, `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`);
    const link = new URL(pageLink);
    assert.equal(link.search, '');
    assert.equal(pageLink, `${link.origin}${link.pathname}#${encodeURIComponent(uri)}`);
    assert.equal(readObsidianUri(link), uri);
  }
});
