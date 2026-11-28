import test from 'node:test';
import assert from 'node:assert/strict';
import {curate,editorialPenalty} from '../src/curation.js';
import {execute} from '../src/main.js';
import {readFile} from 'node:fs/promises';
const c=JSON.parse(await readFile(new URL('../config.json',import.meta.url)));
test('curated topics accept modern fashion, real sneakers, technology, useful home and car products',()=>{
 for(const [name,topic] of [['Camisa Polo Linho Minimalista Masculina','roupas'],['Vestido Midi Alfaiataria Feminino','roupas'],
  ['Tênis Casual Retrô Urbano Unissex','tenis'],['Fone Bluetooth Sem Fio','tecnologia'],['Smartphone Samsung Galaxy','tecnologia'],
  ['Luminária Moderna de Mesa','casa'],['Kit Utensílios de Silicone Cozinha','casa'],['Suporte Veicular para Celular Carro','carro'],
  ['Central Multimídia CarPlay Automotiva','carro']]){
  assert.equal(curate({name},c).topic,topic,name);assert.ok(curate({name},c).allowed,name);
 }
});
test('unrelated tiny goods and keyword-stuffed accessories cannot pass as fashion or technology',()=>{
 for(const name of ['Pipeta Conta Gotas 3ml','Cílios Postiços','Adesivo de Unhas 3D','Fralda Infantil',
  'Ração de Gato','Isca de Pesca','Boneca Vestido Fashion','Encantos para Tênis Jibbitz',
  'Palmilha para Tênis Casual','Raquete de Tênis','Conjunto de Ferramentas','Capinha para iPhone',
  'Camiseta Fantasia Futebol Uniforme','Tênis Réplica Primeira Linha','Pisca Natal Decoração'])
  assert.equal(curate({name},c).allowed,false,name);
});
test('clean modern style is preferred without claiming visual quality or brand authenticity',()=>{
 assert.ok(editorialPenalty({name:'Camisa Polo Linho Minimalista'},[],c)<editorialPenalty({name:'Camisa Masculina'},[],c));
 assert.ok(curate({name:'Camiseta Algodão Básica'},c).allowed);
 assert.ok(editorialPenalty({name:'Tênis Casual Retrô'},[{topic:'casa'},{topic:'casa'}],c)<
  editorialPenalty({name:'Panela Cerâmica'},[{topic:'casa'},{topic:'casa'}],c));
});
test('revalidation cannot substitute an off-topic product even if its IDs match',async()=>{
 const base={itemId:'101',shopId:'202',productName:'Camisa Polo Linho',priceMin:50,priceMax:50,ratingStar:4.9,sales:100,
  priceDiscountRate:20,imageUrl:'https://down-br.img.susercontent.com/file/fashion',offerLink:'https://s.shopee.com.br/fashion'};
 const logs=[];
 await execute({c,now:new Date('2026-11-28T12:00:00Z'),preview:true,
  state:{async load(){return {version:1,products:{},slots:{},cursor:0};},async save(){throw Error('no save');}},
  shopee:{keywordUnavailable:true,async search(){return [base];},async refresh(){return {...base,productName:'Cílios Postiços'};}},
  telegram:{async send(){throw Error('no send');}},onLog:event=>logs.push(event)});
 assert.ok(!logs.includes('preview_valid'));assert.ok(logs.includes('no_eligible_offers'));
});
