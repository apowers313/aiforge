# Implementation Plan for XDG Base Directory Refactoring

## Overview

Refactor AIForge's filesystem paths to follow the XDG Base Directory Specification. Currently, all data lives under `~/.aiforge/` and sockets are in `/tmp/`. This refactoring moves config to `$XDG_CONFIG_HOME/aiforge/`, data to `$XDG_DATA_HOME/aiforge/`, and sockets under the data directory. The primary motivation is fixing E2E test isolation (socket cleanup in `/tmp` kills dev server sockets) while also adopting the Linux-standard directory layout.

## Phase Breakdown

### Phase 1: Central Path Resolution Module + Unit Tests

**What this phase accomplishes**: Create the new `src/server/paths.ts` module as the single source of truth for all filesystem paths, with comprehensive tests. No existing code is changed yet -- this phase is purely additive.

**Duration**: 1 day

**Tests to Write First**:
- `test/unit/server/paths.test.ts`: Test all path resolution functions

```typescript
// Example test cases
describe('paths', () => {
  describe('getConfigDir', () => {
    it('uses XDG_CONFIG_HOME when set', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(getConfigDir()).toBe('/custom/config/aiforge');
    });

    it('defaults to ~/.config/aiforge when XDG_CONFIG_HOME is not set', () => {
      delete process.env.XDG_CONFIG_HOME;
      expect(getConfigDir()).toBe(join(homedir(), '.config', 'aiforge'));
    });
  });

  describe('getDataDir', () => {
    it('uses AIFORGE_DATA_DIR when set (backwards compat)', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      expect(getDataDir()).toBe('/custom/data');
    });

    it('uses XDG_DATA_HOME when set', () => {
      delete process.env.AIFORGE_DATA_DIR;
      process.env.XDG_DATA_HOME = '/custom/share';
      expect(getDataDir()).toBe('/custom/share/aiforge');
    });

    it('defaults to ~/.local/share/aiforge', () => {
      delete process.env.AIFORGE_DATA_DIR;
      delete process.env.XDG_DATA_HOME;
      expect(getDataDir()).toBe(join(homedir(), '.local', 'share', 'aiforge'));
    });
  });

  describe('getSocketDir', () => {
    it('returns sockets/ subdirectory under data dir', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      expect(getSocketDir()).toBe('/custom/data/sockets');
    });
  });

  describe('getSocketPath', () => {
    it('returns path without ai-ide-pty- prefix', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      expect(getSocketPath('abc-123')).toBe('/custom/data/sockets/abc-123.sock');
    });
  });

  describe('getConfigPath', () => {
    it('returns config.json inside config dir', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(getConfigPath()).toBe('/custom/config/aiforge/config.json');
    });
  });

  describe('validateSocketPathLength', () => {
    it('passes for paths under 107 bytes', () => {
      expect(() => validateSocketPathLength('/short/path.sock')).not.toThrow();
    });

    it('throws for paths over 107 bytes', () => {
      const longPath = '/a'.repeat(108) + '.sock';
      expect(() => validateSocketPathLength(longPath)).toThrow(/socket path.*exceeds/i);
    });
  });
});
```

**Implementation**:
- `src/server/paths.ts`: Central path resolution module

```typescript
// Key exports:
export function getConfigDir(): string;    // XDG_CONFIG_HOME/aiforge
export function getConfigPath(): string;   // config dir + config.json
export function getDataDir(): string;      // AIFORGE_DATA_DIR > XDG_DATA_HOME/aiforge > default
export function getSocketDir(): string;    // data dir + sockets/
export function getSocketPath(shellId: string): string;  // socket dir + shellId.sock
export function validateSocketPathLength(socketPath: string): void;  // throws if > 107 bytes

const UNIX_SOCKET_PATH_LIMIT = 107;
```

**Dependencies**:
- External: None (uses only `node:path`, `node:os`)
- Internal: None (this is the foundation)

**Verification**:
1. Run: `npx vitest run test/unit/server/paths.test.ts`
2. Expected output: All tests pass. The new module exists and is importable but nothing in the app uses it yet.

---

### Phase 2: Wire Path Module into Config + Storage

**What this phase accomplishes**: Replace the hardcoded path logic in `src/server/config/index.ts` and `src/server/storage/index.ts` with calls to the new paths module. After this phase, config reads from `~/.config/aiforge/config.json` and data lives in `~/.local/share/aiforge/`. The `AIFORGE_DATA_DIR` override still works for backwards compatibility.

