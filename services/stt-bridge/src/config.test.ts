import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const baseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("loadConfig", () => {
  it("defaults Chirp 3 to a supported multi-region recognizer", () => {
    const config = loadConfig({
      ...baseEnv,
      GOOGLE_CLOUD_PROJECT: "project-1",
    });

    expect(config.googleLocation).toBe("us");
    expect(config.googleRecognizer).toBe("projects/project-1/locations/us/recognizers/_");
    expect(config.googleModel).toBe("chirp_3");
  });

  it("keeps an explicitly configured Google Speech location", () => {
    const config = loadConfig({
      ...baseEnv,
      GOOGLE_CLOUD_PROJECT: "project-1",
      GOOGLE_CLOUD_LOCATION: "eu",
    });

    expect(config.googleLocation).toBe("eu");
    expect(config.googleRecognizer).toBe("projects/project-1/locations/eu/recognizers/_");
  });
});
