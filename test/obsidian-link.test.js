import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readObsidianUri } from '../obsidian-link.js';

// All vaults, files and hosts below are synthetic.
const PAGE = 'https://example.com/obsidian-open/';
const openUri = (vault, file) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
const linkTo = (uri) => `${PAGE}#${encodeURIComponent(uri)}`;
// Reads a page URL the way a browser exposes it to the page script.
const read = (url) => {
  const { hash, search } = new URL(url);
  return readObsidianUri({ hash, search });
};

test('returns the original Obsidian URI byte-for-byte for canonical links', () => {
  const notes = [
    ['Demo Vault', 'Inbox/Plan & ideas'],
    ['Пример', 'Заметки/Привет, мир'],
    ['Demo', 'Budget 100%'],
    ['Demo', '50% off/Q1 = 100'],
    ['Demo', 'Идеи 💡'],
    ['Demo', 'C++ notes (draft) #1'],
    ['Demo', "It's a=b&c=d?"],
    ['デモ', '日本語/メモ'],
    ['Demo', 'v1.2/notes.md'],
  ];
  for (const [vault, file] of notes) {
    const uri = openUri(vault, file);
    assert.equal(read(linkTo(uri)), uri, `${vault} | ${file}`);
  }
});

const URI = openUri('Demo Vault', 'Inbox/Plan & ideas');

test('missing or empty fragment is rejected', () => {
  assert.equal(read(PAGE), null);
  assert.equal(read(`${PAGE}#`), null);
  assert.equal(readObsidianUri({ hash: '#', search: '' }), null);
});

test('malformed percent-encoding or invalid UTF-8 in the fragment is rejected', () => {
  const encoded = encodeURIComponent(URI);
  for (const fragment of [
    '%', '%4', '%zz', `${encoded}%`, `${encoded}%2`, `%${encoded}`,
    `${encoded}%C3%28`, // invalid continuation byte
    `${encoded}%C0%AF`, // overlong "/"
    `${encoded}%ED%A0%80`, // UTF-16 surrogate
    `${encoded}%FF`,
    `${encoded}%E2%82`, // truncated sequence
  ]) {
    assert.equal(read(`${PAGE}#${fragment}`), null, fragment);
  }
});

test('the fragment must be exactly encodeURIComponent of the URI, nothing else', () => {
  const encoded = encodeURIComponent(URI);
  for (const fragment of [
    URI, // not encoded at all
    encoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase()),
    encoded.replace('open', '%6Fpen'), // needless escape of an unreserved character
    `${encoded}#extra`,
    `${encoded}!#`,
  ]) {
    assert.equal(read(`${PAGE}#${fragment}`), null, fragment);
  }
  // Raw characters a browser would never leave unencoded are rejected too.
  for (const raw of ['Пример', ' ', '\n', '"', '<']) {
    assert.equal(readObsidianUri({ hash: `#${encoded}${raw}`, search: '' }), null, JSON.stringify(raw));
  }
});

test('the page query is never an input: any non-empty query is rejected', () => {
  const fragment = encodeURIComponent(URI);
  for (const url of [
    `${PAGE}?uri=${fragment}`,
    `${PAGE}?${fragment}`,
    `${PAGE}?x=1#${fragment}`,
    `${PAGE}?uri=${fragment}#${fragment}`,
  ]) {
    assert.equal(read(url), null, url);
  }
  // A bare "?" is an empty query; browsers expose it as search === ''.
  assert.equal(read(`${PAGE}?#${fragment}`), URI);
});

const rejectsAll = (uris) => {
  for (const uri of uris) assert.equal(read(linkTo(uri)), null, JSON.stringify(uri));
};

test('other schemes are rejected, including executable ones', () => {
  rejectsAll([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    'javascript://obsidian://open?vault=Demo&file=Note%0Aalert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'https://example.com/?vault=Demo&file=Note',
    'http://example.com/',
    'file:///etc/passwd',
    'intent://open?vault=Demo&file=Note#Intent;scheme=obsidian;end',
    'obsidian-evil://open?vault=Demo&file=Note',
    'xobsidian://open?vault=Demo&file=Note',
    'OBSIDIAN://open?vault=Demo&file=Note',
    'Obsidian://open?vault=Demo&file=Note',
  ]);
});

test('only the open action is accepted', () => {
  rejectsAll([
    'obsidian://new?vault=Demo&file=Note',
    'obsidian://new?vault=Demo&file=Note&content=x',
    'obsidian://search?vault=Demo&query=x',
    'obsidian://advanced-uri?vault=Demo&commandid=app%3Areload',
    'obsidian://adv-uri?vault=Demo&commandid=app%3Areload',
    'obsidian://daily?vault=Demo',
    'obsidian://choose-vault',
    'obsidian://hook-get-address',
    'obsidian://show-plugin?id=demo',
    'obsidian://OPEN?vault=Demo&file=Note',
    'obsidian://openx?vault=Demo&file=Note',
    'obsidian://open-anything?vault=Demo&file=Note',
  ]);
});

