// Exact lowercase scheme and action, no credentials/port/path/fragment, and
// exactly one vault and one file in that order. Raw "&" and "#" cannot occur
// inside a value, so duplicate, unknown or encoded parameter names never match.
const OPEN_URI = /^obsidian:\/\/open\?vault=([^&#]+)&file=([^&#]+)$/;
// C0/C1 controls (incl. DEL and NEL), line/paragraph separators and bidi
// embedding/override/isolate controls.
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\u202A-\u202E\u2066-\u2069]/u;
// Anything a mistaken second decode (including legacy %uXXXX) could still
// change. Rejecting it makes every accepted name a fixed point of decoding.
const NESTED_ESCAPE = /%(?:[0-9a-f]{2}|u[0-9a-f]{4})/i;

const MAX_URI_LENGTH = 4096;
// "#" plus a maximal URI with every character percent-encoded; a valid URI is
// ASCII-only, so no valid fragment can be longer.
const MAX_HASH_LENGTH = 1 + 3 * MAX_URI_LENGTH;
const MAX_PATH_LENGTH = 1024;
const MAX_PATH_DEPTH = 32;
const MAX_NAME_LENGTH = 255;

export function readObsidianUri({ hash, search }) {
  // The query is never an input; a non-empty one is a reason to refuse.
  if (search !== '' || !hash.startsWith('#')) return null;
  // Refuse impossible lengths before doing any decoding work.
  if (hash.length > MAX_HASH_LENGTH) return null;
  const uri = decodeCanonical(hash.slice(1));
  if (uri === null || uri.length > MAX_URI_LENGTH) return null;
  const match = OPEN_URI.exec(uri);
  if (match === null) return null;
  // Each value must be canonical too; decoded here only to be checked.
  const vault = decodeCanonical(match[1]);
  const file = decodeCanonical(match[2]);
  // The original string is returned untouched, never rebuilt.
  return isSafeName(vault) && isSafePath(file) ? uri : null;
}

// A vault is one plain name; a file is a vault-relative path of plain names.
function isSafePath(path) {
  if (path === null || path.length > MAX_PATH_LENGTH) return false;
  const names = path.split('/');
  return names.length <= MAX_PATH_DEPTH && names.every(isSafeName);
}

function isSafeName(name) {
  return name !== null
    && name !== '' // absolute paths and empty segments
    && name.length <= MAX_NAME_LENGTH
    && !name.startsWith('.') // ".", "..", hidden files and folders
    && !/[\\/:]/.test(name) // separators, drive letters, alternate data streams
    && !CONTROL.test(name)
    && !NESTED_ESCAPE.test(name);
}

// Decodes exactly once and accepts only input that is byte-identical to
// encodeURIComponent's output for the decoded value: one spelling per string.
function decodeCanonical(encoded) {
  try {
    const decoded = decodeURIComponent(encoded);
    return encodeURIComponent(decoded) === encoded ? decoded : null;
  } catch {
    return null;
  }
}
