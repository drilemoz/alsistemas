import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'

const MAX_OUTPUT = 256 * 1024
const IDLE = 10 * 60_000
const LIFETIME = 30 * 60_000
const failure = (status, message) => Object.assign(new Error(message), {status})

// A sessão Bash vive em outro serviço/UID. Nunca iniciar subprocessos como alsistemas.
export function createTerminalManager({socketPath='/run/alsistemas-terminal/terminal.sock', connect=()=>net.createConnection(socketPath), isSessionActive=()=>false, audit=()=>{}, now=Date.now}={}) {
  const sessions = new Map()
  function end(s, reason) {
    if(s.closed) return
    s.closed=true; s.reason=reason; s.ended=now()
    s.socket.destroy()
    try {audit('terminal_closed',{action:'terminal',reason,success:true})} catch {}
  }
  function append(s, value) {
    s.output += value; s.next += value.length
    if(s.output.length>MAX_OUTPUT) {
      const drop=s.output.length-MAX_OUTPUT
      s.output=s.output.slice(drop);s.base+=drop
    }
  }
  function sweep() {
    const t=now()
    for(const [id,s] of sessions) {
      if(!s.closed) {
        let active=false
        try {active=isSessionActive(s.owner)} catch {}
        if(!active || t>=s.expires) end(s,'sessão administrativa expirada')
        else if(t-s.last>IDLE || t-s.started>=LIFETIME) end(s,'limite de duração/inatividade')
      }
      if(s.closed && t-s.ended>60_000) sessions.delete(id)
    }
  }
  const timer=setInterval(sweep,5000);timer.unref()
  function owned(owner,id) {
    sweep()
    const s=sessions.get(id)
    if(!s || s.owner!==owner) throw failure(404,'Sessão de terminal indisponível.')
    return s
  }
  async function open(owner,expires) {
    sweep()
    const existing=[...sessions.values()].find(s=>s.owner===owner&&!s.closed)
    if(existing) return {id:existing.id,expires:Math.min(expires,existing.started+LIFETIME),idleMs:IDLE,resumed:true}
    if(sessions.size>=12 || [...sessions.values()].filter(s=>!s.closed).length>=2) throw failure(429,'Limite de terminais atingido. Encerre uma sessão ou tente novamente.')
    const id=randomBytes(24).toString('hex'), socket=connect()
    const s={id,owner,expires,socket,output:'',base:0,next:0,started:now(),last:now(),closed:false,decoder:new StringDecoder('utf8')}
    sessions.set(id,s)
    socket.on('data',buf=>{if(!s.closed) append(s,s.decoder.write(buf))})
    socket.on('end',()=>{if(!s.closed) append(s,s.decoder.end());end(s,'Bash encerrado')})
    socket.on('error',()=>end(s,'serviço de terminal indisponível'))
    socket.on('close',()=>end(s,'conexão encerrada'))
    try {
      await new Promise((resolve,reject)=>{
        const t=setTimeout(()=>{cleanup();reject(new Error('timeout'))},3000)
        const cleanup=()=>{clearTimeout(t);socket.off('connect',ok);socket.off('error',bad);socket.off('close',bad)}
        const ok=()=>{cleanup();resolve()};const bad=()=>{cleanup();reject(new Error('socket'))}
        socket.once('connect',ok);socket.once('error',bad);socket.once('close',bad)
      })
      if(s.closed) throw new Error('closed')
      audit('terminal_opened',{action:'terminal',success:true})
      return {id,expires:Math.min(expires,s.started+LIFETIME),idleMs:IDLE}
    } catch {end(s,'serviço de terminal indisponível');sessions.delete(id);throw failure(503,'Terminal indisponível. Confira o serviço alsistemas-terminal.socket no diagnóstico.')}
  }
  function poll(owner,id,cursor) {
    const s=owned(owner,id)
    if(!Number.isSafeInteger(cursor)||cursor<0||cursor>s.next) throw failure(400,'Posição de saída inválida.')
    // Não renova inatividade com polling automático; somente entrada humana.
    const from=Math.max(cursor,s.base)
    return {output:s.output.slice(from-s.base),cursor:s.next,truncated:cursor<s.base,closed:s.closed,reason:s.reason||''}
  }
  function input(owner,id,value) {
    const s=owned(owner,id)
    if(s.closed) throw failure(410,'Terminal encerrado.')
    if(typeof value!=='string'||!value.length||Buffer.byteLength(value)>4096) throw failure(400,'Entrada inválida (máximo de 4 KiB).')
    if(s.socket.writableLength>65536) throw failure(429,'Terminal ocupado; tente novamente.')
    s.last=now();s.socket.write(value);return {ok:true}
  }
  function close(owner,id){const s=owned(owner,id);end(s,'encerrado pelo usuário');return {ok:true}}
  function closeOwner(owner){for(const s of sessions.values()) if(s.owner===owner) end(s,'logout')}
  function closeAll(){for(const s of sessions.values()) end(s,'sessões revogadas')}
  function dispose(){clearInterval(timer);closeAll();sessions.clear()}
  return {open,poll,input,close,closeOwner,closeAll,dispose}
}
