export type Env = {
  DB: D1Database;
  // CACHE: KVNamespace;
  // PHOTOS: R2Bucket;
  // NOTIFICATIONS: Queue;
  AREA_ROOM: DurableObjectNamespace;

  // Vars
  GEOPOP_URL: string;
  CEB_BASE_URL: string;

  // Secrets
  // VAPID_PUBLIC_KEY: string;
  // VAPID_PRIVATE_KEY: string;
  // CEB_USERNAME?: string;
  // CEB_PASSWORD?: string;
};
