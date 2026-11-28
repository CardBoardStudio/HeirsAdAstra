// Pure, predeclared design. Each map gets all roles, all seat orders and all 2+2 allocations.
const PROFILES=['market','military','economy','expansion'];
const permutations=a=>a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];
const allocations=[];for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)allocations.push([0,1,2,3].map(seat=>seat===i||seat===j?'browser':'native'));
function tasks(seeds){const result=[];for(const seed of seeds){
 for(const profiles of permutations(PROFILES))for(const implementations of allocations)result.push({id:result.length,variant:'mixed',condition:'mixed',mode:'updated',seed,rotation:0,profiles:[...profiles],implementations:[...implementations],target:30,maxRound:100,maxSteps:50000,excludeCards:[],exclusionScope:null});
 for(const role of PROFILES)for(const implementations of allocations)result.push({id:result.length,variant:'same-'+role,condition:'same',role,mode:'updated',seed,rotation:0,profiles:Array(4).fill(role),implementations:[...implementations],target:30,maxRound:100,maxSteps:50000,excludeCards:[],exclusionScope:null});
}return result;}
module.exports={PROFILES,permutations,allocations,tasks};
