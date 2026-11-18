import {signature,sleep} from '../src/core.js';
const id=process.env.SHOPEE_APP_ID, secret=process.env.SHOPEE_SECRET;
async function query(query) {
  await sleep(2000);
  const body=JSON.stringify({query}), t=Math.floor(Date.now()/1000);
  const r=await fetch('https://open-api.affiliate.shopee.com.br/graphql',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`SHA256 Credential=${id},Timestamp=${t},Signature=${signature(id,secret,t,body)}`},body,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('probe_http_'+r.status);
  return r.json();
}
try {
  if(!id||!secret)throw Error('probe_credentials');
  const schema=await query('{__schema{queryType{fields{name args{name type{kind name ofType{kind name}}}}}}}');
  const field=schema.data?.__schema?.queryType?.fields?.find(f=>f.name==='productOfferV2');
  console.log(JSON.stringify({event:'discovery_schema',args:field?.args||[],errors:!!schema.errors}));
  const categories=await query('{productOfferV2(page:1,limit:50){nodes{productCatIds}}}');
  const ids=[...new Set((categories.data?.productOfferV2?.nodes||[]).flatMap(n=>n.productCatIds||[]))];
  console.log(JSON.stringify({event:'discovery_categories',ids,errors:!!categories.errors}));
  for(const sort of [2,4,5]){
    const d=await query(`{productOfferV2(sortType:${sort},page:1,limit:50){nodes{itemId shopId ratingStar sales priceDiscountRate}}}`);
    console.log(JSON.stringify({event:'discovery_sort',sort,received:d.data?.productOfferV2?.nodes?.length||0,errors:!!d.errors}));
  }
}catch{console.error(JSON.stringify({event:'discovery_probe_failed'}));process.exitCode=1;}
