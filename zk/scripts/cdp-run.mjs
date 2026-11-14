// Drive local headless Chromium over CDP: open the tabletop, sit, deal, play,
// screenshot. Used because chrome-devtools-axi could not attach (BRIDGE_NOT_READY).
import { writeFileSync } from 'node:fs';
const [,, url, shotDir] = process.argv;
setTimeout(() => { console.log('run timeout'); process.exit(2); }, 300000);
const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waits = new Map(); const logs = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waits.has(d.id)) { waits.get(d.id)(d); waits.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.args.map((a) => a.value ?? a.description).join(' ')); else if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + d.params.exceptionDetails.exception?.description); });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Runtime.enable'); await s('Page.enable');
await s('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
await s('Page.navigate', { url });
const evalJs = async (expression, timeout = 300000) => { const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? JSON.stringify(r); };
for (let i = 0; i < 60; i++) { if (await evalJs('typeof globalThis.grZkSit') === 'function') break; await new Promise((r) => setTimeout(r, 500)); }
console.log('page', await evalJs('JSON.stringify({isolated: crossOriginIsolated, cores: navigator.hardwareConcurrency, ua: navigator.userAgent.match(/Chrome\\/[\\d.]+/)[0]})'));
await evalJs('document.getElementById("chain-tab").click(), 1');
const shot = async (name) => { const r = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(`${shotDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const t0 = Date.now();
await evalJs('globalThis.grZkSit()');
console.log('sit+deal wall ms', Date.now() - t0);
await evalJs('document.getElementById("chain-panel").scrollIntoView(), 1');
await shot('seat-dealt');
console.log('status', await evalJs('document.getElementById("chain-status").textContent'));
console.log('hand', await evalJs('[...document.querySelectorAll("#chain-hand strong")].map(e=>e.textContent).join(", ")'));
await evalJs('document.querySelector(".chain-play").click(), 1');
for (let i = 0; i < 60; i++) { const st = await evalJs('document.getElementById("chain-status").textContent'); if (!st.startsWith('Playing')) break; await new Promise((r) => setTimeout(r, 1000)); }
console.log('after play', await evalJs('document.getElementById("chain-status").textContent'));
await shot('seat-played');
console.log('metrics', await evalJs('JSON.stringify(globalThis.grZkMetrics)'));
console.log('log', await evalJs('[...document.querySelectorAll("#chain-log li")].map(e=>e.textContent).join(" | ")'));
if (logs.length) console.log('console', logs.slice(-8).join('\n'));
await send('Target.closeTarget', { targetId });
process.exit(0);
