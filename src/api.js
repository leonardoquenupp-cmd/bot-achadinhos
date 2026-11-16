import { signature, sleep } from './core.js';
import { inlineKeyboard } from './messages.js';
export class SafeError extends Error { constructor(code,detail){super(code);this.detail=detail;} }
export async function readRequest(url, options={}, {fetcher=fetch, wait=sleep, attempts=3}={}) {
  for(let i=0;i<attempts;i++) {
    let r;
    try { r=await fetcher(url,{...options,signal:AbortSignal.timeout(20000)}); }
    catch { if(i===attempts-1) throw new SafeError('read_network'); await wait(1000*2**i); continue; }
    if((r.status===429||r.status>=500)&&i<attempts-1) {
      const retry=Number(r.headers.get('retry-after'));
      if(retry>60) throw new SafeError('rate_limit_long');
      await wait(Math.max(1000*2**i,(retry||0)*1000)); continue;
    }
    if(!r.ok) throw new SafeError('read_http_'+r.status);
    try { return await r.json(); } catch { throw new SafeError('invalid_json'); }
  }
}
const FIELDS='itemId shopId productName imageUrl offerLink priceMin priceMax ratingStar sales priceDiscountRate';
export class Shopee {
  constructor(env,c,{fetcher=fetch,wait=sleep}={}) { this.id=env.SHOPEE_APP_ID; this.secret=env.SHOPEE_SECRET; this.c=c;this.fetcher=fetcher;this.wait=wait; }
  async query(variables) {
    await this.wait(this.c.requestIntervalMs);
    for(let i=0;i<3;i++) {
      const body=JSON.stringify({query:`query GetProducts($keyword:String,$page:Int,$limit:Int) { productOfferV2(keyword:$keyword,page:$page,limit:$limit) { nodes { ${FIELDS} } } }`,operationName:"GetProducts",variables});
      const t=Math.floor(Date.now()/1000);
      let r;
      try { r=await this.fetcher('https://open-api.affiliate.shopee.com.br/graphql',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`SHA256 Credential=${this.id},Timestamp=${t},Signature=${signature(this.id,this.secret,t,body)}`},body,signal:AbortSignal.timeout(20000)}); }
      catch { if(i===2) throw new SafeError('shopee_network'); await this.wait(2000*2**i);continue; }
      if(r.status===429||r.status>=500) { const delay=Math.max(this.c.requestIntervalMs*2**i,Number(r.headers.get('retry-after')||0)*1000);if(i===2||delay>60000) throw new SafeError('shopee_rate_or_server'); await this.wait(delay);continue; }
      if(!r.ok) throw new SafeError('shopee_http');
      let data;try {data=await r.json();}catch{throw new SafeError('shopee_json');}
      if(data.errors?.length) {
        const messages=data.errors.map(e=>String(e.message||'')).join(' ');
        if(messages.includes('error [10000]')&&messages.includes('System Error')) {
          if(i<1) {await this.wait(4000);continue;}
          throw new SafeError('shopee_temporary_system');
        }
        let detail=messages;
        for (const value of [this.id,this.secret,...Object.entries(process.env).filter(([key])=>/TOKEN|SECRET|KEY|PASSWORD/.test(key)).map(([,value])=>value)]) {
          if(value) detail=detail.split(value).join('[REDACTED]');
        }
        detail=detail.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP]').slice(0,400);
        // Only predefined labels and schema identifiers are logged, never response text.
        const field=messages.match(/Unknown argument ["']([A-Za-z][A-Za-z0-9_]*)["']/i);
        if(field && ['shopId','itemId','keyword','page','limit'].includes(field[1])) throw new SafeError('shopee_unknown_argument_'+field[1]);
        const type=['Int64','Int','String','Float'].find(t=>messages.includes(t));
        if(type) throw new SafeError('shopee_schema_type_'+type);
        throw new SafeError('shopee_schema_or_auth',detail);
      }
      if(!Array.isArray(data.data?.productOfferV2?.nodes)) throw new SafeError('shopee_schema_or_auth');
      return data.data.productOfferV2.nodes;
    }
  }
  async search(keyword,page=1) {
    if(this.keywordUnavailable)return this.generalSearch(page);
    try {return await this.query({keyword,page,limit:50});}
    catch(error) {
      if(error.message!=='shopee_temporary_system')throw error;
      this.keywordUnavailable=true;
      console.log(JSON.stringify({event:'shopee_keyword_unavailable_using_general'}));
      return this.generalSearch(page);
    }
  }
  async generalSearch(page) {
    this.generalPages ||= new Map();
    if(!this.generalPages.has(page))this.generalPages.set(page,await this.query({page,limit:50}));
    return this.generalPages.get(page);
  }
  async refresh(p) { return (await (this.keywordUnavailable
    ? this.query({page:p.sourcePage||1,limit:50})
    : this.query({keyword:p.sourceKeyword||p.name,page:p.sourcePage||1,limit:50}))).find(n=>String(n.itemId)===p.itemId&&String(n.shopId)===p.shopId); }
}
export class Telegram {
  constructor(env,{fetcher=fetch,wait=sleep}={}) {this.token=env.TELEGRAM_BOT_TOKEN;this.chat=env.TELEGRAM_CHAT_ID;this.fetcher=fetcher;this.wait=wait;}
  async check() {
    const me=await readRequest(`https://api.telegram.org/bot${this.token}/getMe`,{}, {fetcher:this.fetcher});
    if(!me.ok) throw new SafeError('telegram_auth');
    const member=await readRequest(`https://api.telegram.org/bot${this.token}/getChatMember`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:this.chat,user_id:me.result.id})},{fetcher:this.fetcher});
    if(!member.ok||!['administrator','creator'].includes(member.result.status)||member.result.can_post_messages===false) throw new SafeError('telegram_permissions');
  }
  async send(p,caption) {
    for(let i=0;i<3;i++) {
      let r,data;
      try {
        r=await this.fetcher(`https://api.telegram.org/bot${this.token}/sendPhoto`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:this.chat,photo:p.image,caption,parse_mode:"HTML",show_caption_above_media:false,reply_markup:inlineKeyboard(p)}),signal:AbortSignal.timeout(25000)});
        data=await r.json();
      } catch { throw new SafeError('telegram_ambiguous'); }
      if(r.ok&&data.ok&&Number.isInteger(data.result?.message_id)) return data.result.message_id;
      if(data.error_code===429&&i<2&&Number.isInteger(data.parameters?.retry_after)&&data.parameters.retry_after<=60) { await this.wait(Math.max(1,data.parameters.retry_after)*1000);continue; }
      if(data.ok===false&&data.error_code===400&&/photo|image|HTTP URL content|webpage_curl_failed|wrong file identifier/i.test(String(data.description||'')))throw new SafeError('telegram_photo_unavailable');
      throw new SafeError('telegram_rejected_or_ambiguous');
    }
  }
}
