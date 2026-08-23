/**
 * K2 — the permission boundary.
 *
 * A capability declares its permissions in its manifest and receives a
 * context whose every method is checked against that declaration. There is no
 * second door: if a capability wants the network or the filesystem, it goes
 * through here, and asking for something undeclared throws.
 *
 * AC-2: a tool declaring only `net:read` must be refused a filesystem write.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ArtifactId, CapabilityContext, Permission } from "./types";
import type { ArtifactStore } from "./artifacts";

export class PermissionDenied extends Error {
  constructor(
    readonly capabilityId: string,
    readonly needed: Permission,
  ) {
    super(`Permission denied: ${capabilityId} is not granted ${needed}`);
    this.name = "PermissionDenied";
  }
}

/** Fetches a URL. Injectable so tests never touch the real network. */
export type Fetcher = (url: string) => Promise<string>;

export interface BoundaryOptions {
  capabilityId: string;
  granted: readonly Permission[];
  store: ArtifactStore;
  fetcher?: Fetcher;
}

/**
 * Build the single context a capability is allowed to touch the world with.
 */
export function createContext(options: BoundaryOptions): CapabilityContext {
  const { capabilityId, granted, store, fetcher } = options;

  const require = (permission: Permission): void => {
    if (!granted.includes(permission)) {
      throw new PermissionDenied(capabilityId, permission);
    }
  };

  return {
    async netRead(url: string): Promise<string> {
      require("net:read");
      if (!fetcher) throw new Error("No fetcher configured for this kernel");
      return fetcher(url);
    },

    async fsRead(path: string): Promise<string> {
      require("fs:read");
      return readFile(path, "utf8");
    },

    async fsWrite(path: string, data: string): Promise<void> {
      require("fs:write");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data, "utf8");
    },

    // The artifact store is the kernel's own surface, not the outside world:
    // writing an artifact is how a capability returns bytes, so it needs no
    // fs permission. Escaping the store is prevented by content-addressing.
    async putArtifact(data: string): Promise<ArtifactId> {
      return store.put(data);
    },

    async readArtifact(id: ArtifactId): Promise<string> {
      return store.get(id);
    },
  };
}
