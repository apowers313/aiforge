import '@testing-library/jest-dom';

// Mock matchMedia for Mantine color scheme detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => { /* deprecated */ },
    removeListener: (): void => { /* deprecated */ },
    addEventListener: (): void => { /* mock */ },
    removeEventListener: (): void => { /* mock */ },
    dispatchEvent: (): boolean => false,
  }) as MediaQueryList,
});

// Mock ResizeObserver for Mantine ScrollArea component
class MockResizeObserver {
  observe(): void { /* mock */ }
  unobserve(): void { /* mock */ }
  disconnect(): void { /* mock */ }
}

global.ResizeObserver = MockResizeObserver;
