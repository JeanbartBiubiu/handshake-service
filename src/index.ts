import pino from "pino";
import {
  LOG_LEVEL,
  PORT,
  HOSTNAME,
  TLS_CA_FILES,
  TLS_KEY_FILE,
  TLS_CERT_FILE,
  TLS_ENABLED,
} from "./var";
import os from "os";

import type { ServerWebSocket } from "bun";

import type { ClientSignal, RawSignal, Room, ServerWebSocketData} from "./types";

const logger = pino({
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { pid: process.pid },
  transport: Bun.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
});

const rooms: Map<string, Room> = new Map();

const server = Bun.serve<ServerWebSocketData>({
  port: PORT,
  hostname: HOSTNAME,
  tls: TLS_ENABLED
    ? {
        cert: Bun.file(TLS_CERT_FILE!),
        key: Bun.file(TLS_KEY_FILE!),
        ca: TLS_CA_FILES?.map((ca) => Bun.file(ca)) ?? [],
      }
    : undefined,
  fetch(req, server) {
    const url = new URL(req.url);
    const roomId = url.searchParams.get("room") || "";

    if (
      server.upgrade(req, {
        data: { roomId, clientId: null },
      })
    ) {
      return;
    }

    return new Response(undefined, { status: 400, statusText: "Bad Request" });
  },
  websocket: {
    open(ws) {
      handleWSOpen(ws);
    },
    message(ws, message) {
      handleWSMessage(ws, message);
    },
    close(ws) {
      handleWSClose(ws);
    },
  },
});

function handleWSOpen(ws: ServerWebSocket<ServerWebSocketData>) {
  const { roomId } = ws.data;
  logger.info({ remoteAddress: ws.remoteAddress, roomId }, "New connection");

  let room: Room | undefined = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      client: ws
    };
    rooms.set(roomId, room);
    logger.info({ roomId }, "Room created");
  } else{
    ws.send(
        JSON.stringify({
          type: "bad request",
          data: "room has exist"
        })
    );
  }

  ws.send(
    JSON.stringify({
      type: "connected",
    })
  );
}

function handleWSMessage(ws: ServerWebSocket<ServerWebSocketData>, message: string | Buffer) {
  try {
    const signal: RawSignal = JSON.parse(message.toString());
    const room: Room | undefined = rooms.get(signal.data.roomId);
    if (!room) {
      logger.warn({ roomId: ws.data.roomId }, "Room not found");
      return;
    }

    switch (signal.type) {
      case "message":
        handleClientMessage(room, signal.data as ClientSignal, ws);
        break;
      default:
        logger.warn({ signal }, "Unknown signal type");
        break;
    }
  } catch (error) {
    logger.error({ error }, "Error processing message");
  }
}

function handleWSClose(ws: ServerWebSocket<ServerWebSocketData>) {
  const room: Room | undefined = rooms.get(ws.data.roomId);
  if (!room) {
    logger.warn({ roomId: ws.data.roomId }, "Room not found");
    return;
  }
  rooms.delete(room.id);
  logger.info("delete room "+ room.id)
}

function handleClientMessage(
  room: Room,
  data: ClientSignal,
  ws?: ServerWebSocket<ServerWebSocketData>
) {
  const targetClientData = room?.client;

  if (targetClientData) {
    if (targetClientData.readyState === WebSocket.OPEN) {
        targetClientData.send(
            JSON.stringify({
              type: "message",
              data: data,
            })
        );
    }
  }
}

const addresses: string[] = [HOSTNAME];

// get all ip addresses
if (HOSTNAME === "0.0.0.0") {
  const interfaces = os.networkInterfaces();
  const ips = Object.values(interfaces).flatMap((iface) => iface?.map((iface) => iface.address));
  addresses.push(...(ips.filter((ip) => ip !== undefined) as string[]));
}

logger.info({ port: server.port, hostname: HOSTNAME, addresses }, "WebSocket server started");

process.on("SIGINT", () => {
  logger.info("Shutting down server...");
  server.stop();
  logger.info("Server closed");
  process.exit(0);
});
