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
import {
  DENY_ALL,
  childEnv,
  requireCwd,
  requireHostAllowed,
  requirePathWithin,
  type Isolation,
} from "./sandbox";

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
  /** K4 blast radius. Omitted means DENY_ALL — fail closed, never open. */
  isolation?: Isolation;
}

/**
 * Build the single context a capability is allowed to touch the world with.
 */
export function createContext(options: BoundaryOptions): CapabilityContext {
  const { capabilityId, granted, store, fetcher } = options;
  const isolation = options.isolation ?? DENY_ALL;

  const require = (permission: Permission): void => {
    if (!granted.includes(permission)) {
      throw new PermissionDenied(capabilityId, permission);
    }
  };

  return {
    async netRead(url: string): Promise<string> {
      require("net:read");
      requireHostAllowed(capabilityId, isolation.allowedHosts, url);
      if (!fetcher) throw new Error("No fetcher configured for this kernel");
      return fetcher(url);
    },

    // Both fs surfaces read back the RESOLVED path the boundary validated,
    // never the caller's original string — re-resolving later would reopen a
    // time-of-check/time-of-use gap between the check and the syscall.
    async fsRead(path: string): Promise<string> {
      require("fs:read");
      const real = requirePathWithin(capabilityId, isolation.readRoots, path, "read");
      return readFile(real, "utf8");
    },

    async fsWrite(path: string, data: string): Promise<void> {
      require("fs:write");
      const real = requirePathWithin(capabilityId, isolation.writeRoots, path, "write");
      await mkdir(dirname(real), { recursive: true });
      await writeFile(real, data, "utf8");
    },

    // The artifact store is the kernel's own surface, not the outside world:
    // writing an artifact is how a capability returns bytes, so it needs no
    // fs permission. Escaping the store is prevented by `assertWellFormedId`,
    // which rejects any id that is not a bare sha256 address before it can
    // reach a path — NOT by content-addressing in general, which is about
    // what an id means rather than where it can point (#60).
    async putArtifact(data: string): Promise<ArtifactId> {
      return store.put(data);
    },

    async readArtifact(id: ArtifactId): Promise<string> {
      return store.get(id);
    },

    async spawnProcess(spec: ProcessSpec): Promise<ProcessResult> {
      require("proc:spawn");
      // The child gets a pinned working directory and a STRIPPED environment.
      // Before K4 this merged all of process.env into every child, handing
      // each one every provider key in .env plus OPTIMUS_SESSION_SECRET.
      // The kernel creates the workspace itself. A capability calling mkdir
      // would be reaching around the very boundary it is standing behind, and
      // spawn() throws outright on a cwd that does not exist.
      const cwd = requireCwd(capabilityId, isolation);
      await mkdir(cwd, { recursive: true });
      return runProcess(spec, cwd, childEnv(isolation, spec.env));
    },

    async netFetch(request: NetFetchRequest): Promise<NetFetchResult> {
      const method = request.method ?? "GET";
      require(method === "GET" || method === "HEAD" ? "net:read" : "net:write");
      requireHostAllowed(capabilityId, isolation.allowedHosts, request.url);
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
function runProcess(
  spec: ProcessSpec,
  cwd: string,
  env: Record<string, string>,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args ?? [], {
      cwd,
      // Cast, not widen: this env is deliberately NOT the parent's ProcessEnv
      // (which Next augments with a required NODE_ENV). childEnv's return type
      // stays honest about what it actually hands the child.
      env: env as NodeJS.ProcessEnv,
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
