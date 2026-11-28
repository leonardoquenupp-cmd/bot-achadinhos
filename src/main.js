import fs from 'node:fs/promises';
import {validateConfig,dueSlot,normalize,caption} from './core.js';
import {Shopee,Telegram} from './api.js';
import {State,localLock} from './state.js';
import {inlineKeyboard,similarityFingerprint} from './messages.js';
import {captionHash} from './receipts.js';
import {curate,editorialPenalty} from './curation.js';
import {discoveryPages,discoverySources,duplicateOffer,repeatFamily,varietyPenalty,imageIdentity,productGroup} from './discovery.js';
export const log=(event,details={})=>console.log(JSON.stringify({time:new Date().toISOString(),event,...details}));
export async function execute({c,state,shopee,telegram,preview=false,now=new Date(),clock=()=>now,onLog=log}) {
  if(c.paused) {onLog('paused');return;}
  const data=await state.load();
  for(const [key,pending] of Object.entries(data.products).filter(([,p])=>p.status==='pending')) {
    let receipt;
    if(!preview&&telegram.reconcile) {
      try {receipt=await telegram.reconcile(pending);}
      catch(error) {
        if(!['read_network','invalid_json','rate_limit_long'].includes(error.message)&&
          !/^read_http_(429|5\d\d)$/.test(error.message))throw error;
        onLog('delivery_receipt_temporarily_unavailable');
      }
    }
    if(!receipt) {
      onLog('delivery_awaiting_confirmation',{product:key});
      return; // Existing uncertainty is a blocked cycle, not a new failure every five minutes.
    }
    pending.status='sent';pending.messageId=receipt.messageId;pending.at=receipt.publishedAt;
    pending.reconciliation='verified_public_telegram_post';
    await state.save();onLog('delivery_reconciled',{product:key,messageId:receipt.messageId});
  }
  let slot=dueSlot(c,data,now);
  if(!slot&&!preview){onLog('outside_window_or_quota');return;}
  const history=Object.values(data.products).filter(p=>p.status==='sent');
  const recent=history.slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const pages=discoveryPages(c,now);
  const sources=shopee.setDiscovery?discoverySources(c,now):null;
  const candidates=new Map();
  let successfulSearches=0;
  for(let j=0;j<(sources?.length||c.keywords.length);j++) {
    if(sources)shopee.setDiscovery(sources[j]);
    const keyword=c.keywords[(data.cursor+j)%c.keywords.length];
    for(const page of pages) {
      onLog('search_started',{category:j,page});
      const counts={invalid:0,alreadyPublished:0,duplicate:0,recentFamily:0,offTopic:0};
      let nodes;
      try { nodes=await shopee.search(keyword,page);successfulSearches++; }
      catch(error) {
        if(error.message!=='shopee_temporary_system') throw error;
        onLog('category_temporarily_unavailable',{category:j,page});
        if(sources)continue;
        break;
      }
      for(const n of nodes) {
        const p=normalize(n,c);
        if(!p){counts.invalid++;continue;}
        if(!curate(p,c).allowed){counts.offTopic++;continue;}
        if(data.products[p.key]||candidates.has(p.key)){counts.alreadyPublished++;continue;}
        if(duplicateOffer(p,history)){counts.duplicate++;continue;}
        if(repeatFamily(p,recent)){counts.recentFamily++;continue;}
        candidates.set(p.key,{...p,category:j,sourceKeyword:keyword,sourcePage:page,sourceFilters:sources?.[j]});
      }
      onLog('search_results',{page,received:nodes.length,eligible:candidates.size,...counts,general:!!shopee.keywordUnavailable,categoryId:sources?.[j]?.productCatId,sortType:sources?.[j]?.sortType});
    }
    // All keywords share the same fallback; do not pretend these are different categories.
    if(shopee.keywordUnavailable&&!sources)break;
    if(sources&&j>=1&&candidates.size>=30)break;
  }
  if(!successfulSearches)throw Error('shopee_all_searches_failed');
  const sorted=[...candidates.values()].sort((a,b)=>editorialPenalty(a,recent,c)-editorialPenalty(b,recent,c)||varietyPenalty(a,recent)-varietyPenalty(b,recent)||a.category-b.category||b.score-a.score);
  const failedSources=new Set();
  let refreshAttempts=0;
  for(const candidate of sorted) {
    const source=JSON.stringify([candidate.sourceFilters||candidate.sourceKeyword,candidate.sourcePage]);
    if(failedSources.has(source))continue;
    if(refreshAttempts++>=12)break;
    onLog('revalidation_started');
    let fresh;
    try {fresh=await shopee.refresh(candidate);}
    catch(error) {
      if(error.message!=='shopee_temporary_system')throw error;
      failedSources.add(source);
      onLog('revalidation_source_temporarily_unavailable');
      continue;
    }
    const p=fresh&&normalize(fresh,c);
    if(!p||!curate(p,c).allowed||p.key!==candidate.key||duplicateOffer(p,history)||repeatFamily(p,recent))continue;
    const text=caption(p);
    if(text.length>1024)continue;
    if(preview){onLog('preview_valid',{caption:text,image:p.image,parse_mode:'HTML',reply_markup:inlineKeyboard(p)});return;}
    const deliveryTime=clock();
    slot=dueSlot(c,data,deliveryTime);
    if(!slot){onLog('delivery_window_or_interval_closed');return;}
    await telegram.check();
    data.products[p.key]={status:'pending',slot,at:deliveryTime.toISOString(),fingerprint:similarityFingerprint(p),imageIdentity:imageIdentity(p.image),...productGroup(p),topic:curate(p,c).topic,receipt:{captionHash:captionHash(text),affiliateLink:p.link}};
    data.slots[slot]=p.key;data.cursor=(data.cursor+candidate.category+1)%c.keywords.length;
    await state.save();
    let messageId;
    try {messageId=await telegram.send(p,text);}
    catch(error) {
      if(error.message!=='telegram_photo_unavailable')throw error;
      data.products[p.key].status='skipped';data.products[p.key].reason='photo_unavailable';
      await state.save();onLog('skipped_unavailable_photo',{product:p.key});return;
    }
    data.products[p.key].status='sent';data.products[p.key].messageId=messageId;data.products[p.key].at=clock().toISOString();
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
    await execute({c:diagnostic?{...c,paused:false}:c,state:new State(),shopee,telegram,clock:()=>new Date(),preview:process.argv.includes('--preview')});
  }finally{await release();}
}
