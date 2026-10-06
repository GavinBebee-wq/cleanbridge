#!/usr/bin/env node
/* Builds dist/cleanbridge.html: the page, styles and scripts in one file, for hosts that take a
   single page plus data files (a Claude artifact). It still reads the feed from data/. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFile(path.join(ROOT, f), 'utf8');
const [css, config, data, app] = await Promise.all([read('styles.css'), read('config.js'), read('data.js'), read('app.js')]);
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const html = `<title>CleanBridge</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800;900&family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&display=swap">
<style>
${css}</style>
<div id="root"></div><div id="toasts" class="toasts" aria-live="polite"></div>
<script>
window.CLEANBRIDGE_EMBEDDED = true;
${safe(config)}
${safe(data)}
${safe(app)}</script>
`;
await mkdir(path.join(ROOT, 'dist'), { recursive: true });
await writeFile(path.join(ROOT, 'dist', 'cleanbridge.html'), html);
console.log(`wrote dist/cleanbridge.html (${Math.round(html.length / 1024)} KB)`);
