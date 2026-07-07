const amqp = require('amqplib');
const sgMail = require('@sendgrid/mail');
const mysql = require('mysql2/promise');

const EXCHANGE_NAME = 'inscripcion.creada';
const QUEUE_NAME = 'notificaciones.email';
const DLQ_NAME = 'notificaciones.email.dlq';
const MAX_INTENTOS = 3;

const DEV_MODE = !process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY.startsWith('SG.xxx');
if (!DEV_MODE) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

let dbPool;
async function getPool() {
  if (!dbPool) {
    dbPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return dbPool;
}

function buildEmailHTML(data) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <div style="background: #1a1a2e; color: white; padding: 30px 40px;">
          <h1 style="margin: 0; font-size: 24px;">🎓 EduTech Platform</h1>
        </div>
        <div style="padding: 40px;">
          <h2 style="color: #1a1a2e;">¡Inscripción Confirmada!</h2>
          <p>Hola <strong>${data.nombre_estudiante || 'Estudiante'}</strong>,</p>
          <p>Tu inscripción al curso ha sido procesada exitosamente.</p>
          <div style="background: #f0f4ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 8px;"><strong>📚 Curso:</strong> ${data.curso_titulo}</p>
            <p style="margin: 0 0 8px;"><strong>🆔 ID Inscripción:</strong> ${data.inscripcion_id}</p>
            <p style="margin: 0;"><strong>📅 Fecha:</strong> ${new Date(data.timestamp).toLocaleDateString('es-ES', { dateStyle: 'long' })}</p>
          </div>
          <p style="color: #888; font-size: 14px;">¡Mucho éxito en tu aprendizaje!</p>
        </div>
        <div style="background: #f5f5f5; padding: 20px 40px; text-align: center; color: #888; font-size: 12px;">
          EduTech Platform — Este es un email automático, no responder.
        </div>
      </div>
    </body>
    </html>
  `;
}

async function guardarNotificacion(pool, datos, estado, intentos) {
  await pool.execute(
    `INSERT INTO notificaciones (tipo, destinatario, asunto, estado, intentos, payload)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estado = VALUES(estado), intentos = VALUES(intentos)`,
    ['email', datos.email_estudiante, `Inscripción: ${datos.curso_titulo}`, estado, intentos, JSON.stringify(datos)]
  );
}

async function procesarMensaje(channel, msg, pool) {
  const datos = JSON.parse(msg.content.toString());
  const intentos = (msg.properties.headers?.['x-retry-count'] || 0) + 1;

  console.log(`[worker-email] Procesando mensaje (intento ${intentos}):`, datos.inscripcion_id);

  try {
    if (DEV_MODE) {
      // Modo desarrollo: simular envío sin SendGrid real
      console.log(`[worker-email][DEV] Email simulado → ${datos.email_estudiante} | Curso: ${datos.curso_titulo}`);
    } else {
      await sgMail.send({
        to: datos.email_estudiante,
        from: process.env.FROM_EMAIL,
        subject: `¡Inscripción confirmada! - ${datos.curso_titulo}`,
        html: buildEmailHTML(datos),
      });
    }

    await guardarNotificacion(pool, datos, 'enviado', intentos);
    channel.ack(msg);
    console.log(`[worker-email] Email enviado a ${datos.email_estudiante}`);
  } catch (err) {
    console.error(`[worker-email] Error al enviar email (intento ${intentos}):`, err.message);
    await guardarNotificacion(pool, datos, intentos >= MAX_INTENTOS ? 'fallido' : 'pendiente', intentos);

    if (intentos >= MAX_INTENTOS) {
      // Enviar a Dead Letter Queue
      channel.nack(msg, false, false);
      console.warn(`[worker-email] Mensaje enviado a DLQ tras ${MAX_INTENTOS} intentos`);
    } else {
      // Reencolar con header de intentos
      channel.nack(msg, false, false);
    }
  }
}

async function startWorker() {
  let connection;
  try {
    const pool = await getPool();
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Dead Letter Queue
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.assertExchange('notificaciones.dlx', 'direct', { durable: true });
    await channel.bindQueue(DLQ_NAME, 'notificaciones.dlx', 'email');

    // Cola principal con DLX configurado
    await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'notificaciones.dlx',
        'x-dead-letter-routing-key': 'email',
        'x-message-ttl': 86400000, // 24h
      },
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');
    channel.prefetch(1);

    console.log('[worker-email] Esperando mensajes en:', QUEUE_NAME);
    channel.consume(QUEUE_NAME, msg => {
      if (msg) procesarMensaje(channel, msg, pool);
    });

    connection.on('error', err => {
      console.error('[worker-email] Conexión RabbitMQ perdida:', err.message);
      setTimeout(startWorker, 5000);
    });
  } catch (err) {
    console.error('[worker-email] Error al iniciar worker:', err.message);
    if (connection) await connection.close().catch(() => {});
    setTimeout(startWorker, 5000);
  }
}

startWorker();
