const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const Redis = require('ioredis');
const client = require('prom-client');
const cursosRouter = require('./routes/cursos');

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Redis client
const redis = new Redis(process.env.REDIS_URL);
redis.on('error', err => console.error('[Redis]', err.message));

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de requests HTTP',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requests HTTP',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

app.use(cors());
app.use(express.json());

// Metrics middleware
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    end({ method: req.method, route, status_code: res.statusCode });
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
  });
  next();
});

// Inject dependencies
app.use((req, _res, next) => {
  req.db = pool;
  req.redis = redis;
  next();
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ok', service: 'cursos-api', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/cursos', cursosRouter);

// Swagger UI docs
app.get('/docs', (req, res) => {
  res.redirect('https://app.swaggerhub.com/apis/edutech/edutech-platform/1.0.0');
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`[cursos-api] corriendo en http://0.0.0.0:${PORT}`);
});

module.exports = app;
