const DEFAULT_FRONTEND_ORIGIN = "http://localhost:5173";
const LOCAL_VITE_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

export const configuredFrontendOrigin = () => process.env.FRONTEND_ORIGIN?.trim() || DEFAULT_FRONTEND_ORIGIN;

// A local Vite server can be reached through either loopback hostname. Treat
// those addresses as one development UI while preserving the exact single
// configured origin for production and the Worker deployment.
export const allowedFrontendOrigins = () => {
  const configured = configuredFrontendOrigin();
  if (process.env.NODE_ENV === "production" || process.env.CLOUDFLARE_WORKER === "true") {
    return new Set([configured]);
  }
  return new Set([configured, ...LOCAL_VITE_ORIGINS]);
};

export const isAllowedFrontendOrigin = (origin) => allowedFrontendOrigins().has(origin);
