"""
Lambda: obtener_resultado
Recibe evaluacionId via path param → retorna resultado desde MongoDB
"""
import json
import os

from pymongo import MongoClient

def get_mongo_client():
    uri = os.environ.get("MONGO_ATLAS_URI") or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    return MongoClient(uri, serverSelectionTimeoutMS=5000)

def handler(event, context):
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    path_params = event.get("pathParameters") or {}
    evaluacion_id = path_params.get("evaluacionId")

    if not evaluacion_id:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "evaluacionId es requerido en el path"}),
        }

    try:
        client = get_mongo_client()
        db = client[os.environ.get("MONGO_DB", "edutech_evaluaciones")]
        documento = db.evaluaciones.find_one({"_id": evaluacion_id})
        client.close()
    except Exception as e:
        return {
            "statusCode": 503,
            "headers": headers,
            "body": json.dumps({"error": "Error al consultar base de datos", "detail": str(e)}),
        }

    if not documento:
        return {
            "statusCode": 404,
            "headers": headers,
            "body": json.dumps({"error": "Evaluación no encontrada"}),
        }

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps({
            "evaluacionId": documento["_id"],
            "cursoId": documento["cursoId"],
            "estudianteId": documento["estudianteId"],
            "puntaje": documento["puntaje"],
            "aprobado": documento["aprobado"],
            "correctas": documento["correctas"],
            "totalPreguntas": documento["totalPreguntas"],
            "fechaCreacion": str(documento["fechaCreacion"]),
            "estado": documento["estado"],
        }),
    }
