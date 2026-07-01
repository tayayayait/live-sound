export interface BridgeConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  googleCloudProject?: string;
  googleLocation: string;
  googleRecognizer: string;
  googleModel: string;
  geminiApiKey?: string;
  useMockStt: boolean;
}

const DEFAULT_GOOGLE_SPEECH_LOCATION = "us";
const DEFAULT_GOOGLE_SPEECH_MODEL = "latest_long";

export function loadConfig(env = process.env): BridgeConfig {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const googleCloudProject = env.GOOGLE_CLOUD_PROJECT;
  const googleLocation = env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_GOOGLE_SPEECH_LOCATION;
  const googleModel = env.GOOGLE_SPEECH_MODEL ?? DEFAULT_GOOGLE_SPEECH_MODEL;
  const googleRecognizer =
    env.GOOGLE_SPEECH_RECOGNIZER ??
    (googleCloudProject
      ? `projects/${googleCloudProject}/locations/${googleLocation}/recognizers/_`
      : "");

  return {
    port: Number(env.PORT ?? 8787),
    supabaseUrl,
    supabaseServiceRoleKey,
    googleCloudProject,
    googleLocation,
    googleRecognizer,
    googleModel,
    geminiApiKey: env.GEMINI_API_KEY,
    useMockStt: env.USE_MOCK_STT === "true" || !googleCloudProject,
  };
}
