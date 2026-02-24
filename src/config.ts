export const config = {
  port: parseInt(process.env.PORT || "3001"),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  syncServerUrl: process.env.SYNC_SERVER_URL || "http://localhost:5006",
  dataDir: process.env.DATA_DIR || "./actual-data",
  logLevel: process.env.LOG_LEVEL || "info",
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
};
