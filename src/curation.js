// Editorial selection from real titles, not a claim to judge photographs or authenticity.
const textOf=p=>String(p.presentation?.title||p.name||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const unwanted=/\b(brinquedo|boneca|pelucia|miniatura|pipeta|descartavel|cilios|unha|unhas|lentes? de contato|pesca|anzol|isca|racao|pet|cachorro|gato|fralda|chupeta|mamadeira|fantasia|natal|festa|lembrancinha|adesivo|aplique|replica|imitacao|primeira linha|infantil|bebe|lingerie|cueca|calcinha|sutia|pijama|camisola)\b/;
const shoeAccessories=/\b(raquete|bola|bolinha|cadarco|palmilha|enfeite|charm|jibbitz|encanto|remendo|limpador|lavar|escova|meia|meias)\b/;
const clothes=/\b(camisetas?|camisas?|polos?|calcas?|jeans|bermudas?|shorts?|jaquetas?|moletons?|moletom|sueter|cardigans?|blazers?|vestidos?|saias?|blusas?|croppeds?|macacao|macacoes|coletes?)\b/;
const tech=/\b(placa de video|placa mae|memoria ram|ryzen|hd externo|microfone|camera wifi|camera de seguranca|videogame|kindle|echo dot|alexa|smartphone|celular|iphone|tablet|notebook|computador|monitor|teclado|mouse|headset|fone|fones|earbuds|smartwatch|relogio inteligente|carregador|powerbank|power bank|ssd|roteador|webcam|console|gamepad|controle.*(gamer|xbox|playstation)|caixa de som|soundbar|televisao|smart tv|projetor)\b/;
const home=/\b(porta temperos|lixeira|escorredor|rack|almofada|manta|torneira|filtro de agua|organizador|organizadores|prateleira|estante|sapateira|cabide|cesto|luminaria|abajur|lustre|pendente|espelho|tapete|cortina|travesseiro|lencol|edredom|cobertor|toalha|panela|frigideira|talheres|utensilios|potes|pote|tigela|garrafa termica|copo termico|cafeteira|air fryer|airfryer|liquidificador|aspirador|processador de alimentos|mesa|cadeira|sofa)\b/;
const car=/\b(automotivo|automotiva|carro|veicular|carplay|android auto|multimidia|camera de re|compressor|calibrador|pneu|vonixx)\b/;
const carProduct=/\b(suporte|carregador|aspirador|camera|sensor|multimidia|carplay|compressor|calibrador|organizador|tapete|capa|cera|shampoo|limpador|kit|pneu)\b/;
const style=/\b(minimalista|minimalist|casual|urbano|streetwear|oversized|oversize|alfaiataria|linho|tricot|canelado|slim|reta|reto|wide leg|cargo|retro|chunky|couro|camurca|polo|blazer|sueter|cardigan)\b/;

export function curate(p,c) {
  if(!c.curatedSelection)return {allowed:true,topic:null,styleScore:0};
  const text=textOf(p);
  if(unwanted.test(text))return {allowed:false};
  let topic;
  if(/\btenis\b/.test(text)&&!shoeAccessories.test(text))topic='tenis';
  else if((clothes.test(text)||(/\bconjunto\b/.test(text)&&/\b(feminino|masculino|unissex)\b/.test(text)))&&!/\b(cabide|remendo|capa para|capa de)\b/.test(text)&&!/\b(uniforme|futebol|fantasia|cosplay)\b/.test(text))topic='roupas';
  else if(car.test(text)&&carProduct.test(text))topic='carro';
  else if(tech.test(text)&&!/\b(capinha|pelicula|suporte|capa|peca|conserto)\b/.test(text))topic='tecnologia';
  else if(home.test(text))topic='casa';
  return {allowed:!!topic,topic,styleScore:topic&&['roupas','tenis'].includes(topic)&&style.test(text)?1:0};
}
export function editorialPenalty(p,recent,c) {
  const selection=curate(p,c);
  if(!c.curatedSelection)return 0;
  const weights={roupas:5,tenis:5,tecnologia:4,casa:2,carro:2};
  const count=recent.slice(0,18).filter(r=>
    (r.topic||curate({name:(r.fingerprint||[]).join(' ')},c).topic)===selection.topic).length;
  // Weighted rotation: fashion and technology get more room, without flooding one topic.
  return count/weights[selection.topic]*100-selection.styleScore*8;
}
