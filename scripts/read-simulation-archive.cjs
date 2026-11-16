// Emit hash-verified full positions and events; no game is rerun.
const {archiveRecords}=require('./lib/simulation-archive.cjs');
if(!process.argv[2])throw Error('Usage: node scripts/read-simulation-archive.cjs /path/to/game-archive');
let records=0;
for(const record of archiveRecords(process.argv[2])){records++;process.stdout.write(JSON.stringify(record)+'\n');}
console.error(JSON.stringify({records,sourceHashesVerified:true,stateHashesVerified:true}));
