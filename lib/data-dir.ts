import { join } from "node:path";

/**
 * Where a local, persistent OPTIMUS process keeps its real state — mission
 * history, artifacts. Only meaningful for the local/self-hosted deployment
 * the kernel is actually designed for (CLAUDE.md: "no internet... one
 * repo, one deploy, everything local"), not the marketing Vercel deploy,
 * which has no writable persistent disk anyway.
 */
export const DATA_DIR = process.env.OPTIMUS_DATA_DIR ?? join(process.cwd(), ".optimus-data");
