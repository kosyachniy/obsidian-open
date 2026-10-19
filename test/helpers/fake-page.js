// Stand-in for the few DOM APIs that app.js uses. The initial state mirrors
// index.html (cross-checked in page-contract.test.js). Every object is
// sealed, so if the strict-mode app writes any other property (textContent,
// href, dataset, ...) it throws instead of silently putting data into the page.

class FakeElement {
  constructor(id, { hidden = false, parent = null } = {}) {
    this.id = id;
    this.hidden = hidden;
    this.disabled = false;
    this.parent = parent;
    this.connected = true;
    this.listeners = [];
    Object.seal(this);
  }

  addEventListener(type, listener) {
    this.listeners.push({ type, listener });
  }

  remove() {
    this.connected = false;
  }
}

export function createPage(url) {
  const { hash, search } = new URL(url);
  const elements = new Map();
  const add = (id, options) => {
    const element = new FakeElement(id, options);
    elements.set(id, element);
    return element;
  };
  add('pending');
  const ready = add('ready', { hidden: true });
  add('open-button', { parent: ready });
  add('error', { hidden: true });

  const assigned = [];
  let reloads = 0;
  const location = Object.seal({
    hash,
    search,
    assign(target) {
      assigned.push(target);
    },
    reload() {
      reloads += 1;
    },
  });
  const windowListeners = [];
  const window = Object.seal({
    location,
    addEventListener(type, listener) {
      windowListeners.push({ type, listener });
    },
  });
  const document = Object.seal({
    getElementById(id) {
      const element = elements.get(id);
      return element?.connected ? element : null;
    },
  });

  const isVisible = (element) =>
    element.connected && !element.hidden && (element.parent === null || isVisible(element.parent));

  return {
    window,
    document,
    assigned,
    get reloads() {
      return reloads;
    },
    // Same-document navigation to another fragment: no reload, only an event.
    changeHash(newHash) {
      location.hash = newHash;
      for (const { type, listener } of windowListeners) {
        if (type === 'hashchange') listener();
      }
    },
    state() {
      const state = {};
      for (const [id, element] of elements) {
        state[id] = !element.connected ? 'removed' : isVisible(element) ? 'visible' : 'hidden';
      }
      return state;
    },
    isVisible(id) {
      return isVisible(elements.get(id));
    },
    // A user can only click what is attached, visible and enabled.
    click(id) {
      const element = elements.get(id);
      if (!isVisible(element) || element.disabled) {
        throw new Error(`#${id} is not available to the user`);
      }
      for (const { type, listener } of element.listeners) {
        if (type === 'click') listener();
      }
    },
    domSnapshot() {
      return JSON.stringify([...elements.values()].map(({ id, hidden, disabled, connected }) =>
        ({ id, hidden, disabled, connected })));
    },
  };
}
