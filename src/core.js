import crypto from 'node:crypto';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function signature(id, secret, timestamp, payload) {
  return crypto.createHash('sha256').update(id + timestamp + payload + secret).digest('hex');
}
export function validateConfig(c) {
  new Intl.DateTimeFormat('en', {timeZone:c.timezone}).format();
  for (const [k,min,max] of [['dailyLimit',1,24],['windowMinutes',1,180],['minRating',0,5],['minSales',0,1e9],['minDiscount',0,99],['requestIntervalMs',1000,60000],['pagesPerSearch',1,5]]) {
    if (!Number.isFinite(c[k]) || c[k]<min || c[k]>max) throw Error('invalid_config');
  }
  if (!Number.isInteger(c.dailyLimit) || !Number.isInteger(c.pagesPerSearch)) throw Error('invalid_config');
  if (!Array.isArray(c.times) || !c.times.length || c.times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || new Set(c.times).size!==c.times.length) throw Error('invalid_times');
  if (!Array.isArray(c.keywords) || !c.keywords.length || c.keywords.some(k=>typeof k!=='string'||!k.trim()) || typeof c.paused!=='boolean' || typeof c.strictStock!=='boolean') throw Error('invalid_config');
  return c;
}
export function dueSlot(c, state, now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:c.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const day=`${parts.year}-${parts.month}-${parts.day}`, minute=+parts.hour*60 + +parts.minute;
  if (Object.values(state.products).some(p=>p.status==='pending')) throw Error('pending_delivery_requires_review');
  if(Object.keys(state.slots).filter(k=>k.startsWith(day+':')).length>=c.dailyLimit) return null;
  return c.times.slice().sort().map(t=>({id:`${day}:${t}`,age:minute-(+t.slice(0,2)*60 + +t.slice(3))})).find(s=>s.age>=0&&s.age<c.windowMinutes&&!state.slots[s.id])?.id ?? null;
}
export function httpsUrl(value, hosts) {
  try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password&&(!hosts||hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))); } catch { return false; }
}
export function normalize(n,c) {
  if ([n.itemId,n.shopId].some(id=>typeof id==='number'&&!Number.isSafeInteger(id))) return null;
  const price=Number(n.priceMin),max=Number(n.priceMax),rating=Number(n.ratingStar),sales=Number(n.sales),discount=Number(n.priceDiscountRate);
  if(!/^\d+$/.test(String(n.itemId))||!/^\d+$/.test(String(n.shopId))||typeof n.productName!=='string'||!n.productName.trim()||!Number.isFinite(price)||price<=0||!Number.isFinite(max)||max<price||!Number.isFinite(rating)||rating<c.minRating||rating>5||!Number.isFinite(sales)||sales<c.minSales||!Number.isFinite(discount)||discount<c.minDiscount||discount>=100) return null;
  if(!httpsUrl(n.imageUrl,['shopee.com.br','shopee.com','susercontent.com','shopeemobile.com'])||!httpsUrl(n.offerLink,['shope.ee','s.shopee.com.br','shopee.com.br'])) return null;
  if(c.strictStock && !(Number(n.stock)>0)) return null;
  return {key:`${n.shopId}:${n.itemId}`,itemId:String(n.itemId),shopId:String(n.shopId),name:n.productName.trim().slice(0,180),price,max,rating,sales,discount,image:n.imageUrl,link:n.offerLink,score:discount+rating*5+Math.log1p(sales)*3};
}
export function caption(p) {
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  // priceMax is a variant price, never a previous price.
  return `🔥 Achadinho Shopee\n\n${p.name}\n\n💰 ${p.max>p.price?'A partir de: ':''}${money(p.price)}\n🏷 ${p.discount}% de desconto informado pela Shopee\n⭐ ${p.rating}/5 · ${p.sales} vendas\n\n🔗 ${p.link}\n\nPublicidade • Link de afiliado. Preço e disponibilidade podem mudar.`;
}
