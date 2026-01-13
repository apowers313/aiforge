import { useEffect, useRef } from 'react';
import { Box, ScrollArea } from '@mantine/core';
import type { TerminalLine } from '@client/mocks/terminal';

interface TerminalCanvasProps {
  lines: TerminalLine[];
  prompt: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function TerminalCanvas({ lines, prompt, inputValue, onInputChange, onKeyDown }: TerminalCanvasProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [lines, inputValue]);

  const handleContainerClick = (): void => {
    inputRef.current?.focus();
  };

  return (
    <ScrollArea
      style={{ flex: 1, cursor: 'text' }}
      viewportRef={(viewport) => {
        viewportRef.current = viewport;
      }}
      onClick={handleContainerClick}
    >
      <Box
        p="md"
        style={{
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
        data-testid="terminal-content"
      >
        {lines.map((line, index) => (
          <div key={index}>
            {line.type === 'prompt' && (
              <span style={{ color: 'var(--mantine-color-green-4)' }}>{line.content}</span>
            )}
            {line.type === 'input' && (
              <span style={{ color: 'var(--mantine-color-gray-3)' }}>{line.content}</span>
            )}
            {line.type === 'output' && (
              <span style={{ color: 'var(--mantine-color-gray-5)' }}>{line.content}</span>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: 'var(--mantine-color-green-4)' }}>{prompt}</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => { onInputChange(e.target.value); }}
            onKeyDown={onKeyDown}
            data-testid="terminal-input"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--mantine-color-gray-3)',
              fontFamily: 'monospace',
              fontSize: 14,
              padding: 0,
              margin: 0,
              caretColor: 'var(--mantine-color-gray-3)',
            }}
          />
        </div>
      </Box>
    </ScrollArea>
  );
}
