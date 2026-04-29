/**
 * Viewer plugin registry — runtime registration + slot-aware lookup.
 *
 * Plugin packs (e.g., `lintpdf/register.ts`) call `register(plugin)`
 * during module load. The viewer reads `getPluginsForSlot(slot)` at
 * render time to find what to mount.
 *
 * Phase 1 keeps the registry simple — a process-wide map. Phase 2
 * introduces per-viewer-instance scopes so two viewer instances on the
 * same page can run different plugin packs.
 *
 * @public
 */

import type { ViewerPlugin, ViewerSlot } from "./types";

const _registry: Map<string, ViewerPlugin> = new Map();

/**
 * Register a plugin. Throws on duplicate id.
 *
 * @public
 */
export function register(plugin: ViewerPlugin): void {
  if (_registry.has(plugin.id)) {
    throw new Error(
      `viewer plugin already registered: ${plugin.id} ` +
        `(version ${_registry.get(plugin.id)?.version})`,
    );
  }
  _registry.set(plugin.id, plugin);
}

/**
 * Unregister a plugin by id. No-op if absent.
 *
 * @public
 */
export function unregister(id: string): void {
  _registry.delete(id);
}

/**
 * Return every registered plugin for a slot, sorted by `order` asc
 * (where supported by the plugin shape; defaults to insertion order).
 *
 * @public
 */
export function getPluginsForSlot<S extends ViewerSlot>(
  slot: S,
): Array<Extract<ViewerPlugin, { slot: S }>> {
  const matches: Array<Extract<ViewerPlugin, { slot: S }>> = [];
  for (const plugin of _registry.values()) {
    if (plugin.slot === slot) {
      matches.push(plugin as Extract<ViewerPlugin, { slot: S }>);
    }
  }
  matches.sort((a, b) => {
    const ao = "order" in a ? (a.order ?? 0) : 0;
    const bo = "order" in b ? (b.order ?? 0) : 0;
    return ao - bo;
  });
  return matches;
}

/**
 * Snapshot of every registered plugin (mainly for tests / debugging).
 *
 * @public
 */
export function listAll(): ReadonlyArray<ViewerPlugin> {
  return Array.from(_registry.values());
}

/**
 * Reset the registry. **Test-only.** Production code never calls this.
 *
 * @public
 */
export function _resetRegistryForTesting(): void {
  _registry.clear();
}