test('credentials, ports, paths and other authority forms are rejected', () => {
  rejectsAll([
    'obsidian://user@open?vault=Demo&file=Note',
    'obsidian://user:secret@open?vault=Demo&file=Note',
    'obsidian://open:443?vault=Demo&file=Note',
    'obsidian://open/?vault=Demo&file=Note',
    'obsidian://open/extra?vault=Demo&file=Note',
    'obsidian:///open?vault=Demo&file=Note',
    'obsidian:open?vault=Demo&file=Note',
    'obsidian:/open?vault=Demo&file=Note',
    'obsidian://open.?vault=Demo&file=Note',
    'obsidian://open%3Fvault=Demo&file=Note',
    'obsidian://evil.example/open?vault=Demo&file=Note',
  ]);
});

test('exactly one vault and one file, in canonical order, and nothing else', () => {
  rejectsAll([
    'obsidian://open?',
    'obsidian://open?vault=Demo',
    'obsidian://open?file=Note',
    'obsidian://open?file=Note&vault=Demo',
    'obsidian://open?vault=Demo&vault=Other&file=Note',
    'obsidian://open?vault=Demo&file=Note&file=Other',
    'obsidian://open?vault=&file=Note',
    'obsidian://open?vault=Demo&file=',
    'obsidian://open?vault&file=Note',
    'obsidian://open?vault=Demo&file=Note&',
    'obsidian://open?&vault=Demo&file=Note',
    'obsidian://open?vault=Demo&&file=Note',
    'obsidian://open?vault=Demo;file=Note',
    'obsidian://open?vault=Demo&file=Note#heading',
    'obsidian://open?path=%2Fhome%2Fdemo%2FNote.md',
    'obsidian://open?vault=Demo&path=Note',
  ]);
});

test('unknown parameters are rejected wherever they appear', () => {
  for (const extra of [
    'append=x', 'prepend=x', 'content=x', 'new=true', 'overwrite=true', 'silent=true',
    'line=1', 'paneType=window', 'x-success=https%3A%2F%2Fexample.com',
  ]) {
    rejectsAll([
      `obsidian://open?vault=Demo&file=Note&${extra}`,
      `obsidian://open?${extra}&vault=Demo&file=Note`,
      `obsidian://open?vault=Demo&${extra}&file=Note`,
    ]);
  }
});

test('percent-encoded parameter names or separators never form parameters', () => {
  rejectsAll([
    'obsidian://open?%76ault=Demo&file=Note',
    'obsidian://open?vault=Demo&%66ile=Note',
    'obsidian://open?vault%3DDemo&file=Note',
    'obsidian://open?vault=Demo%26file%3DNote',
  ]);
  // Encoded separators inside a value are data, not structure.
  const uri = openUri('a&file=b', 'c&vault=d');
  assert.equal(read(linkTo(uri)), uri);
});

const rejectsInBothValues = (values) => {
  for (const value of values) {
    rejectsAll([
      `obsidian://open?vault=${value}&file=Note`,
      `obsidian://open?vault=Demo&file=${value}`,
    ]);
  }
};

test('vault and file values must be exactly encodeURIComponent output', () => {
  rejectsInBothValues([
    'Demo Note', // raw space
    'C++', // raw "+": form decoders would read spaces
    'Inbox%2fNote', // lowercase hex
    'N%6Fte', // needless escape
    'Note%', 'Note%2', 'Note%GZ', // malformed escapes
    'Inbox/Note', 'Note:1', 'Note?x', 'a=b', 'user@host', 'a,b', 'a;b', 'a$b',
    'Заметка', // raw non-ASCII
    'Note%C3%28', // invalid UTF-8
    'Note%C0%AF', // overlong "/"
    'Note%ED%A0%80', // UTF-16 surrogate
  ]);
});

