import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../app.js';
import { createPage } from './helpers/fake-page.js';

// All vaults, files and hosts below are synthetic.
const PAGE = 'https://example.com/obsidian-open/';
const URI = 'obsidian://open?vault=Demo%20Vault&file=Inbox%2FPlan%20%26%20ideas';
const linkTo = (uri) => `${PAGE}#${encodeURIComponent(uri)}`;

// Starts the app on a fake page and records every navigation it requests,
// together with whether the fallback button was already usable at that moment.
function run(url, navigate = () => {}) {
  const page = createPage(url);
  const navigations = [];
  start({
    window: page.window,
    document: page.document,
    navigate(uri) {
      navigations.push({ uri, buttonVisible: page.isVisible('open-button') });
      navigate(uri);
    },
  });
  return { page, navigations };
}

test('valid link: shows the open button first, then automatically opens the exact URI once', () => {
  const { page, navigations } = run(linkTo(URI));
  assert.deepEqual(navigations, [{ uri: URI, buttonVisible: true }]);
  assert.deepEqual(page.state(),
    { pending: 'hidden', ready: 'visible', 'open-button': 'visible', error: 'hidden' });
});

test('the open button opens the exact URI when clicked', () => {
  const { page, navigations } = run(linkTo(URI));
  page.click('open-button');
  assert.deepEqual(navigations.map(({ uri }) => uri), [URI, URI]);
});

test('note data never reaches the DOM: the app only toggles visibility', () => {
  const { page } = run(linkTo(URI));
  const dom = page.domSnapshot();
  for (const secret of ['Demo', 'Inbox', 'Plan', 'obsidian', 'vault', 'file']) {
    assert.equal(dom.includes(secret), false, secret);
  }
});

test('bootstraps itself in a browser and makes the automatic attempt with location.assign', async () => {
  const page = createPage(linkTo(URI));
  globalThis.window = page.window;
  globalThis.document = page.document;
  try {
    await import('../app.js?bootstrap');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
  assert.deepEqual(page.assigned, [URI]);
  assert.equal(page.isVisible('open-button'), true);
});

const FAILED_CLOSED = { pending: 'hidden', ready: 'hidden', 'open-button': 'removed', error: 'visible' };

test('missing, empty or malformed fragment: no navigation, no open control, error shown', () => {
  for (const url of [
    PAGE,
    `${PAGE}#`,
    `${PAGE}#%E0%A4%A`,
    `${PAGE}#${URI}`, // the raw URI is not the encoded contract
  ]) {
    const { page, navigations } = run(url);
    assert.deepEqual(navigations, [], url);
    assert.deepEqual(page.state(), FAILED_CLOSED, url);
    assert.equal(page.document.getElementById('open-button'), null, url);
    assert.throws(() => page.click('open-button'), /not available/);
  }
});

test('a URI in the page query is ignored and a non-empty query fails closed', () => {
  for (const url of [
    `${PAGE}?uri=${encodeURIComponent(URI)}`,
    `${PAGE}?utm_source=x${linkTo(URI).slice(PAGE.length)}`,
  ]) {
    const { page, navigations } = run(url);
    assert.deepEqual(navigations, [], url);
    assert.deepEqual(page.state(), FAILED_CLOSED, url);
  }
});

const READY = { pending: 'hidden', ready: 'visible', 'open-button': 'visible', error: 'hidden' };

test('if the automatic attempt throws, the fallback button stays usable', () => {
  let attempts = 0;
  const { page, navigations } = run(linkTo(URI), () => {
    attempts += 1;
    if (attempts === 1) throw new Error('navigation blocked');
  });
  assert.deepEqual(page.state(), READY);
  page.click('open-button');
  assert.deepEqual(navigations.map(({ uri }) => uri), [URI, URI]);
});

test('a throwing click attempt is contained and the button remains for another try', () => {
  const { page, navigations } = run(linkTo(URI), () => {
    // Real browsers can put the target URL into such messages; it must not
    // escape as an uncaught error that would be printed to the console.
    throw new Error('navigation blocked');
  });
  assert.doesNotThrow(() => page.click('open-button'));
  assert.doesNotThrow(() => page.click('open-button'));
  assert.deepEqual(navigations.map(({ uri }) => uri), [URI, URI, URI]);
  assert.deepEqual(page.state(), READY);
});

test('executable or foreign targets never navigate and never get an open control', () => {
  for (const uri of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://example.com/',
    'obsidian://advanced-uri?vault=Demo&commandid=app%3Areload',
  ]) {
    const { page, navigations } = run(linkTo(uri));
    assert.deepEqual(navigations, [], uri);
    assert.deepEqual(page.state(), FAILED_CLOSED, uri);
  }
});

const OTHER = 'obsidian://open?vault=Demo%20Vault&file=Archive%2FOther';

test('a changed fragment removes the stale open control and reloads the page', () => {
  const { page, navigations } = run(linkTo(URI));
  page.changeHash(`#${encodeURIComponent(OTHER)}`);
  assert.equal(page.reloads, 1);
  assert.equal(page.document.getElementById('open-button'), null);
  assert.throws(() => page.click('open-button'), /not available/);
  assert.deepEqual(navigations.map(({ uri }) => uri), [URI]);
});

test('a changed fragment after a rejected link also reloads the page', () => {
  const { page, navigations } = run(PAGE);
  page.changeHash(`#${encodeURIComponent(URI)}`);
  assert.equal(page.reloads, 1);
  assert.deepEqual(navigations, []);
});
