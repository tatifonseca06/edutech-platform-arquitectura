const express = require('express');
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const CACHE_TTL = 300; // 5 minutos

// GET /api/cursos — listar todos los cursos (cache-aside)
router.get('/', async (req, res) => {
  const cacheKey = 'cursos:all';
  try {
    const cached = await req.redis.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }

    const result = await req.db.query(`
      SELECT c.id, c.titulo, c.descripcion, c.instructor, c.precio,
             c.duracion_horas, c.nivel, c.categoria, c.activo, c.created_at,
             COUNT(i.id) AS inscritos
        FROM cursos c
        LEFT JOIN inscripciones i ON i.curso_id = c.id AND i.estado = 'activa'
       WHERE c.activo = true
       GROUP BY c.id
       ORDER BY c.created_at DESC
    `);

    await req.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result.rows));
    res.json({ source: 'db', data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cursos/:id — detalle de curso (cache-aside por ID)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const cacheKey = `cursos:${id}`;
  try {
    const cached = await req.redis.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }

    const result = await req.db.query(`
      SELECT c.*, COUNT(i.id) AS inscritos
        FROM cursos c
        LEFT JOIN inscripciones i ON i.curso_id = c.id AND i.estado = 'activa'
       WHERE c.id = $1
       GROUP BY c.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    await req.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result.rows[0]));
    res.json({ source: 'db', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cursos — crear curso
router.post('/', async (req, res) => {
  const { titulo, descripcion, instructor, precio, duracion_horas, nivel, categoria } = req.body;

  if (!titulo || !instructor) {
    return res.status(400).json({ error: 'titulo e instructor son requeridos' });
  }

  try {
    const result = await req.db.query(`
      INSERT INTO cursos (titulo, descripcion, instructor, precio, duracion_horas, nivel, categoria)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [titulo, descripcion, instructor, precio || 0, duracion_horas || 0, nivel || 'principiante', categoria || 'general']);

    // Invalidar cache de lista
    await req.redis.del('cursos:all');
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cursos/:id/inscribir — inscribir estudiante
router.post('/:id/inscribir', async (req, res) => {
  const { id: curso_id } = req.params;
  const { estudiante_id, nombre_estudiante, email_estudiante } = req.body;

  if (!estudiante_id || !email_estudiante) {
    return res.status(400).json({ error: 'estudiante_id y email_estudiante son requeridos' });
  }

  try {
    // Verificar que el curso existe
    const curso = await req.db.query('SELECT * FROM cursos WHERE id = $1 AND activo = true', [curso_id]);
    if (curso.rows.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado o inactivo' });
    }

    // Verificar inscripción duplicada
    const existente = await req.db.query(
      'SELECT id FROM inscripciones WHERE curso_id = $1 AND estudiante_id = $2 AND estado = $3',
      [curso_id, estudiante_id, 'activa']
    );
    if (existente.rows.length > 0) {
      return res.status(409).json({ error: 'El estudiante ya está inscrito en este curso' });
    }

    // Crear inscripción
    const inscripcion = await req.db.query(`
      INSERT INTO inscripciones (id, curso_id, estudiante_id, nombre_estudiante, email_estudiante)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [uuidv4(), curso_id, estudiante_id, nombre_estudiante, email_estudiante]);

    // Invalidar cache del curso
    await req.redis.del(`cursos:${curso_id}`);
    await req.redis.del('cursos:all');

    // Publicar evento a RabbitMQ
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      const channel = await connection.createChannel();
      await channel.assertExchange('inscripcion.creada', 'fanout', { durable: true });

      const mensaje = {
        tipo: 'inscripcion',
        inscripcion_id: inscripcion.rows[0].id,
        curso_id,
        curso_titulo: curso.rows[0].titulo,
        estudiante_id,
        nombre_estudiante,
        email_estudiante,
        timestamp: new Date().toISOString(),
      };

      channel.publish('inscripcion.creada', '', Buffer.from(JSON.stringify(mensaje)));
      await channel.close();
      await connection.close();
    } catch (mqErr) {
      console.error('[RabbitMQ] Error al publicar evento:', mqErr.message);
      // No falla la inscripción si RabbitMQ no está disponible
    }

    res.status(201).json({
      message: 'Inscripción exitosa',
      data: inscripcion.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cursos/:id/inscripciones — listar inscripciones de un curso
router.get('/:id/inscripciones', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await req.db.query(`
      SELECT i.*, c.titulo AS curso_titulo
        FROM inscripciones i
        JOIN cursos c ON c.id = i.curso_id
       WHERE i.curso_id = $1
       ORDER BY i.fecha_inscripcion DESC
    `, [id]);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
