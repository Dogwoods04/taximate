// Siheung Taxi-Mate API contract (MVP v1).
// Mirror of docs/api-contract.md — owned by the lead. Do not edit in feature work;
// request contract changes instead.

export type UUID = string;
export type ISODateTime = string;

// ---------- shared ----------
export interface LatLng { lat: number; lng: number }
export type PlaceKind = 'GPS' | 'MAP_PICK' | 'SEARCH' | 'BUS_STOP' | 'STATION_EXIT' | 'LANDMARK';
export interface PlaceRef {
  name?: string | null;
  address?: string | null;
  location: LatLng;
  kind: PlaceKind;
  providerPlaceId?: string | null;
}
export type MeetingPointKind = 'BUS_STOP' | 'STATION_EXIT' | 'LANDMARK' | 'CUSTOM';
export interface MeetingPoint {
  id?: string | null;
  name: string;
  kind: MeetingPointKind;
  location: LatLng;
  address?: string | null;
}
export type ProximityTier = 'NEAR' | 'EXTENDED';

export type ErrorCode =
  | 'KAKAO_AUTH_FAILED' | 'NICKNAME_TAKEN'
  | 'VALIDATION_FAILED' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'MEMBER_RESTRICTED' | 'DEV_LOGIN_RESTRICTED'
  | 'LOCATION_CONSENT_REQUIRED' | 'ACTIVE_TRIP_EXISTS' | 'TRIP_NOT_SEARCHABLE' | 'ROUTE_UNAVAILABLE'
  | 'ROUTE_EXPIRED' | 'ROOM_NOT_JOINABLE' | 'ROOM_FULL' | 'ROOM_READ_ONLY' | 'ALREADY_IN_ROOM'
  | 'TERMS_VERSION_MISMATCH' | 'MEETING_POINT_REQUIRED' | 'LOCK_TIMEOUT' | 'EXTERNAL_API_ERROR'
  | 'GENDER_REQUIRED' | 'GENDER_RESTRICTED' | 'GENDER_SOURCE_LOCKED' | 'INTERNAL_ERROR';
export interface ErrorResponse { code: ErrorCode; message: string; details: Record<string, unknown> }

// ---------- status names ----------
export type TripStatus = 'DRAFT' | 'SEARCHING' | 'MATCHED' | 'NO_MATCH' | 'CANCELLED' | 'EXPIRED';
export type RoomStatus = 'OPEN' | 'COORDINATING' | 'CONFIRMED' | 'CLOSED' | 'CANCELLED' | 'EXPIRED';
export type ParticipantRole = 'HOST' | 'MEMBER';
export type ParticipantStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';
export type MemberStatus = 'ACTIVE' | 'RESTRICTED' | 'WITHDRAWN';
export type MemberRole = 'USER' | 'ADMIN';
export type MessageType = 'TEXT' | 'SYSTEM';
export type ReportTargetType = 'ROOM' | 'MESSAGE' | 'MEMBER';
export type ReportReason = 'SPAM' | 'ABUSE' | 'NO_SHOW' | 'FRAUD' | 'PRIVACY' | 'OTHER';
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
export type ModerationAction = 'HIDE_ROOM' | 'HIDE_MESSAGE' | 'RESTRICT_MEMBER' | 'DISMISS';
export type FarePolicy = 'EQUAL_SPLIT' | 'DISTANCE_PRORATED' | 'DISCUSS';

export const ROOM_JOINABLE: RoomStatus[] = ['OPEN', 'COORDINATING'];
export const ROOM_READ_ONLY: RoomStatus[] = ['CONFIRMED', 'CLOSED', 'CANCELLED', 'EXPIRED'];

// ---------- identity ----------
/** devLoginPrefix: when set, nickname login only accepts nicknames starting with it (demo accounts); admin names excepted. */
export interface AuthOptions { devLogin: boolean; kakao: boolean; devLoginPrefix: string | null }
export interface KakaoLoginRequest { code: string; redirectUri: string }
export interface KakaoLoginResponse extends DevLoginResponse { isNew: boolean; suggestedNickname: string }
export interface DevLoginRequest { nickname: string }
export interface DevLoginResponse { token: string; member: Member }
export interface LocationConsent { id: UUID; policyVersion: string; agreedAt: ISODateTime }
/** External services the app sends data to (step 4 of onboarding). */
export type ServiceItem = 'KAKAO' | 'TMAP';
export const REQUIRED_SERVICE_ITEMS: ServiceItem[] = ['KAKAO', 'TMAP'];
export interface ServicesConsent { id: UUID; policyVersion: string; items: ServiceItem[]; agreedAt: ISODateTime }
export interface ServicesConsentRequest { policyVersion: string; items: ServiceItem[] }
export type Gender = 'MALE' | 'FEMALE' | 'UNDISCLOSED';
export type GenderSource = 'SELF' | 'KAKAO';
export interface Member {
  authProvider: 'DEV' | 'KAKAO';
  gender: Gender | null;
  genderSource: GenderSource | null;
  id: UUID;
  nickname: string;
  role: MemberRole;
  status: MemberStatus;
  locationConsent: LocationConsent | null;
  servicesConsent: ServicesConsent | null;
  /** Confirmed "만 14세 이상" at signup (POST /api/me/age-confirmation). Onboarding asks until true. */
  ageConfirmed: boolean;
}
export interface LocationConsentRequest { policyVersion: string }

