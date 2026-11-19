import test from 'node:test';
import assert from 'node:assert/strict';
import {captionHash,findReceipt} from '../src/receipts.js';
import {Telegram} from '../src/api.js';
import {execute} from '../src/main.js';
import {readFile} from 'node:fs/promises';
const c=JSON.parse(await readFile(new URL('../config.json',import.meta.url)));
const caption='🔥 <b>Boné &amp; Chapéu &lt;Original&gt;</b>\n\n✅ Por: <b>R$ 48,99</b>\n\n🧡 Shopee';
const pending={status:'pending',at:'2026-11-19T21:26:52.380Z',receipt:{captionHash:captionHash(caption),affiliateLink:'https://s.shopee.com.br/example?x=1&y=2'}};
const block=({text=caption.replace(/\n/g,'<br/>'),link='https://s.shopee.com.br/example?x=1&amp;y=2',
 stamp='2026-11-19T21:27:25+00:00',user='ofertasleleo',photo=true}={})=>
 `<div class="tgme_widget_message_wrap"><div data-post="${user}/407">${photo?'<a class="tgme_widget_message_photo_wrap"></a>':''}<div class="tgme_widget_message_text js-message_text">${text}</div><a href="${link}">Pegar oferta</a><time datetime="${stamp}"></time></div></div>`;
test('public delivery proof matches escaped HTML, caption, exact button URL, channel, photo and time',()=>{
 assert.deepEqual(findReceipt(block(),'ofertasleleo',pending),{messageId:407,publishedAt:'2026-11-19T21:27:25.000Z'});
 assert.equal(captionHash('A &amp; B<br/>C'),captionHash('A &amp; B\nC'));
});
test('Telegram second-precision timestamps do not reject a delivery within the reservation second',()=>{
 assert.equal(findReceipt(block({stamp:'2026-11-19T21:26:52Z'}),'ofertasleleo',pending)?.messageId,407);
});
test('different price, affiliate link, channel, missing photo or invalid time cannot confirm delivery',()=>{
 for(const patch of [{text:caption.replace('48,99','49,99')},{link:'https://s.shopee.com.br/other'},
  {user:'otherchannel'},{photo:false},{stamp:'2026-11-19T21:26:00Z'},{stamp:'2026-11-19T21:40:00Z'},
  {stamp:'invalid'}])assert.equal(findReceipt(block(patch),'ofertasleleo',pending),null);
 assert.equal(findReceipt(block(),'ofertasleleo',{...pending,receipt:undefined}),null);
 assert.equal(findReceipt(block()+block(),'ofertasleleo',pending),null);
});
test('receipt reconciliation only reads Telegram and its verified public channel',async()=>{
 const urls=[];
 const api=new Telegram({TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_CHAT_ID:'-100123'},{fetcher:async(url)=>{
  urls.push(url);
  return url.includes('/getChat')?new Response(JSON.stringify({ok:true,result:{username:'ofertasleleo'}})):new Response(block());
 }});
 assert.equal((await api.reconcile(pending)).messageId,407);
 assert.equal(urls.length,2);assert.equal(urls[1],'https://t.me/s/ofertasleleo');
 assert.ok(!urls.some(u=>u.includes('sendPhoto')));
});
test('private channels have no assumed receipt and never trigger public lookups or resends',async()=>{
 let calls=0;
 const api=new Telegram({},{fetcher:async()=>{calls++;return new Response(JSON.stringify({ok:true,result:{id:-100123}}));}});
 assert.equal(await api.reconcile(pending),null);assert.equal(calls,1);
});
test('unresolved delivery blocks safely without producing another failing cycle or mutating history',async()=>{
 const data={version:1,products:{one:structuredClone(pending)},slots:{},cursor:0};
 const logs=[],events=[];
 const args={c,now:new Date('2026-11-19T21:30:00Z'),state:{async load(){return data;},async save(){events.push('save');}},
  shopee:{async search(){events.push('search');}},telegram:{async reconcile(){return null;},async send(){events.push('send');}},onLog:e=>logs.push(e)};
 await execute(args);await execute(args);
 assert.deepEqual(events,[]);assert.equal(data.products.one.status,'pending');
 assert.deepEqual(logs,['delivery_awaiting_confirmation','delivery_awaiting_confirmation']);
});
test('verified receipt is persisted and does not resend the delivered product',async()=>{
 const data={version:1,products:{one:structuredClone(pending)},slots:{},cursor:0};let saves=0;
 await execute({c,now:new Date('2026-11-19T21:30:00Z'),state:{async load(){return data;},async save(){saves++;}},
  shopee:{async search(){throw Error('interval still closed');}},telegram:{async reconcile(){return {messageId:407,publishedAt:'2026-11-19T21:29:00.000Z'};},async send(){throw Error('no resend');}},onLog:()=>{}});
 assert.equal(saves,1);assert.equal(data.products.one.status,'sent');assert.equal(data.products.one.messageId,407);
});
test('preview never reconciles or changes a pending delivery',async()=>{
 const data={version:1,products:{one:structuredClone(pending)},slots:{},cursor:0};
 await execute({c,preview:true,state:{async load(){return data;},async save(){throw Error('must not save');}},
  telegram:{async reconcile(){throw Error('must not reconcile');}},onLog:()=>{}});
 assert.equal(data.products.one.status,'pending');
});
test('new authentication errors still fail instead of being hidden as an unresolved receipt',async()=>{
 const data={version:1,products:{one:structuredClone(pending)},slots:{},cursor:0};
 await assert.rejects(execute({c,state:{async load(){return data;}},
  telegram:{async reconcile(){throw Error('read_http_401');}},onLog:()=>{}}),/read_http_401/);
});
test('public receipt network outage never marks delivery confirmed',async()=>{
 let calls=0;
 const api=new Telegram({},{fetcher:async()=>{
  if(calls++===0)return new Response(JSON.stringify({ok:true,result:{username:'ofertasleleo'}}));
  throw Error('network unavailable');
 }});
 assert.equal(await api.reconcile(pending),null);
});
