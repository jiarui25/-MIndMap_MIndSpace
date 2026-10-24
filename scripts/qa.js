#!/usr/bin/env node
/**
 * MindSpace 浏览器回归测试（puppeteer-core）
 *
 * 用法:
 *   node scripts/qa.js /path/to/mindspace.html
 *
 * 依赖: puppeteer-core（WorkBuddy node workspace 已装）
 * 环境变量:
 *   CHROME_PATH  指向 Chrome 可执行文件（默认 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome）
 *   PUPPETEER_CORE  puppeteer-core 的入口（默认取 WorkBuddy node workspace）
 */

const fs = require('fs');
const path = require('path');

const HTML = process.argv[2];
if (!HTML || !fs.existsSync(HTML)) {
  console.error('用法: node scripts/qa.js /path/to/mindspace.html');
  process.exit(2);
}
const fileUrl = 'file://' + path.resolve(HTML);

const CHROME_PATH = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PUPPETEER_CORE = process.env.PUPPETEER_CORE
  || '/Users/mac/.workbuddy-ai/binaries/node/workspace/node_modules/puppeteer-core';

const puppeteer = require(PUPPETEER_CORE);

const overlapCheck = () => {
  const rects = Array.from(document.querySelectorAll('.node')).map(e => {
    const r = e.getBoundingClientRect();
    return { t: e.textContent.trim().slice(0, 8), x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const bad = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 1.5 && oy > 1.5) bad.push([a.t, b.t]);
  }
  return { total: rects.length, overlaps: bad };
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  const client = await page.createCDPSession();
  const dl = path.join('/tmp', 'mindspace-qa-' + Date.now());
  fs.rmSync(dl, { recursive: true, force: true });
  fs.mkdirSync(dl, { recursive: true });
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });

  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));

  const base = await page.evaluate(overlapCheck);
  console.log('BASE', JSON.stringify(base));

  // flip a branch with children (今日待办)
  const box = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.node.d1')).find(e => e.textContent.includes('今日待办'));
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y, { button: 'right' });
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => Array.from(document.querySelectorAll('#menu button')).find(b => b.textContent.includes('移到'))?.click());
  await new Promise(r => setTimeout(r, 450));
  const flipped = await page.evaluate(overlapCheck);
  console.log('AFTER_FLIP', JSON.stringify(flipped));

  // export PNG
  await page.click('#tbPng');
  await new Promise(r => setTimeout(r, 1600));
  const files = fs.readdirSync(dl).filter(f => f.endsWith('.png'));
  console.log('PNG', JSON.stringify(files.map(f => Math.round(fs.statSync(path.join(dl, f)).size / 1024) + 'KB')));

  // persistence
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  const persisted = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('mindspace.v1'));
    const b = raw.boards.find(x => x.id === raw.current);
    return { boards: raw.boards.length, nodes: Object.keys(b.nodes).length, flippedLeft: Object.values(b.nodes).some(n => n.text === '今日待办' && n.side === 'left') };
  });
  console.log('PERSISTED', JSON.stringify(persisted));

  console.log('ERRORS', errors.length ? JSON.stringify(errors) : 'none');
  await browser.close();
  process.exit(errors.length || flipped.overlaps.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
