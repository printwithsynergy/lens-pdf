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
// id-of-target → id-of-overrider. When `replaces` is set on a
// registered plugin, that plugin shadows the target in slot lookups.
const _overrides: Map<string, string> = new Map();

/**
 * Register a plugin. Throws on duplicate id, or on a second
 * `replaces` claim against the same target.
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
  if (plugin.replaces !== undefined) {
    const claimer = _overrides.get(plugin.replaces);
    if (claimer !== undefined) {
      throw new Error(
        `viewer plugin override conflict: '${plugin.id}' tried to ` +
          `replace '${plugin.replaces}', but '${claimer}' already does`,
      );
    }
    _overrides.set(plugin.replaces, plugin.id);
  }
  _registry.set(plugin.id, plugin);
}

/**
 * Unregister a plugin by id. No-op if absent. Also clears any
 * `replaces` claim this plugin held, freeing the target for a
 * subsequent override.
 *
 * @public
 */
export function unregister(id: string): void {
  const plugin = _registry.get(id);
  if (plugin?.replaces !== undefined) {
    _overrides.delete(plugin.replaces);
  }
  _registry.delete(id);
}

/**
 * Return every registered plugin for a slot, sorted by `order` asc
 * (where supported by the plugin shape; defaults to insertion order).
 *
 * Plugins that have been overridden via another plugin's `replaces`
 * field are filtered out — the overrider takes their place when it
 * shares the same slot. Cross-slot overrides also remove the
 * original from this slot (the override declares an intent to take
 * over the named feature; rendering the replaced one alongside
 * would defeat the override semantics).
 *
 * @public
 */
export function getPluginsForSlot<S extends ViewerSlot>(
  slot: S,
): Array<Extract<ViewerPlugin, { slot: S }>> {
  const matches: Array<Extract<ViewerPlugin, { slot: S }>> = [];
  for (const plugin of _registry.values()) {
    if (plugin.slot !== slot) continue;
    if (_overrides.has(plugin.id)) continue; // someone replaces this
    matches.push(plugin as Extract<ViewerPlugin, { slot: S }>);
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
 * Includes plugins that have been overridden — `getPluginsForSlot`
 * filters those out, but they remain in the registry.
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
  _overrides.clear();
}
