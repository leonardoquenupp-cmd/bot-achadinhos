import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryPages,discoverySources,duplicateOffer,repeatFamily,varietyPenalty,imageIdentity} from '../src/discovery.js';
import {similarityFingerprint} from '../src/messages.js';
import {execute} from '../src/main.js';
import {readFile} from 'node:fs/promises';
const c=JSON.parse(await readFile(new URL('../config.json',import.meta.url)));
const record=name=>({fingerprint:similarityFingerprint({name}),status:'sent',at:'2026-11-17T12:00:00Z'});
test('exploration covers all five available pages despite no deliveries, keeping page one as fallback',()=>{
 const seen=new Set();
 for(let i=0;i<10;i++){
  const pages=discoveryPages(c,new Date(i*300000));
  assert.ok(pages.includes(1));assert.equal(new Set(pages).size,pages.length);
  pages.forEach(p=>seen.add(p));
 }
 assert.equal(seen.size,5);
 assert.notDeepEqual(discoveryPages(c,new Date(0)),discoveryPages(c,new Date(300000)));
});
test('different listings with the same original photo are excluded',()=>{
 assert.ok(duplicateOffer({name:'Outro nome completamente diferente',image:'https://down-br.img.susercontent.com/file/abc?x=2'},
  [{imageIdentity:imageIdentity('https://down-br.img.susercontent.com/file/abc?x=1')}]));
});
test('category rotation covers every configured category without publishing or changing cursor',()=>{
 const ids=new Set(), sorts=new Set();
 for(let i=0;i<c.discoveryCategoryIds.length*3;i++){
  const sources=discoverySources(c,new Date(i*300000));
  assert.equal(sources.length,4);
  sources.forEach(s=>{if(s.productCatId)ids.add(s.productCatId);sorts.add(s.sortType);});
 }
 assert.equal(ids.size,c.discoveryCategoryIds.length);
 assert.deepEqual([...sorts].sort(),[2,4,5]);
});
test('seller title padding does not hide the same product',()=>{
 const old=record('Kit potes vidro hermeticos tampa silicone alimentos');
 assert.ok(duplicateOffer({name:'Jogo premium potes vidro hermeticos tampa silicone alimentos luxo 12'},[old]));
 assert.ok(!duplicateOffer({name:'Monitor Samsung Odyssey G5 27 polegadas 144Hz'},[old]));
});
test('Christmas trees with different dimensions cannot occupy consecutive publications',()=>{
 assert.ok(repeatFamily({name:'Arvore Natal Nevada 180cm 320 galhos branca'},
  [record('Arvore Natal Pinheiro 500 galhos premium tradicional')]));
 assert.ok(!repeatFamily({name:'Teclado mecanico gamer RGB'},[record('Arvore Natal Pinheiro 500 galhos')]));
});
test('selection prioritizes a different department over more kitchen products',()=>{
 const recent=[record('Kit potes vidro hermeticos cozinha'),record('Panela frigideira ceramica')];
 assert.ok(varietyPenalty({name:'Fone Bluetooth Sony sem fio'},recent)<varietyPenalty({name:'Garrafa termica inox'},recent));
});
test('fallback pages remain accessible when an earlier explored page is empty; preview never sends',async()=>{
 const now=new Date('2026-11-18T12:10:00Z'),pages=[],stateData={version:1,products:{},slots:{},cursor:0};
 const node={itemId:'100',shopId:'200',productName:'Teclado mecanico gamer RGB',priceMin:50,priceMax:50,
  ratingStar:4.9,sales:500,priceDiscountRate:30,imageUrl:'https://down-br.img.susercontent.com/file/keyboard',offerLink:'https://s.shopee.com.br/keyboard'};
 const shopee={keywordUnavailable:true,async search(keyword,page){pages.push(page);return page===1?[node]:[];},async refresh(){return node;}};
 const logs=[];
 await execute({c,state:{async load(){return stateData;},async save(){throw Error('must not save');}},
  shopee,telegram:{async check(){throw Error('must not contact Telegram');},async send(){throw Error('must not send');}},
  preview:true,now,onLog:event=>logs.push(event)});
 assert.ok(pages.length>1);assert.equal(pages.at(-1),1);assert.ok(logs.includes('preview_valid'));
});
