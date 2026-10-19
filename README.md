# obsidian-open

A minimal static HTTPS landing page that opens one Obsidian note from a link.
Russian UI, vanilla HTML/CSS/JS, no dependencies, no build step.

**Deployment target:** `https://kosyachniy.github.io/obsidian-open/`
(GitHub Pages, branch `main`, root `/`). See the repository's Pages status for the current deployment.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | The page (Russian UI, CSP and referrer policy in `<meta>`) |
| `style.css` | Styles (external file; no inline styles) |
| `app.js` | Page controller: renders a state, makes the automatic attempt, wires the button |
| `obsidian-link.js` | Fragment validator; the only place that interprets input |
| `.nojekyll` | Disables Jekyll processing on GitHub Pages |
| `test/*.test.js` | `node:test` suites (validator, controller, static page contract, README examples) |
| `test/helpers/fake-page.js` | Sealed fake DOM used by the controller tests |
| `package.json` | `"type": "module"` and the test script; no dependencies, `private` |

GitHub Pages publishes the repository root, so once deployed **every file above
is public**, including the tests, README and `package.json`. They contain only
synthetic data. The page itself loads only `index.html`, `style.css`, `app.js`
and `obsidian-link.js`. A test pins the root to exactly these files plus
`.nojekyll`, `README.md`, `package.json` and `test/`.

## Link contract

The link is the page URL followed by `#` and `encodeURIComponent` of the
**full** Obsidian URI. The Obsidian URI itself must be exactly:

```js
const obsidianUri = 'obsidian://open?vault=' + encodeURIComponent(vault)
  + '&file=' + encodeURIComponent(file);
const pageLink = PAGE_URL + '#' + encodeURIComponent(obsidianUri);
```

- `PAGE_URL` is the published page URL without a query or fragment. The
  deployment target is `https://kosyachniy.github.io/obsidian-open/`.
- `vault` is the vault name. `file` is the vault-relative note path, as you
  would pass it to Obsidian's `open` action (usually without `.md`).
- `vault` comes first, then `file`, and there are no other parameters.
  Obsidian URIs copied from elsewhere are accepted only if they are in exactly
  this form.

Synthetic examples for the target URL (not deployed yet). `test/readme.test.js`
checks these lines against the code:

```text
Vault:        Demo Vault
File:         Inbox/Plan & ideas 100%
Obsidian URI: obsidian://open?vault=Demo%20Vault&file=Inbox%2FPlan%20%26%20ideas%20100%25
Page link:    https://kosyachniy.github.io/obsidian-open/#obsidian%3A%2F%2Fopen%3Fvault%3DDemo%2520Vault%26file%3DInbox%252FPlan%2520%2526%2520ideas%2520100%2525
```

```text
Vault:        Пример
File:         Заметки/План
Obsidian URI: obsidian://open?vault=%D0%9F%D1%80%D0%B8%D0%BC%D0%B5%D1%80&file=%D0%97%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B8%2F%D0%9F%D0%BB%D0%B0%D0%BD
Page link:    https://kosyachniy.github.io/obsidian-open/#obsidian%3A%2F%2Fopen%3Fvault%3D%25D0%259F%25D1%2580%25D0%25B8%25D0%25BC%25D0%25B5%25D1%2580%26file%3D%25D0%2597%25D0%25B0%25D0%25BC%25D0%25B5%25D1%2582%25D0%25BA%25D0%25B8%252F%25D0%259F%25D0%25BB%25D0%25B0%25D0%25BD
```

## What the page accepts

Everything else fails closed: the page shows a generic error, there is no open
control, and no navigation happens.

1. **Only the fragment is input.** Any non-empty query makes the page refuse,
   even if the fragment is valid, so the query can never act as an alternate
   source. A bare `?` counts as an empty query.
2. **One decode, one spelling.** The fragment is decoded exactly once with
   `decodeURIComponent`. It must be byte-identical to `encodeURIComponent` of
   the result. That rejects raw reserved characters, lowercase hex, needless
   escapes, malformed `%` sequences and invalid UTF-8 (overlong, surrogate,
   truncated).
3. **Exact shape.** The decoded URI must match
   `obsidian://open?vault=<V>&file=<F>`:
   - lowercase scheme and the `open` action only, so no `javascript:`,
     `data:`, `https:`, `new`, `search` or `advanced-uri`;
   - no credentials, port, path or fragment;
   - exactly one `vault` followed by exactly one `file`;
   - no other parameters (`append`, `prepend`, `content`, `x-success`, …),
     no duplicates and no percent-encoded parameter names.
4. **Canonical values.** `<V>` and `<F>` must also be exact
   `encodeURIComponent` output, so no raw space, `+`, `/`, `:` or non-ASCII.
