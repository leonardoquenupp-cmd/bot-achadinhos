import fs from 'node:fs/promises';
import {validateConfig,dueSlot,normalize,caption} from './core.js';
import {Shopee,Telegram} from './api.js';
import {State,localLock} from './state.js';
import {inlineKeyboard,similarityFingerprint} from './messages.js';
import {discoveryPages,duplicateOffer,repeatFamily,varietyPenalty,imageIdentity,productGroup} from './discovery.js';
export const log=(event,details={})=>console.log(JSON.stringify({time:new Date().toISOString(),event,...details}));
export async function execute({c,state,shopee,telegram,preview=false,now=new Date(),onLog=log}) {
  if(c.paused) {onLog('paused');return;}
  const data=await state.load();
  const slot=dueSlot(c,data,now);
  if(!slot&&!preview){onLog('outside_window_or_quota');return;}
  const history=Object.values(data.products).filter(p=>p.status==='sent');
  const recent=history.slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const pages=discoveryPages(c,now);
  const candidates=new Map();
  let successfulSearches=0;
  for(let j=0;j<c.keywords.length;j++) {
    const keyword=c.keywords[(data.cursor+j)%c.keywords.length];
    for(const page of pages) {
      onLog('search_started',{category:j,page});
      let nodes;
      try { nodes=await shopee.search(keyword,page);successfulSearches++; }
      catch(error) {
        if(error.message!=='shopee_temporary_system') throw error;
        onLog('category_temporarily_unavailable',{category:j,page});break;
      }
      for(const n of nodes) {const p=normalize(n,c);if(p&&!data.products[p.key]&&!candidates.has(p.key)&&!duplicateOffer(p,history)&&!repeatFamily(p,recent)) candidates.set(p.key,{...p,category:j,sourceKeyword:keyword,sourcePage:page});}
      onLog('search_results',{page,received:nodes.length,eligible:candidates.size,general:!!shopee.keywordUnavailable});
    }
    // All keywords share the same fallback; do not pretend these are different categories.
    if(shopee.keywordUnavailable)break;
  }
  if(!successfulSearches)throw Error('shopee_all_searches_failed');
  const sorted=[...candidates.values()].sort((a,b)=>varietyPenalty(a,recent)-varietyPenalty(b,recent)||a.category-b.category||b.score-a.score);
  for(const candidate of sorted.slice(0,12)) {
    onLog('revalidation_started');
    const fresh=await shopee.refresh(candidate);
    const p=fresh&&normalize(fresh,c);
    if(!p||p.key!==candidate.key||duplicateOffer(p,history)||repeatFamily(p,recent))continue;
    const text=caption(p);
    if(text.length>1024)continue;
    if(preview){onLog('preview_valid',{caption:text,image:p.image,parse_mode:'HTML',reply_markup:inlineKeyboard(p)});return;}
    await telegram.check();
    data.products[p.key]={status:'pending',slot,at:now.toISOString(),fingerprint:similarityFingerprint(p),imageIdentity:imageIdentity(p.image),...productGroup(p)};
    data.slots[slot]=p.key;data.cursor=(data.cursor+candidate.category+1)%c.keywords.length;
    await state.save();
    let messageId;
    try {messageId=await telegram.send(p,text);}
    catch(error) {
      if(error.message!=='telegram_photo_unavailable')throw error;
      data.products[p.key].status='skipped';data.products[p.key].reason='photo_unavailable';
      await state.save();onLog('skipped_unavailable_photo',{product:p.key});return;
    }
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
