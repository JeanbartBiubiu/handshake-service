import type { ServerWebSocket } from "bun";

export type SessionID = string;
export type ClientID = string;

export interface Client {
  clientId: ClientID;
  name: string;
  avatar: string | null;
}
export type TransferClient = Client & {
  createdAt: number;
  resume?: boolean;
};

export interface RawSignal {
  type: string;
  data: any;
}

export interface ClientSignal extends RawSignal {
  sessionId: SessionID;
  clientId: ClientID;
  targetClientId: ClientID;
}

export type ServerWebSocketData = {
  roomId: string;
  clientId: ClientID | null;
};

export interface ClientData {
  session: ServerWebSocket<ServerWebSocketData>;
  lastPongTime: number;
  disconnectTimeout: Timer | null;
}

export interface Room {
  id: string;
  client: ServerWebSocket<ServerWebSocketData>;
}
