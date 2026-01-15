import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { compactTheme } from '@graphty/compact-mantine';
import '@mantine/core/styles.css';
import './styles/global.css';
import { App } from './App';
import { log, getDebugConfig } from './services/logger';

// Log startup with debug config
const debugConfig = getDebugConfig();
log.startup.info({ debugConfig }, 'AIForge browser starting');
if (debugConfig.enabled) {
  log.startup.info('Debug logging enabled via query string');
  if (debugConfig.remoteLoggerUrl) {
    log.startup.info({ url: debugConfig.remoteLoggerUrl }, 'Remote logging enabled');
  }
}

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
