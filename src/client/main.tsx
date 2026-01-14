import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { compactTheme } from '@graphty/compact-mantine';
import { RemoteLogClient } from '@graphty/remote-logger';
import '@mantine/core/styles.css';
import './styles/global.css';
import { App } from './App';

// Set up remote logging for debugging terminal switch delay
const remoteLogger = new RemoteLogClient({
  serverUrl: 'https://dev.ato.ms:9085',
  projectMarker: 'aiforge-terminal-debug',
});

// Intercept console.log to send to remote logger
const originalConsoleLog = console.log.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);

console.log = (...args: unknown[]): void => {
  originalConsoleLog(...args);
  remoteLogger.log('INFO', args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
};
console.warn = (...args: unknown[]): void => {
  originalConsoleWarn(...args);
  remoteLogger.log('WARN', args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
};
console.error = (...args: unknown[]): void => {
  originalConsoleError(...args);
  remoteLogger.log('ERROR', args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
};

console.log('[REMOTE_LOGGER] Remote logging initialized');

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <MantineProvider theme={compactTheme} defaultColorScheme="dark">
        <App />
      </MantineProvider>
    </StrictMode>,
  );
}
