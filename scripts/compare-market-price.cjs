// A declared, single-card printed-price change. Other source/policy changes fail closed.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {compare}=require('./compare-world-engine-price.cjs'),{hash}=require('./lib/simulation-archive.cjs');
function validatePrice(left,right,key,from,to){
 assert(/^[A-Za-z][A-Za-z0-9]*$/.test(key),'Simple card key required');
 const line=new RegExp('^    '+key+': \\{[^\\n]+','m'),a=left.match(line),b=right.match(line);assert(a&&b,'Card definition missing');
 const price=/cost: (\{[^}]*\})/,ac=a[0].match(price),bc=b[0].match(price);assert(ac&&bc,'Printed price missing');
 assert.deepEqual(JSON.parse(ac[1]),from,'Unexpected control cost');assert.deepEqual(JSON.parse(bc[1]),to,'Unexpected candidate cost');
 assert.equal(b[0],a[0].replace(ac[0],bc[0]),'Non-price card change');assert.equal(right,left.replace(a[0],b[0]),'Unrelated app change');
}
function comparePrice(left,right,key,from,to){
 return {...compare(left,right,(a,b)=>validatePrice(a,b,key,from,to),`Only ${key} printed cost ${JSON.stringify(from)} to ${JSON.stringify(to)}; identical policy binary and adapter/native sources.`),priceComparisonSourceHash:hash(fs.readFileSync(__filename)),declaredPriceChange:{key,from,to}};
}
if(require.main===module){const[out,left,right,key,from,to]=process.argv.slice(2),r=comparePrice(left,right,key,JSON.parse(from),JSON.parse(to));fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({delta:r.delta,seedBootstrap95:r.seedBootstrap95}));}
module.exports={validatePrice,comparePrice};
