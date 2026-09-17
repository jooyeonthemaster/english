// Assemble slides/s*.html into index.html from template.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(ROOT, 'slides')).filter((f) => /^s\d+\.html$/.test(f)).sort();
const problems = [];
const parts = files.map((f) => {
  const html = readFileSync(join(ROOT, 'slides', f), 'utf8').trim();
  const id = f.replace('.html', '');
  const secCount = (html.match(/<section/g) || []).length;
  if (secCount !== 1) problems.push(`${f}: ${secCount} <section> tags`);
  if (!html.includes(`id="${id}"`)) problems.push(`${f}: missing id="${id}"`);
  return html;
});
const tpl = readFileSync(join(ROOT, 'template.html'), 'utf8');
writeFileSync(join(ROOT, 'index.html'), tpl.replace('<!--SLIDES-->', parts.join('\n\n')));
console.log(`built index.html with ${files.length} slides: ${files.join(', ')}`);
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
