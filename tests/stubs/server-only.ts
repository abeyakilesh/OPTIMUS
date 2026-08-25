/**
 * `server-only` is resolved by Next's bundler, not by node_modules — it is a
 * build-time marker that fails a build if a server module is pulled into a
 * client bundle. Vitest has no such bundler, so importing it would throw and
 * take down every test of a server module.
 *
 * Aliased to this empty file so the guard keeps working where it matters (the
 * real build, which DOES enforce it) without making server code untestable.
 */
export {};
