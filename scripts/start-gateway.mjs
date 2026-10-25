// LIVE read-only gateway entrypoint. Run with secrets injected by the host, e.g.:
//   node --env-file=/run/secrets/gateway.env scripts/start-gateway.mjs
// Never prints secrets. Refuses mock mode and any shared CRM token (see gatewayConfig).
import {createServer} from 'node:http';
import {createGateway,nodeListener,defaultLog} from '../src/live-gateway.mjs';

let gateway;
try{gateway=createGateway(process.env)}
catch(e){
 const code=/^gateway_config_[a-z_]+$|^crm_[a-z_]+$/.test(e?.message||'')?e.message:'gateway_config_invalid';
 console.error('LIVE_GATEWAY_BOOT_BLOCKED '+code);process.exit(1);
}
const host=process.env.EVYD_LISTEN_HOST||'127.0.0.1';
const port=Number(process.env.EVYD_LISTEN_PORT||8090);
if(!Number.isInteger(port)||port<1||port>65535){console.error('LIVE_GATEWAY_BOOT_BLOCKED invalid_port');process.exit(1)}
const server=createServer({requestTimeout:30000,headersTimeout:15000,keepAliveTimeout:5000},nodeListener(gateway));
server.maxHeadersCount=64;
server.listen(port,host,()=>defaultLog({evt:'gateway_started',host,port,public_host:gateway.cfg.hostname,operators:gateway.cfg.allowedOperators.size}));
const stop=sig=>{defaultLog({evt:'gateway_stopping',sig});server.close(()=>gateway.close().finally(()=>process.exit(0)));setTimeout(()=>process.exit(0),10000).unref()};
process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'));