const codePoint = (char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

test('control and newline characters are rejected at every decoding layer', () => {
  const controls = [
    '\u0000', '\t', '\n', '\r', '\u001F', '\u007F', '\u0085', '\u009F', // C0, DEL, NEL, C1
    '\u2028', '\u2029', // line and paragraph separators
    '\u202A', '\u202E', '\u2066', '\u2069', // bidi embedding/override/isolate controls
  ];
  for (const control of controls) {
    const label = codePoint(control);
    // Decoded vault and file names (what Obsidian receives after its one decode).
    assert.equal(read(linkTo(openUri(`Demo${control}`, 'Note'))), null, `vault ${label}`);
    assert.equal(read(linkTo(openUri('Demo', `Inbox/No${control}te`))), null, `file ${label}`);
    // Raw inside the Obsidian URI.
    assert.equal(read(linkTo(`obsidian://open?vault=Demo&file=No${control}te`)), null, `uri ${label}`);
    // Raw inside the page fragment.
    assert.equal(readObsidianUri({ hash: `#${encodeURIComponent(URI)}${control}`, search: '' }), null,
      `fragment ${label}`);
  }
  // Joiners used by emoji and Persian text are ordinary characters, not controls.
  for (const file of ['👩‍💻 notes', 'می‌خواهم']) {
    const uri = openUri('Demo', file);
    assert.equal(read(linkTo(uri)), uri, file);
  }
});

test('names that a second decode would still change are rejected; plain "%" is kept', () => {
  // After the one intended decode these names still contain escapes that a
  // mistaken second decode would turn into "/", "..", "\", NUL, newline, ...
  for (const name of [
    'a%2Fb', 'a%2fb', '%2E%2E%2Fsecret', 'a%5Cb', 'a%00b', 'a%0Ab', 'a%250Ab', 'a%25', 'a%20b',
    'a%u002Fb', 'a%U002Fb', // legacy %uXXXX, as understood by unescape()
  ]) {
    assert.equal(read(linkTo(openUri(name, 'Note'))), null, `vault ${name}`);
    assert.equal(read(linkTo(openUri('Demo', `Inbox/${name}`))), null, `file ${name}`);
  }
  for (const file of ['100%', '50% off', '%', '%%', 'x%y', '%G1', 'a%u12']) {
    const uri = openUri('Demo', file);
    assert.equal(read(linkTo(uri)), uri, file);
  }
});

test('unsafe file paths are rejected', () => {
  for (const file of [
    '.', '..', '...', '../Note', 'Inbox/../Note', 'Inbox/..', './Note', 'Inbox/./Note',
    '.obsidian/app.json', '.hidden', 'Inbox/.trash/Note', // dot-prefixed (hidden) names
    '/Note', '/etc/passwd', 'Inbox//Note', 'Inbox/', // absolute paths, empty segments
    'C:/Note', 'C:Note', 'c:\\Note', 'Inbox\\Note', '\\\\server\\share\\Note', '..\\Note',
    'Note:stream', // NTFS alternate data stream
  ]) {
    assert.equal(read(linkTo(openUri('Demo', file))), null, file);
  }
});

test('the vault must be a single plain name', () => {
  for (const vault of ['.', '..', '.hidden', 'Demo/Sub', '/Demo', 'Demo\\Sub', 'C:', 'C:Demo']) {
    assert.equal(read(linkTo(openUri(vault, 'Note'))), null, vault);
  }
});

test('dots inside names are fine', () => {
  for (const [vault, file] of [
    ['Demo.v2', 'a.b/c.d'],
    ['Demo', 'notes/2024.01.01 Meeting'],
    ['Demo', 'v1..2/Note..md'],
    ['Demo', 'Папка/Подпапка/Заметка'],
  ]) {
    const uri = openUri(vault, file);
    assert.equal(read(linkTo(uri)), uri, `${vault} | ${file}`);
  }
});

const accepted = (vault, file) => read(linkTo(openUri(vault, file))) === openUri(vault, file);

test('a vault or path name is limited to 255 characters', () => {
  assert.equal(accepted('v'.repeat(255), 'Note'), true);
  assert.equal(accepted('v'.repeat(256), 'Note'), false);
  assert.equal(accepted('Demo', `Inbox/${'n'.repeat(255)}`), true);
  assert.equal(accepted('Demo', `Inbox/${'n'.repeat(256)}`), false);
});

test('a file path is limited to 1024 characters and 32 levels', () => {
  const path = (lastLength) => [...Array(5).fill('f'.repeat(200)), 'x'.repeat(lastLength)].join('/');
  assert.equal(path(19).length, 1024);
  assert.equal(accepted('Demo', path(19)), true);
  assert.equal(accepted('Demo', path(20)), false);
  const deep = (levels) => Array(levels).fill('d').join('/');
  assert.equal(accepted('Demo', deep(32)), true);
  assert.equal(accepted('Demo', deep(33)), false);
});

test('the Obsidian URI is limited to 4096 characters', () => {
  // Multi-byte names make a long URI while every name and the path stay in limits.
  const head = `${Array(3).fill('あ'.repeat(150)).join('/')}/`;
  const file = (uriLength) => head + 'a'.repeat(uriLength - openUri('V', head).length);
  assert.equal(openUri('V', file(4096)).length, 4096);
  assert.equal(accepted('V', file(4096)), true);
  assert.equal(accepted('V', file(4097)), false);
});

test('a fragment longer than any valid link is rejected before decoding', () => {
  // "#" plus a 4096-character URI with every character percent-encoded.
  const maxHash = 1 + 3 * 4096;
  const decode = globalThis.decodeURIComponent;
  let decodes = 0;
  globalThis.decodeURIComponent = (value) => {
    decodes += 1;
    return decode(value);
  };
  try {
    assert.equal(readObsidianUri({ hash: `#${'a'.repeat(maxHash)}`, search: '' }), null);
    assert.equal(decodes, 0, 'an oversized fragment must not be decoded');
    // At exactly the bound the fragment is still decoded, then validated as usual.
    assert.equal(readObsidianUri({ hash: `#${'a'.repeat(maxHash - 1)}`, search: '' }), null);
    assert.ok(decodes > 0, 'a fragment at the bound is decoded');
  } finally {
    globalThis.decodeURIComponent = decode;
  }
});
