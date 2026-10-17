vi.mock('../server/memories',()=>({keyTag:()=> 'tag',MemoryStore:class {async create(){} async update(){} async append(){} async refresh(){} async list(){return []}}}));
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { Server } from 'node:http';

const fakes=vi.hoisted(()=>({all:[] as any[]}));
vi.mock('ws',async()=>{
  const {EventEmitter}=await import('node:events');
  class FakeSocket extends EventEmitter {
    static OPEN=1;static CONNECTING=0;readyState=0;sent:any[]=[];
    constructor(){super();fakes.all.push(this);}
    send(text:string){this.sent.push(JSON.parse(text));}
    close(){this.readyState=3;this.emit('close');}
    open(){this.readyState=1;this.emit('open');}
  }
  class FakeServer extends EventEmitter{close(){}handleUpgrade(){}}
  return {WebSocket:FakeSocket,WebSocketServer:FakeServer};
});
import { installLive } from '../server/live';
let shutdown=()=>{};
beforeEach(()=>{
  vi.useFakeTimers();fakes.all.length=0;
  vi.stubEnv('VIDU_API_KEY','vda_test_only');vi.stubEnv('VIDU_HOST','api.vidu.com');vi.stubEnv('LIVE_MAX_SECONDS','120');
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({live:{id:'123',status:'ended'},rtc:{token:'short-lived',user_id:'player'}})})));
});
afterEach(()=>{shutdown();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(){
  const routes=new Map<string,Function>();const app={get:(p:string,f:Function)=>routes.set('GET '+p,f),post:(p:string,f:Function)=>routes.set('POST '+p,f)};
  const api=installLive(app as unknown as Express,new EventEmitter() as Server);shutdown=api.shutdown;
  async function call(route:string,body:unknown={}){const result:any={};const res={destroyed:false,status(n:number){result.status=n;return this;},json(value:unknown){result.data=value;return this;}};await routes.get(route)!({body},res);return result;}
  return {call};
}
describe('billable live lifetime',()=>{
  it('ends an abandoned session even when no browser websocket ever attaches',async()=>{
    const {call}=setup();const created=await call('POST /api/live',{nodeId:'arrival'});expect(created.data.id).toBe('123');
    const socket=fakes.all[0];socket.open();vi.advanceTimersByTime(30001);
    expect(socket.sent.some((x:any)=>x.type===5)).toBe(true);
    expect((await call('GET /api/status')).data.activeLive).toBe(0);
  });
  it('cancels during upstream handshake by sending hangup as soon as it opens',async()=>{
    const {call}=setup();const {data}=await call('POST /api/live',{nodeId:'arrival'});const socket=fakes.all[0];
    await call('POST /api/live/end',{id:data.id,ticket:data.ticket});socket.open();
    expect(socket.sent.filter((x:any)=>x.type===5)).toHaveLength(1);expect(socket.readyState).toBe(3);
  });
  it('does not let a different ticket terminate an active session',async()=>{
    const {call}=setup();await call('POST /api/live',{nodeId:'arrival'});
    await call('POST /api/live/end',{id:'123',ticket:'wrong'});
    expect((await call('GET /api/status')).data.activeLive).toBe(1);
  });
  it('rejects a second live session and never exposes the permanent key',async()=>{
    const {call}=setup();const first=await call('POST /api/live',{nodeId:'arrival'});
    expect(JSON.stringify(first)).not.toContain('vda_');expect((await call('POST /api/live',{nodeId:'arrival'})).status).toBe(409);
  });
});
