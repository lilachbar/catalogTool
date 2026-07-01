// Single Vite entry for the CatalogOne web UI.
//
// This is the foundation of the incremental React/TypeScript/Tailwind
// migration: new "islands" are registered here and mounted into the existing
// Flask/Jinja pages by DOM id. The first island is the Agentic Catalog
// Assistant chat client (still .jsx today; TS migration is a follow-up slice).
import "./index.css";

// The chat client self-mounts on #chatRoot when present on the page.
import "../src/chat-client.jsx";
