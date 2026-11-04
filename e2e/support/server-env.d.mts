export function e2eServerEnv(options: {
  // The caller's environment (process.env).
  env: Record<string, string | undefined>;
  // The text of .env.example: every variable it lists is blanked.
  envExample: string;
  port: string;
  // Path of the module every server process imports first.
  preload: string;
}): Record<string, string | undefined>;
