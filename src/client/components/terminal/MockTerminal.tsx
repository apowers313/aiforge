import { useState } from 'react';
import { Box, Group, Text, Badge } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { useShell } from '@client/hooks/useShells';
import { TerminalCanvas } from './TerminalCanvas';
import { executeCommand, formatPrompt, type TerminalLine } from '@client/mocks/terminal';

interface MockTerminalProps {
  shellId: string;
}

export function MockTerminal({ shellId }: MockTerminalProps): React.ReactElement {
  const shell = useShell(shellId);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [inputValue, setInputValue] = useState('');

  const cwd = shell?.cwd ?? '/';
  const prompt = formatPrompt(cwd);

  if (!shell) {
    return (
      <Box
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text c="dimmed">Shell not found</Text>
      </Box>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      const command = inputValue.trim();

      // Add the prompt and command to history
      setLines((prev) => [
        ...prev,
        { type: 'prompt', content: prompt },
        { type: 'input', content: command },
      ]);

      // Execute the command
      if (command === 'clear') {
        setLines([]);
      } else if (command) {
        const result = executeCommand(command, cwd);
        setLines((prev) => [
          ...prev,
          ...result.output.map((output): TerminalLine => ({ type: 'output', content: output })),
        ]);
      }

      setInputValue('');
    }
  };

  const statusColor = shell.status === 'active' ? 'green' : shell.status === 'error' ? 'red' : 'gray';

  return (
    <Box
      data-testid="terminal-container"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--mantine-color-dark-9)',
      }}
    >
      {/* Terminal Header */}
      <Box
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-4)',
          padding: '8px 16px',
          backgroundColor: 'var(--mantine-color-dark-7)',
        }}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <IconTerminal2 size={16} style={{ color: 'var(--mantine-color-green-4)' }} />
            <Text size="sm" fw={500}>
              {shell.name}
            </Text>
          </Group>
          <Group gap="xs">
            <Badge size="xs" variant="dot" color={statusColor}>
              {shell.status}
            </Badge>
            {shell.pid && (
              <Text size="xs" c="dimmed">
                PID: {shell.pid}
              </Text>
            )}
          </Group>
        </Group>
      </Box>

      {/* Terminal Content */}
      <TerminalCanvas
        lines={lines}
        prompt={prompt}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onKeyDown={handleKeyDown}
      />
    </Box>
  );
}
