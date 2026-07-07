const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3002;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'notificaciones', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/notificaciones', async (req, res) => {
  try {
    const { destinatario, estado, limit = 50 } = req.query;
    let query = 'SELECT * FROM notificaciones WHERE 1=1';
    const params = [];
    if (destinatario) { query += ' AND destinatario = ?'; params.push(destinatario); }
    if (estado) { query += ' AND estado = ?'; params.push(estado); }
    query += ' ORDER BY fecha_creacion DESC LIMIT ?';
    params.push(Number(limit));
    const [rows] = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notificaciones/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notificaciones WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Iniciar worker de email en el mismo proceso
require('./workers/worker_email');

app.listen(PORT, () => {
  console.log(`[notificaciones] corriendo en http://0.0.0.0:${PORT}`);
});
