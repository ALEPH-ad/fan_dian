/**
 * GitHub Actions：每 5 分钟检查一次，到饭点就发 Web Push 到你的手机。
 *
 * 只用 GitHub 自带的能力，不需要自己填任何密钥：
 *   GITHUB_TOKEN        自动提供，用来读写仓库里的 data.json（记下今天发过哪些提醒）
 *   VAPID_PUBLIC_KEY    仓库 Settings → Secrets and variables → Actions 里设置一次
 *   VAPID_PRIVATE_KEY   同上
 *
 * 网页保存设置、登记订阅都会触发本工作流（push 事件），到点由定时任务触发（schedule 事件）。
 * 两种触发共用这一份脚本，数据都放在 data.json 里，做到无服务器、不需要你自己的数据库。
 */
import webpush from 'web-push';

const owner = process.env.GITHUB_REPOSITORY_OWNER;
const repo = (process.env.GITHUB_REPOSITORY || '').split('/')[1];
const branch = process.env.GITHUB_REF_NAME || process.env.REPORT_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;
const CLEAR_TESTS = process.argv.includes('--clear-tests');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
// VAPID 的联系邮箱：优先用仓库里 Actions 变量 VAPID_MAILTO（可选），没有就用发信人账号
const MAILTO = process.env.VAPID_MAILTO || `${owner}.noreply@github.com`;

const DATA_PATH = 'data.json';
const DEFAULT_TIMES = ['07:30', '11:45', '17:45'];
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];
const MEAL_NAMES = { breakfast: '早饭', lunch: '午饭', dinner: '晚饭' };
const EMOJI = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };
const PRAISE = {
  breakfast: '🥣 早饭吃点温热的：粥、蒸蛋、半个包子，垫一垫就好。',
  lunch: '🍱 午饭吃七八分就好，肉和菜多一点，主食别过量。',
  dinner: '🥗 晚饭清淡一点，少油少盐，睡前留出 3 小时。'
};

// 每顿饭点了好几份提醒文案，随机挑，每天看到的都不一样
const MEAL_VARIANTS = {
  breakfast: [
    { title: '🌅 早饭时间 · 别空腹', lines: ['空腹先别灌汽水，对胃不好。', '🥚 先吃点蛋白质，一上午都有精神。'] },
    { title: '🌅 早饭时间 · 七分饱', lines: ['吃个七分饱，别撑。', '☕ 想要精神好，比咖啡更管用的是一个热乎早饭。'] },
    { title: '🌅 早饭时间 · 好好吃', lines: ['一口一口慢慢吃，别边走边塞。', '🍚 吃饱了，上午才有底气。'] }
  ],
  lunch: [
    { title: '☀️ 午饭时间 · 慢慢嚼', lines: ['吃慢点，嚼碎了再咽，肚子更好受。', '🥬 先吃几口青菜再动主食，饱得慢一点。', '🚫 零食留到下午再说，现在先吃饭。'] },
    { title: '☀️ 午饭时间 · 别用零食应付', lines: ['一顿正经午饭，抵得上一整袋零食。', '⚠️ 吃完渴了喝温水，别再开一罐汽水。', '🍱 吃饱就好，别撑到下午打瞌睡。'] },
    { title: '☀️ 午饭时间 · 七分饱', lines: ['筷子放下时应该还想再吃一点点，那就对了。', '❌ 膨化食品今天先放一放。', '🚶 吃完站起来走两步。'] }
  ],
  dinner: [
    { title: '🌙 晚饭时间 · 别吃太撑', lines: ['晚上吃多了最容易涨肚子、睡不好。', '🍲 汤别喝太多，饭别添第二碗。', '🚶 吃完散散步，比躺沙发强。'] },
    { title: '🌙 晚饭时间 · 别碰夜宵零食', lines: ['晚饭好好吃，晚上就不会想找零食。', '❌ 薯片、汽水、辣条这顿都先收起来。', '🌙 睡前留出 3 小时，睡得踏实。'] },
    { title: '🌙 晚饭时间 · 好好收个尾', lines: ['一天最后一顿，吃得舒服最重要。', '🥦 菜多一点，油少一点。', '🍵 吃完喝杯温水，别急着躺下。'] }
  ]
};
const BAD = ['薯片', '虾条', '锅巴', '爆米花', '辣条', '方便面'];
const INTROS = [
  '肚子嘀嘀咕咕了，到饭点啦～',
  '该吃饭了，别硬扛～',
  '饭点到了，先照顾一下自己的胃吧。',
  '停一停手里的事，吃饭时间到咯。'
];
const RULES = [
  '⚠️ 酥脆的膨化食品先放一放，吃完口渴又涨肚，还压不住饿。',
  '⚠️ 容易涨肚的少吃：汽水、豆类、糯米、大量汤水，吃完一下午都难受。',
  '⚠️ 吃慢点、嚼碎点，七分饱就放下筷子，肚子别撑成气球。',
  '🥬 青菜和蛋白质多一点，吃到舒服就停。'
];
const ENDINGS = [
  '乖乖吃顿正经饭，零食盒子先收起来～',
  '吃完记得喝点温水，别急着躺下。',
  '吃完站起来走两步，帮肚子消消气。',
  '吃饱了心情会变好，去吧～'
];

