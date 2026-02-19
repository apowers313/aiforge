/**
 * Sanitize PATH for user shells by removing node_modules/.bin entries
 * that leak from the server's own process environment (e.g. when started via npx).
 */
export function sanitizePathForShell(path: string | undefined): string {
  if (!path) return '';
  return path.split(':').filter((p) => !p.includes('node_modules/.bin')).join(':');
}
