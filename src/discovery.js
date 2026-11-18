import {similarityFingerprint,similarToRecent} from './messages.js';

// Rotate even when a cycle finds nothing; cursor-only rotation stalls on empty searches.
export function discoveryPages(c, now) {
  const pool=c.discoveryPagePool||c.pagesPerSearch;
  const cycle=Math.floor(now.getTime()/300000);
  const pages=Array.from({length:c.pagesPerSearch},(_,i)=>(cycle*c.pagesPerSearch+i)%pool+1);
  return [...new Set([...pages,1])];
}
export function discoverySources(c, now) {
  const ids=c.discoveryCategoryIds||[];
  if(!ids.length)return null;
  const cycle=Math.floor(now.getTime()/300000);
  const sortType=[2,4,5][Math.floor(cycle/ids.length)%3];
  return [...Array.from({length:Math.min(3,ids.length)},(_,i)=>({
    productCatId:ids[(cycle*3+i)%ids.length],sortType,
  })),{sortType}];
}
const groups=[
  ['arvore-natal','decoracao',/arvore.*natal|natal.*arvore/],
  ['luzes-natal','decoracao',/natal|pisca/],
  ['espelho','decoracao',/espelho/],
  ['fone','eletronicos',/fone|headset|earbud/],
  ['relogio','eletronicos',/relogio|smartwatch/],
  ['carregador','eletronicos',/carregador|powerbank/],
  ['computador','informatica',/teclado|mouse|monitor|notebook|computador|ssd|pendrive/],
  ['potes','cozinha',/pote|tigela|marmita/],
  ['panelas','cozinha',/panela|frigideira|cac[ao]rola/],
  ['utensilios','cozinha',/utensilio|talher|faca|facas|tabua|espremedor|processador|liquidificador/],
  ['garrafas','cozinha',/garrafa|copo|taca|caneca/],
  ['ferramentas','ferramentas',/furadeira|parafusadeira|catraca|soquete|ferramenta|alicate/],
  ['calcados','moda',/tenis|chinelo|sandalia|sapato|slide|bota /],
  ['roupas','moda',/camiseta|bermuda|vestido|pijama|calca|blusa|cueca|calcinha|sutia/],
  ['acessorios','moda',/oculos|bolsa|mochila|carteira|mala /],
  ['cama-banho','casa',/travesseiro|lencol|cobertor|edredom|toalha|tapete/],
  ['organizacao','casa',/organizador|prateleira|estante|cabide|sapateira|cesto/],
  ['beleza','beleza',/cabelo|hidratante|perfume|maquiagem|batom|secador|barba/],
  ['automotivo','automotivo',/moto|carro|automotivo|vonixx|capacete|pneu/],
  ['pets','pets',/pet |gato|cachorro|racao|coleira|arranhador/],
  ['esporte','esporte',/halter|academia|fitness|bicicleta|yoga|creatina|whey/],
  ['brinquedos','brinquedos',/brinquedo|boneca|pelucia|carrinho|quebra cabeca|bloco.*montar/],
  ['bebes','bebes',/bebe|fralda|mamadeira|chupeta/],
  ['papelaria','papelaria',/caderno|caneta|lapis|estojo|papelaria/],
  ['jardim','jardim',/jardim|rocadeira|mangueira|planta|vaso/],
];
export function productGroup(p) {
  const words=p.fingerprint||similarityFingerprint(p);
  const text=words.join(' ')+' ';
  const match=groups.find(([, , pattern])=>pattern.test(text));
  return match?{family:match[0],department:match[1]}:
    {family:words.slice(0,2).join('-')||'outros',department:'outros'};
}
export function imageIdentity(image) {
  try {return new URL(image).pathname.replace(/_tn$/, '');}catch{return null;}
}
export function duplicateOffer(p, history) {
  const image=imageIdentity(p.image);
  if(image&&history.some(r=>r.imageIdentity===image))return true;
  if(similarToRecent(p,history))return true;
  const clean=words=>new Set(words.filter(w=>!/^\d+$/.test(w)&&
    !['premium','luxo','original','novo','nova','oficial','moderno','completo','pecas','jogo'].includes(w)));
  const a=clean(similarityFingerprint(p));
  return history.some(r=>{
    const b=clean(r.fingerprint||[]);
    const common=[...a].filter(w=>b.has(w)).length;
    return common>=3&&common/Math.min(a.size,b.size)>=0.75&&common/new Set([...a,...b]).size>=0.45;
  });
}
export function repeatFamily(p, recent) {
  return recent.slice(0,4).some(r=>productGroup(r).family===productGroup(p).family);
}
export function varietyPenalty(p, recent) {
  const group=productGroup(p);
  return recent.slice(0,12).reduce((total,r,i)=>{
    const other=productGroup(r);
    return total+(other.department===group.department?(12-i)*10:0)+
      (other.family===group.family?(12-i)*30:0);
  },0);
}
