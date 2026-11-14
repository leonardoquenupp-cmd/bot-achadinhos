import fs from 'node:fs/promises';
import {validateConfig,dueSlot,normalize,caption} from './core.js';
import {Shopee,Telegram} from './api.js';
import {State,localLock} from './state.js';
export const log=(event,details={})=>console.log(JSON.stringify({time:new Date().toISOString(),event,...details}));
export async function execute({c,state,shopee,telegram,preview=false,now=new Date(),onLog=log}) {
  if(c.paused) {onLog('paused');return;}
  const data=await state.load();
  const slot=dueSlot(c,data,now);
  if(!slot&&!preview){onLog('outside_window_or_quota');return;}
  const candidates=new Map();
  for(let j=0;j<c.keywords.length;j++) {
    const keyword=c.keywords[(data.cursor+j)%c.keywords.length];
    for(let page=1;page<=c.pagesPerSearch;page++) {
      onLog('search_started',{category:j,page});
      const nodes=await shopee.search(keyword,page);
      for(const n of nodes) {const p=normalize(n,c);if(p&&!data.products[p.key]&&!candidates.has(p.key)) candidates.set(p.key,{...p,category:j});}
      if(nodes.length<50)break;
    }
  }
  const sorted=[...candidates.values()].sort((a,b)=>a.category-b.category||b.score-a.score);
  for(const candidate of sorted) {
    onLog('revalidation_started');
    const fresh=await shopee.refresh(candidate);
    const p=fresh&&normalize(fresh,c);
    if(!p||p.key!==candidate.key)continue;
    const text=caption(p);
    if(text.length>1024)continue;
    if(preview){onLog('preview_valid',{caption:text,image:p.image});return;}
    await telegram.check();
    data.products[p.key]={status:'pending',slot,at:now.toISOString()};
    data.slots[slot]=p.key;data.cursor=(data.cursor+1)%c.keywords.length;
    await state.save();
    const messageId=await telegram.send(p,text);
    data.products[p.key].status='sent';data.products[p.key].messageId=messageId;
    await state.save();onLog('published',{product:p.key,messageId});return;
  }
  onLog('no_eligible_offers');
}
export async function main() {
  const c=validateConfig(JSON.parse(await fs.readFile('config.json','utf8')));
  const diagnostic=process.argv.includes('--check')||process.argv.includes('--preview');
  if(!diagnostic&&(process.env.BOT_PAUSED==='true'||c.paused)){log('paused');return;}
  for(const key of ['SHOPEE_APP_ID','SHOPEE_SECRET','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID']) if(!process.env[key]?.trim())throw Error('missing_environment');
  const release=await localLock();
  try {
    const shopee=new Shopee(process.env,c),telegram=new Telegram(process.env);
    if(process.argv.includes('--check')) {
      await telegram.check();const nodes=await shopee.search(c.keywords[0]);
      log('connectivity_ok',{received:nodes.length,eligible:nodes.filter(n=>normalize(n,c)).length});return;
    }
    if(process.env.GITHUB_ACTIONS!=='true'&&!process.argv.includes('--preview')&&!process.argv.includes('--publish'))throw Error('local_publish_requires_flag');
    await execute({c:diagnostic?{...c,paused:false}:c,state:new State(),shopee,telegram,preview:process.argv.includes('--preview')});
  }finally{await release();}
}
