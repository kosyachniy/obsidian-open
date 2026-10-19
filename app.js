import { readObsidianUri } from './obsidian-link.js';

export function start({ window, document, navigate }) {
  const uri = readObsidianUri(window.location);
  const button = document.getElementById('open-button');
  // A new fragment is a different link: never leave the old control usable.
  window.addEventListener('hashchange', () => {
    button.remove();
    window.location.reload();
  });
  document.getElementById('pending').hidden = true;

  if (uri === null) {
    button.remove();
    document.getElementById('error').hidden = false;
    return;
  }

  const attempt = () => {
    try {
      navigate(uri);
    } catch {
      // Deliberately silent: browser errors can contain the URI. The button
      // stays available for another, user-initiated attempt.
    }
  };
  button.addEventListener('click', attempt);
  document.getElementById('ready').hidden = false;
  attempt();
}

if (typeof document !== 'undefined') {
  start({ window, document, navigate: (uri) => window.location.assign(uri) });
}
