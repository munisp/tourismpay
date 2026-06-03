/**
 * Vitest global test setup file.
 * Runs before each test file.
 */

// Extend Vitest matchers if needed in the future
// import '@testing-library/jest-dom/vitest';

// Set consistent timezone for date-dependent tests
process.env.TZ = "UTC";

// Suppress console noise during tests (optional — uncomment if tests are chatty)
// import { vi } from 'vitest';
// vi.spyOn(console, 'warn').mockImplementation(() => {});

export {};