**Duration**: 1-2 days

**Tests to Write First**:
- Update `test/unit/server/config/index.test.ts`: Add tests for new config path

```typescript
// New test cases to add
it('reads config from XDG config path', () => {
  // Mock existsSync to return true for XDG path
  const xdgConfigPath = join(homedir(), '.config', 'aiforge', 'config.json');
  vi.mocked(fs.existsSync).mockImplementation(
    (p) => p === xdgConfigPath
  );
  vi.mocked(fs.readFileSync).mockReturnValue('{"port": 9042}');
  const config = loadConfig();
  expect(config.port).toBe(9042);
});
```

- Update `test/unit/server/storage/index.test.ts`: Add tests for XDG data path

```typescript
// Update existing test
it('returns XDG default path when no env vars are set', () => {
  delete process.env.AIFORGE_DATA_DIR;
  delete process.env.XDG_DATA_HOME;
  const result = getDataDir();
  expect(result).toBe(join(homedir(), '.local', 'share', 'aiforge'));
});

it('uses XDG_DATA_HOME when set', () => {
  delete process.env.AIFORGE_DATA_DIR;
  process.env.XDG_DATA_HOME = '/custom/share';
  expect(getDataDir()).toBe('/custom/share/aiforge');
});

it('AIFORGE_DATA_DIR takes priority over XDG_DATA_HOME', () => {
  process.env.AIFORGE_DATA_DIR = '/override';
  process.env.XDG_DATA_HOME = '/custom/share';
  expect(getDataDir()).toBe('/override');
});
```

- `test/unit/server/storage/index.test.ts`: Ensure `initStorage()` creates `sockets/` subdirectory

```typescript
it('creates sockets subdirectory during init', async () => {
  const newDir = join(tempDir, 'new-data');
  process.env.AIFORGE_DATA_DIR = newDir;
  await initStorage();
  expect(existsSync(join(newDir, 'sockets'))).toBe(true);
});
```

**Implementation**:
- `src/server/config/index.ts`: Replace `getConfigFilePath()` body

```typescript
// Before:
function getConfigFilePath(): string {
  return path.join(os.homedir(), '.aiforge', 'config.json');
}

// After:
import { getConfigPath } from '../paths.js';

function getConfigFilePath(): string {
  return getConfigPath();
}
```

- `src/server/storage/index.ts`: Replace `getDataDir()` body, add sockets dir creation

```typescript
// Before:
export function getDataDir(): string {
  return process.env.AIFORGE_DATA_DIR ?? join(homedir(), '.aiforge', 'data');
}

// After:
import { getDataDir as resolveDataDir, getSocketDir } from '../paths.js';

export function getDataDir(): string {
  return resolveDataDir();
}

// In initStorage(), add after creating data dir:
const socketsDir = getSocketDir();
if (!existsSync(socketsDir)) {
  await mkdir(socketsDir, { recursive: true });
}
```

**Dependencies**:
- Internal: `src/server/paths.ts` (Phase 1)

**Verification**:
1. Run: `npx vitest run test/unit/server/config test/unit/server/storage`
2. Run: `npm run typecheck` (ensure no type errors)
3. Run: `npm run build` (ensure server builds)
4. Manual: Start the dev server with `npm run dev:server`. Verify it starts without errors. Check that `~/.config/aiforge/config.json` is read (or `~/.local/share/aiforge/` is created) by examining log output.
5. Manual: Set `XDG_DATA_HOME=/tmp/test-xdg npm run dev:server` and verify data is created under `/tmp/test-xdg/aiforge/`.

---

### Phase 3: Socket Path Migration + Orphan Cleanup Fix

**What this phase accomplishes**: Move socket files from `/tmp/ai-ide-pty-{id}.sock` to `$XDG_DATA_HOME/aiforge/sockets/{id}.sock`. Fix the orphan socket cleanup to scan only the instance-specific socket directory. This is the phase that fixes the E2E test isolation bug.

**Duration**: 2 days

**Tests to Write First**:
- Update `test/unit/server/services/pty/daemon/protocol.test.ts`: Socket path tests

