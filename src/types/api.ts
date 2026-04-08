/**
 * Wire types for the worker API. Mirrors what the routes return.
 */

export type OutageType = 'breakdown' | 'demand_management' | 'planned' | 'unplanned' | 'scheduled' | 'restored';
export type OutageSource = 'ceb' | 'crowdsourced';
export type OutageStatus = 'active' | 'resolved' | 'confirmed' | 'spam';

export interface CebOutage {
  id: string;
  source: 'ceb';
  areaId: string;
  areaName: string | null;
  outageTypeId: number;
  type: 'breakdown' | 'demand_management' | 'planned';
  numCustomers: number;
  timestamp: string | null;
  generatedTime: string | null;
  startTime: string | null;
  endTime: string | null;
  groupId: string | null;
  interruptionId: string | null;
  interruptionType: string | null;
  centroidLat: number | null;
  centroidLon: number | null;
  polygon: Array<{ lat: number; lon: number }>;
  status: OutageStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface CrowdReport {
  id: string;
  source: 'crowdsourced';
  areaId: string | null;
  areaName: string | null;
  type: string;
  status: OutageStatus;
  description: string | null;
  lat: number;
  lon: number;
  centroidLat: number;
  centroidLon: number;
  confirmedBy: number;
  populationAffected: number | null;
  nearestPlace: string | null;
  reportedAt: string;
  resolvedAt: string | null;
}

export type AnyOutage = CebOutage | CrowdReport;

export interface OutagesResponse {
  ceb: CebOutage[];
  crowdsourced: CrowdReport[];
}

export interface PowerStatusResponse {
  coordinates: { lat: number; lon: number };
  place: {
    name: string;
    displayName: string;
    district: string | null;
    province: string | null;
  } | null;
  status: 'powered' | 'outage';
  nearest: {
    id: string;
    source: OutageSource;
    areaId: string | null;
    areaName: string | null;
    type: string;
    affected: number;
    startedAt: string;
    distanceKm: number;
  } | null;
  estRestoreMins: number | null;
}

export interface IslandStats {
  activeOutages: number;
  cebOutages: number;
  crowdReports: number;
  customersAffected: number;
  populationAffected: number;
  newToday: number;
  newYesterday: number;
  trend: 'up' | 'down' | 'flat';
  trendDelta: number;
  worstAreas: Array<{
    areaId: string;
    areaName: string | null;
    outages: number;
    customers: number;
  }>;
}

export interface AreaStats {
  areaId: string;
  areaName: string;
  provinceName: string | null;
  totalCustomers: number;
  activeOutages: number;
  customersAffectedNow: number;
  outagesLast7Days: number;
  outagesLast30Days: number;
  avgDurationMins: number | null;
  hourlyDistribution: Array<{ hour: number; count: number }>;
}

export interface AreaSummary {
  areaId: string;
  areaName: string;
  provinceId: string;
  provinceName: string | null;
  totalCustomers: number;
  activeOutages: number;
  affectedNow: number;
}

export interface ReportCreateResponse {
  id: string;
  lat: number;
  lon: number;
  type: string;
  description: string | null;
  nearestPlace: string | null;
  displayName: string | null;
  populationAffected: number | null;
  linkedCebId: string | null;
  linkedAreaId: string | null;
  fused: boolean;
}
