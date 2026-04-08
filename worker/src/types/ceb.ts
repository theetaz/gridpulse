/**
 * Raw shape of a single outage cluster as returned by CEB's
 * /Incognito/GetOutageLocationsInArea endpoint.
 *
 * IMPORTANT: The endpoint returns a double-JSON-encoded string —
 * the body is a JSON string whose value is itself a JSON-encoded
 * array of these objects.
 */
export interface RawCEBCluster {
  NumberOfCustomers: number;
  TimeStamp: string; // "2026-04-07 11:07 AM"
  OutageTypeId: number; // 1 = Breakdown, 3 = DemandMgmt, other = Planned
  StartTime: string; // "0001-01-01T00:00:00" when not set
  EndTime: string;
  GeneratedTime: string; // ISO with timezone
  GroupId?: string; // OutageTypeId === 3
  InterruptionId?: string; // planned outages
  InterruptionTypeName?: string;
  Points: RawCEBPoint[];
}

export interface RawCEBPoint {
  Lat: number;
  Lon: number;
  ElapsedTime: number;
  LvFeeder: number;
  ReceivedTime: string;
}

/**
 * Normalized cluster ready to be persisted in D1.
 */
export interface ParsedOutage {
  id: string;
  areaId: string;
  outageTypeId: number;
  numCustomers: number;
  timestamp: string | null;
  generatedTime: string | null;
  startTime: string | null;
  endTime: string | null;
  groupId: string | null;
  interruptionId: string | null;
  interruptionType: string | null;
  polygon: Array<{ lat: number; lon: number }>;
  centroidLat: number;
  centroidLon: number;
}