```typescript
// Replace existing getSocketPath tests
describe('getSocketPath', () => {
  it('returns socket path under data dir sockets/', () => {
    process.env.AIFORGE_DATA_DIR = '/test/data';
    const path = getSocketPath('abc-123');
    expect(path).toBe('/test/data/sockets/abc-123.sock');
  });

  it('does not include ai-ide-pty- prefix', () => {
    process.env.AIFORGE_DATA_DIR = '/test/data';
    const path = getSocketPath('shell-id');
    expect(path).not.toContain('ai-ide-pty-');
  });
});
```

- Update `test/unit/server/services/pty/PtyDaemonManager.test.ts`: Orphan socket cleanup tests

```typescript
// findOrphanedSockets should scan getSocketDir(), not /tmp
describe('findOrphanedSockets', () => {
  it('scans the sockets directory, not /tmp', async () => {
    // Create socket files in the test's socket directory
    const socketsDir = getSocketDir();
    await mkdir(socketsDir, { recursive: true });
    await writeFile(join(socketsDir, 'valid-id.sock'), '');
    await writeFile(join(socketsDir, 'orphan-id.sock'), '');

    const orphans = await manager.findOrphanedSockets(['valid-id']);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toContain('orphan-id.sock');
    expect(orphans[0]).not.toContain('/tmp');
  });

  it('matches *.sock pattern without ai-ide-pty- prefix', async () => {
    const socketsDir = getSocketDir();
    await mkdir(socketsDir, { recursive: true });
    await writeFile(join(socketsDir, 'some-shell.sock'), '');
    await writeFile(join(socketsDir, 'not-a-socket.txt'), '');

    const orphans = await manager.findOrphanedSockets([]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toContain('some-shell.sock');
  });
});
```

- Add socket path length validation test in `test/unit/server/paths.test.ts`:

```typescript
describe('validateSocketPathLength at startup', () => {
  it('rejects paths that exceed 107 bytes', () => {
    // Simulate a very long XDG_DATA_HOME
    process.env.XDG_DATA_HOME = '/a'.repeat(80);
    const path = getSocketPath('test-uuid');
    expect(path.length).toBeGreaterThan(107);
    expect(() => validateSocketPathLength(path)).toThrow();
  });
});
```

**Implementation**:
- `src/server/services/pty/daemon/protocol.ts`: Replace `getSocketPath()` with re-export

```typescript
// Before:
export function getSocketPath(shellId: string): string {
  return `/tmp/ai-ide-pty-${shellId}.sock`;
}

// After: Re-export from the central paths module
export { getSocketPath } from '../../paths.js';
// This preserves the import path for all existing consumers
```

  Note: By re-exporting from `protocol.ts`, we avoid changing imports in `PtyDaemonClient.ts`, `PtyDaemonManager.ts`, `pty-daemon.ts`, and `index.ts`. This minimizes churn.

- `src/server/services/pty/PtyDaemonManager.ts`: Update `findOrphanedSockets()` and scrollback fallback

```typescript
// Import the socket dir resolver
import { getSocketDir, getDataDir } from '../../paths.js';

// findOrphanedSockets: scan getSocketDir() instead of /tmp
async findOrphanedSockets(validShellIds: string[]): Promise<string[]> {
  const orphans: string[] = [];
  const validSet = new Set(validShellIds);
  const socketsDir = getSocketDir();

  try {
    const files = await readdir(socketsDir);
    for (const file of files) {
      if (file.endsWith('.sock')) {
        const shellId = file.replace('.sock', '');
        if (!validSet.has(shellId)) {
          orphans.push(join(socketsDir, file));
        }
      }
    }
  } catch {
    // Socket dir doesn't exist or can't be read
  }
  return orphans;
}

// Scrollback fallback: use data dir instead of /tmp
scrollbackDir: this._scrollbackStore?.directory ?? join(getDataDir(), 'scrollback'),
```

- `src/server/services/pty/PtyDaemonManager.ts`: Add socket dir creation before daemon spawn

```typescript
// In spawn(), before creating the daemon process:
import { mkdir } from 'node:fs/promises';
import { getSocketDir } from '../../paths.js';

// Ensure socket directory exists
const socketsDir = getSocketDir();
if (!existsSync(socketsDir)) {
  await mkdir(socketsDir, { recursive: true });
}
```

- Add startup validation in `src/server/index.ts` or `src/server/paths.ts`:

