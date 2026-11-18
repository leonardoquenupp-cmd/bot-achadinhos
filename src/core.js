import crypto from 'node:crypto';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function signature(id, secret, timestamp, payload) {
  return crypto.createHash('sha256').update(id + timestamp + payload + secret).digest('hex');
}
export function validateConfig(c) {
  new Intl.DateTimeFormat('en', {timeZone:c.timezone}).format();
  for (const [k,min,max] of [['dailyLimit',1,180],['windowMinutes',1,180],['minRating',0,5],['minSales',0,1e9],['minDiscount',0,99],['requestIntervalMs',1000,60000],['pagesPerSearch',1,5]]) {
    if (!Number.isFinite(c[k]) || c[k]<min || c[k]>max) throw Error('invalid_config');
  }
  if (!Number.isInteger(c.dailyLimit) || !Number.isInteger(c.pagesPerSearch)) throw Error('invalid_config');
  if(c.discoveryPagePool!==undefined&&(!Number.isInteger(c.discoveryPagePool)||c.discoveryPagePool<c.pagesPerSearch||c.discoveryPagePool>100))throw Error('invalid_config');
  const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
  if(c.times!==undefined && (!Array.isArray(c.times)||!c.times.length||c.times.some(t=>!timePattern.test(t))||new Set(c.times).size!==c.times.length))throw Error('invalid_times');
  if(c.postingWindow) {
    if(!timePattern.test(c.postingWindow.start)||!timePattern.test(c.postingWindow.end)||c.postingWindow.start>=c.postingWindow.end)throw Error('invalid_times');
  }else if(!c.times)throw Error('invalid_times');
  if(c.minimumIntervalMinutes!==undefined&&(!Number.isInteger(c.minimumIntervalMinutes)||c.minimumIntervalMinutes<1||c.minimumIntervalMinutes>1440))throw Error('invalid_config');
  if(c.postingWindow && (minuteOfDay(c.postingWindow.end)-minuteOfDay(c.postingWindow.start))/c.dailyLimit<(c.minimumIntervalMinutes||0))throw Error('invalid_config');
  if (!Array.isArray(c.keywords) || !c.keywords.length || c.keywords.some(k=>typeof k!=='string'||!k.trim()) || typeof c.paused!=='boolean' || typeof c.strictStock!=='boolean') throw Error('invalid_config');
  return c;
}
const minuteOfDay=t=>+t.slice(0,2)*60 + +t.slice(3);
export function scheduledTimes(c) {
  if(!c.postingWindow)return c.times.slice().sort();
  const start=minuteOfDay(c.postingWindow.start),span=minuteOfDay(c.postingWindow.end)-start;
  return Array.from({length:c.dailyLimit},(_,i)=>{const m=start+Math.floor(i*span/c.dailyLimit);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;});
}
export function dueSlot(c, state, now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:c.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const day=`${parts.year}-${parts.month}-${parts.day}`,minute=+parts.hour*60 + +parts.minute;
  if(Object.values(state.products).some(p=>p.status==='pending'))throw Error('pending_delivery_requires_review');
  if(c.postingWindow&&(minute<minuteOfDay(c.postingWindow.start)||minute>=minuteOfDay(c.postingWindow.end)))return null;
  if(Object.keys(state.slots).filter(k=>k.startsWith(day+':')).length>=c.dailyLimit)return null;
  const last=Math.max(0,...Object.values(state.products).map(p=>Date.parse(p.at)||0));
  if(now.getTime()-last<(c.minimumIntervalMinutes||0)*60000)return null;
  // Only the latest due slot is eligible. Never drain a backlog after delays.
  const time=scheduledTimes(c).filter(t=>minuteOfDay(t)<=minute).at(-1);
  if(!time||minute-minuteOfDay(time)>=c.windowMinutes)return null;
  const slot=`${day}:${time}`;
  return state.slots[slot]?null:slot;
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
  return {key:`${n.shopId}:${n.itemId}`,itemId:String(n.itemId),shopId:String(n.shopId),name:n.productName.trim().slice(0,180),price,max,rating,sales,discount,image:n.imageUrl,link:n.offerLink,score:discount+rating*5+Math.log1p(sales)*3,presentation:{title:n.productName.slice(0,4096)}};
}
export {caption} from './messages.js';
