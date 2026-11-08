import { defineConfig } from 'vite';
export default defineConfig({ root: 'tests/viewer', server: { port: 5199, fs: { allow: ['../..'] } } });