```typescript
// In server startup (createApp or similar):
import { getSocketPath, validateSocketPathLength } from './paths.js';

// Validate socket path length with a sample UUID
const samplePath = getSocketPath('00000000-0000-0000-0000-000000000000');
validateSocketPathLength(samplePath);
```

**Dependencies**:
- Internal: `src/server/paths.ts` (Phase 1), storage changes (Phase 2)

**Verification**:
1. Run: `npx vitest run test/unit/server/services/pty`
2. Run: `npm run typecheck && npm run build`
3. Manual: Start the dev server. Create a shell. Verify socket appears under `~/.local/share/aiforge/sockets/` (not `/tmp/`). Run `ls ~/.local/share/aiforge/sockets/` to confirm.
4. Manual: Kill the server and restart it. Verify orphan cleanup logs reference the new socket directory.
5. Manual: Verify old `/tmp/ai-ide-pty-*.sock` files are no longer created.

---

### Phase 4: Legacy Data Migration

**What this phase accomplishes**: Add automatic one-time migration of config and data from the old `~/.aiforge/` layout to the new XDG locations. On first startup after the refactor, if old paths exist and new paths don't, files are moved automatically.

**Duration**: 1-2 days

**Tests to Write First**:
- `test/unit/server/migration.test.ts` (or add to `test/unit/server/storage/index.test.ts`):

```typescript
describe('migrateFromLegacyPaths', () => {
  it('migrates data from ~/.aiforge/data/ to XDG data dir', async () => {
    // Create legacy directory structure in temp dir
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'projects.json'), '[]');

    // Mock homedir to return tempDir
    const newDataDir = join(tempDir, '.local', 'share', 'aiforge');

    await migrateFromLegacyPaths(tempDir);

    expect(existsSync(join(newDataDir, 'projects.json'))).toBe(true);
    expect(existsSync(legacyDir)).toBe(false);
  });

  it('migrates config.json to XDG config dir', async () => {
    const legacyConfig = join(tempDir, '.aiforge', 'config.json');
    await mkdir(dirname(legacyConfig), { recursive: true });
    await writeFile(legacyConfig, '{"port": 9042}');

    const newConfig = join(tempDir, '.config', 'aiforge', 'config.json');

    await migrateFromLegacyPaths(tempDir);

    expect(existsSync(newConfig)).toBe(true);
    const content = await readFile(newConfig, 'utf-8');
    expect(JSON.parse(content)).toEqual({ port: 9042 });
  });

  it('skips migration if new paths already exist', async () => {
    // Both old and new exist -- don't overwrite new
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'projects.json'), '["old"]');

    const newDataDir = join(tempDir, '.local', 'share', 'aiforge');
    await mkdir(newDataDir, { recursive: true });
    await writeFile(join(newDataDir, 'projects.json'), '["new"]');

    await migrateFromLegacyPaths(tempDir);

    // New data should be untouched
    const content = await readFile(join(newDataDir, 'projects.json'), 'utf-8');
    expect(JSON.parse(content)).toEqual(['new']);
  });

  it('skips migration if legacy paths do not exist', async () => {
    // No legacy, no new -- nothing to migrate
    await migrateFromLegacyPaths(tempDir);
    // Should not throw
  });

  it('skips migration when AIFORGE_DATA_DIR is set', async () => {
    // If the user has a custom data dir, don't auto-migrate
    process.env.AIFORGE_DATA_DIR = '/custom/path';
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });

    await migrateFromLegacyPaths(tempDir);

    // Legacy should still exist (not moved)
    expect(existsSync(legacyDir)).toBe(true);
  });
});
```

**Implementation**:
- `src/server/migration.ts`: Migration module

```typescript
import { existsSync } from 'node:fs';
import { rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { getDataDir, getConfigDir, getConfigPath } from './paths.js';
import { logger } from './utils/logger.js';

export async function migrateFromLegacyPaths(home?: string): Promise<void> {
  const homeDir = home ?? homedir();
  const legacyDataDir = join(homeDir, '.aiforge', 'data');
  const legacyConfigFile = join(homeDir, '.aiforge', 'config.json');

  // Skip data migration if AIFORGE_DATA_DIR is explicitly set
  if (!process.env.AIFORGE_DATA_DIR) {
    const newDataDir = getDataDir();
    if (existsSync(legacyDataDir) && !existsSync(newDataDir)) {
      await mkdir(dirname(newDataDir), { recursive: true });
      await rename(legacyDataDir, newDataDir);
      logger.info('Migrated data from %s to %s', legacyDataDir, newDataDir);
    }
  }

  // Migrate config
  const newConfigPath = getConfigPath();
  if (existsSync(legacyConfigFile) && !existsSync(newConfigPath)) {
    await mkdir(dirname(newConfigPath), { recursive: true });
    await rename(legacyConfigFile, newConfigPath);
    logger.info('Migrated config from %s to %s', legacyConfigFile, newConfigPath);
  }
}
```

