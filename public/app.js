'use strict';
const el=id=>document.getElementById(id);
let pin=sessionStorage.getItem('storeboard_admin')||'',publicKey='',lastLogoVersion=null;
const fmt=(a,c='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency:c}).format(Number(a)||0);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]||'&#39;'));
function msg(id,text,error=false){const x=el(id);x.classList.remove('hidden');x.classList.toggle('error',error);x.textContent=text}
function clearMsg(id){el(id).classList.add('hidden')}
async function api(route,method='GET',data){const headers={};if(pin)headers['X-Admin-Pin']=pin;if(data!==undefined)headers['Content-Type']='application/json';const r=await fetch(route,{method,headers,cache:'no-store',body:data!==undefined?JSON.stringify(data):undefined});let x;try{x=await r.json()}catch{throw Error('No se obtuvo respuesta del servidor')};if(!r.ok)throw Error(x.error||'Error');return x}
function render(d){
  let s=d.settings;el('side-name').textContent=s.storeName;el('count').textContent=d.totalOrders.toLocaleString('en-US');el('revenue').textContent=fmt(d.revenue,s.currency);el('devices').textContent=d.connectedDevices;el('receipt-product').textContent=s.productName;el('receipt-customer').textContent=s.customerName;el('receipt-price').textContent=fmt(s.amount,s.currency);
  el('orders').innerHTML=d.orders.length?d.orders.map(o=>'<div class="order"><span class="order-icon">▤</span><div class="order-details"><b>#'+escapeHTML(o.number)+'</b><small>'+escapeHTML(o.customer)+' · '+escapeHTML(o.product)+' · '+new Date(o.createdAt).toLocaleString('es-US')+'</small></div><div class="amount">'+fmt(o.amount,o.currency)+'<small>Simulado</small></div></div>').join(''):'<p class="empty">Aún no hay pedidos de prueba.</p>';
  const sent=Number(s.batchSent)||0,limit=Number(s.batchLimit)||10;el("batch-progress").textContent=s.autoEnabled?`Tanda activa: ${sent} de ${limit} compras simuladas. ${Math.max(0,limit-sent)} pendientes.`:sent>=limit?`Tanda completada: ${sent} de ${limit}. Se detuvo automáticamente.`:`Tanda pausada: ${sent} de ${limit} compras DEMO.`;
  const form=el('settings-form');if(!form.contains(document.activeElement)){for(const k of ['storeName','productName','customerName','amount','currency','frequency','batchLimit','baseOrders','baseRevenue'])if(form.elements[k])form.elements[k].value=s[k];el('autoEnabled').checked=!!s.autoEnabled}
  if(lastLogoVersion!==s.logoVersion){
    lastLogoVersion=s.logoVersion;
    const url=s.hasLogo?'/brand-icon?v='+encodeURIComponent(s.logoVersion||0):'/icon.svg';
    for(const id of ['side-logo','mobile-logo','notification-logo','logo-preview'])if(el(id))el(id).src=url;
  }
  updatePush();
}
function updatePush(){const ok='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;el('push-status').textContent=!ok?'No compatible':Notification.permission==='granted'?'Permitido':Notification.permission==='denied'?'Bloqueado':'Sin activar'}
async function refresh(){try{render(await api('/api/status'))}catch(e){if(e.message.includes('Clave de administrador')){pin='';sessionStorage.removeItem('storeboard_admin');el('dashboard').classList.add('hidden');el('login').classList.remove('hidden')}else msg('test-result',e.message,true)}}
async function enter(){const d=await api('/api/status');sessionStorage.setItem('storeboard_admin',pin);el('login').classList.add('hidden');el('dashboard').classList.remove('hidden');publicKey=(await api('/api/public')).publicKey;render(d);if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});}
el('login-form').addEventListener('submit',async e=>{e.preventDefault();pin=el('pin').value.trim();try{await enter()}catch(err){msg('login-error',err.message,true);pin=''}});
el('refresh').addEventListener('click',refresh);
el('send-test').addEventListener('click',async()=>{const btn=el('send-test');btn.disabled=true;clearMsg('test-result');try{const d=await api('/api/trigger','POST',{});msg('test-result',d.push.accepted?'Pedido simulado '+d.order.number+' creado; '+d.push.accepted+' aviso(s) aceptados por el servicio push.':'Pedido DEMO creado. Primero vincula tu iPhone para recibir alertas.');await refresh()}catch(err){msg('test-result',err.message,true)}finally{btn.disabled=false}});
el('settings-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form).entries());data.autoEnabled=el('autoEnabled').checked;try{render(await api('/api/settings','POST',data));msg('settings-result',data.autoEnabled?`Tanda iniciada: ${data.batchLimit} compras DEMO, cada ${data.frequency} segundos. Se detendrá sola.`:'Configuración guardada. Tanda automática detenida.')}catch(err){msg('settings-result',err.message,true)}});
function toBytes(s){const b=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(b+'='.repeat((4-b.length%4)%4)),c=>c.charCodeAt(0))}
el('enable-push').addEventListener('click',async()=>{const btn=el('enable-push');btn.disabled=true;clearMsg('push-result');try{
 if(!isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Esta versión requiere HTTPS y un navegador compatible.');
 const standalone=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
 if(/iPhone|iPad|iPod/i.test(navigator.userAgent)&&!standalone)throw Error('Primero abre esta página en Safari, elige Compartir → Añadir a pantalla de inicio y abre la app desde su icono.');
 await navigator.serviceWorker.register('/sw.js');const result=await Notification.requestPermission();if(result!=='granted')throw Error('Debes permitir las notificaciones del iPhone en Ajustes.');
 const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(publicKey)});
 await api('/api/subscribe','POST',sub.toJSON());await refresh();msg('push-result','¡Listo! Este dispositivo está registrado. Pulsa “Enviar compra de prueba” y bloquea el teléfono.');
 }catch(err){msg('push-result',err.message,true)}finally{btn.disabled=false;updatePush()}});