5. **Safe names**, checked on the values after their single decode, i.e. what
   Obsidian receives:
   - no C0/C1 controls, DEL, NEL, U+2028/U+2029, or bidi
     embedding/override/isolate characters (U+202A–U+202E, U+2066–U+2069).
     Joiners (ZWJ, ZWNJ) are allowed.
   - no nested escapes (see below);
   - the vault is a single name; the file is names separated by `/`;
   - no name is empty, starts with `.`, or contains `\` or `:`. This rules out
     `.`/`..` segments, hidden folders such as `.obsidian`, absolute and UNC
     paths, drive letters and NTFS streams.
6. **Limits** (UTF-16 code units): Obsidian URI ≤ 4096; decoded file path ≤ 1024
   and ≤ 32 levels; each name (the vault or one path segment) ≤ 255. A
   `location.hash` longer than `1 + 3 × 4096` (12289) is refused before any
   decoding: `#` plus the URI with every character percent-encoded is the
   longest a valid link can be.
7. The page navigates to the decoded URI string **exactly as received**. It is
   never rebuilt, normalised or decoded again.

Unicode names, spaces, `&`, `=`, `#`, `?`, `+` and a literal `%` all work
because they arrive encoded inside the values. See the examples above and
`test/obsidian-link.test.js`.

### Conservative handling of nested encoded sequences

A value can legitimately decode to text that still looks encoded. For example,
a link built for a note literally named `a%2F..%2Fb` decodes once to that
string. A correct consumer treats `%2F` as three ordinary characters. A
component that mistakenly decodes again would see `a/../b`, a path traversal.
In the same way, `%250A` would become a newline and `%2526` a new parameter
separator.

The page doesn't guess which consumers decode twice. It rejects every decoded
name that still contains `%` followed by two hex digits (either case) or a
legacy `%uXXXX` sequence. As a result, every accepted name is a fixed point of
percent-decoding: decoding it again changes nothing, so a double decode can't
introduce separators, dot segments, control characters or parameters.

The cost: names that really do contain `%` plus two hex digits (for example
`100%AB` or a literal `%20`) can't be opened through this page. A bare `%`, as
in `100%` or `50% off`, works. A whole link encoded one level too deep (a
common generator bug) is rejected instead of opening a different note.

## Page behaviour

- **Valid link:** the button «Открыть в Obsidian» and the iPhone/Safari and
  Telegram guidance are shown first. Then the page makes one automatic attempt
  with `location.assign(uri)`. The button always stays. Any error from either
  attempt is swallowed silently, because browser errors can contain the URL.
- **Invalid or missing link:** the button is removed from the DOM and a generic
  error is shown. Nothing navigates.
- **Fragment changes in the same tab** (a second link to the same page): the
  button is removed and the page reloads, so a stale button can never open the
  previous note.
- **The URI exists only inside a JavaScript closure.** The app never writes it
  to the DOM (no `href`, text or attribute), to storage or to the console. That is
  why the control is a `<button>` and not a link: there is no hover or
  long-press URL preview, and the URL isn't exposed in the accessibility tree.
  As a consequence there is no `<a>` for `rel="noreferrer"` to sit on; the
  static test forbids hyperlinks entirely. Referrers are suppressed by
  `<meta name="referrer" content="no-referrer">`, which covers the page's
  subresource requests and its navigations.
- **The browser may still log the URI.** When an external-protocol launch fails
  or is blocked (for example, no app handles `obsidian://`), browsers can print
  their own diagnostics, and Chromium's include the target URI. That is outside
  the page's control: there is no promise that the browser console never
  contains the URI.

## Content Security Policy

Set with `<meta>` (static hosting cannot set headers), before any resource:

```text
default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; worker-src 'none';
base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'
```

- Scripts and styles may come only from the same origin. There is no
  `'unsafe-inline'` or `'unsafe-eval'`, and the page has no inline code,
  styles or event handlers.
- `connect-src 'none'` blocks fetch, XHR, WebSockets and beacons.
  `default-src 'none'` blocks images, fonts, frames, objects, media and
  manifests. `worker-src 'none'` is explicit because workers would otherwise
  fall back to `script-src 'self'`.
- Trusted Types (in browsers that support them) block DOM-XSS sinks and
  `javascript:` navigations, as a second layer behind the validator.
- CSP does not govern top-level navigation, so navigating to `obsidian://`
  stays possible. This still needs confirming in real browsers; see below.
- Meta CSP limits: `frame-ancestors`, `sandbox` and reporting can't be set via
  `<meta>`, and GitHub Pages can't add headers. So other sites can frame the
  page. That gains them little: the page only offers to open the note the link
  already names, and browsers generally block external-app launches from
  cross-origin frames without a user gesture.
- On `kosyachniy.github.io`, the origin (and therefore `'self'`) is shared with
  every other GitHub Pages site of that account. The page has no injection
  point and uses no storage, so this matters only if another site on that
  origin is compromised.
- There is no favicon. A browser may still request `/favicon.ico`; that is
  harmless.

## Privacy

- **Not sent to the host:** browsers never put the fragment into HTTP requests.
  The hosting provider's logs and any `Referer` header never contain the note
  identifiers.
