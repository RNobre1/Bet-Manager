// open-next.config.ts
// Cloudflare Workers adapter for OpenNext.
// See https://opennext.js.org/cloudflare for the full reference.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Defaults: in-memory caching, no R2 / KV. We don't depend on ISR here,
  // so the simplest config is fine. Add an incrementalCache when /forecast
  // or /explore start re-rendering hot data on a tight schedule.
});