/* ---------------- GitHub 仓库读写 ---------------- */
// 网站目录（docs/），里面放网页和 data.json；本地测试时是 tools/../push-site
const SITE_DIR = (process.env.FD_SITE_DIR || 'push-site').replace(/^\/+|\/+$/g, '');
const API_BASE = process.env.FD_API_BASE || `https://api.github.com/repos/${owner}/${repo}/contents`;
function contentsUrl(file) {
  return `${API_BASE}/${file}`;
}
function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'fan-dian-push-worker'
  };
}
function normalize(data) {
  const prefs = Object.assign({ enabled: true, window: 60, times: DEFAULT_TIMES.slice(), days: [0, 1, 2, 3, 4, 5, 6], nameBad: true }, data.prefs || {});
  for (let i = 0; i < 3; i++) if (!prefs.times[i]) prefs.times[i] = DEFAULT_TIMES[i];
  return { subs: Array.isArray(data.subs) ? data.subs : [], prefs, fired: data.fired || {}, state: data.state || {} };
}
const dataFile = () => `${SITE_DIR}/${DATA_PATH}`;
async function readData() {
  const r = await fetch(`${contentsUrl(dataFile())}?ref=${encodeURIComponent(branch)}`, { headers: headers() });
  if (r.status === 404) return { data: normalize({}), sha: null };
  if (!r.ok) throw new Error(`读取 data.json 失败 ${r.status}: ${await r.text()}`);
  const j = await r.json();
  let data = {};
  try { data = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); } catch {}
  return { data: normalize(data), sha: j.sha };
}
async function writeData(data, sha, message) {
  const body = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    branch
  };
  if (sha) body.sha = sha;
  const r = await fetch(contentsUrl(dataFile()), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`写入 data.json 失败 ${r.status}: ${await r.text()}`);
}

/* ---------------- 时间 ---------------- */
function beijingNow(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short'
  }).formatToParts(d);
  const g = t => (p.find(x => x.type === t) || {}).value;
  const hh = Number(g('hour')) % 24, mm = Number(g('minute'));
  return { date: `${g('year')}-${g('month')}-${g('day')}`, iso: d.toISOString(), weekday: g('weekday'), minutes: hh * 60 + mm, hh, mm };
}
function parseHM(hm) {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/* ---------------- 文案 ---------------- */
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
function buildMessage(i, late, seed) {
  const key = MEAL_KEYS[i];
  // 迟到 / 正常 用不同开头
  const lines = [
    late ? pick(LATE_INTROS, seed) : pick(INTROS, seed)
  ];
  // 主文案：每顿 4 份（含基础版），随机挑一份
  const basics = [{ title: `${EMOJI[key]} ${MEAL_NAMES[key]}时间 · 别吃膨化`, lines: [PRAISE[key]] }];
  const variant = pick(basics.concat(MEAL_VARIANTS[key]), seed + 5);
  lines.push.apply(lines, variant.lines);
  if (state_nameBad !== false) lines.push(`❌ 别买：${BAD.slice(0, 4).join('、')}，这些就是会涨肚的膨化/气泡雷区。`);
  lines.push(late ? '快去吃点正经的，别用零食凑合。' : pick(RULES, seed + 1));
  lines.push(pick(ENDINGS, seed + 2));
  return {
    title: variant.title,
    body: lines.join('\n'),
    tag: 'fan-dian-' + key,
    meal: key,
    late: !!late,
    url: './'
  };
}
const LATE_INTROS = [
  '饭点过了一阵啦，再拖下去容易饿到乱吃东西哦。',
  '还没吃吗？别硬扛到下午。',
  '过了点还没吃，先吃点正经的吧。'
];
let state_nameBad = true; // 由 main() 从 prefs 里读取

/* ---------------- 发送 ---------------- */
async function sendOne(sub, payload) {
  try {
    await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'high' });
    return { ok: true };
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) return { ok: false, gone: true };
    return { ok: false, gone: false, status: e.statusCode, body: String(e.body || e.message).slice(0, 300) };
  }
}

