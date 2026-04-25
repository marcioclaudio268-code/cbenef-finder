import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Database } from "../db.js";

interface GetCbenefBody {
  ncm?: unknown;
  descricao?: unknown;
  cst_icms?: unknown;
  ean?: unknown;
  marca?: unknown;
  [key: string]: unknown;
}

interface PlaceholderResponse {
  status: "placeholder";
  route: "POST /get-cbenef";
  request_id: string;
  received_at: string;
  message: string;
  next_step: string;
  received: {
    ncm: string;
    descricao: string;
    cst_icms: string | null;
    ean: string | null;
    marca: string | null;
  };
  persistence: {
    configured: boolean;
    stored_query_log: boolean;
    reason: string | null;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function registerGetCbenefRoute(app: FastifyInstance, database: Database) {
  app.post(
    "/get-cbenef",
    async (request: FastifyRequest<{ Body: GetCbenefBody }>, reply: FastifyReply) => {
      const requestId = randomUUID();
      const body = request.body;

      if (!isPlainObject(body)) {
        return reply.code(400).send({
          status: "error",
          message: "JSON body is required.",
          request_id: requestId,
        });
      }

      const ncm = readText(body.ncm);
      const descricao = readText(body.descricao);

      if (!ncm || !descricao) {
        return reply.code(400).send({
          status: "error",
          message: "ncm and descricao are required for the Block A placeholder.",
          request_id: requestId,
        });
      }

      const cstIcms = readText(body.cst_icms);
      const ean = readText(body.ean);
      const marca = readText(body.marca);
      const receivedAt = new Date().toISOString();

      const responseBody: PlaceholderResponse = {
        status: "placeholder",
        route: "POST /get-cbenef",
        request_id: requestId,
        received_at: receivedAt,
        message:
          "A logica real do comparador conservador ainda nao foi migrada para esta API oficial.",
        next_step: "Migrar a engine real do get-cbenef no proximo bloco.",
        received: {
          ncm,
          descricao,
          cst_icms: cstIcms,
          ean,
          marca,
        },
        persistence: {
          configured: database.isConfigured,
          stored_query_log: false,
          reason: null,
        },
      };

      const responsePayloadForLog = {
        ...responseBody,
        persistence: {
          ...responseBody.persistence,
          stored_query_log: null,
        },
      };

      const persisted = await database.logQuery({
        id: requestId,
        routeName: "POST /get-cbenef",
        ean,
        description: descricao,
        ncm,
        cstIcms,
        brand: marca,
        suggestedCbenef: null,
        confidenceScore: null,
        confidenceLevel: null,
        matchedBy: "block_a_placeholder",
        responseMode: "placeholder",
        matchedRuleId: null,
        requestPayload: body,
        responsePayload: responsePayloadForLog as Record<string, unknown>,
      });

      responseBody.persistence.stored_query_log = persisted.stored;
      responseBody.persistence.reason = persisted.reason;

      return reply
        .code(200)
        .header("X-Request-Id", requestId)
        .header("X-CBENEF-Stage", "block-a-placeholder")
        .send(responseBody);
    },
  );
}
