#!/usr/bin/env node

/**
 * AIForge CLI entry point
 * This file serves as the binary entry point for global npm installation and npx
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load package.json for version
const packageJsonPath = join(__dirname, '..', 'package.json');
const { default: pkg } = await import(packageJsonPath, { with: { type: 'json' } });

const program = new Command();

program
  .name('aiforge')
  .description('A web-based IDE for 100% agentic coding')
  .version(pkg.version, '-v, --version')
  .option('-p, --port <number>', 'server port (default: random 9000-9099)')
  .option('-H, --host <address>', 'server host (default: 0.0.0.0)')
  .option('--https-cert <path>', 'path to HTTPS certificate file')
  .option('--https-key <path>', 'path to HTTPS private key file')
  .addHelpText('after', `
Environment Variables:
  AIFORGE_PORT              Server port (default: random 9000-9099)
  AIFORGE_HOST              Server host (default: 0.0.0.0)
  AIFORGE_AUTH_GUID         Authentication GUID (empty = no auth)
  AIFORGE_SCROLLBACK_LINES  Terminal scrollback size (default: 10000)
  AIFORGE_LOG_LEVEL         Log level: trace/debug/info/warn/error/fatal (default: info)
  AIFORGE_DATA_DIR          Data directory override (default: ~/.local/share/aiforge)
  AIFORGE_HTTPS_CERT        Path to HTTPS certificate file
  AIFORGE_HTTPS_KEY         Path to HTTPS private key file

Examples:
  aiforge                              Start server with default settings
  aiforge --port 9050                  Start server on port 9050
  aiforge --port 9050 --host 127.0.0.1 Start on specific port and host
  aiforge --https-cert cert.pem --https-key key.pem  Start with HTTPS

Documentation: https://github.com/apowers313/aiforge
`);

program.parse();

const options = program.opts();

// Validate HTTPS options: if one is provided, both must be provided
if ((options.httpsCert && !options.httpsKey) || (!options.httpsCert && options.httpsKey)) {
  console.error('Error: Both --https-cert and --https-key must be provided together for HTTPS mode.');
  process.exit(1);
}

// Validate HTTPS cert/key files exist
if (options.httpsCert && !existsSync(options.httpsCert)) {
  console.error(`Error: HTTPS certificate file not found: ${options.httpsCert}`);
  process.exit(1);
}
if (options.httpsKey && !existsSync(options.httpsKey)) {
  console.error(`Error: HTTPS key file not found: ${options.httpsKey}`);
  process.exit(1);
}

// Set environment variables from CLI options (CLI takes precedence)
if (options.port) {
  process.env.AIFORGE_PORT = options.port;
}
if (options.host) {
  process.env.AIFORGE_HOST = options.host;
}
if (options.httpsCert) {
  process.env.AIFORGE_HTTPS_CERT = options.httpsCert;
}
if (options.httpsKey) {
  process.env.AIFORGE_HTTPS_KEY = options.httpsKey;
}

// Import and start the server
const serverPath = join(__dirname, '..', 'dist', 'server', 'server', 'index.js');

if (!existsSync(serverPath)) {
  console.error('Error: Server build not found. The package may not have been built correctly.');
  console.error(`Expected: ${serverPath}`);
  process.exit(1);
}

const { startServer } = await import(serverPath);
startServer().catch((err) => {
  console.error('Failed to start AIForge:', err);
  process.exit(1);
});
