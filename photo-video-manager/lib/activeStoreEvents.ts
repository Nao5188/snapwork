type ActiveStoreChangedPayload = {
  storeId: string;
  userId: string;
};

type ActiveStoreChangedListener = (payload: ActiveStoreChangedPayload) => void;

const activeStoreChangedListeners = new Set<ActiveStoreChangedListener>();

export function subscribeActiveStoreChanged(listener: ActiveStoreChangedListener) {
  activeStoreChangedListeners.add(listener);
  return () => {
    activeStoreChangedListeners.delete(listener);
  };
}

export function emitActiveStoreChanged(payload: ActiveStoreChangedPayload) {
  activeStoreChangedListeners.forEach((listener) => {
    listener(payload);
  });
}
