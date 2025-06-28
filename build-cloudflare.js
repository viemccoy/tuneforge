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
  'src/web/index-merged.html',
  'src/web/app-cloudflare.js',
  'src/web/style.css',
  'src/web/style-bins.css',
  'src/web/style-merged.css'
];

staticFiles.forEach(file => {
  const src = path.join(__dirname, file);
  const filename = path.basename(file);
  const dest = path.join(distDir, filename === 'index-merged.html' ? 'index.html' : filename);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied ${file} to dist/`);
  } else {
    console.error(`✗ File not found: ${file}`);
  }
});

// Combine CSS files
const mainCSS = fs.readFileSync(path.join(__dirname, 'src/web/style.css'), 'utf8');
const binsCSS = fs.readFileSync(path.join(__dirname, 'src/web/style-bins.css'), 'utf8');
const mergedCSS = fs.readFileSync(path.join(__dirname, 'src/web/style-merged.css'), 'utf8');
fs.writeFileSync(path.join(distDir, 'style.css'), mainCSS + '\n\n' + binsCSS + '\n\n' + mergedCSS);
console.log('✓ Combined CSS files');

// Update HTML to use correct JS file
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
html = html.replace('app-cloudflare.js', 'app.js');
fs.writeFileSync(path.join(distDir, 'index.html'), html);

// Rename JS file
fs.renameSync(path.join(distDir, 'app-cloudflare.js'), path.join(distDir, 'app.js'));
console.log('✓ Updated HTML references');

console.log('\n🔥 Build complete! Ready for Cloudflare Pages deployment.');