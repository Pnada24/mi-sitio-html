# Storeboard Push · Aplicación de demostración

Panel privado inspirado en los patrones habituales de administración de comercio electrónico. Todos los pedidos y métricas son **DEMO**. No procesa pagos reales y no está afiliado a Shopify ni Larptom.

## Publicación (Render)
Web Service, Runtime: Node, plan: Free (para pruebas); Build: `npm install`, Start: `npm start`. Variables de entorno requeridas: `ADMIN_PIN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`; opcional `VAPID_SUBJECT` con `mailto:...`. Las claves privadas nunca se suben al repositorio.

## Activar notificaciones iPhone
Abrir HTTPS en **Safari** → Compartir → Añadir a pantalla de inicio → abrir Storeboard desde ese icono → introducir clave → Activar notificaciones → permitir. Enviar una compra de prueba y bloquear pantalla. Activar compras automáticas y guardar ajustes para avisos periódicos.

## Limitaciones de Render Free
El servicio gratuito puede suspenderse por inactividad y su sistema de archivos no es persistente entre despliegues o reinicios: pedidos, suscripciones push y ajustes se perderán. Así, las notificaciones automáticas **no estarán garantizadas** en el iPhone bloqueado hasta contar con servidor siempre activo y almacenamiento persistente. Las notificaciones dependen además de permisos y ajustes de iOS. La entrega aceptada por un proveedor push no garantiza visualización.

El repositorio es público, pero las claves ADMIN_PIN y VAPID deben mantenerse exclusivamente en las variables secretas de Render.