- `src/server/storage/index.ts`: Call migration before `initStorage()`

```typescript
import { migrateFromLegacyPaths } from '../migration.js';

export async function initStorage(): Promise<Storage> {
  // One-time migration from legacy ~/.aiforge/ layout
  await migrateFromLegacyPaths();

  const dataDir = getDataDir();
  // ... rest unchanged
}
```

**Dependencies**:
- Internal: `src/server/paths.ts` (Phase 1), config/storage wiring (Phase 2)

**Verification**:
1. Run: `npx vitest run test/unit/server/migration.test.ts` (or relevant test file)
2. Manual: Create a fake legacy layout: `mkdir -p ~/.aiforge/data && echo '[]' > ~/.aiforge/data/projects.json`. Ensure new XDG paths do NOT exist. Start the server. Verify files are moved to `~/.local/share/aiforge/` and `~/.config/aiforge/`. Check server logs for migration messages.
3. Manual: Restart the server again. Verify no migration runs (idempotent -- legacy paths are gone).
4. Manual: Create legacy paths AND new XDG paths. Restart. Verify new paths are NOT overwritten.

---

### Phase 5: E2E Test Isolation Fix + Documentation Updates

**What this phase accomplishes**: Update E2E test infrastructure to use the new socket directory, simplify `cleanupDaemonSockets()`, and update all documentation. After this phase, the E2E test isolation bug is fully resolved: E2E tests can no longer delete dev server sockets.

**Duration**: 1-2 days

**Tests to Write First**:
- The E2E tests themselves serve as the verification. No new test files needed, but existing E2E tests must continue to pass.
- Optionally add a targeted integration test:

```typescript
// test/integration/pty/socket-isolation.test.ts
describe('socket isolation', () => {
  it('sockets are created under AIFORGE_DATA_DIR/sockets/', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'socket-test-'));
    process.env.AIFORGE_DATA_DIR = tempDir;

    const socketDir = getSocketDir();
    expect(socketDir).toBe(join(tempDir, 'sockets'));

    // Create a socket file to verify the directory is correct
    await mkdir(socketDir, { recursive: true });
    const socketPath = getSocketPath('test-shell');
    expect(socketPath).toBe(join(tempDir, 'sockets', 'test-shell.sock'));

    await rm(tempDir, { recursive: true, force: true });
  });

  it('cleanup only scans instance-specific directory', async () => {
    // Verify findOrphanedSockets does NOT scan /tmp
    const tempDir = await mkdtemp(join(tmpdir(), 'socket-test-'));
    process.env.AIFORGE_DATA_DIR = tempDir;

    // Create a socket in /tmp that should NOT be found
    const tmpSocket = '/tmp/ai-ide-pty-fake.sock';
    await writeFile(tmpSocket, '');

    const manager = new PtyDaemonManager({ ... });
    const orphans = await manager.findOrphanedSockets([]);
    // Should not find the /tmp socket
    expect(orphans.find(o => o.includes('/tmp'))).toBeUndefined();

    await unlink(tmpSocket);
    await rm(tempDir, { recursive: true, force: true });
  });
});
```

**Implementation**:
- `test/e2e/fixtures.ts`: Simplify `cleanupDaemonSockets()`

```typescript
// Before: scans /tmp with regex and stale-socket detection
// After: simply cleans the test's own socket directory

import { getSocketDir } from '../../src/server/paths.js';

async function cleanupDaemonSockets(): Promise<void> {
  // With XDG refactoring, sockets live under DATA_DIR/sockets/
  // Since DATA_DIR is test-specific, we can safely delete everything
  const socketsDir = join(DATA_DIR, 'sockets');
  try {
    const files = readdirSync(socketsDir);
    for (const file of files) {
      if (file.endsWith('.sock')) {
        try {
          unlinkSync(join(socketsDir, file));
        } catch {
          // Socket may have been removed by another process
        }
      }
    }
  } catch {
    // Socket dir doesn't exist yet
  }
}
```

  The `isSocketStale()` function can be removed entirely since we no longer need to check whether a socket belongs to another instance -- the directory is guaranteed to be test-only.

