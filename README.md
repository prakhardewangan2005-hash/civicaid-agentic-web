# CivicAid Hub — Open Agentic Community Clinic & Pharmacy

Built for the **Cognizant × MIT × Mozilla × AWS Open Agentic Web Challenge** (`cognizant-agenticweb.devpost.com`).

**CivicAid Hub** is a public, zero-backend **Open Agentic Website** that conforms to the **Worldwide Agentic Web MVP Specification** (`github.com/cognizant-ai-labs/agentic-web`). It provides a dual-interface community healthcare and subsidized pharmacy portal: humans can browse and book manually, while an embedded **4-agent browser network** reads live page state, delegates across specialists, and executes state-changing actions only after explicit visitor confirmation.

- **Live Open Agentic Website:** https://prakhardewangan2005-hash.github.io/civicaid-agentic-web/
- **Public Agent Manifest:** https://prakhardewangan2005-hash.github.io/civicaid-agentic-web/agent-manifest.json
- **Public Agent Network Definition:** https://prakhardewangan2005-hash.github.io/civicaid-agentic-web/civicaid_clinic_assistant.network.json

## Open Agentic Web Spec Conformance

| Required Artifact | File | Role |
| :--- | :--- | :--- |
| Public Agent Manifest | `agent-manifest.json` | Machine-readable index of networks, front agent, BYOK providers, and page-local tools |
| Data-Only Agent Graph | `civicaid_clinic_assistant.network.json` | Portable 4-agent JSON graph (`coordinator`, `triage_specialist`, `pharmacy_specialist`, `booking_specialist`) |
| Browser Runtime | `runtime.js` | Pure ES-module runtime executing the agent network in the browser (zero server code) |
| Dual Interface + BYOK UI | `index.html` | Manual clinic/pharmacy UI + embedded assistant + `⚙ AI Model Settings` + explicit confirmation modal |
| Discovery Files | `links.json`, `agent-mcp.json` | Peer-link consent policy and MCP facade declaration |

## Key Safety & Architecture Principles
- **Zero Server / Zero Host LLM Cost:** Runs 100% in the visitor's browser over static HTTPS hosting (GitHub Pages). Visitors can plug in their own **Otari**, **OpenAI**, **OpenRouter**, or custom CORS-enabled LLM key under **⚙ AI Model Settings**, or test immediately with the built-in **Local Deterministic Multi-Agent Engine**.
- **Explicit Human-in-the-Loop Writes:** Every state-mutating tool (`website_book_appointment`, `website_reserve_medicine`) requires an explicit browser confirmation dialog and checks `expectedStateVersion` to prevent stale writes.
- **Simulated Community Data:** All appointments and pharmacy reservations are simulated in page memory with no real payments or personal medical records stored.

## Author
Built solo by **Prakhar Dewangan** (B.Tech ECE, IIIT Allahabad) — [GitHub](https://github.com/prakhardewangan2005-hash) · [LinkedIn](https://www.linkedin.com/in/prakhardewangan)
