// Production deploy: the web app's files are embedded in the Worker itself.
//
// Why: deploys run from a Claude Code cloud session, whose network proxy
// replaces the token wrangler uses to upload static assets, so `assets` uploads
// fail (401). Embedding avoids that upload entirely; worker/src/embedded.ts
// serves the files with the same rules the `assets` config had.
//
// The Worker has a size limit (3 MB compressed on the free plan). This script
// stops before deploying when the bundle reaches LIMIT (2.5 MB) — at that point
// switch to deploying from GitHub with Cloudflare Workers Builds (see PROGRESS.md).
//
//   node scripts/deploy.mjs           build bundle, check size, deploy
//   node scripts/deploy.mjs --check   build bundle and check size only
// Run `npm run build` first (npm run deploy / npm run size do both).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT = 2.5 * 1024 * 1024;
const CHECK_ONLY = process.argv.includes('--check');
const DIST = 'dist';
const CLIENT = join(DIST, 'client');
const OUT = join(DIST, 'embed');
const SKIP = new Set(['_headers', '_redirects']);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// 0. Secrecy (UPDATE-2 rule one): the browser files must never carry challenge card text.
//    (A title that is also a public word — a stage name or a screen named in the brief — is skipped.)
{
  const deck = JSON.parse(readFileSync('updates/update-2/data/challenge-deck.json', 'utf8'));
  const brief = readFileSync('updates/update-2/UPDATE-2.md', 'utf8');
  const stageNames = Object.values(deck.stages).map((s) => s.label);
  const secrets = deck.days.flatMap((d) => [d.hook, d.idea, d.constraint, d.successMark, ...(stageNames.includes(d.title) || brief.includes(d.title) ? [] : [d.title])].filter(Boolean));
  const leaks = walk(CLIENT).filter((f) => {
    const text = readFileSync(f, 'latin1');
    const utf = Buffer.from(text, 'latin1').toString('utf8');
    return secrets.some((t) => utf.includes(t));
  });
  if (leaks.length) {
    console.error(`STOP: challenge card text found in the web files (${leaks.length} file(s)). Not deploying.`);
    process.exit(1);
  }
  console.log('Secrecy check: no card text in the web files ✓');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'files'), { recursive: true });

// 1. Copy each client file as <path>.bin (imported as an ArrayBuffer "Data" module).
const imports = [];
const entries = [];
walk(CLIENT).forEach((file, i) => {
  const rel = relative(CLIENT, file).split('\\').join('/');
  if (SKIP.has(rel)) return;
  const bin = join(OUT, 'files', `${rel}.bin`);
  mkdirSync(join(bin, '..'), { recursive: true });
  cpSync(file, bin);
  const etag = `"${createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 20)}"`;
  imports.push(`import f${i} from ${JSON.stringify(`./files/${rel}.bin`)};`);
  entries.push(`  ${JSON.stringify(`/${rel}`)}: { body: f${i}, etag: ${JSON.stringify(etag)} },`);
});
const headersText = readFileSync(join(CLIENT, '_headers'), 'utf8');
writeFileSync(join(OUT, 'entry.js'), `import app from '../lawhat_almashahed/index.js';
import { withEmbeddedAssets } from '../../worker/src/embedded.ts';
${imports.join('\n')}
export default withEmbeddedAssets(app, {
${entries.join('\n')}
}, ${JSON.stringify(headersText)});
`);

// 2. Wrangler config: the one the Vite build produced, minus `assets`, bundling the entry above.
const cfg = JSON.parse(readFileSync(join(DIST, 'lawhat_almashahed', 'wrangler.json'), 'utf8'));
delete cfg.assets;
delete cfg.configPath;
delete cfg.userConfigPath;
cfg.main = 'entry.js';
cfg.no_bundle = false;
cfg.upload_source_maps = false;
cfg.rules = [{ type: 'Data', globs: ['**/*.bin'], fallthrough: false }];
for (const d of cfg.d1_databases ?? []) d.migrations_dir = '../../worker/migrations';
writeFileSync(join(OUT, 'wrangler.json'), JSON.stringify(cfg, null, 2));

// 3. Bundle without deploying, then measure what Cloudflare will count (compressed size).
const wrangler = (args) => execFileSync('npx', ['wrangler', ...args, '--config', join(OUT, 'wrangler.json')], { stdio: 'inherit' });
wrangler(['deploy', '--dry-run', '--outdir', resolve(OUT, 'bundle')]);
let raw = 0;
let gz = 0;
for (const f of walk(resolve(OUT, 'bundle'))) {
  if (f.endsWith('.map') || f.endsWith('README.md')) continue;
  const b = readFileSync(f);
  raw += b.length;
  gz += gzipSync(b, { level: 9 }).length;
}
const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`\nWorker bundle: ${mb(raw)} MB, compressed ${mb(gz)} MB (stop at ${mb(LIMIT)} MB, Cloudflare free limit 3 MB)`);
writeFileSync(join(OUT, 'size.json'), JSON.stringify({ raw, gzip: gz, limit: LIMIT }) + '\n');

if (gz >= LIMIT) {
  console.error(`
✘ STOP: the Worker bundle is ${mb(gz)} MB compressed, at or above the ${mb(LIMIT)} MB safety line.
  Not deploying. Next step (agreed with the user): deploy from GitHub with Cloudflare Workers Builds.
✘ توقّف النشر: حجم البرنامج ${mb(gz)} ميجا بعد الضغط، وصل حد الأمان ${mb(LIMIT)} ميجا.
  الخطوة التالية (المتفق عليها): ربط GitHub بـ Cloudflare والنشر من هناك.`);
  process.exit(1);
}
if (CHECK_ONLY) process.exit(0);

// 4. Deploy.
wrangler(['deploy']);
