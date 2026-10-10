'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),webpush=require('web-push');
const PORT=+process.env.PORT||3000, ADMIN_PIN=process.env.ADMIN_PIN||'';
if(ADMIN_PIN.length<12||!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY){console.error('Missing private ADMIN_PIN or VAPID keys');process.exit(1)}
webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
const dir=path.resolve(process.env.DATA_DIR||'./data'),store=path.join(dir,'state.json');
fs.mkdirSync(dir,{recursive:true});
const initial=()=>({settings:{storeName:'Mi tienda',customerName:'Cliente de prueba',productName:'Pedido especial',amount:64.99,currency:'USD',orderPrefix:'SB',itemCount:1,frequency:60,batchLimit:10,batchSent:0,autoEnabled:false,baseOrders:0,baseRevenue:0,logoData:null,logoVersion:0,savedAt:0},orders:[],subscriptions:[],seq:1000,nextRun:0,instanceId:crypto.randomUUID()});
let db=initial();try{let old=JSON.parse(fs.readFileSync(store,'utf8'));db={...db,...old,settings:{...db.settings,...old.settings}}}catch{};if(!db.instanceId)db.instanceId=crypto.randomUUID();
const save=()=>{fs.writeFileSync(store+'.tmp',JSON.stringify(db),{mode:0o600});fs.renameSync(store+'.tmp',store)};
const reply=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
const safe=(v,len=80)=>String(v??'').replace(/[<>]/g,'').trim().slice(0,len);
const pass=req=>{const a=Buffer.from(String(req.headers['x-admin-pin']||'')),b=Buffer.from(ADMIN_PIN);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
async function body(req){let bufs=[],n=0;for await(const x of req){n+=x.length;if(n>350000)throw new Error('Payload too large');bufs.push(x)}return JSON.parse(Buffer.concat(bufs).toString('utf8')||'{}')}
function summary(){const s=db.settings,{logoData,...otherSettings}=s;return {settings:{...otherSettings,hasLogo:!!logoData},connectedDevices:db.subscriptions.length,totalOrders:s.baseOrders+db.orders.length,revenue:+(s.baseRevenue+db.orders.reduce((a,x)=>a+x.amount,0)).toFixed(2),orders:db.orders.slice(0,50),nextOrderNumber:db.seq+1,nextRun:db.nextRun,instanceId:db.instanceId}}
async function makeOrder(){
  const s=db.settings;const o={number:(s.orderPrefix?s.orderPrefix+'-':'')+(++db.seq),itemCount:Math.max(1,Number(s.itemCount)||1),amount:s.amount,currency:s.currency,customer:s.customerName,product:s.productName,createdAt:new Date().toISOString(),type:'SIMULATED'};
  db.orders.unshift(o);db.orders=db.orders.slice(0,200);save();let accepted=0,failed=0;
  const payload=JSON.stringify({title:'Order #'+o.number,body:new Intl.NumberFormat('en-US',{style:'currency',currency:s.currency}).format(o.amount)+', '+o.itemCount+' '+(o.itemCount===1?'item':'items')+' from '+s.storeName+' · Simulado',number:o.number,logoVersion:s.logoVersion||0});
  const gone=new Set();
  await Promise.all(db.subscriptions.map(async sub=>{try{await webpush.sendNotification(sub,payload,{TTL:900,urgency:'high'});accepted++}catch(e){failed++;if([404,410].includes(e.statusCode))gone.add(sub.endpoint);else console.warn('push failed',e.statusCode||e.message)}}));
  if(gone.size){db.subscriptions=db.subscriptions.filter(x=>!gone.has(x.endpoint));save()}
  return {order:o,push:{accepted,failed}};
}
let generating=false;
setInterval(async()=>{
  const s=db.settings;
  if(!s.autoEnabled||generating)return;
  const limit=Math.min(100,Math.max(1,Number(s.batchLimit)||10));
  if((Number(s.batchSent)||0)>=limit){s.autoEnabled=false;db.nextRun=0;save();return}
  if(!db.nextRun){db.nextRun=Date.now()+s.frequency*1000;save()}
  if(Date.now()<db.nextRun)return;
  generating=true;
  try{
    await makeOrder();
    s.batchSent=(Number(s.batchSent)||0)+1;
    if(s.batchSent>=limit){s.autoEnabled=false;db.nextRun=0}
    else db.nextRun=Date.now()+s.frequency*1000;
    save();
  }catch(e){console.error('automatic order:',e.message);db.nextRun=Date.now()+s.frequency*1000;save()}
  finally{generating=false}
},500);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg'};
const hits=new Map();
http.createServer(async(req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p==='/brand-icon'){
    const data=db.settings.logoData;
    if(!data){res.writeHead(302,{Location:'/icon.svg','Cache-Control':'no-store'});return res.end()}
    const match=/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(data);
    if(!match){res.writeHead(404);return res.end('Not found')}
    const buf=Buffer.from(match[2],'base64');
    res.writeHead(200,{'Content-Type':'image/'+match[1],'Content-Length':buf.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    return res.end(buf)
  }
  if(p==='/manifest.webmanifest'){
    const storeName=safe(db.settings.storeName,48)||'Mi tienda';
    const version=Number(db.settings.logoVersion)||0;
    const manifest={
      id:'/',name:storeName,short_name:storeName.slice(0,22),
      description:'Panel privado de pedidos simulados y notificaciones',
      start_url:'/',scope:'/',display:'standalone',
      background_color:'#f7f8fa',theme_color:'#194e37',
      icons:[
        {src:'/brand-icon?v='+version,sizes:'180x180',purpose:'any maskable'},
        {src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}
      ]
    };
    res.writeHead(200,{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'no-store'});
    return res.end(JSON.stringify(manifest));
  }
  if(p==='/health')return reply(res,200,{ok:true});
  if(p==='/api/public')return reply(res,200,{publicKey:process.env.VAPID_PUBLIC_KEY});
  if(p.startsWith('/api/')){
    const ip=req.socket.remoteAddress||'unknown';let record=hits.get(ip)||{start:Date.now(),fails:0};
    if(Date.now()-record.start>60000)record={start:Date.now(),fails:0};
    if(record.fails>=25)return reply(res,429,{error:'Demasiados intentos. Vuelve en un minuto.'});
    if(!pass(req)){record.fails++;hits.set(ip,record);return reply(res,401,{error:'Clave de administrador incorrecta'})}
    try{
      if(req.method==='GET'&&p==='/api/status')return reply(res,200,summary());
      if(req.method==='POST'&&p==='/api/subscribe'){const b=await body(req);if(typeof b.endpoint!=='string'||!b.endpoint.startsWith('https://')||b.endpoint.length>3000||typeof b.keys?.auth!=='string'||typeof b.keys?.p256dh!=='string')return reply(res,400,{error:'Suscripción inválida'});db.subscriptions=db.subscriptions.filter(x=>x.endpoint!==b.endpoint);db.subscriptions.push({endpoint:b.endpoint,keys:{auth:b.keys.auth.slice(0,256),p256dh:b.keys.p256dh.slice(0,256)}});db.subscriptions=db.subscriptions.slice(-20);save();return reply(res,200,{ok:true})}
      if(req.method==='POST'&&p==='/api/logo'){
        const b=await body(req),v=b.image;
        if(v!==null && typeof v!=='string')return reply(res,400,{error:'Imagen inválida'});
        if(v!==null){
          const m=/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(v);
          if(!m)return reply(res,400,{error:'Solo se admiten imágenes JPG, PNG o WebP'});
          const bytes=Buffer.from(m[2],'base64');
          if(bytes.length<100||bytes.length>180000)return reply(res,400,{error:'La imagen debe pesar menos de 180 KB'});
          const png=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a';
          const jpg=bytes.subarray(0,2).toString('hex')==='ffd8';
          const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
          if(!(m[1]==='png'&&png||m[1]==='jpeg'&&jpg||m[1]==='webp'&&webp))return reply(res,400,{error:'Archivo de imagen incorrecto'});
        }
        db.settings.logoData=v;
        db.settings.logoVersion=Date.now();
        save();return reply(res,200,summary())
      }
      if(req.method==='POST'&&p==='/api/trigger'){if(generating)return reply(res,429,{error:'Espera unos segundos'});generating=true;try{return reply(res,200,await makeOrder())}finally{generating=false}}
      if(req.method==='POST'&&p==='/api/start'){const a=db.settings;a.autoEnabled=true;a.batchSent=0;db.nextRun=Date.now()+a.frequency*1000;save();return reply(res,200,summary())}
      if(req.method==='POST'&&p==='/api/stop'){db.settings.autoEnabled=false;db.nextRun=0;save();return reply(res,200,summary())}
      if(req.method==='POST'&&p==='/api/settings'){const b=await body(req),s=db.settings;s.storeName=safe(b.storeName,48)||s.storeName;s.customerName=safe(b.customerName,72)||s.customerName;s.productName=safe(b.productName,72)||s.productName;s.amount=Math.round(Math.max(0.01,Math.min(100000,Number(b.amount)||0.01))*100)/100;s.orderPrefix=/^[A-Za-z0-9]{0,10}$/.test(String(b.orderPrefix??'SB'))?String(b.orderPrefix??'SB'):'SB';s.itemCount=Math.max(1,Math.min(100,Math.floor(Number(b.itemCount)||1)));if(b.nextOrderNumber!==undefined){db.seq=Math.max(1,Math.min(99999999,Math.floor(Number(b.nextOrderNumber)||db.seq+1)))-1;}s.currency=['USD','EUR','MXN','DOP'].includes(b.currency)?b.currency:'USD';s.frequency=[3,15,30,60,120,300,900].includes(+b.frequency)?+b.frequency:60;s.batchLimit=Math.min(100,Math.max(1,Math.floor(Number(b.batchLimit)||10)));s.batchSent=0;s.autoEnabled=false;s.savedAt=Date.now();s.baseOrders=Math.max(0,Math.min(100000,Math.floor(Number(b.baseOrders)||0)));s.baseRevenue=Math.max(0,Math.min(10000000,Number(b.baseRevenue)||0));db.nextRun=s.autoEnabled?Date.now()+s.frequency*1000:0;save();return reply(res,200,summary())}
      return reply(res,404,{error:'Ruta no encontrada'});
    }catch(e){console.error(e);return reply(res,400,{error:'No se pudo procesar la solicitud'})}
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return reply(res,405,{error:'Método no permitido'});
  const target=p==='/'?'index.html':p.slice(1);
  if(!/^(index\.html|app\.js|sw\.js|icon\.svg|manifest\.webmanifest|sale-chime\.mp3)$/.test(target)){res.writeHead(404);return res.end('Not Found')}
  fs.readFile(path.join(__dirname,'public',target),(err,bytes)=>{
    if(err){res.writeHead(404);return res.end('Not Found')}
    if(target==='index.html'){
      const title=String(db.settings.storeName||'Mi tienda').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const version=Number(db.settings.logoVersion)||0;
      let html=bytes.toString('utf8');
      html=html.replace('name="apple-mobile-web-app-title" content="Storeboard"','name="apple-mobile-web-app-title" content="'+title+'"');
      html=html.replace('rel="apple-touch-icon" href="/brand-icon"','rel="apple-touch-icon" sizes="180x180" href="/brand-icon?v='+version+'"');
      bytes=Buffer.from(html,'utf8');
    }
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});
    res.end(bytes)
  })
}).listen(PORT,'0.0.0.0',()=>console.log('Storeboard listening on',PORT));
