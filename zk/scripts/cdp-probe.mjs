// Navigate a fresh tab to `url`, wait, evaluate `expr`; hard 25 s timeout.
const [,, url, expr = 'document.title', wait = '3000'] = process.argv;
setTimeout(() => { console.log('probe timeout'); process.exit(2); }, 25000);
const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waits = new Map(); const logs = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waits.has(d.id)) { waits.get(d.id)(d); waits.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); else if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300)); else if (d.method === 'Page.javascriptDialogOpening') logs.push('DIALOG ' + d.params.message); });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
console.log('ws ok'); const ct = await send('Target.createTarget', { url: 'about:blank' }); console.log('created', JSON.stringify(ct).slice(0, 200)); const { result: { targetId } } = ct;
const at = await send('Target.attachToTarget', { targetId, flatten: true }); console.log('attached', JSON.stringify(at).slice(0, 160)); const { result: { sessionId } } = at;
await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
console.log('navigate', JSON.stringify((await send('Page.navigate', { url }, sessionId)).result));
await new Promise((r) => setTimeout(r, Number(wait)));
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 5000 }, sessionId);
console.log('value', JSON.stringify(r.result?.result?.value ?? r.result));
console.log(logs.slice(-10).join('\n'));
await send('Target.closeTarget', { targetId }); process.exit(0);