// ---------- trip ----------
export interface CreateTripRequest {
  origin: PlaceRef;
  destination: PlaceRef;
  desiredDepartureAt: ISODateTime;
  maxWaitMinutes: number;   // 0–60
  maxDetourMinutes: number; // 0–30
  passengerCount: number;   // 1–3
}
/** GET /api/routes/walk — pedestrian route (TMAP) or straight-line estimate. Never stored. */
export interface WalkRoute {
  source: 'TMAP' | 'ESTIMATE';
  distanceMeters: number;
  durationSeconds: number;
  path: LatLng[];
}
export interface RouteSnapshot {
  id: UUID;
  provider: 'KAKAO' | 'MOCK';
  distanceMeters: number;
  durationSeconds: number;
  path: LatLng[];
  taxiFareWon: number | null; // whole-route taxi fare (KRW); null if provider gave none
  calculatedAt: ISODateTime;
  expiresAt: ISODateTime;
}
export interface TripIntent {
  id: UUID;
  status: TripStatus;
  origin: PlaceRef;
  destination: PlaceRef;
  desiredDepartureAt: ISODateTime;
  maxWaitMinutes: number;
  maxDetourMinutes: number;
  passengerCount: number;
  route: RouteSnapshot | null;
  routeError: 'ROUTE_UNAVAILABLE' | null;
  expiresAt: ISODateTime;
  createdAt: ISODateTime;
}

// ---------- matching ----------
export interface MatchPolicy { priorityRadiusMeters: number; maxRadiusMeters: number }
export interface MatchCandidate {
  roomId: UUID;
  tier: ProximityTier;
  originDistanceMeters: number;
  destinationDistanceMeters: number;
  departureDiffMinutes: number;
  overlapRatio: number;
  estimatedDetourMinutes: number;
  seatsLeft: number;
  score: number;
  reasons: string[];
  room: RoomSummary;
  routePreview: LatLng[];
}
export interface MatchCandidatesResponse {
  tripId: UUID;
  generatedAt: ISODateTime;
  policy: MatchPolicy;
  candidates: MatchCandidate[];
  similarSearchingCount: number;
  /** Same origin/destination area, but departing outside my time window (nearest time first, max 20). */
  otherTimeCandidates: MatchCandidate[];
}
export interface MeetingPointSuggestion {
  point: MeetingPoint;
  tier: ProximityTier;
  maxWalkMeters: number;
  walkMinutesMax: number | null;
  walkSource: 'WALKING_API' | 'ESTIMATE';
}

// ---------- ride-room ----------
export interface RoomTerms { farePolicy: FarePolicy; luggageAllowed: boolean; note?: string | null }
export interface CreateRoomRequest {
  sameGenderOnly?: boolean;
  sourceTripId: UUID;
  capacity: number; // 2–4 persons incl. host
  terms: RoomTerms;
  departureAt?: ISODateTime;
}
export interface JoinRoomRequest { tripId: UUID }
export interface UpdatePlanRequest { meetingPoint: MeetingPoint; departureAt: ISODateTime; terms: RoomTerms }
/** Host only, JOINABLE and non-hidden room; route failure rolls back the change. */
export interface UpdateDestinationRequest { destination: PlaceRef }
export interface ConfirmRequest { termsVersion: number }
export interface RoomSummary {
  sameGenderOnly: boolean;
  id: UUID;
  status: RoomStatus;
  hostNickname: string;
  approxOrigin: LatLng;
  approxDestination: LatLng;
  originLabel: string;
  destinationLabel: string;
  departureAt: ISODateTime;
  departureWindowEnd: ISODateTime;
  capacity: number;
  seatsLeft: number;
  participantCount: number;
  terms: RoomTerms;
  meetingPoint: MeetingPoint | null;
  estimatedTaxiFareWon: number | null; // host route whole fare; per person = this / participantCount
  originName: string | null;      // public place/building name the host picked by search; null for GPS/map pick (use originLabel)
  destinationName: string | null; // same for the destination
  routeDistanceMeters: number | null;  // host route length (m); null if the host trip has no route
  routeDurationSeconds: number | null; // host route driving time (s); the room map shows it like the select screen
}
export interface Participant {
  memberId: UUID;
  nickname: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  passengerCount: number;
  confirmed: boolean;
  joinedAt: ISODateTime;
}
export interface RoomDetail extends RoomSummary {
  myRole: ParticipantRole | 'NONE';
  myTripId: UUID | null;
  termsVersion: number;
  readOnly: boolean;
  canJoin: boolean;
  canConfirm: boolean;
  allConfirmed: boolean;
  participants: Participant[];
  routePreview: LatLng[];
}

// ---------- conversation ----------
export interface Message {
  id: UUID;
  roomId: UUID;
  senderId: UUID | null;
  senderNickname: string | null;
  type: MessageType;
  body: string | null;
  hidden: boolean;
  createdAt: ISODateTime;
}
export interface SendMessageRequest { body: string; clientMessageId: string }
export type RoomEvent =
  | { type: 'MESSAGE_CREATED'; payload: Message }
  | { type: 'MESSAGE_HIDDEN'; payload: { messageId: UUID } }
  | { type: 'ROOM_UPDATED'; payload: { roomId: UUID; status: RoomStatus; termsVersion: number } };

// ---------- moderation ----------
export interface CreateReportRequest {
  targetType: ReportTargetType;
  targetId: UUID;
  reason: ReportReason;
  detail?: string | null;
}
export interface Report {
  id: UUID;
  reporterId: UUID;
  reporterNickname: string;
  targetType: ReportTargetType;
  targetId: UUID;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  targetPreview: string | null;
  createdAt: ISODateTime;
  resolvedAt: ISODateTime | null;
  resolutionNote: string | null;
}
export interface ModerationActionRequest { action: ModerationAction; note?: string | null }
export interface AdminMetrics {
  periodDays: number;
  openReports: number;
  reportsInPeriod: number;
  tripsCreated: number;
  tripsMatched: number;
  tripsNoMatch: number;
  tripsExpired: number;
  matchFailureRate: number;
  roomsCreated: number;
  roomsConfirmed: number;
}
