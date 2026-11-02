import type * as C from './contract';

export class ApiError extends Error {
  constructor(public code: C.ErrorCode, message: string, public details: Record<string, unknown> = {}) {
    super(message); this.name = 'ApiError';
  }
}
export interface ApiClient {
  identity: {
    login(body: C.DevLoginRequest): Promise<C.DevLoginResponse>;
    me(): Promise<C.Member>;
    agree(body: C.LocationConsentRequest): Promise<C.LocationConsent>;
    withdraw(): Promise<void>;
  };
  places: { search(query: string, bias?: C.LatLng): Promise<C.PlaceRef[]>; reverse(point: C.LatLng): Promise<C.PlaceRef> };
  trips: {
    create(body: C.CreateTripRequest): Promise<C.TripIntent>;
    active(): Promise<C.TripIntent | null>;
    get(id: string): Promise<C.TripIntent>;
    route(id: string): Promise<C.TripIntent>;
    cancel(id: string): Promise<C.TripIntent>;
    candidates(id: string): Promise<C.MatchCandidatesResponse>;
  };
  rooms: {
    create(body: C.CreateRoomRequest): Promise<C.RoomDetail>;
    mine(): Promise<C.RoomSummary[]>;
    get(id: string): Promise<C.RoomDetail>;
    join(id: string, body: C.JoinRoomRequest): Promise<C.RoomDetail>;
    leave(id: string): Promise<C.RoomDetail>;
    remove(id: string, memberId: string): Promise<C.RoomDetail>;
    plan(id: string, body: C.UpdatePlanRequest): Promise<C.RoomDetail>;
    confirm(id: string, body: C.ConfirmRequest): Promise<C.RoomDetail>;
    close(id: string): Promise<C.RoomDetail>;
    cancel(id: string): Promise<C.RoomDetail>;
    suggestions(id: string): Promise<C.MeetingPointSuggestion[]>;
  };
  messages: { list(id: string, after?: string, limit?: number): Promise<C.Message[]>; send(id: string, body: C.SendMessageRequest): Promise<C.Message> };
  reports: { create(body: C.CreateReportRequest): Promise<C.Report> };
  admin: { reports(status?: C.ReportStatus): Promise<C.Report[]>; action(id: string, body: C.ModerationActionRequest): Promise<C.Report>; metrics(): Promise<C.AdminMetrics> };
  subscribe(id: string, onEvent: (event: C.RoomEvent) => void): () => void;
}
const tokenKey = `taximate.token.${import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'}`;
export const session = {
  get: () => localStorage.getItem(tokenKey),
  set: (token: string) => localStorage.setItem(tokenKey, token),
  clear: () => localStorage.removeItem(tokenKey),
};
