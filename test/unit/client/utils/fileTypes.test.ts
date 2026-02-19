/**
 * Tests for fileTypes utility functions
 */
import { describe, it, expect } from 'vitest';
import { detectFileType, getFileIcon, isImage, isMarkdown } from '@client/utils/fileTypes.js';

describe('fileTypes', () => {
  describe('detectFileType', () => {
    it('detects image files', () => {
      expect(detectFileType('photo.png')).toBe('image');
      expect(detectFileType('photo.jpg')).toBe('image');
      expect(detectFileType('photo.jpeg')).toBe('image');
      expect(detectFileType('photo.gif')).toBe('image');
      expect(detectFileType('photo.svg')).toBe('image');
      expect(detectFileType('photo.webp')).toBe('image');
      expect(detectFileType('photo.ico')).toBe('image');
      expect(detectFileType('photo.bmp')).toBe('image');
    });

    it('detects markdown files', () => {
      expect(detectFileType('README.md')).toBe('markdown');
      expect(detectFileType('docs.mdx')).toBe('markdown');
      expect(detectFileType('notes.markdown')).toBe('markdown');
    });

    it('detects code files as default', () => {
      expect(detectFileType('app.ts')).toBe('code');
      expect(detectFileType('index.js')).toBe('code');
      expect(detectFileType('style.css')).toBe('code');
      expect(detectFileType('data.json')).toBe('code');
    });

    it('handles uppercase extensions', () => {
      expect(detectFileType('photo.PNG')).toBe('image');
      expect(detectFileType('README.MD')).toBe('markdown');
    });

    it('handles files without extension', () => {
      expect(detectFileType('Makefile')).toBe('code');
      expect(detectFileType('Dockerfile')).toBe('code');
    });

    it('handles paths with multiple dots', () => {
      expect(detectFileType('/path/to/file.test.ts')).toBe('code');
      expect(detectFileType('/path/to/image.thumb.png')).toBe('image');
    });
  });

  describe('getFileIcon', () => {
    describe('TypeScript/JavaScript', () => {
      it('returns typescript for .ts and .tsx', () => {
        expect(getFileIcon('app.ts')).toBe('typescript');
        expect(getFileIcon('App.tsx')).toBe('typescript');
      });

      it('returns javascript for .js, .jsx, .mjs, .cjs', () => {
        expect(getFileIcon('app.js')).toBe('javascript');
        expect(getFileIcon('App.jsx')).toBe('javascript');
        expect(getFileIcon('utils.mjs')).toBe('javascript');
        expect(getFileIcon('config.cjs')).toBe('javascript');
      });
    });

    describe('Web', () => {
      it('returns html for .html and .htm', () => {
        expect(getFileIcon('index.html')).toBe('html');
        expect(getFileIcon('page.htm')).toBe('html');
      });

      it('returns css for .css', () => {
        expect(getFileIcon('style.css')).toBe('css');
      });

      it('returns css for preprocessors', () => {
        expect(getFileIcon('style.scss')).toBe('css');
        expect(getFileIcon('style.sass')).toBe('css');
        expect(getFileIcon('style.less')).toBe('css');
      });
    });

    describe('Data', () => {
      it('returns json for .json and .jsonc', () => {
        expect(getFileIcon('data.json')).toBe('json');
        expect(getFileIcon('settings.jsonc')).toBe('json');
      });

      it('returns yaml for .yaml and .yml', () => {
        expect(getFileIcon('config.yaml')).toBe('yaml');
        expect(getFileIcon('docker-compose.yml')).toBe('yaml');
      });

      it('returns xml for .xml', () => {
        expect(getFileIcon('pom.xml')).toBe('xml');
      });
    });

    describe('Documentation', () => {
      it('returns markdown for markdown files', () => {
        expect(getFileIcon('README.md')).toBe('markdown');
        expect(getFileIcon('docs.mdx')).toBe('markdown');
        expect(getFileIcon('notes.markdown')).toBe('markdown');
      });

      it('returns text for .txt', () => {
        expect(getFileIcon('notes.txt')).toBe('text');
      });
    });

    describe('Images', () => {
      it('returns image for image extensions', () => {
        expect(getFileIcon('photo.png')).toBe('image');
        expect(getFileIcon('photo.jpg')).toBe('image');
        expect(getFileIcon('photo.jpeg')).toBe('image');
        expect(getFileIcon('photo.gif')).toBe('image');
      });
    });

    describe('Config files', () => {
      it('returns env for .env files', () => {
        expect(getFileIcon('.env')).toBe('env');
        expect(getFileIcon('.env.local')).toBe('env');
        expect(getFileIcon('config.env')).toBe('env');
      });

      it('returns docker for Dockerfile', () => {
        expect(getFileIcon('Dockerfile')).toBe('docker');
        expect(getFileIcon('dev.dockerfile')).toBe('docker');
        expect(getFileIcon('Dockerfile.prod')).toBe('docker');
      });

      it('returns makefile for Makefile', () => {
        expect(getFileIcon('Makefile')).toBe('makefile');
        expect(getFileIcon('makefile')).toBe('makefile');
      });
    });

    describe('Shell', () => {
      it('returns shell for shell scripts', () => {
        expect(getFileIcon('script.sh')).toBe('shell');
        expect(getFileIcon('script.bash')).toBe('shell');
        expect(getFileIcon('script.zsh')).toBe('shell');
      });
    });

    describe('Other languages', () => {
      it('returns correct icon for various languages', () => {
        expect(getFileIcon('app.py')).toBe('python');
        expect(getFileIcon('app.rb')).toBe('ruby');
        expect(getFileIcon('main.go')).toBe('go');
        expect(getFileIcon('main.rs')).toBe('rust');
        expect(getFileIcon('App.java')).toBe('java');
        expect(getFileIcon('main.c')).toBe('c');
        expect(getFileIcon('header.h')).toBe('c');
        expect(getFileIcon('main.cpp')).toBe('cpp');
        expect(getFileIcon('main.cc')).toBe('cpp');
        expect(getFileIcon('header.hpp')).toBe('cpp');
      });
    });

    describe('Fallback', () => {
      it('returns file for unknown extensions', () => {
        expect(getFileIcon('data.xyz')).toBe('file');
        expect(getFileIcon('unknown')).toBe('file');
      });
    });
  });

  describe('isImage', () => {
    it('returns true for image files', () => {
      expect(isImage('photo.png')).toBe(true);
      expect(isImage('photo.jpg')).toBe(true);
      expect(isImage('photo.gif')).toBe(true);
    });

    it('returns false for non-image files', () => {
      expect(isImage('app.ts')).toBe(false);
      expect(isImage('README.md')).toBe(false);
      expect(isImage('style.css')).toBe(false);
    });
  });

  describe('isMarkdown', () => {
    it('returns true for markdown files', () => {
      expect(isMarkdown('README.md')).toBe(true);
      expect(isMarkdown('docs.mdx')).toBe(true);
      expect(isMarkdown('notes.markdown')).toBe(true);
    });

    it('returns false for non-markdown files', () => {
      expect(isMarkdown('app.ts')).toBe(false);
      expect(isMarkdown('photo.png')).toBe(false);
      expect(isMarkdown('style.css')).toBe(false);
    });
  });
});
