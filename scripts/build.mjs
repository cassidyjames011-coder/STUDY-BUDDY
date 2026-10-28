import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const out='public';fs.mkdirSync(out+'/assets',{recursive:true});
const normalized=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const inputs=['src/index.html','src/app.js','src/studioza.css','src/privacy.html','worker.js','frontend-worker.js','pnpm-lock.yaml','package.json','tailwind.config.cjs','wrangler.jsonc','wrangler.frontend.jsonc','wrangler.staging.jsonc'];
const id=crypto.createHash('sha256').update(inputs.map(normalized).join('\n')).digest('hex').slice(0,20);
fs.writeFileSync('release.js',`export const RELEASE_ID=${JSON.stringify(id)};\n`);
for(const name of ['index.html','privacy.html'])fs.writeFileSync(out+'/'+name,normalized('src/'+name));
fs.writeFileSync(out+'/assets/app.js',normalized('src/app.js'));
fs.copyFileSync('node_modules/lucide/dist/umd/lucide.min.js',out+'/assets/lucide.min.js');
fs.copyFileSync('node_modules/lucide/LICENSE',out+'/assets/LUCIDE-LICENSE');
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-c','tailwind.config.cjs','-i','src/tailwind.css','-o',out+'/assets/tailwind.css','--minify'],{stdio:'inherit'});
fs.writeFileSync(out+'/assets/studioza.css',normalized(out+'/assets/tailwind.css')+'\n'+normalized('src/studioza.css'));
fs.writeFileSync(out+'/build-info.json',JSON.stringify({release:id}));
for(const file of ['src/index.html','src/app.js']){const text=fs.readFileSync(file,'utf8');if(/\son(?:click|change|keydown|submit|dragover|drop|error)="/.test(text))throw Error('Inline event handler remains: '+file);}
console.log('Built self-hosted assets; release '+id);
