/* 铁线时刻：一条会「走」的线，到饭点化成消息气泡 */
const MEALS = [
  { key: 'breakfast', label: '早饭', time: '07:30', x: 74, y: 100 },
  { key: 'lunch', label: '午饭', time: '11:45', x: 226, y: 212 },
  { key: 'dinner', label: '晚饭', time: '17:45', x: 96, y: 330 }
];
const NS = 'http://www.w3.org/2000/svg';
const PATH_D = 'M 26 18 C 150 16, 34 120, 104 132 S 246 160, 232 208 S 60 282, 116 302 S 190 352, 150 404';

function createWire(host, opts = {}) {
  host.innerHTML = '';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 420');
  svg.setAttribute('class', 'wire-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '一条从早饭走到晚饭的铁丝');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATH_D);
  path.setAttribute('class', 'wire-line');
  svg.appendChild(path);

  // 沿着线流动的小光点（CSS 用 offset-path 让它跑起来）
  const glow = document.createElementNS(NS, 'circle');
  glow.setAttribute('r', '5');
  glow.setAttribute('cx', '0');
  glow.setAttribute('cy', '0');
  glow.setAttribute('class', 'wire-glow');
  svg.appendChild(glow);

  MEALS.forEach((m, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'wire-node');
    g.style.setProperty('--i', String(i));

    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('cx', m.x); halo.setAttribute('cy', m.y); halo.setAttribute('r', '16');
    halo.setAttribute('class', 'node-halo');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', m.x); dot.setAttribute('cy', m.y); dot.setAttribute('r', '7.5');
    dot.setAttribute('class', 'node-dot');
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', m.x); label.setAttribute('y', m.y - 24);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'node-label');
    label.textContent = m.label;
    const time = document.createElementNS(NS, 'text');
    time.setAttribute('x', m.x); time.setAttribute('y', m.y + 34);
    time.setAttribute('text-anchor', 'middle');
    time.setAttribute('class', 'node-time');
    time.textContent = m.time;
    g.append(halo, dot, label, time);
    svg.appendChild(g);
  });

  if (opts.sent) {
    // 线走完后，节点上冒出「已送达」小气泡
    MEALS.forEach((m, i) => {
      const bubble = document.createElementNS(NS, 'g');
      bubble.setAttribute('class', 'wire-bubble');
      bubble.style.setProperty('--i', String(i));
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', '-30'); r.setAttribute('y', '-6'); r.setAttribute('width', '60'); r.setAttribute('height', '22');
      r.setAttribute('rx', '11');
      r.setAttribute('class', 'bubble-bg');
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', '0'); t.setAttribute('y', '9'); t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'bubble-text');
      t.textContent = '已送达 ✓';
      bubble.append(r, t);
      const place = { lunch: [-58, 18], dinner: [42, -26], breakfast: [40, 0] }[m.key];
      bubble.setAttribute('transform', `translate(${m.x + place[0]}, ${m.y + place[1]})`);
      svg.appendChild(bubble);
    });
  }

  host.appendChild(svg);
  host.appendChild(caption(host, opts));
}

function caption(host, opts) {
  const box = document.createElement('div');
  box.className = 'wire-caption' + (opts.sent ? ' sent' : '');
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const next = MEALS.find(m => {
    const [h, mi] = m.time.split(':').map(Number);
    return mins < h * 60 + mi;
  }) || MEALS[0];
  box.innerHTML = opts.sent
    ? '<b>今天的提醒已送达</b><span>线走到这里，剩下的交给晚饭前的那阵饥饿感吧。</span>'
    : `<b>铁丝正在路上</b><span>下一条：${next.label} ${next.time} · 到点手机会自己响</span>`;
  return box;
}

// 供 app.js（普通脚本）使用
window.createWire = createWire;

