# Per-plan mission settings

Admin → ลิงก์ภารกิจ / Mission links → choose 6H, 12H or 24H.

Each plan now accepts an ordered list of link steps. Add, remove or reorder steps, choose their type, edit their title/description/HTTPS URL, and set each wait in whole seconds (0 means no cooldown after returning). At least one link step is required. Human verification is always last and adds no cooldown. Key durations remain 6, 12 and 24 hours.

There is no fixed step-count limit. The authenticated settings request is limited to 1 MiB to protect storage and memory; other JSON APIs retain their 16 KiB limit. Flows retain their existing 24-hour expiry, so configure a practical total wait that users can finish within a session.

Settings use the existing `site_settings` rows `links:6h`, `links:12h`, `links:24h`, with optional `missions` inside their JSON. No schema migration is required. Records without `missions` keep the legacy links, counts and timings until an admin saves the new editor. Issued keys keep their existing expiry.

The server binds progress to each step's URL, timer, title, type and position. Changes invalidate affected progress and require fresh human verification. Claiming atomically checks every current step and its timer, the settings revision, account key lock and final verification. The SQL uses JSON requirements with a constant parameter count, supporting long lists without hitting per-step SQL parameter/expression limits.