async function main() {
  if (!TOKEN || !owner || !repo) throw new Error('缺少 GITHUB_TOKEN / GITHUB_REPOSITORY');
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.log('未配置 VAPID 密钥：请在仓库 Settings → Secrets and variables → Actions 添加 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY，然后重跑。');
    return;
  }
  webpush.setVapidDetails('mailto:' + MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);

  const { data, sha } = await readData();
  state_nameBad = data.prefs.nameBad;
  const now = beijingNow();
  const week = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[now.weekday];
  console.log(`北京 ${now.date} ${now.weekday} ${String(now.hh).padStart(2, '0')}:${String(now.mm).padStart(2, '0')}`);
  console.log(`订阅 ${data.subs.length} 台 · 提醒开关 ${data.prefs.enabled !== false}`);

  let dirty = false;
  const results = [];

  // 1) 网页里点了「测试真推送」：立即给所有设备发一条测试
  const testDue = data.subs.some(s => s.test);
  if (testDue) {
    const payload = Buffer.from(JSON.stringify({
      title: '🧪 测试推送',
      body: '如果你在锁屏状态下看到这条，就说明到饭点也会这样叫你。\n（薯片虾条别买，会涨肚～）',
      tag: 'fan-dian-test',
      meal: 'test',
      ts: Date.now()
    }));
    for (const sub of data.subs) {
      const res = await sendOne(sub, payload);
      if (res.gone) { sub.__gone = true; dirty = true; }
      results.push({ kind: 'test', id: sub.id, ...res });
    }
    if (!CLEAR_TESTS) {
      for (const s of data.subs) delete s.test;
      dirty = true;
    }
  }

  // 2) 到点提醒
  if (data.prefs.enabled !== false) {
    const days = Array.isArray(data.prefs.days) ? data.prefs.days : [0, 1, 2, 3, 4, 5, 6];
    for (let i = 0; i < 3; i++) {
      const mins = parseHM(data.prefs.times[i]);
      const diff = now.minutes - mins;
      const key = `${now.date}|${i}`;
      if (diff < -2 || diff > 20) continue;        // 只在新到的这个 5 分钟窗口里发
      if (data.fired[key]) continue;                // 今天已发过
      if (!days.includes(week)) { console.log(`${MEAL_NAMES[MEAL_KEYS[i]]}：今天不提醒`); continue; }

      const seed = now.minutes + i * 7;
      const msg = buildMessage(i, diff >= 10, seed);
      const payload = Buffer.from(JSON.stringify({ ...msg, ts: Date.now() }));
      let sentCount = 0;
      for (const sub of data.subs) {
        if (sub.__gone) continue;
        const sdays = Array.isArray(sub.days) ? sub.days : [0, 1, 2, 3, 4, 5, 6];
        if (!sdays.includes(week)) continue;
        const res = await sendOne(sub, payload);
        if (res.gone) { sub.__gone = true; dirty = true; }
        else if (res.ok) sentCount++;
        results.push({ kind: 'meal', meal: msg.meal, title: msg.title, id: sub.id, ...res });
      }
      console.log(`「${msg.title}」发送给 ${sentCount} 台设备`);
      data.fired[key] = now.iso;
      dirty = true;
    }
  }

  // 3) 清理：已失效订阅、3 天前的发送记录
  if (data.subs.some(s => s.__gone)) {
    data.subs = data.subs.filter(s => !s.__gone);
    dirty = true;
  }
  const cutoff = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  for (const k of Object.keys(data.fired)) {
    if (k.slice(0, 10) < cutoff) { delete data.fired[k]; dirty = true; }
  }
  for (const s of data.subs) delete s.__gone;

  if (results.length) console.log(JSON.stringify(results, null, 2));

  if (dirty) {
    await writeData(data, sha, `push: ${results.length ? results.map(r => r.kind).join(',') + ' ' + now.date + ' ' + now.minutes : 'cleanup'}`);
    console.log('data.json 已更新');
  } else {
    console.log('本次无变化');
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
