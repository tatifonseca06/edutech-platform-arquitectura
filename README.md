# EduTech Platform — Proyecto Final Arquitectura de Software

**Facultad de Ingeniería y Ciencias Aplicadas · ISWZ2202**

---

## Índice

1. [Visión General](#visión-general)
2. [Ecosistema de Aplicaciones](#ecosistema-de-aplicaciones)
3. [Arquitectura — Diagramas C4](#arquitectura--diagramas-c4)
4. [Patrones de Diseño Aplicados](#patrones-de-diseño-aplicados)
5. [Infraestructura y Despliegue](#infraestructura-y-despliegue)
6. [Análisis de Atributos de Calidad](#análisis-de-atributos-de-calidad)
7. [API Gateway — Kong](#api-gateway--kong)
8. [Documentación Swagger](#documentación-swagger)
9. [CI/CD](#cicd)
10. [Monitoreo](#monitoreo)
11. [Instrucciones de Despliegue](#instrucciones-de-despliegue)

---

## Visión General

**EduTech Platform** es una plataforma de cursos en línea construida con una arquitectura de **microservicios**, compuesta por tres aplicaciones independientes que se comunican a través de un **API Gateway centralizado (Kong)** y un **gestor de colas (RabbitMQ)**.

```
                        ┌──────────────────────────────────────────────────────┐
                        │              INTERNET / CLIENTES                     │
                        │   Browser · Mobile App · Postman · Swagger UI        │
                        └────────────────────────┬─────────────────────────────┘
                                                 │ HTTP / REST
                        ┌────────────────────────▼─────────────────────────────┐
                        │          API GATEWAY — Kong (puerto 8080)            │
                        │   Rate Limiting · CORS · JWT · Prometheus plugin     │
                        └──────┬──────────────────┬──────────────────┬─────────┘
                               │                  │                  │
               ┌───────────────▼──┐  ┌─────────────▼───────┐  ┌────▼───────────────┐
               │   App 1: CURSOS  │  │ App 2: EVALUACIONES │  │ App 3: NOTIFICACIONES│
               │  Node.js/Express │  │ Node.js:3003 (local)│  │   Node.js Workers   │
               │  Next.js Frontend│  │ AWS Lambda (prod)   │  │   RabbitMQ consumer │
               └──────┬───────────┘  └────────┬────────────┘  └────────┬────────────┘
                      │                        │                         │
              ┌───────▼────┐  ┌─────┐  ┌──────▼────┐          ┌────────▼────┐
              │ PostgreSQL │  │Redis│  │  MongoDB  │  RabbitMQ │    MySQL    │
              │  (Docker)  │◄─┤Cache│  │  (Docker) │◄──────────┤   (Docker)  │
              └────────────┘  └─────┘  └───────────┘  fanout  └─────────────┘
```

---

## Ecosistema de Aplicaciones

### App 1 — Microservicio de Cursos (Node.js + Next.js)
- **Backend:** Express.js REST API en puerto 3001
- **Frontend:** Next.js 14 App Router en puerto 3000
- **Base de datos:** PostgreSQL 16 (Docker) — tablas `cursos`, `usuarios`, `inscripciones`
- **Caché:** Redis 7 (cache-aside pattern, TTL 5 min)
- **Patrón:** API REST + Cache-Aside + Publisher de eventos

**Endpoints:**
| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/cursos` | Listar cursos (con cache) |
| GET | `/api/cursos/:id` | Detalle del curso (con cache) |
| POST | `/api/cursos` | Crear curso |
| POST | `/api/cursos/:id/inscribir` | Inscribir estudiante → publica evento RabbitMQ |
| GET | `/api/cursos/:id/inscripciones` | Listar inscripciones |

### App 2 — Evaluaciones Serverless (AWS Lambda + Python)
- **Local (Docker):** `apps/evaluaciones/local/` — Express.js que simula las Lambdas, puerto 3003
- **Producción:** AWS Lambda Python 3.12 + AWS SAM (`template.yaml`)
- **Base de datos:** MongoDB 7 (Docker para dev, Atlas para prod)
- **Patrón:** Serverless / FaaS — escala automáticamente con la demanda

> La app corre en Docker localmente con `app-evaluaciones:3003` y se despliega como Lambda real con `sam deploy` para producción.

**Endpoints (expuestos por Kong `/api/evaluaciones`):**
| Método | Path | Descripción |
|--------|------|-------------|
| `POST` | `/api/evaluaciones` | Recibe respuestas, calcula puntaje, persiste en MongoDB → HTTP 202 |
| `GET` | `/api/evaluaciones/:id` | Retorna resultado desde MongoDB |
| `GET` | `/api/evaluaciones` | Lista evaluaciones (filtrable por estudianteId, cursoId) |

### App 3 — Notificaciones (RabbitMQ + Workers)
- **Workers:** Node.js consumidor de RabbitMQ
- **Message Broker:** RabbitMQ 3.12 (fanout exchange + DLQ)
- **Base de datos:** MySQL 8 (Docker) — historial de notificaciones
- **Email:** SendGrid API
- **Patrón:** Event-Driven + Consumer Worker + Dead Letter Queue

**Flujo de mensaje:**
```
App Cursos → [Exchange: inscripcion.creada] → [Queue: notificaciones.email] → Worker Email → SendGrid
                                                                    ↓ (falla 3x)
                                                             [DLQ: notificaciones.email.dlq]
```

---

## Arquitectura — Diagramas C4

### Nivel 1 — Contexto del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                      EduTech Platform                           │
│                                                                 │
│  ┌──────────┐    usa     ┌──────────────────────────────────┐   │
│  │Estudiante│───────────►│         EduTech Platform         │   │
│  │(usuario) │            │  Plataforma de cursos en línea   │   │
│  └──────────┘            └─────────────────┬────────────────┘   │
│                                            │                    │
│  ┌──────────┐    admin   │     ┌───────────▼────────────┐       │
│  │Instructor│───────────►│     │  Sistema externo:      │       │
│  └──────────┘            │     │  SendGrid (emails)     │       │
│                          │     │  AWS (Lambdas)         │       │
│                          │     └────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Nivel 2 — Contenedores

```
┌──────────────────────────────────────────────────────────────────────┐
│                          EduTech Platform                            │
│                                                                      │
│  ┌─────────────┐   HTTPS    ┌──────────────────────────────────┐    │
│  │  Estudiante │───────────►│    API Gateway (Kong)            │    │
│  └─────────────┘            │    puerto 8080                   │    │
│                             └───────┬─────────────┬────────────┘    │
│                                     │             │                  │
│                          ┌──────────▼──┐   ┌──────▼───────────┐     │
│                          │  Cursos API │   │   Notificaciones │     │
│                          │  Node.js    │   │   Node.js        │     │
│                          │  :3001      │   │   :3002          │     │
│                          └──┬──────┬───┘   └──────┬───────────┘     │
│                             │      │              │                  │
│                    ┌────────▼┐ ┌───▼────┐  ┌─────▼──────┐          │
│                    │Postgres │ │ Redis  │  │  MySQL     │          │
│                    │:5432    │ │ :6379  │  │  :3306     │          │
│                    └─────────┘ └────────┘  └────────────┘          │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    RabbitMQ :5672                             │  │
│  │   Exchange: inscripcion.creada (fanout)                       │  │
│  │   Queue: notificaciones.email → Worker → SendGrid             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────┐                             │
│  │      AWS Lambda (App 2)            │                             │
│  │  crear_evaluacion / obtener_result │                             │
│  │          ↕ MongoDB Atlas           │                             │
│  └────────────────────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Nivel 3 — Componentes (App 1: Cursos)

```
┌─────────────────────────── App 1: Cursos ────────────────────────────┐
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    Express.js API                             │   │
│  │                                                               │   │
│  │  ┌──────────────────┐    ┌────────────────────────────────┐  │   │
│  │  │  Router: /cursos │───►│  Cache Middleware (Redis)      │  │   │
│  │  │  GET / POST      │    │  cache-aside, TTL 5 min        │  │   │
│  │  └──────────────────┘    └────────────────┬───────────────┘  │   │
│  │                                           │ miss             │   │
│  │  ┌──────────────────┐    ┌────────────────▼───────────────┐  │   │
│  │  │  /inscribir POST │───►│  PostgreSQL (pg-pool)          │  │   │
│  │  │                  │    │  Connection pool max:10         │  │   │
│  │  └────────┬─────────┘    └────────────────────────────────┘  │   │
│  │           │                                                   │   │
│  │  ┌────────▼─────────────────────────────────────────────┐    │   │
│  │  │  RabbitMQ Publisher                                  │    │   │
│  │  │  Exchange: inscripcion.creada (fanout, durable)      │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    Next.js Frontend                           │   │
│  │  /cursos → Server Component → fetch(API interna)             │   │
│  │  /cursos/[id] → Client Component → formulario inscripción    │   │
│  └───────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

> **IcePanel C4:** Importar `docs/c4-icepanel-export.json` en https://icepanel.io para la versión interactiva.

---

## Patrones de Diseño Aplicados

| Patrón | Dónde | Justificación |
|--------|-------|---------------|
| **API Gateway** | Kong | Punto único de entrada, desacopla clientes de servicios internos |
| **Cache-Aside** | Redis en App 1 | Reduce carga sobre PostgreSQL en lecturas frecuentes |
| **Publish/Subscribe** | RabbitMQ fanout | Desacopla inscripción de notificación; permite múltiples consumers |
| **Dead Letter Queue** | RabbitMQ DLQ | Reintentos automáticos, mensajes fallidos no se pierden |
| **Serverless/FaaS** | AWS Lambda | Escalado automático por evento, sin infraestructura fija para evaluaciones |
| **Strangler Fig** | Separación DB por app | Cada servicio tiene su propia base de datos (PostgreSQL / MongoDB / MySQL) |
| **Health Check** | `/health` en cada app | Permite a Kong y Docker detectar fallas y desviar tráfico |
| **Circuit Breaker** | Kong + timeouts | Kong corta el circuito si un upstream no responde |
| **Multi-stage Build** | Dockerfiles | Imágenes de producción < 150 MB, sin herramientas de build |

---

## Infraestructura y Despliegue

### Diagrama de Infraestructura Docker

```
Host (Linux/Mac)
│
├── red: edutech-net ─────────────────────────────────────────────┐
│   │                                                             │
│   ├── kong:8080          API Gateway (DB-less mode)             │
│   ├── nginx:80           Proxy reverso → frontend              │
│   ├── app-cursos:3001    Express.js API                        │
│   ├── app-cursos-frontend:3000  Next.js                        │
│   ├── app-notificaciones:3002  Workers + API                   │
│   ├── postgres:5432      PostgreSQL 16 Alpine                  │
│   ├── redis:6379         Redis 7 Alpine (maxmem 256MB LRU)     │
│   ├── rabbitmq:5672      RabbitMQ 3.12 + Management UI:15672   │
│   ├── mongodb:27017      MongoDB 7                             │
│   ├── mysql:3306         MySQL 8.0                             │
│   └── prometheus:9090    Métricas                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
│
├── red: monitoring-net ──────────────────────────────────────────┐
│   ├── prometheus:9090                                           │
│   └── grafana:3003       Dashboards                            │
└─────────────────────────────────────────────────────────────────┘

Volúmenes persistentes:
  postgres-data, redis-data, rabbitmq-data,
  mongo-data, mysql-data, prometheus-data, grafana-data
```

### Capas de Datos

| Capa | Tecnología | Docker Image | Propósito |
|------|-----------|--------------|-----------|
| Relacional transaccional | PostgreSQL 16 | `postgres:16-alpine` | Cursos, usuarios, inscripciones |
| Caché distribuida | Redis 7 | `redis:7-alpine` | Cache-aside con LRU eviction |
| Documental | MongoDB 7 | `mongo:7-jammy` | Resultados de evaluaciones (schema flexible) |
| Relacional histórico | MySQL 8 | `mysql:8.0` | Log de notificaciones enviadas |

---

## Análisis de Atributos de Calidad

### Caché
- **Estrategia:** Cache-Aside con Redis (read-through manual)
- **TTL:** 5 minutos para listas, 5 minutos para detalle individual
- **Invalidación:** Activa al crear/modificar recursos (delete por key)
- **Política de eviction:** `allkeys-lru` con límite de 256 MB
- **Hit rate esperado:** 80–90% en lecturas de catálogo (datos estáticos frecuentes)

### Balanceo
- **Kong** actúa como load balancer L7 para los microservicios
- Configurar múltiples upstreams en kong.yml para escalar horizontalmente:
  ```yaml
  upstreams:
    - name: cursos-upstream
      targets:
        - target: app-cursos-1:3001
        - target: app-cursos-2:3001
  ```
- **PostgreSQL:** connection pool con pg-pool (max 10 conexiones por instancia)
- **AWS Lambda:** balanceo automático por AWS (sin configuración)

### Indexación

**PostgreSQL:**
```sql
-- Búsqueda por categoría y nivel (queries más frecuentes del catálogo)
CREATE INDEX idx_cursos_categoria ON cursos(categoria);
CREATE INDEX idx_cursos_nivel     ON cursos(nivel);
-- Inscripciones por curso y por estudiante
CREATE INDEX idx_inscripciones_curso ON inscripciones(curso_id);
CREATE INDEX idx_inscripciones_est   ON inscripciones(estudiante_id);
```

**MongoDB:**
```js
// Historial de evaluaciones (query más común: último resultado por estudiante)
{ estudianteId: 1, fechaCreacion: -1 }  // índice compuesto
// Ranking por curso
{ cursoId: 1, puntaje: -1 }
// TTL para limpieza automática de evaluaciones anuladas (90 días)
{ fechaCreacion: 1 } con expireAfterSeconds: 7776000
```

**MySQL:**
```sql
-- Notificaciones por usuario, tipo y estado (query más común del worker)
INDEX idx_notif_user_tipo_estado ON notificaciones(destinatario(100), tipo, estado)
```

### Redundancia
- **Aplicaciones:** Stateless → escalan horizontalmente (N réplicas)
- **RabbitMQ:** mensajes persistentes (`durable: true`, `persistent: true`) → sobreviven reinicios
- **Dead Letter Queue:** mensajes fallidos no se pierden, quedan en DLQ para reprocesar
- **PostgreSQL:** backups via volumen Docker; en producción usar RDS Multi-AZ
- **Redis:** `save 60 1` → snapshot periódico a disco; en producción usar Redis Cluster

### Disponibilidad
- **Health checks** en todos los servicios Docker (con reintentos y períodos de gracia)
- **Kong** descarta upstreams unhealthy automáticamente
- **Worker RabbitMQ** se reconecta automáticamente con backoff (5 s) si pierde conexión
- **Target SLA:** 99.9% (3 nines) — tolera ~8.7 horas de downtime/año
- **Estrategia de degradación:** si Redis cae, las consultas van directo a PostgreSQL (fallback transparente)

### Concurrencia
- **Express.js:** event loop no bloqueante; async/await en todas las operaciones I/O
- **PostgreSQL Pool:** máximo 10 conexiones por instancia; las requests en exceso hacen cola
- **RabbitMQ:** `channel.prefetch(1)` — el worker procesa un mensaje a la vez (garantía de orden)
- **Redis:** single-threaded + pipelining → atomicidad en operaciones de caché
- **AWS Lambda:** concurrencia automática (hasta 1000 invocaciones paralelas en us-east-1)

### Latencia

| Operación | Latencia esperada (p50) | p99 |
|-----------|------------------------|-----|
| GET /api/cursos (cache hit) | < 5 ms | < 20 ms |
| GET /api/cursos (cache miss, PostgreSQL) | 20–50 ms | 150 ms |
| POST /api/cursos/:id/inscribir | 50–100 ms | 300 ms |
| Lambda crear_evaluacion (cold start) | 800–1500 ms | 3 s |
| Lambda crear_evaluacion (warm) | 50–150 ms | 500 ms |
| Email vía SendGrid | 200–500 ms (async) | 2 s |

**Estrategias de reducción de latencia:**
- Cache Redis para lecturas frecuentes
- Lambdas en `Provisioned Concurrency` para eliminar cold starts en prod
- Kong con `upstream keepalive` para reutilizar conexiones TCP
- Next.js Server Components con `cache: 'no-store'` solo donde sea necesario

### Costo y Proyección

| Componente | Dev (Docker local) | Producción (1000 usuarios/día) | Proyección 10K usuarios/día |
|---|---|---|---|
| Infraestructura base | $0 | EC2 t3.medium: ~$35/mes | EC2 t3.xlarge x2: ~$140/mes |
| PostgreSQL | $0 (Docker) | RDS db.t3.micro: ~$25/mes | RDS db.t3.medium: ~$80/mes |
| Redis | $0 (Docker) | ElastiCache cache.t3.micro: ~$15/mes | ElastiCache cache.t3.medium: ~$50/mes |
| MongoDB | $0 (Docker) | MongoDB Atlas M10: ~$57/mes | Atlas M30: ~$190/mes |
| MySQL | $0 (Docker) | RDS MySQL db.t3.micro: ~$25/mes | RDS MySQL db.t3.medium: ~$80/mes |
| AWS Lambda | $0 | ~$2/mes (1M invocaciones) | ~$20/mes (10M invocaciones) |
| **Total estimado** | **$0** | **~$160/mes** | **~$560/mes** |

**Modelo de escalado:** Las aplicaciones Node.js son stateless → el costo crece linealmente con las réplicas. El componente de mayor costo es la base de datos relacional (RDS); usar read replicas si el 80% del tráfico son lecturas.

### Performance y Escalabilidad

**Estrategias implementadas:**
1. **Horizontal scaling:** Apps stateless → K8s HPA o ECS auto-scaling
2. **Database connection pooling:** pg-pool evita conexiones por request
3. **Async processing:** Inscripción retorna 201 inmediatamente; el email se envía de forma asíncrona via RabbitMQ
4. **Multi-stage Docker builds:** Imágenes < 150 MB → deploy más rápido
5. **Next.js Server Components:** HTML renderizado en servidor → menor JS en cliente

**Cuellos de botella identificados:**
- PostgreSQL es el componente más crítico para App 1 → mitigar con read replicas y Redis
- Lambda cold start en App 2 → Provisioned Concurrency para endpoints críticos
- SendGrid rate limits → implementar cola de prioridad en RabbitMQ para picos

---

## API Gateway — Kong

Kong actúa como único punto de entrada (`localhost:8080`) con las siguientes capacidades:

| Plugin | Configuración | Propósito |
|--------|--------------|-----------|
| `rate-limiting` | 100 req/min por IP | Protección contra abuso |
| `cors` | origins: * | Permite requests desde el frontend |
| `prometheus` | métricas por ruta | Observabilidad en Grafana |
| Rutas | `/api/cursos`, `/api/notificaciones` | Routing a microservicios internos |

**Admin API:** `http://localhost:8001` — gestión en caliente de plugins y rutas.

---

## Documentación Swagger

La especificación OpenAPI 3.0 completa se encuentra en `docs/openapi.yaml`.

**Para visualizarla localmente:**
```bash
# Opción 1: Docker
docker run -p 8085:8080 -e SWAGGER_JSON=/spec/openapi.yaml \
  -v $(pwd)/docs:/spec swaggerapi/swagger-ui

# Opción 2: SwaggerHub
# Subir docs/openapi.yaml a https://app.swaggerhub.com/
```

**Endpoints documentados:** 10 endpoints con schemas completos de request/response, códigos HTTP y ejemplos.

---

## CI/CD

Pipeline GitHub Actions (`.github/workflows/deploy.yml`) con 4 etapas:

```
push → main
    │
    ├─ [1] test       → npm test + pytest
    ├─ [2] build-push → Docker build + push a Docker Hub
    ├─ [3] deploy     → SSH → docker compose pull && up -d
    └─ [4] notify     → Resumen en GitHub Actions summary
```

**Secrets requeridos en GitHub:**
- `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`

---

## Monitoreo

**Prometheus** (`:9090`) hace scraping de:
- `/metrics` de cada app Node.js (prom-client)
- Kong métricas nativas
- RabbitMQ Management Plugin

**Grafana** (`:3003`, admin/admin123) incluye dashboard pre-configurado con:
- Requests/seg por servicio
- Latencia p99 en tiempo real
- Errores 5xx
- Uso de CPU y memoria
- Uptime de servicios

---

## Instrucciones de Despliegue

### Requisitos
- Docker Desktop 4.x
- Docker Compose v2
- AWS SAM CLI (solo para deploy de Lambdas en producción)

### Levantar todo con Docker Compose

```bash
# 1. Clonar el repositorio
git clone https://github.com/tatifonseca06/edutech-platform-arquitectura
cd edutech-platform-arquitectura

# 2. Copiar variables de entorno
cp .env.example .env
# Para demo funciona con los valores por defecto.
# Editar SENDGRID_API_KEY solo si se quiere envío real de emails.

# 3. Levantar toda la infraestructura (10 servicios + monitoreo)
docker compose up -d

# 4. Esperar que todos los servicios estén healthy (~60 segundos)
docker compose ps

# 5. Verificar los 3 microservicios vía API Gateway
curl http://localhost:8080/health/cursos
curl http://localhost:8080/health/evaluaciones
curl http://localhost:8080/health/notificaciones
```

### URLs de acceso

| Servicio | URL | Descripción |
|---|---|---|
| Frontend | http://localhost:3000 | Catálogo de cursos e inscripciones |
| API Gateway | http://localhost:8080 | Punto único de entrada REST |
| Swagger UI | http://localhost:8085 | Documentación interactiva de la API |
| Grafana | http://localhost:3003 | Dashboards de monitoreo (admin/admin123) |
| RabbitMQ UI | http://localhost:15672 | Gestión de colas y mensajes |
| Prometheus | http://localhost:9090 | Métricas raw |

### Deploy de Lambdas a AWS

```bash
cd apps/evaluaciones

# Instalar dependencias en la capa
mkdir -p layers/python
pip install pymongo -t layers/python/

# Build y deploy
sam build
sam deploy --guided
# Seguir el wizard: stack name, región, confirmar cambios
```

### Verificar el flujo completo

```bash
# 1. Crear un curso
curl -X POST http://localhost:8080/api/cursos \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Test Curso","instructor":"Prof. Test","precio":0}'

# 2. Listar cursos (verifica cache Redis)
curl http://localhost:8080/api/cursos

# 3. Inscribir estudiante (dispara evento RabbitMQ → email)
curl -X POST http://localhost:8080/api/cursos/<ID>/inscribir \
  -H "Content-Type: application/json" \
  -d '{"estudiante_id":"<UUID>","nombre_estudiante":"Ana","email_estudiante":"ana@test.com"}'

# 4. Crear evaluación (Lambda)
curl -X POST <LAMBDA_URL>/evaluaciones \
  -H "Content-Type: application/json" \
  -d '{"cursoId":"<ID>","estudianteId":"<UUID>","respuestas":{"p1":"b","p2":"a","p3":"c","p4":"d","p5":"a"}}'

# 5. Ver historial de notificaciones
curl http://localhost:8080/api/notificaciones
```

---

## Estructura del Proyecto

```
edutech-platform/
├── docker-compose.yml          # Infraestructura completa
├── kong.yml                    # API Gateway config (DB-less)
├── .env.example                # Variables de entorno (plantilla)
├── nginx/nginx.conf            # Proxy reverso
│
├── apps/
│   ├── cursos/
│   │   ├── api/                # Express.js REST API
│   │   │   ├── server.js
│   │   │   ├── routes/cursos.js
│   │   │   └── Dockerfile      # Multi-stage build
│   │   ├── frontend/           # Next.js 14
│   │   │   ├── app/
│   │   │   │   ├── cursos/page.tsx       # Lista de cursos (SSR)
│   │   │   │   └── cursos/[id]/page.tsx  # Detalle + inscripción
│   │   │   └── Dockerfile
│   │   └── db/init.sql         # Schema PostgreSQL + índices + seed
│   │
│   ├── evaluaciones/
│   │   ├── lambdas/
│   │   │   ├── crear_evaluacion.py   # Lambda producción (AWS)
│   │   │   └── obtener_resultado.py  # Lambda producción (AWS)
│   │   ├── local/                    # Wrapper Docker para desarrollo
│   │   │   ├── server.js             # Express que simula las Lambdas
│   │   │   ├── package.json
│   │   │   └── Dockerfile
│   │   ├── template.yaml             # AWS SAM (deploy producción)
│   │   └── db/init-mongo.js          # Índices MongoDB
│   │
│   └── notificaciones/
│       ├── src/
│       │   ├── publisher/publicar_evento.js
│       │   ├── workers/worker_email.js   # Consumer + DLQ + retry
│       │   └── index.js                  # Express + workers
│       ├── db/schema.sql                 # Schema MySQL + índices
│       └── Dockerfile
│
├── docs/
│   └── openapi.yaml            # OpenAPI 3.0 (10 endpoints)
│
├── monitoring/
│   ├── prometheus.yml          # Scrape configs
│   └── grafana/provisioning/   # Datasource + dashboard JSON
│
└── .github/
    └── workflows/deploy.yml    # CI/CD: test → build → push → deploy
```
