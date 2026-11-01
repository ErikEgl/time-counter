import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {generateIcons} from './icons.mjs';
const root=fileURLToPath(new URL('../app/',import.meta.url));
await generateIcons(`${root}icons`);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const port=Number(process.env.PORT||4173);
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');let path=decodeURIComponent(url.pathname);
    // Also exercise project-site paths locally.
    if(path.startsWith('/time-counter/'))path=path.slice('/time-counter'.length);
    let file=resolve(root,'.'+path);if(file!==resolve(root)&&!file.startsWith(resolve(root)+sep))throw new Error('Forbidden');
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Не найдено');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/time-counter/`));
