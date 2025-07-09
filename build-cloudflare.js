#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create dist directory
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Copy static files
const staticFiles = [
  'src/web/index-ultimate.html',
  'src/web/app-ultimate.js',
  'src/web/loom.js',
  'src/web/login.html',
  'src/web/login.js',
  'src/web/style.css',
  'src/web/style-bins.css',
  'src/web/style-final.css',
  'src/web/style-ultimate.css',
  'src/web/style-loom.css'
];

staticFiles.forEach(file => {
  const src = path.join(__dirname, file);
  const filename = path.basename(file);
  const dest = path.join(distDir, filename === 'index-ultimate.html' ? 'index.html' : 
                         filename === 'app-ultimate.js' ? 'app.js' : filename);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied ${file} to dist/`);
  } else {
    console.error(`✗ File not found: ${file}`);
  }
});

// Don't combine CSS files - keep them separate for the ultimate version
console.log('✓ CSS files copied separately');

// No need to rename files or update references - already handled in the copy step
console.log('✓ Build uses ultimate UI with all features');

console.log('\n🔥 Build complete! Ready for Cloudflare Pages deployment.');