- **What the host sees:** the visitor's IP address, user agent, time, and the
  page path for `index.html`, `style.css`, `app.js`, `obsidian-link.js` (and
  possibly `/favicon.ico`).
- **The full link discloses the note identifiers.** The vault name and note
  path are only percent-encoded, which anyone can trivially decode. Anyone who
  sees the full URL can read them, including:
  - chat participants, and the messenger's servers, which store the message
    text;
  - browser history and history sync;
  - screenshots, clipboard managers and browser extensions.

  Share links only where that is acceptable. Note *contents* are never in the
  link.
- **Link previews:** when a messenger fetches the page for a preview, the
  fragment is not sent. The fetcher only learns the page URL.
- **History:** the page deliberately does not remove the fragment from the
  address bar (`history.replaceState`). Reloading and the "open this page in
  Safari" workaround both need the full URL, so the link stays in browser
  history.
- **No tracking:** no analytics, cookies, storage, third-party resources or
  network calls from JavaScript.

## Tests

```sh
node --test --test-reporter=spec test/*.test.js
```

Tested with Node.js 26.7.0 using only built-in modules (`node:test`,
`node:assert`, `node:fs`). The suites cover:

- the validator: valid inputs, every rejection class, and limits (including the
  pre-decode length bound);
- the controller, run against a sealed fake DOM: automatic attempt,
  click fallback, a throwing navigation, fail-closed states, no DOM writes,
  `hashchange`, and the browser bootstrap;
- the static page contract: CSP, metas, no inline code, no third-party or
  forbidden APIs, the allowlist of files in the published root, Russian and
  accessible UI;
- the README examples.

These tests run in Node, not in a browser.

## Browser checks: Chromium simulation vs real iOS acceptance

No browser was available where this was built, and nothing was installed. So
there is **no browser smoke script**, and browser checks are left to the
orchestrator. Keep two kinds of check apart:

**Chromium simulation** (desktop, headless or device emulation) can confirm:

- the page renders with no CSP violations in the console;
- the valid, invalid and missing-fragment states;
- that a navigation to the exact `obsidian://` URI is *requested* on load and
  on button click;
- that only the four same-origin files are fetched.

Device emulation is still Blink, not WebKit. It does **not** show iOS Safari's
"Open in Obsidian?" prompt, Telegram's in-app browser, or a real Obsidian app
opening the note. Passing it is not iOS acceptance.

Suggested Chromium smoke checklist:

1. Serve the repository root over HTTP(S) with any static server.
2. Open `PAGE_URL#<fragment of the first example>`. Expect the button and
   guidance, no error, and one navigation request to exactly
   `obsidian://open?vault=Demo%20Vault&file=Inbox%2FPlan%20%26%20ideas%20100%25`.
   Use the DevTools Protocol to observe it.
3. Click «Открыть в Obsidian»: expect another request for the same URI.
4. Open `PAGE_URL`, `PAGE_URL#garbage`, `PAGE_URL#javascript%3Aalert(1)` and
   `PAGE_URL?x=1#<valid fragment>`. Expect the error, no button and no
   navigation request.
5. The console shows no CSP violations (other than an optional favicon) and no
   messages from the page itself. Chromium may add its own diagnostics for the
   external-protocol launch, and those can include the URI. That is expected
   browser behaviour, not a page log, so don't treat it as a failure. The
   network panel shows no third-party requests.

**Real iOS acceptance** (manual, on an iPhone with Obsidian and a synthetic
test vault that contains the example notes):

1. Send both example links in Telegram and tap each one. In Telegram's in-app
   browser, record whether the automatic attempt or the button opens Obsidian.
   If neither does, follow the on-page guidance (open the page in Safari) and
   tap the button again.
2. In Safari, expect the "Open in Obsidian?" prompt. Tap «Открыть» and check
   that Obsidian shows the exact note (including the `&`, `%` and Cyrillic
   example).
3. Go back to Safari: the button is still there and works again.
4. An invalid link shows the error and no button.

## Deployment

The deployment target is `https://kosyachniy.github.io/obsidian-open/`:
GitHub Pages, "Deploy from a branch", branch `main`, folder `/ (root)`.
Deployment is verified against the published commit and served files.
`.nojekyll` makes Pages serve the files as
they are, with no Jekyll processing. Everything in the repository root becomes
public, including the tests and README (synthetic data only).

## Limitations and non-goals

- The page does not check that the note exists or what kind of file it is;
  Obsidian decides.
- Valid but unusual names are rejected by design (see the rules above): names
  that start with `.`; names containing `\`, `:`, control or bidi characters,
  or `%` plus two hex digits; paths over the limits; and any link not encoded
  exactly as `encodeURIComponent` output.
- Messenger auto-linkers may cut a URL at trailing punctuation.
  `encodeURIComponent` leaves `. ! ' ( ) * ~` unencoded, so a truncated link
  can still be a *valid* link to a different, shorter name. Send links as
  explicit hyperlinks when note names end in punctuation.
- How Telegram's in-app browser handles custom schemes, and how iOS behaves,
  have not been verified (see the checklists above).
