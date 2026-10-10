self.addEventListener('install',event=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={title:'Storeboard · Nuevo pedido',body:'Pedido simulado',number:String(Date.now()),logoVersion:0};
  try{if(event.data)data={...data,...event.data.json()}}catch{}
  const icon='/brand-icon?v='+encodeURIComponent(data.logoVersion||0);
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,
    icon,
    badge:'/icon.svg',
    tag:'order-'+data.number,
    renotify:true,
    data:{url:'/'},
    timestamp:Date.now()
  }))
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(win=>win.url.startsWith(self.location.origin));
    if(existing)return existing.focus();
    return self.clients.openWindow('/');
  })())
});
