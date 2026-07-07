"""
Lambda: crear_evaluacion
Recibe { cursoId, estudianteId, respuestas } → calcula puntaje → guarda en MongoDB → HTTP 202
"""
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from pymongo import MongoClient

PREGUNTAS_CORRECTAS = {
    "p1": "b",
    "p2": "a",
    "p3": "c",
    "p4": "d",
    "p5": "a",
}

def get_mongo_client():
    uri = os.environ.get("MONGO_ATLAS_URI") or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    return MongoClient(uri, serverSelectionTimeoutMS=5000)

def calcular_puntaje(respuestas: dict) -> dict:
    total = len(PREGUNTAS_CORRECTAS)
    correctas = sum(
        1 for pregunta, respuesta in respuestas.items()
        if PREGUNTAS_CORRECTAS.get(pregunta) == respuesta
    )
    puntaje = round((correctas / total) * 100) if total > 0 else 0
    return {
        "correctas": correctas,
        "total": total,
        "puntaje": puntaje,
        "aprobado": puntaje >= 60,
    }

def handler(event, context):
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Body JSON inválido"}),
        }

    curso_id = body.get("cursoId")
    estudiante_id = body.get("estudianteId")
    respuestas = body.get("respuestas", {})

    if not curso_id or not estudiante_id:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "cursoId y estudianteId son requeridos"}),
        }

    if not isinstance(respuestas, dict) or len(respuestas) == 0:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "respuestas debe ser un objeto no vacío"}),
        }

    resultado = calcular_puntaje(respuestas)
    evaluacion_id = str(uuid.uuid4())
    ahora = datetime.now(timezone.utc)

    documento = {
        "_id": evaluacion_id,
        "cursoId": curso_id,
        "estudianteId": estudiante_id,
        "respuestas": respuestas,
        "puntaje": resultado["puntaje"],
        "correctas": resultado["correctas"],
        "totalPreguntas": resultado["total"],
        "aprobado": resultado["aprobado"],
        "fechaCreacion": ahora,
        "estado": "completada",
    }

    try:
        client = get_mongo_client()
        db = client[os.environ.get("MONGO_DB", "edutech_evaluaciones")]
        db.evaluaciones.insert_one(documento)
        client.close()
    except Exception as e:
        return {
            "statusCode": 503,
            "headers": headers,
            "body": json.dumps({"error": "Error al guardar en base de datos", "detail": str(e)}),
        }

    response_body = {
        "message": "Evaluación procesada exitosamente",
        "evaluacionId": evaluacion_id,
        "puntaje": resultado["puntaje"],
        "aprobado": resultado["aprobado"],
        "correctas": resultado["correctas"],
        "totalPreguntas": resultado["total"],
    }

    return {
        "statusCode": 202,
        "headers": headers,
        "body": json.dumps(response_body, default=str),
    }
