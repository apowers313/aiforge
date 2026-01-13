import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { compactTheme } from '@graphty/compact-mantine';
import '@mantine/core/styles.css';
import './styles/global.css';
import { App } from './App';

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
