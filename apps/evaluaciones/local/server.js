/**
 * Wrapper Express que simula localmente el comportamiento de las AWS Lambdas.
 * En producción se despliega con AWS SAM (apps/evaluaciones/template.yaml).
 */
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3003;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const MONGO_URI = process.env.MONGO_URI ||
  `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@mongodb:27017/${process.env.MONGO_DB}?authSource=admin`;

const PREGUNTAS_CORRECTAS = { p1: 'b', p2: 'a', p3: 'c', p4: 'd', p5: 'a' };

let mongoClient;
async function getDb() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
  }
  return mongoClient.db(process.env.MONGO_DB || 'edutech_evaluaciones');
}

function calcularPuntaje(respuestas) {
  const total = Object.keys(PREGUNTAS_CORRECTAS).length;
  const correctas = Object.entries(respuestas).filter(
    ([p, r]) => PREGUNTAS_CORRECTAS[p] === r
  ).length;
  const puntaje = total > 0 ? Math.round((correctas / total) * 100) : 0;
  return { correctas, total, puntaje, aprobado: puntaje >= 60 };
}

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ status: 'ok', service: 'evaluaciones-local', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// POST /api/evaluaciones — simula crear_evaluacion Lambda
app.post('/api/evaluaciones', async (req, res) => {
  const { cursoId, estudianteId, respuestas } = req.body;

  if (!cursoId || !estudianteId) {
    return res.status(400).json({ error: 'cursoId y estudianteId son requeridos' });
  }
  if (!respuestas || typeof respuestas !== 'object' || Object.keys(respuestas).length === 0) {
    return res.status(400).json({ error: 'respuestas debe ser un objeto no vacío' });
  }

  const resultado = calcularPuntaje(respuestas);
  const evaluacionId = uuidv4();
  const ahora = new Date();

  const documento = {
    _id: evaluacionId,
    cursoId,
    estudianteId,
    respuestas,
    puntaje: resultado.puntaje,
    correctas: resultado.correctas,
    totalPreguntas: resultado.total,
    aprobado: resultado.aprobado,
    fechaCreacion: ahora,
    estado: 'completada',
  };

  try {
    const db = await getDb();
    await db.collection('evaluaciones').insertOne(documento);
  } catch (err) {
    return res.status(503).json({ error: 'Error al guardar en base de datos', detail: err.message });
  }

  res.status(202).json({
    message: 'Evaluación procesada exitosamente',
    evaluacionId,
    puntaje: resultado.puntaje,
    aprobado: resultado.aprobado,
    correctas: resultado.correctas,
    totalPreguntas: resultado.total,
  });
});

// GET /api/evaluaciones/:evaluacionId — simula obtener_resultado Lambda
app.get('/api/evaluaciones/:evaluacionId', async (req, res) => {
  const { evaluacionId } = req.params;
  try {
    const db = await getDb();
    const doc = await db.collection('evaluaciones').findOne({ _id: evaluacionId });
    if (!doc) return res.status(404).json({ error: 'Evaluación no encontrada' });
    res.json({
      evaluacionId: doc._id,
      cursoId: doc.cursoId,
      estudianteId: doc.estudianteId,
      puntaje: doc.puntaje,
      aprobado: doc.aprobado,
      correctas: doc.correctas,
      totalPreguntas: doc.totalPreguntas,
      fechaCreacion: doc.fechaCreacion,
      estado: doc.estado,
    });
  } catch (err) {
    res.status(503).json({ error: 'Error al consultar base de datos', detail: err.message });
  }
});

// GET /api/evaluaciones — listar evaluaciones por estudiante
app.get('/api/evaluaciones', async (req, res) => {
  const { estudianteId, cursoId, limit = 20 } = req.query;
  const filtro = {};
  if (estudianteId) filtro.estudianteId = estudianteId;
  if (cursoId) filtro.cursoId = cursoId;
  try {
    const db = await getDb();
    const docs = await db.collection('evaluaciones')
      .find(filtro)
      .sort({ fechaCreacion: -1 })
      .limit(Number(limit))
      .toArray();
    res.json({ data: docs });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[evaluaciones-local] corriendo en http://0.0.0.0:${PORT}`);
  console.log('[evaluaciones-local] Simula las Lambdas de AWS para desarrollo local');
});
