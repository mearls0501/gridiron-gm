// ==========================================
// Gridiron GM - Database Module
// ==========================================

// Core database and types
export * from "./database";

// Personnel generation
export * from "./personnel-generator";

// Lifecycle management (retirement, firing, season transitions)
export * from "./lifecycle-manager";

// Personnel repository (hiring, searching, interviews)
export * from "./personnel-repository";

// Normalized ratings repository
export * from "./normalized-ratings-repository";

// Game initialization and save management
export * from "./game-initializer";

// Re-export the database instance for convenience
export { db } from "./database";
