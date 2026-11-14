import fs from 'node:fs/promises';
import {readRequest,SafeError} from './api.js';
export class State {
  constructor(env=process.env,{fetcher=fetch,path='data/history.json'}={}) {this.env=env;this.fetcher=fetcher;this.path=path;}
  async load() {
    if(this.env.GITHUB_ACTIONS==='true') {
      if(!this.env.GITHUB_TOKEN||!/^[-\w.]+\/[-\w.]+$/.test(this.env.GITHUB_REPOSITORY||'')||!this.env.STATE_BRANCH) throw Error('state_configuration');
      this.url=`https://api.github.com/repos/${this.env.GITHUB_REPOSITORY}/contents/data/history.json`;
      this.headers={'Authorization':`Bearer ${this.env.GITHUB_TOKEN}`,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
      const d=await readRequest(`${this.url}?ref=${encodeURIComponent(this.env.STATE_BRANCH)}`,{headers:this.headers},{fetcher:this.fetcher});
      this.sha=d.sha;this.data=JSON.parse(Buffer.from(d.content,'base64').toString());
    } else this.data=JSON.parse(await fs.readFile(this.path,'utf8'));
    if(this.data.version!==1||!this.data.products||!this.data.slots||!Number.isInteger(this.data.cursor)) throw Error('corrupt_state');
    return this.data;
  }
  async save() {
    const text=JSON.stringify(this.data,null,2)+'\n';
    if(this.url) {
      let r;try {r=await this.fetcher(this.url,{method:'PUT',headers:this.headers,body:JSON.stringify({message:'bot: persist delivery ledger [skip ci]',content:Buffer.from(text).toString('base64'),sha:this.sha,branch:this.env.STATE_BRANCH}),signal:AbortSignal.timeout(20000)});}catch{throw new SafeError('state_write_uncertain');}
      if(!r.ok) throw new SafeError('state_write_conflict_or_denied');
      const d=await r.json();if(!d.content?.sha) throw new SafeError('state_write_invalid');this.sha=d.content.sha;
    } else {await fs.writeFile(this.path+'.tmp',text,{mode:0o600});await fs.rename(this.path+'.tmp',this.path);}
  }
}
export async function localLock(path='.state.lock') {
  await fs.mkdir(path);
  return async()=>fs.rmdir(path);
}
