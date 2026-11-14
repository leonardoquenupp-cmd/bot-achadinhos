import { signature, sleep } from './core.js';
export class SafeError extends Error { constructor(code){super(code);} }
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
  async query(args) {
    await this.wait(this.c.requestIntervalMs);
    for(let i=0;i<3;i++) {
      const body=JSON.stringify({query:`query { productOfferV2(${args}) { nodes { ${FIELDS} } } }`});
      const t=Math.floor(Date.now()/1000);
      let r;
      try { r=await this.fetcher('https://open-api.affiliate.shopee.com.br/graphql',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`SHA256 Credential=${this.id},Timestamp=${t},Signature=${signature(this.id,this.secret,t,body)}`},body,signal:AbortSignal.timeout(20000)}); }
      catch { if(i===2) throw new SafeError('shopee_network'); await this.wait(2000*2**i);continue; }
      if(r.status===429||r.status>=500) { const delay=Math.max(this.c.requestIntervalMs*2**i,Number(r.headers.get('retry-after')||0)*1000);if(i===2||delay>60000) throw new SafeError('shopee_rate_or_server'); await this.wait(delay);continue; }
      if(!r.ok) throw new SafeError('shopee_http');
      let data;try {data=await r.json();}catch{throw new SafeError('shopee_json');}
      if(data.errors?.length) {
        const messages=data.errors.map(e=>String(e.message||'')).join(' ');
        // Only predefined labels and schema identifiers are logged, never response text.
        const field=messages.match(/Unknown argument ["']([A-Za-z][A-Za-z0-9_]*)["']/i);
        if(field && ['shopId','itemId','keyword','page','limit'].includes(field[1])) throw new SafeError('shopee_unknown_argument_'+field[1]);
        const type=['Int64','Int','String','Float'].find(t=>messages.includes(t));
        if(type) throw new SafeError('shopee_schema_type_'+type);
        throw new SafeError('shopee_schema_or_auth');
      }
      if(!Array.isArray(data.data?.productOfferV2?.nodes)) throw new SafeError('shopee_schema_or_auth');
      return data.data.productOfferV2.nodes;
    }
  }
  search(keyword,page=1) { return this.query(`keyword:${JSON.stringify(keyword)},page:${page},limit:50`); }
  async refresh(p) { return (await this.query(`shopId:${p.shopId},itemId:${p.itemId},page:1,limit:1`)).find(n=>String(n.itemId)===p.itemId&&String(n.shopId)===p.shopId); }
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
        r=await this.fetcher(`https://api.telegram.org/bot${this.token}/sendPhoto`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:this.chat,photo:p.image,caption}),signal:AbortSignal.timeout(25000)});
        data=await r.json();
      } catch { throw new SafeError('telegram_ambiguous'); }
      if(r.ok&&data.ok&&Number.isInteger(data.result?.message_id)) return data.result.message_id;
      if(data.error_code===429&&i<2&&Number.isInteger(data.parameters?.retry_after)&&data.parameters.retry_after<=60) { await this.wait(Math.max(1,data.parameters.retry_after)*1000);continue; }
      throw new SafeError('telegram_rejected_or_ambiguous');
    }
  }
}
