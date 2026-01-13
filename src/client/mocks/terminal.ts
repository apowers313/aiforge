export interface TerminalLine {
  type: 'input' | 'output' | 'prompt';
  content: string;
}

export interface CommandResult {
  output: string[];
  exitCode: number;
}

const mockCommands: Record<string, (args: string[], cwd: string) => CommandResult> = {
  echo: (args: string[]): CommandResult => ({
    output: [args.join(' ')],
    exitCode: 0,
  }),

  pwd: (_args: string[], cwd: string): CommandResult => ({
    output: [cwd],
    exitCode: 0,
  }),

  ls: (): CommandResult => ({
    output: [
      'total 16',
      'drwxr-xr-x  4 user user 4096 Jan 10 10:00 .',
      'drwxr-xr-x 12 user user 4096 Jan 10 09:00 ..',
      '-rw-r--r--  1 user user  256 Jan 10 10:00 package.json',
      '-rw-r--r--  1 user user  128 Jan 10 10:00 tsconfig.json',
      'drwxr-xr-x  3 user user 4096 Jan 10 10:00 src',
      'drwxr-xr-x  2 user user 4096 Jan 10 10:00 node_modules',
    ],
    exitCode: 0,
  }),

  cat: (args: string[]): CommandResult => {
    if (args.length === 0) {
      return { output: ['cat: missing file operand'], exitCode: 1 };
    }
    const filename = args[0] ?? '';
    if (filename === 'package.json') {
      return {
        output: [
          '{',
          '  "name": "my-project",',
          '  "version": "1.0.0",',
          '  "main": "index.js"',
          '}',
        ],
        exitCode: 0,
      };
    }
    return { output: [`cat: ${filename}: No such file or directory`], exitCode: 1 };
  },

  whoami: (): CommandResult => ({
    output: ['user'],
    exitCode: 0,
  }),

  date: (): CommandResult => ({
    output: [new Date().toString()],
    exitCode: 0,
  }),

  clear: (): CommandResult => ({
    output: [],
    exitCode: 0,
  }),

  help: (): CommandResult => ({
    output: [
      'Available mock commands:',
      '  echo <text>    - Print text',
      '  pwd            - Print working directory',
      '  ls             - List directory contents',
      '  cat <file>     - Display file contents',
      '  whoami         - Print current user',
      '  date           - Print current date',
      '  clear          - Clear terminal',
      '  help           - Show this help',
      '',
      'Note: This is a mock terminal. Commands are simulated.',
    ],
    exitCode: 0,
  }),
};

export function executeCommand(input: string, cwd: string): CommandResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { output: [], exitCode: 0 };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0] ?? '';
  const args = parts.slice(1);

  const handler = mockCommands[command];
  if (handler) {
    return handler(args, cwd);
  }

  return {
    output: [`${command}: command not found (mock terminal)`],
    exitCode: 127,
  };
}

export function formatPrompt(cwd: string): string {
  return `${cwd} $ `;
}
