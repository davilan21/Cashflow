const NS = "cashflow:";

function installStorageShim() {
  if (typeof window === "undefined" || window.storage) return;

  window.storage = {
    async get(key) {
      const raw = window.localStorage.getItem(NS + key);
      if (raw === null) throw new Error(`No existe la llave "${key}"`);
      return { key, value: raw };
    },

    async set(key, value) {
      window.localStorage.setItem(NS + key, value);
      return { key, value };
    },

    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const full = window.localStorage.key(i);
        if (full && full.startsWith(NS)) {
          const key = full.slice(NS.length);
          if (key.startsWith(prefix)) keys.push(key);
        }
      }
      return { keys };
    },
  };
}

export { installStorageShim };
