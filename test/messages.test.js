import test from 'node:test';
import assert from 'node:assert/strict';
import {caption,escapeHtml,inlineKeyboard,shortTitle,similarityFingerprint,similarToRecent} from '../src/messages.js';
import {normalize,scheduledTimes,dueSlot,validateConfig} from '../src/core.js';
import {Telegram} from '../src/api.js';
import {execute} from '../src/main.js';
import {readFile} from 'node:fs/promises';
const c=JSON.parse(await readFile(new URL('../config.json',import.meta.url)));
const p={key:'1:2',name:'Kit de Utensílios de Silicone com Cabo de Madeira',price:18.61,max:18.61,rating:4.8,sales:1349,discount:87,image:'https://down-br.img.susercontent.com/file/produto',link:'https://s.shopee.com.br/oferta?sub_id=canal&x=1'};
const now=new Date('2026-11-15T11:22:00Z');
const empty=()=>({version:1,products:{},slots:{},cursor:0});
const response=(d,status=200)=>new Response(JSON.stringify(d),{status});
test('short title, unique price, compact stats and discrete affiliate disclosure',()=>{
 const text=caption(p);
 assert.ok(text.startsWith('🔥 <b>'+p.name+'</b>\n\n'));
 assert.match(text,/✅ Por: <b>R\$ 18,61<\/b>/);
 assert.match(text,/⭐ 4,8 • 1\.349 vendidos/);
 assert.ok(text.endsWith('🧡 Shopee'));assert.ok(!text.includes('Publicidade'));
 assert.doesNotMatch(text,/https?:|A partir|Desconto informado|De:|Frete grátis|87%/);
});
test('independent confirmed previous price is struck and discount calculated conservatively',()=>{
 const text=caption({...p,presentation:{previousPrice:149.90,previousPriceConfirmed:true,freeShipping:true,freeShippingConfirmed:true}});
 assert.match(text,/❌ De: <s>R\$ 149,90<\/s>/);assert.match(text,/🔻 -87%/);assert.match(text,/🚚 Frete grátis/);
});
test('missing, unconfirmed, inverted, invalid and variant prices never become old prices',()=>{
 for(const facts of [{},{previousPrice:149.9},{previousPrice:149.9,previousPriceConfirmed:false},{previousPrice:10,previousPriceConfirmed:true},{previousPrice:'149.90',previousPriceConfirmed:true}])assert.doesNotMatch(caption({...p,presentation:facts}),/De:|🔻/);
 const text=caption({...p,max:99,presentation:{previousPrice:149.9,previousPriceConfirmed:true}});
 assert.match(text,/A partir de/);assert.doesNotMatch(text,/De:|🔻/);
});
test('no free shipping claim without an explicit confirmed true value',()=>{
 for(const facts of [{},{freeShipping:true},{freeShipping:false,freeShippingConfirmed:true},{freeShipping:'true',freeShippingConfirmed:true}])assert.doesNotMatch(caption({...p,presentation:facts}),/Frete grátis/);
});
test('HTML is escaped once and malformed source tags never become Telegram markup',()=>{
 const text=caption({...p,name:'JBL <script> & "Go" \'3\''});
 assert.ok(text.includes('JBL &lt;script&gt; &amp; &quot;Go&quot; &#39;3&#39;'));assert.ok(!text.includes('<script>'));
 assert.equal(escapeHtml('A&B'),'A&amp;B');
});
test('long repeated titles stay bounded and retain observed brand/model/specifications',()=>{
 const title='Fone de Ouvido '+('sem fio com estojo confortável para uso no dia a dia '.repeat(12))+'JBL Tune 520BT Bluetooth 5.3';
 const compact=shortTitle(title);assert.ok([...compact].length<=105);assert.match(compact,/JBL/);assert.match(compact,/520BT/);assert.match(compact,/Bluetooth/);
 assert.equal(shortTitle('Kit Silicone Kit Silicone'),'Kit Silicone');
});
test('pathological and Unicode captions fit the existing raw 1024-char guard',()=>{
 for(const title of ['& < > " '.repeat(1000),'🧡🔥 Kit '.repeat(1000),'x'.repeat(5000),'Café & Chá <Premium> '+ 'çã '.repeat(1000)]) {
  const text=caption({...p,name:title});assert.ok(text.length<=1024);assert.ok(text.endsWith('🧡 Shopee'));
 }
 assert.doesNotMatch(caption({...p,name:'Mouse https://example.org/link gamer'}),/https?:/);
});
test('missing ratings/sales are omitted, never fabricated',()=>{
 const text=caption({...p,rating:undefined,sales:undefined});assert.doesNotMatch(text,/⭐|vendidos/);
 assert.match(caption({...p,sales:1}),/1 vendido/);
});
test('current API data does not imply old price or free shipping',()=>{
 const raw={itemId:2,shopId:1,productName:p.name,priceMin:18.61,priceMax:149.9,ratingStar:4.8,sales:1349,priceDiscountRate:87,imageUrl:p.image,offerLink:p.link};
 const normalized=normalize(raw,c);assert.ok(normalized);assert.equal(normalized.score,87+4.8*5+Math.log1p(1349)*3);
 assert.doesNotMatch(caption(normalized),/149,90|De:|87%|Frete grátis/);
});
test('inline button retains the exact affiliate URL and rejects unsafe destinations',()=>{
 assert.deepEqual(inlineKeyboard(p),{inline_keyboard:[[{text:'🛒 Pegar oferta',url:p.link}]]});
 for(const link of ['http://shopee.com.br/a','https://evil.example/a','javascript:alert(1)','https://user:password@shopee.com.br/a'])assert.throws(()=>inlineKeyboard({...p,link}));
});
test('sendPhoto uses original image, HTML caption and affiliate keyboard under the photo',async()=>{
 let sent;const api=new Telegram({TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_CHAT_ID:'@test'},{fetcher:async(url,opts)=>{assert.ok(url.endsWith('/sendPhoto'));sent=JSON.parse(opts.body);return response({ok:true,result:{message_id:10}});}});
 assert.equal(await api.send(p,caption(p)),10);assert.equal(sent.photo,p.image);assert.equal(sent.parse_mode,'HTML');assert.equal(sent.show_caption_above_media,false);assert.equal(sent.reply_markup.inline_keyboard[0][0].url,p.link);assert.ok(!sent.caption.includes(p.link));
});
test('definitively rejected photos are skippable; timeouts/5xx retain ambiguity',async()=>{
 const api=new Telegram({}, {fetcher:async()=>response({ok:false,error_code:400,description:'Bad Request: failed to get HTTP URL content'},400)});
 await assert.rejects(api.send(p,caption(p)),/telegram_photo_unavailable/);
 api.fetcher=async()=>response({ok:false,error_code:500,description:'Internal error'},500);await assert.rejects(api.send(p,caption(p)),/rejected_or_ambiguous/);
});
test('rejected photo records skipped, saves history and does not block a later slot',async()=>{
 const d=empty();let saves=0;
 const raw={itemId:2,shopId:1,productName:p.name,priceMin:p.price,priceMax:p.max,ratingStar:p.rating,sales:p.sales,priceDiscountRate:p.discount,imageUrl:p.image,offerLink:p.link};
 await execute({c,state:{load:async()=>d,save:async()=>saves++},shopee:{search:async()=>[raw],refresh:async()=>raw},telegram:{check:async()=>{},send:async()=>{throw Error('telegram_photo_unavailable');}},now,onLog:()=>{}});
 assert.equal(d.products['1:2'].status,'skipped');assert.equal(d.products['1:2'].reason,'photo_unavailable');assert.equal(saves,2);
 assert.ok(dueSlot(c,d,new Date('2026-11-15T11:40:00Z')));
});
test('similar recent titles are excluded without weakening exact identity history',()=>{
 const record={fingerprint:similarityFingerprint(p)};
 assert.ok(similarToRecent({...p,name:p.name+'!'},[record]));
 assert.ok(!similarToRecent({...p,name:'Monitor Samsung Odyssey G5 27 Polegadas 144Hz'},[record]));
 assert.ok(!similarToRecent(p,[{}]));
});
test('50 derived slots fill 08:00–23:00 with no simultaneous timestamps',()=>{
 const times=scheduledTimes(validateConfig(c));assert.equal(times.length,50);assert.equal(new Set(times).size,50);assert.equal(times[0],'08:00');assert.equal(times.at(-1),'22:42');
 for(let i=1;i<times.length;i++){const minutes=t=>+t.slice(0,2)*60 + +t.slice(3);assert.equal(minutes(times[i])-minutes(times[i-1]),18);}
 assert.equal(scheduledTimes({...c,dailyLimit:10}).length,10);
});
test('delays use latest slot only, gap prevents bursts, and day boundaries match Brasilia',()=>{
 const d=empty();assert.equal(dueSlot(c,d,now),'2026-11-15:08:18');d.slots['2026-11-15:08:18']='x';assert.equal(dueSlot(c,d,now),null);
 assert.equal(dueSlot(c,empty(),new Date('2026-11-15T10:59:00Z')),null);
 assert.equal(dueSlot(c,empty(),new Date('2026-11-16T02:00:00Z')),null);
 const gap=empty();gap.products.x={status:'sent',at:now.toISOString()};assert.equal(dueSlot(c,gap,new Date('2026-11-15T11:37:00Z')),'2026-11-15:08:36');assert.equal(dueSlot(c,gap,new Date('2026-11-15T11:36:00Z')),null);
 assert.equal(dueSlot(c,empty(),new Date('2026-11-15T11:17:00Z')),null);
});
test('every derived slot has a five-minute cron tick inside its tolerance',()=>{
 for(const t of scheduledTimes(c)) {
  const minute=+t.slice(0,2)*60 + +t.slice(3);
  assert.ok(Array.from({length:c.windowMinutes},(_,i)=>minute+i).some(m=>m%5===2&&m<23*60));
 }
});
test('preview uses the same HTML and button without changing history or sending',async()=>{
 const d=empty(),before=JSON.stringify(d),events=[];
 const raw={itemId:2,shopId:1,productName:p.name,priceMin:p.price,priceMax:p.max,ratingStar:p.rating,sales:p.sales,priceDiscountRate:p.discount,imageUrl:p.image,offerLink:p.link};
 await execute({c,state:{load:async()=>d,save:async()=>assert.fail('preview cannot save')},shopee:{search:async()=>[raw],refresh:async()=>raw},telegram:{send:async()=>assert.fail('preview cannot send')},preview:true,now,onLog:(e,v)=>events.push([e,v])});
 const item=events.find(([e])=>e==='preview_valid')[1];assert.equal(item.parse_mode,'HTML');assert.equal(item.reply_markup.inline_keyboard[0][0].url,p.link);assert.equal(JSON.stringify(d),before);
});
