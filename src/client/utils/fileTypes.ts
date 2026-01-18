/**
 * File type detection utilities for the client
 */

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']);
const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown']);

export type FileType = 'image' | 'markdown' | 'code';

/**
 * Detect the file type from a file path
 */
export function detectFileType(path: string): FileType {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';

  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }

  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return 'markdown';
  }

  return 'code';
}

/**
 * Get the icon name for a file based on its extension
 */
export function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';

  // TypeScript/JavaScript
  if (['ts', 'tsx'].includes(ext)) return 'typescript';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'javascript';

  // Web
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (['scss', 'sass', 'less'].includes(ext)) return 'css';

  // Data
  if (ext === 'json' || ext === 'jsonc') return 'json';
  if (['yaml', 'yml'].includes(ext)) return 'yaml';
  if (ext === 'xml') return 'xml';

  // Documentation
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (ext === 'txt') return 'text';

  // Images
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';

  // Config
  if (ext === 'env' || path.includes('.env')) return 'env';
  if (ext === 'dockerfile' || path.toLowerCase().includes('dockerfile')) return 'docker';
  if (ext === 'makefile' || path.toLowerCase().includes('makefile')) return 'makefile';

  // Shell
  if (['sh', 'bash', 'zsh'].includes(ext)) return 'shell';

  // Other languages
  if (ext === 'py') return 'python';
  if (ext === 'rb') return 'ruby';
  if (ext === 'go') return 'go';
  if (ext === 'rs') return 'rust';
  if (ext === 'java') return 'java';
  if (['c', 'h'].includes(ext)) return 'c';
  if (['cpp', 'cc', 'hpp'].includes(ext)) return 'cpp';

  return 'file';
}

/**
 * Check if a file is an image
 */
export function isImage(path: string): boolean {
  return detectFileType(path) === 'image';
}

/**
 * Check if a file is markdown
 */
export function isMarkdown(path: string): boolean {
  return detectFileType(path) === 'markdown';
}
