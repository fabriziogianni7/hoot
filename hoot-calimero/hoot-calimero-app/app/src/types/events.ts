/**
 * Game event types that can be received from the WebSocket connection
 * These correspond to the events emitted by the Rust backend
 */

export interface GameEvent {
  type:
    | 'MatchCreated'
    | 'MoveMade'
    | 'GameWon'
    | 'GameTied'
    | 'MatchEnded';
  id: string;
  x?: number;
  y?: number;
  player?: string;
  winner?: string;
}

export interface MatchCreatedEvent extends GameEvent {
  type: 'MatchCreated';
  id: string;
}

export interface MoveMadeEvent extends GameEvent {
  type: 'MoveMade';
  id: string;
  x: number;
  y: number;
  player: string;
}

export interface GameWonEvent extends GameEvent {
  type: 'GameWon';
  id: string;
  winner: string;
}

export interface GameTiedEvent extends GameEvent {
  type: 'GameTied';
  id: string;
}

export interface MatchEndedEvent extends GameEvent {
  type: 'MatchEnded';
  id: string;
}

export type AllGameEvents =
  | MatchCreatedEvent
  | MoveMadeEvent
  | GameWonEvent
  | GameTiedEvent
  | MatchEndedEvent;

/**
 * WebSocket message structure
 */
export interface WebSocketMessage {
  type: 'event' | 'error' | 'connected' | 'disconnected';
  data?: AllGameEvents;
  error?: string;
  timestamp?: number;
}