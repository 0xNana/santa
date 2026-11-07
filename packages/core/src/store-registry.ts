// Internal registry for Santa's coordinated store implementations. This module stays browser-safe;
// the SQLite implementation and its Node built-ins are imported only by the server bootstrap.
export const sharedStores = new WeakSet<object>();
