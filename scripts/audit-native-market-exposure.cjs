const fs=require('node:fs'),{audit}=require('./audit-native-colony-exposure.cjs'),{hash}=require('./lib/simulation-archive.cjs');
const [directory,out]=process.argv.slice(2);if(!directory||!out)throw Error('Usage: node audit-native-market-exposure.cjs run-directory output.json');
const result={...audit(directory,{all:true}),entrySourceHash:hash(fs.readFileSync(__filename))};fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify(result.cards));
