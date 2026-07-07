// init-mongo.js — Corre automáticamente al iniciar el contenedor MongoDB
// Crea la colección evaluaciones con validación de schema e índices

db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'edutech_evaluaciones');

db.createCollection('evaluaciones', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['cursoId', 'estudianteId', 'puntaje', 'fechaCreacion'],
      properties: {
        cursoId:        { bsonType: 'string', description: 'ID del curso (UUID)' },
        estudianteId:   { bsonType: 'string', description: 'ID del estudiante (UUID)' },
        respuestas:     { bsonType: 'object', description: 'Mapa pregunta → respuesta' },
        puntaje:        { bsonType: 'int',    minimum: 0, maximum: 100 },
        correctas:      { bsonType: 'int',    minimum: 0 },
        totalPreguntas: { bsonType: 'int',    minimum: 0 },
        aprobado:       { bsonType: 'bool' },
        estado:         { bsonType: 'string', enum: ['completada', 'anulada', 'revision'] },
        fechaCreacion:  { bsonType: 'date' },
      },
    },
  },
  validationLevel: 'moderate',
  validationAction: 'warn',
});

// Índice compuesto para consultas de historial por estudiante
db.evaluaciones.createIndex(
  { estudianteId: 1, fechaCreacion: -1 },
  { name: 'idx_estudiante_fecha', background: true }
);

// Índice para búsquedas por curso
db.evaluaciones.createIndex(
  { cursoId: 1, puntaje: -1 },
  { name: 'idx_curso_puntaje', background: true }
);

// Índice TTL: eliminar evaluaciones anuladas después de 90 días
db.evaluaciones.createIndex(
  { fechaCreacion: 1 },
  { expireAfterSeconds: 7776000, partialFilterExpression: { estado: 'anulada' }, name: 'idx_ttl_anuladas' }
);

print('[init-mongo] Colección evaluaciones creada con índices OK');
