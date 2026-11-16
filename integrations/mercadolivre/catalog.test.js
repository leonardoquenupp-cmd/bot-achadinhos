import test from 'node:test';
import assert from 'node:assert/strict';
import {MercadoLivre, normalizeProduct} from './catalog.js';
const info = {id:'MLB123',status:'active',name:'Produto real de teste',pictures:[{url:'https://http2.mlstatic.com/D_test.jpg'}]};
const listing = {id:'MLB456',condition:'new',status:'active',currency_id:'BRL',price:80,original_price:100,available_quantity:2};
test('verified listing preserves exact listing, price and absence of affiliate link',()=>{
  const p=normalizeProduct(info,{results:[listing]});
  assert.equal(p.price,80);assert.equal(p.discount,20);assert.equal(p.itemId,'MLB456');
  assert.equal(new URL(p.productUrl).searchParams.get('pdp_filters'),'item_id:MLB456');
  assert.equal(p.affiliateLink,null);assert.equal(p.freeShipping,false);
});
test('unknown stock, used items, unavailable listings and other currencies fail closed',()=>{
  for(const patch of [{available_quantity:undefined},{available_quantity:0},{condition:'used'},
    {status:undefined},{status:'paused'},{currency_id:'USD'},{price:0},{price:'80'}])
    assert.equal(normalizeProduct(info,{results:[{...listing,...patch}]}),null);
});
test('invalid images and inactive catalog entries fail closed',()=>{
  for(const patch of [{status:'inactive'},{pictures:[{url:'https://evil.example/image.jpg'}]},
    {pictures:[{url:'http://http2.mlstatic.com/image.jpg'}]}])
    assert.equal(normalizeProduct({...info,...patch},{results:[listing]}),null);
});
test('old prices and freight are never invented',()=>{
  const p=normalizeProduct(info,{results:[{...listing,original_price:undefined}]});
  assert.equal(p.previousPrice,null);assert.equal(p.discount,null);assert.equal(p.freeShipping,false);
});
test('authentication requires credentials and never calls Telegram',async()=>{
  let calls=0;const api=new MercadoLivre({},async()=>{calls++;});
  await assert.rejects(api.discover('MLB1051'),/credentials_required/);assert.equal(calls,0);
});
test('discovery uses authenticated catalog and filters invalid IDs',async()=>{
  const api=new MercadoLivre({ML_ACCESS_TOKEN:'test-only'},async(url,options)=>{
    assert.equal(url,'https://api.mercadolibre.com/highlights/MLB/category/MLB1051');
    assert.equal(options.headers.Authorization,'Bearer test-only');
    return new Response(JSON.stringify({content:[{type:'PRODUCT',id:'MLB123'},
      {type:'PRODUCT',id:'MLB123'},{type:'ITEM',id:'MLB456'},{type:'PRODUCT',id:'../other'}]}));
  });
  assert.deepEqual(await api.discover('MLB1051'),['MLB123']);
  await assert.rejects(api.discover('../other'),/invalid_category/);
});