function cropImage(file){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith('image/'))return reject(Error('Selecciona una foto o imagen válida'));
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      try{
        const c=document.createElement('canvas');c.width=c.height=256;
        const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,256,256);
        const short=Math.min(img.naturalWidth,img.naturalHeight),x=(img.naturalWidth-short)/2,y=(img.naturalHeight-short)/2;
        ctx.drawImage(img,x,y,short,short,0,0,256,256);
        let data=c.toDataURL('image/jpeg',.84);
        if(data.length>200000)data=c.toDataURL('image/jpeg',.6);
        URL.revokeObjectURL(url);resolve(data);
      }catch(e){URL.revokeObjectURL(url);reject(e)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('No se puede abrir esa imagen. Prueba una foto JPG o PNG.'))};
    img.src=url;
  })
}
el('upload-logo').addEventListener('click',async()=>{
  const file=el('brand-file').files?.[0];
  if(!file)return msg('logo-result','Primero elige una imagen de Fotos o Archivos.',true);
  if(file.size>20000000)return msg('logo-result','Elige una imagen de menos de 20 MB.',true);
  const btn=el('upload-logo');btn.disabled=true;clearMsg('logo-result');
  try{
    const image=await cropImage(file);
    render(await api('/api/logo','POST',{image}));
    msg('logo-result','Logo guardado. Se usará en el panel y se intentará mostrar en las notificaciones. iOS puede seguir mostrando el icono de la app instalada.');
  }catch(e){msg('logo-result',e.message,true)}
  finally{btn.disabled=false}
});
el('remove-logo').addEventListener('click',async()=>{
  try{render(await api('/api/logo','POST',{image:null}));el('brand-file').value='';msg('logo-result','Logo original restaurado.')}catch(e){msg('logo-result',e.message,true)}
});

if(pin)enter().catch(()=>{pin='';sessionStorage.removeItem('storeboard_admin');el('dashboard').classList.add('hidden');el('login').classList.remove('hidden')});
setInterval(()=>{if(pin&&!document.hidden)refresh()},15000);
