// Requested inward centers and the previous release's immutable geometry.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(prefix){
 const c=vm.createContext({});let e;
 vm.runInContext(['adapter.js','app.js'].map(n=>fs.readFileSync(path.join(__dirname,'..',prefix+n),'utf8')).join('\n'),c);
 const create=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return create(p);};
 c.createGalacticReach({headless:true,random:()=>0});return JSON.parse(JSON.stringify(e.state));
}
const current=setup('prototypes/galactic-reach/'),old=setup('crates/galactic-reach/rules/v37-');
const centers=s=>s.clusters.filter(c=>c.kind==='world').map(c=>c.center);
for(const [before,after] of [['9,-9','8,-8'],['-9,9','-8,8']]){
 assert(centers(old).includes(before));assert(!centers(old).includes(after));
 assert(centers(current).includes(after));assert(!centers(current).includes(before));
 const world=current.clusters.find(c=>c.center===after);
 assert.equal(world.coords.length,7);
 assert(world.coords.every(k=>{const[q,r]=k.split(',').map(Number);return Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=9;}),'Leave a space hex before the rim');
}
assert.deepEqual(current.clusters.slice(0,4),old.clusters.slice(0,4),'Home worlds stay fixed');
assert.deepEqual(current.portalLinks,old.portalLinks,'Portal entrances and pairings stay fixed');
assert.equal(centers(current).length,13);assert.equal(Object.keys(current.planets).length,95);
assert(!current.planets['10,-10']);assert(!current.planets['-10,10']);
console.log('Inward worlds: both requested centers, seven-hex worlds, rim clearance, fixed homes/portals and archived 37.42 geometry passed.');
