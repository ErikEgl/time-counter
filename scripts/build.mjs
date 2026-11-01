import {cp, mkdir, readFile, writeFile, readdir, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {generateIcons} from './icons.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await generateIcons(`${root}app/icons`);
await mkdir(`${root}dist`,{recursive:true});
await cp(`${root}app`,`${root}dist`,{recursive:true});
const files=await readdir(`${root}dist`);
if(!files.includes('index.html')||!files.includes('sw.js'))throw new Error('Неполная сборка');
const manifest=JSON.parse(await readFile(`${root}dist/manifest.webmanifest`,'utf8'));
if(manifest.start_url!=='./'||manifest.scope!=='./')throw new Error('Неверные пути PWA');
// Every published shell has its own cache, including releases without a version bump.
const hash=createHash('sha256');
for(const path of (await readdir(`${root}app`,{recursive:true})).sort()) {
  if(path==='sw.js')continue;
  const fullPath=`${root}app/${path}`;
  if((await stat(fullPath)).isFile())hash.update(path).update(await readFile(fullPath));
}
const worker=await readFile(`${root}app/sw.js`,'utf8');
hash.update(worker);
await writeFile(`${root}dist/sw.js`,worker.replace(/const CACHE = '[^']+';/,`const CACHE = 'my-report-shell-${hash.digest('hex').slice(0,16)}';`));
await writeFile(`${root}dist/.nojekyll`,'');
console.log('Готово: dist/ — статическое PWA без внешних зависимостей.');
