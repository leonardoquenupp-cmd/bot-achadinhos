import {createHash} from 'node:crypto';

function unescapeHtml(text) {
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',bull:'•',hellip:'…'};
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(match,key)=>{
    if(key[0]!=='#')return entities[key.toLowerCase()]??match;
    const value=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
    return value>0&&value<=0x10ffff?String.fromCodePoint(value):match;
  });
}
export function captionHash(html) {
  const plain=unescapeHtml(String(html).replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,''))
    .normalize('NFC').replace(/\s+/gu,' ').trim();
  return createHash('sha256').update(plain).digest('hex');
}
export function findReceipt(html, username, pending) {
  if(!pending.receipt?.captionHash||!pending.receipt?.affiliateLink||!Number.isFinite(Date.parse(pending.at)))return null;
  const matches=[];
  const blocks=String(html).match(/<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|$)/g)||[];
  for(const block of blocks) {
    const post=block.match(/data-post="([a-zA-Z0-9_]+)\/(\d+)"/);
    const text=block.match(/<div class="tgme_widget_message_text[^\"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    const stamp=block.match(/<time[^>]*datetime="([^\"]+)"/)?.[1];
    const elapsed=Date.parse(stamp)-Date.parse(pending.at);
    if(!post||post[1].toLowerCase()!==username.toLowerCase()||!text||
      !Number.isFinite(elapsed)||elapsed< -1000||elapsed>600000||!block.includes('tgme_widget_message_photo_wrap'))continue;
    const links=[...block.matchAll(/href="([^\"]+)"/g)].map(m=>unescapeHtml(m[1]));
    if(captionHash(text)!==pending.receipt.captionHash||!links.includes(pending.receipt.affiliateLink))continue;
    const messageId=Number(post[2]);
    if(Number.isSafeInteger(messageId)&&messageId>0)matches.push({messageId,publishedAt:new Date(stamp).toISOString()});
  }
  // Absence or multiple matches cannot prove a unique delivery. Never resend automatically.
  return matches.length===1?matches[0]:null;
}
