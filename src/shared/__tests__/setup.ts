import "fake-indexeddb/auto";

// Chrome storage mock
export const mockStorage: Record<string, unknown> = {};

globalThis.chrome = {
  storage: {
    local: {
      get: async (keys: string | string[] | Record<string, unknown> | null) => {
        if (keys === null) return { ...mockStorage };
        const keyList = Array.isArray(keys)
          ? keys
          : typeof keys === "string"
          ? [keys]
          : Object.keys(keys);
        return Object.fromEntries(
          keyList
            .filter((k) => k in mockStorage)
            .map((k) => [k, mockStorage[k]])
        );
      },
      set: async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      },
      remove: async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) delete mockStorage[k];
      },
      clear: async () => {
        Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      },
    },
  },
} as typeof chrome;

export function clearMockStorage(): void {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
}