- `playwright.config.ts`: No changes needed. `AIFORGE_DATA_DIR=./tmp/e2e-data` still works because `AIFORGE_DATA_DIR` is the highest-priority override.

- `test/test-isolation.ts`: No changes needed. It already sets `AIFORGE_DATA_DIR` which remains the override mechanism.

- `bin/aiforge.js`: Update help text

```typescript
// Change this line:
//   AIFORGE_DATA_DIR          Data directory (default: ~/.aiforge)
// To:
//   AIFORGE_DATA_DIR          Data directory override (default: ~/.local/share/aiforge)
```

- `scripts/generate-guid.ts`: Update config path reference

```typescript
// Change:
//   console.log('2. Or add to ~/.aiforge/config.json:');
// To:
//   console.log('2. Or add to ~/.config/aiforge/config.json:');
```

- `CLAUDE.md`: Update environment variables section

```markdown
# Update the AIFORGE_DATA_DIR description:
AIFORGE_DATA_DIR          # Data directory override (default: $XDG_DATA_HOME/aiforge or ~/.local/share/aiforge)

# Add new XDG variables:
XDG_CONFIG_HOME           # XDG config base (default: ~/.config); AIForge uses $XDG_CONFIG_HOME/aiforge/
XDG_DATA_HOME             # XDG data base (default: ~/.local/share); AIForge uses $XDG_DATA_HOME/aiforge/
```

**Dependencies**:
- Internal: All previous phases

**Verification**:
1. Run: `npm run lint && npm run typecheck && npm run build`
2. Run: `npm test` (all unit/integration tests pass)
3. Run: `npm run test:e2e` (all E2E tests pass)
4. Manual isolation test:
   a. Start the dev server: `npm run dev`
   b. Create a shell in the UI
   c. Verify socket exists: `ls ~/.local/share/aiforge/sockets/`
   d. In a separate terminal, run `npm run test:e2e`
   e. After E2E tests complete, verify the dev server shell still works (type in the terminal)
   f. Verify socket still exists: `ls ~/.local/share/aiforge/sockets/`
5. This confirms the core bug is fixed: E2E tests no longer kill dev server sockets.

---

## Common Utilities Needed

- **`src/server/paths.ts`**: The central path module created in Phase 1. Used by config, storage, PTY daemon manager, protocol, E2E fixtures, and migration. This is the key utility that eliminates all path duplication.

## External Libraries Assessment

- No external libraries are needed. The XDG spec is simple enough to implement with `node:path`, `node:os`, and `node:fs`. Libraries like `xdg-basedir` exist but add a dependency for ~5 lines of code.

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| **Socket path exceeds 107 bytes** | `validateSocketPathLength()` runs at startup and fails fast with a clear error message suggesting the user shorten `XDG_DATA_HOME` |
| **Existing `AIFORGE_DATA_DIR` users break** | `AIFORGE_DATA_DIR` remains the highest-priority override with no `aiforge/` suffix appended, preserving exact backwards compatibility |
| **Legacy data left behind after migration** | Auto-migration in Phase 4 moves files. Legacy `~/.aiforge/` directory may remain (empty or with non-AIForge files); we do not delete it automatically to avoid data loss |
| **Running daemons have sockets at old path** | Phase 3 changes where new sockets are created. Existing daemons at `/tmp/` paths will stop working after server restart. This is expected -- users kill and restart shells. Scrollback is preserved. |
| **E2E tests fail during partial rollout** | Phases are ordered so that E2E fixtures are updated last (Phase 5), after all underlying path changes are complete. Tests can be run at each phase boundary. |
| **Config file not found after migration** | Migration checks existence of both old and new paths. If both exist, new path wins. If neither exists, fresh defaults are used. |
| **NFS home directory (sockets fail on NFS)** | Document that users can set `AIFORGE_DATA_DIR` to a local filesystem path. This is an existing limitation of Unix domain sockets, not introduced by this refactoring. |
