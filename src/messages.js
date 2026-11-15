// Presentation only. The current affiliate query does NOT provide an independent
// previous price or shipping eligibility. An audited adapter may supply confirmed
// presentation facts; never infer them from priceMax or priceDiscountRate.
const money = value => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(value).replace(/\u00a0/g,' ');
export const escapeHtml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const brands = /^(?:samsung|apple|xiaomi|philips|walita|mondial|britânia|electrolux|lg|jbl|lenovo|logitech|sony|asus|acer|dell|intel|amd|motorola|bosch|makita|tramontina|baseus|ugreen)$/iu;
const specification = /(?:\d.*[a-z]|[a-z].*\d|usb|hdmi|bluetooth|silicone|madeira|inox)/iu;
export function shortTitle(value, limit=105) {
  let title=String(value||'').normalize('NFC').replace(/https?:\/\/\S+/giu,'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').replace(/\s+/gu,' ').trim();
  // Drop repeated phrases, preserving the original words, brand and model.
  for(let size=12;size>=1;size--) {
    const words=title.split(' ');
    for(let i=0;i+size*2<=words.length;i++) {
      if(words.slice(i,i+size).join(' ').toLocaleLowerCase('pt-BR')===words.slice(i+size,i+2*size).join(' ').toLocaleLowerCase('pt-BR')) {words.splice(i+size,size);i--;}
    }
    title=words.join(' ');
  }
  if([...title].length<=limit)return title;
  const tokens=title.split(' '),chosen=new Set();
  const length=()=>[...tokens.filter((_,i)=>chosen.has(i)).join(' ')].length;
  const add=i=>{chosen.add(i);if(length()>limit-1)chosen.delete(i);};
  for(let i=0;i<Math.min(4,tokens.length);i++)add(i);
  for(let i=4;i<tokens.length;i++)if(brands.test(tokens[i])||specification.test(tokens[i]))add(i);
  for(let i=0;i<tokens.length;i++)add(i);
  const compact=tokens.filter((_,i)=>chosen.has(i)).join(' ');
  return (compact||[...title].slice(0,limit-1).join(''))+'…';
}
export function caption(p) {
  if(!Number.isFinite(p.price)||p.price<=0)throw Error('invalid_message_price');
  const facts=p.presentation||{};
  const samePrice=p.max===p.price;
  const previous=facts.previousPriceConfirmed===true && samePrice && Number.isFinite(facts.previousPrice) && facts.previousPrice>p.price ? facts.previousPrice : null;
  const discount=previous?Math.floor((1-p.price/previous)*100+1e-9):null;
  const body=[];
  if(previous)body.push(`❌ De: <s>${money(previous)}</s>`);
  body.push(`✅ ${samePrice?'Por:':'A partir de:'} <b>${money(p.price)}</b>${discount>0?` 🔻 -${discount}%`:''}`);
  const stats=[];
  if(Number.isFinite(p.rating)&&p.rating>0&&p.rating<=5)stats.push(p.rating.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}));
  if(Number.isSafeInteger(p.sales)&&p.sales>=0)stats.push(`${p.sales.toLocaleString('pt-BR')} ${p.sales===1?'vendido':'vendidos'}`);
  if(stats.length)body.push(`${Number.isFinite(p.rating)&&p.rating>0?'⭐ ':''}${stats.join(' • ')}`);
  if(facts.freeShippingConfirmed===true && facts.freeShipping===true)body.push('🚚 Frete grátis');
  for(const size of [105,85,65,45,25,10]) {
    const result=`🔥 <b>${escapeHtml(shortTitle(facts.title||p.name,size))}</b>\n\n${body.join('\n')}\n\n🧡 Shopee`;
    // Conservative raw HTML budget also satisfies main()'s existing guard.
    if(result.length<=1024)return result;
  }
  throw Error('caption_too_long');
}
export function inlineKeyboard(p) {
  let url;
  try{url=new URL(p.link);}catch{throw Error('invalid_affiliate_link');}
  if(url.protocol!=='https:'||url.username||url.password||!['shope.ee','s.shopee.com.br','shopee.com.br'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('invalid_affiliate_link');
  return {inline_keyboard:[[{text:'🛒 Pegar oferta',url:p.link}]]};
}
export function similarityFingerprint(p) {
  return [...new Set(String(p.presentation?.title||p.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)||[])].filter(w=>w.length>2&&!['para','com','por','das','dos','uma','kit','produto','oferta','promocao'].includes(w)).slice(0,30);
}
export function similarToRecent(p, records) {
  const a=new Set(similarityFingerprint(p));
  if(a.size<3)return false;
  return records.some(record=>{
    const b=new Set(record.fingerprint||[]);
    if(b.size<3)return false;
    const common=[...a].filter(w=>b.has(w)).length;
    return common/(new Set([...a,...b]).size)>=0.8;
  });
}
