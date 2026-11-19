const assert=require('node:assert/strict'),{classify}=require('./audit-native-colony-exposure.cjs');
const s={players:[{resources:{matter:4,energy:4,biomass:4,data:4},resourceLimits:{matter:4,energy:4,biomass:4,data:4},hand:[{key:'colonize'},{key:'construct',starter:true,level:2}],deck:[],discard:[],inPlay:[]}],fleets:{'1,0':{0:{settler:1}}},planets:{'0,0':{owner:0,upgrade:'starbase'},'1,0':{owner:null}},clusters:[{kind:'world',center:'0,0'},{kind:'world',center:'1,0'}]};
const card={cost:{biomass:4}},a=classify(s,0,card);assert(a.fundable);assert(a.fundableWithEstablishedPlan);assert(a.priceFitsButColonyReserveDoesNot);assert(a.priceFundableButColonyReserveShort);
s.players[0].resourceLimits.biomass=6;s.players[0].resources.biomass=6;assert(!classify(s,0,card).priceFundableButColonyReserveShort);assert(!classify(s,0,card).priceFitsButColonyReserveDoesNot);
s.planets['1,0'].owner=1;assert(!classify(s,0,card).withProspect);s.fleets['1,0'][0].fleet=1;assert(classify(s,0,card).withProspect);
s.players[0].hand=[];s.players[0].resourceLimits.biomass=4;s.players[0].resources.biomass=4;assert(!classify(s,0,card).priceFitsButColonyReserveDoesNot);
s.players[0].hand=[{key:'colonize'}];s.players[0].resourceLimits.biomass=8;s.players[0].resources.biomass=8;assert(classify(s,0,{cost:{biomass:8}}).priceFitsButColonyReserveDoesNot);
console.log('Colony exposure: ship/prospect requirements, reserve/price distinction, funded capacity and no-owned-order cases pass.');
