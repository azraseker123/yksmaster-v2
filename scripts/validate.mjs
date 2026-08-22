import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mustExist = [
  'api/index.js','handlers/auth/login.js','handlers/auth/register.js','handlers/auth/me.js',
  'handlers/user/profile.js','handlers/dashboard.js','handlers/curriculum.js','handlers/questions.js',
  'handlers/resources.js','handlers/ai.js','handlers/duels.js','public/index.html','public/app.js',
  'public/styles.css','sql/001_schema.sql','data/curriculum.js','vercel.json','package.json'
];
for (const rel of mustExist) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Eksik dosya: ${rel}`);
}
const apiFiles = fs.readdirSync(path.join(root, 'api')).filter(x => x.endsWith('.js'));
if (apiFiles.length !== 1 || apiFiles[0] !== 'index.js') {
  throw new Error(`Hobby sürümünde api/ altında yalnızca index.js olmalı. Bulunan: ${apiFiles.join(', ')}`);
}
const v = JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
if (!Array.isArray(v.rewrites) || !v.rewrites.some(r => r.source === '/api/:path*' && r.destination.includes('route=:path*'))) {
  throw new Error('Vercel API rewrite eksik.');
}
const app = fs.readFileSync(path.join(root,'public/app.js'),'utf8');
for (const endpoint of ['/api/auth/login','/api/auth/register','/api/dashboard','/api/curriculum','/api/questions','/api/resources','/api/ai']) {
  if (!app.includes(endpoint)) throw new Error(`Frontend endpointi bulunamadı: ${endpoint}`);
}
const router = fs.readFileSync(path.join(root,'api/index.js'),'utf8');
for (const route of ['auth/login','auth/register','auth/me','user/profile','dashboard','curriculum','questions','resources','ai','duels']) {
  if (!router.includes(`'${route}'`)) throw new Error(`Router route eksik: ${route}`);
}
console.log('YKS Master V2 Hobby-safe doğrulaması başarılı.');
console.log('Fiziksel Vercel Function sayısı: 1');
console.log('API handler sayısı:', fs.readdirSync(path.join(root,'handlers'), {withFileTypes:true}).length, '(klasörler dahil üst seviye)');
