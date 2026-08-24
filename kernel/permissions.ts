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
import { spawn } from "node:child_process";
import type {
  ArtifactId,
  CapabilityContext,
  NetFetchRequest,
  NetFetchResult,
  Permission,
  ProcessResult,
  ProcessSpec,
} from "./types";
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

    async spawnProcess(spec: ProcessSpec): Promise<ProcessResult> {
      require("proc:spawn");
      return runProcess(spec);
    },

    async netFetch(request: NetFetchRequest): Promise<NetFetchResult> {
      const method = request.method ?? "GET";
      require(method === "GET" || method === "HEAD" ? "net:read" : "net:write");
      return runFetch(request, method);
    },
  };
}

/**
 * Runs `spec.command` to completion, killing it if `timeoutMs` elapses.
 * Deliberately independent of the harness's own budget clock: the harness
 * only checks wall time BETWEEN attempts, so without a hard kill here a
 * single hung process (a browser that never responds, a stuck subprocess)
 * would block past the step's budget instead of failing honestly within it.
 */
function runProcess(spec: ProcessSpec): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args ?? [], {
      env: { ...process.env, ...spec.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, spec.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });

    if (spec.input !== undefined) child.stdin.write(spec.input);
    child.stdin.end();
  });
}

/**
 * Calls `request.url` and aborts if `timeoutMs` elapses, mirroring
 * runProcess's independent hard-kill reasoning: this is enforced HERE, not
 * left to the caller to notice a step's budget ran out.
 */
async function runFetch(request: NetFetchRequest, method: string): Promise<NetFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await fetch(request.url, {
      method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: response.status, headers, body, timedOut: false };
  } catch (error) {
    if (controller.signal.aborted) {
      return { status: 0, headers: {}, body: "", timedOut: true };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
