const amqp = require('amqplib');

const EXCHANGE_NAME = 'inscripcion.creada';
const EXCHANGE_TYPE = 'fanout';

/**
 * Publica un evento de inscripción en el exchange fanout de RabbitMQ.
 * La app de cursos llama este módulo al completar una inscripción.
 */
async function publicarEvento(mensaje) {
  let connection;
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

    const payload = Buffer.from(JSON.stringify({
      ...mensaje,
      publishedAt: new Date().toISOString(),
      version: '1.0',
    }));

    channel.publish(EXCHANGE_NAME, '', payload, {
      persistent: true,
      contentType: 'application/json',
    });

    console.log(`[publisher] Evento publicado: ${EXCHANGE_NAME}`, { tipo: mensaje.tipo, inscripcion_id: mensaje.inscripcion_id });
    await channel.close();
  } catch (err) {
    console.error('[publisher] Error al publicar evento:', err.message);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = { publicarEvento };
