/**
 * 生成推送口令（VAPID 密钥），不依赖任何第三方库，只用 Node 自带的 crypto。
 * 用法：由 第1步-生成口令.cmd 调用；仓库地址通过环境变量 FD_REPO 传入。
 * 输出：同目录下 key.txt（两串口令）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));

const raw = (process.env.FD_REPO || process.argv[2] || '').trim()
  .replace(/^https?:\/\/github\.com\//i, '')
  .replace(/\.git$/i, '')
  .replace(/^\/+|\/+$/g, '');

// P-256 密钥对 + base64url 编码
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const publicKey = ecdh.getPublicKey().toString('base64url');   // 65 字节：04 || X || Y
const privateKey = ecdh.getPrivateKey().toString('base64url'); // 32 字节

// 顺便填好网页要用的 config.json。
// 网页在 tools/../push-site，在仓库里（上传到 GitHub 后）则是 tools/../docs，两个都试一下。
const candidates = [
  path.join(here, '..', 'push-site', 'config.json'),
  path.join(here, '..', 'docs', 'config.json')
];
for (const cfgPath of candidates) {
  if (!fs.existsSync(cfgPath)) continue;
  let cfg = { githubRepo: '', vapidPublicKey: '', branch: 'main' };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch {}
  cfg.githubRepo = raw || cfg.githubRepo || '';
  cfg.vapidPublicKey = publicKey;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  break;
}

const lines = [
  'VAPID keys',
  '',
  '=== 1. VAPID_PUBLIC_KEY ===',
  publicKey,
  '',
  '=== 2. VAPID_PRIVATE_KEY ===',
  privateKey,
  '',
  'repository: ' + (raw || '(not set)'),
  ''
];
fs.writeFileSync(path.join(here, 'key.txt'), lines.join('\r\n'), 'utf8');
console.log('OK -> key.txt');
