// Open Agentic Web Browser Runtime (Zero-Backend, BYOK + Deterministic Fallback)
// Loads agent-manifest.json and civicaid_clinic_assistant.network.json directly in the browser.

const STORAGE_KEY = "civicaid_oaw_llm_settings_v1";

export const initialClinicState = {
  version: 1,
  clinicName: "CivicAid Community Clinic & Pharmacy",
  doctors: [
    { id: "doc-1", name: "Dr. Meera Nair", specialty: "General Medicine", slot: "14:00 Today", waitMins: 10, feeCents: 0, available: true },
    { id: "doc-2", name: "Dr. Carlos Vega", specialty: "Pediatrics", slot: "14:30 Today", waitMins: 15, feeCents: 0, available: true },
    { id: "doc-3", name: "Dr. Hannah Kim", specialty: "Cardiology Screening", slot: "15:15 Today", waitMins: 25, feeCents: 500, available: true },
    { id: "doc-4", name: "Dr. Tariq Al-Mansoor", specialty: "Dental & Preventive", slot: "16:00 Today", waitMins: 20, feeCents: 0, available: true }
  ],
  pharmacy: [
    { id: "med-1", name: "Paracetamol 500mg (20 tabs)", category: "Fever & Pain", priceCents: 150, stock: 42, rxRequired: false },
    { id: "med-2", name: "Metformin 500mg (30 tabs)", category: "Diabetes Care", priceCents: 300, stock: 18, rxRequired: true },
    { id: "med-3", name: "Amoxicillin 500mg (15 caps)", category: "Antibiotic", priceCents: 450, stock: 11, rxRequired: true },
    { id: "med-4", name: "Oral Rehydration Salts (5 packs)", category: "Hydration", priceCents: 100, stock: 64, rxRequired: false },
    { id: "med-5", name: "Cetirizine 10mg (10 tabs)", category: "Allergy Relief", priceCents: 120, stock: 29, rxRequired: false }
  ],
  appointments: [],
  reservations: []
};

export function loadLlmSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    provider: "local-deterministic",
    baseUrl: "https://api.otari.ai/api/v1",
    model: "alibaba/qwen-3.5-35b-a3b",
    apiKey: ""
  };
}

export function saveLlmSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export class AgenticWebRuntime {
  constructor({ getState, onBook, onReserve, onConfirm, onTrace }) {
    this.getState = getState;
    this.onBook = onBook;
    this.onReserve = onReserve;
    this.onConfirm = onConfirm;
    this.onTrace = onTrace;
    this.manifest = null;
    this.network = null;
  }

  async boot() {
    const [mRes, nRes] = await Promise.all([
      fetch("./agent-manifest.json"),
      fetch("./civicaid_clinic_assistant.network.json")
    ]);
    if (!mRes.ok || !nRes.ok) {
      throw new Error("Could not load agent-manifest.json or network.json over HTTP.");
    }
    this.manifest = await mRes.json();
    this.network = await nRes.json();
    this.onTrace({
      agent: "runtime",
      step: "boot",
      detail: `Loaded ${this.network.network_name} (${this.network.agents.length} agents, ${this.manifest.actions.agentTools.length} page-local tools)`
    });
    return { manifest: this.manifest, network: this.network };
  }

  // Execute page-local tools declared in agent-manifest.json
  async runTool(toolName, args = {}) {
    const state = this.getState();

    if (toolName === "website_get_clinic_state") {
      this.onTrace({ agent: "tool", step: toolName, detail: `Read live state v${state.version}` });
      return {
        version: state.version,
        open_doctors: state.doctors.filter((d) => d.available),
        pharmacy_items: state.pharmacy,
        appointments_count: state.appointments.length,
        reservations_count: state.reservations.length
      };
    }

    if (toolName === "website_search_pharmacy") {
      const q = String(args.query || "").toLowerCase();
      const matches = state.pharmacy.filter(
        (m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
      );
      this.onTrace({ agent: "tool", step: toolName, detail: `Matched ${matches.length} items for "${q || "all"}"` });
      return { version: state.version, matches: matches.length ? matches : state.pharmacy };
    }

    if (toolName === "website_book_appointment") {
      const doc = state.doctors.find((d) => d.id === args.doctorId && d.available);
      if (!doc) return { ok: false, error: "Selected doctor slot is no longer available." };
      const patientName = (args.patientName || "Walk-in Visitor").trim();
      const approved = await this.onConfirm({
        title: "Confirm Clinic Appointment",
        summary: `Book ${doc.name} (${doc.specialty}) at ${doc.slot} for ${patientName}`,
        meta: `Fee: ${doc.feeCents === 0 ? "Free ($0.00)" : "$" + (doc.feeCents / 100).toFixed(2)} · State v${state.version}`
      });
      if (!approved) {
        this.onTrace({ agent: "booking_specialist", step: "declined", detail: "Visitor declined booking confirmation." });
        return { ok: false, cancelled: true, message: "Booking cancelled by visitor." };
      }
      const result = this.onBook(doc.id, patientName, state.version);
      this.onTrace({ agent: "booking_specialist", step: "committed", detail: `Booked ${doc.name} (${doc.slot}) for ${patientName}` });
      return result;
    }

    if (toolName === "website_reserve_medicine") {
      const med = state.pharmacy.find((m) => m.id === args.medicineId && m.stock > 0);
      if (!med) return { ok: false, error: "Medicine out of stock or not found." };
      const qty = Math.min(Math.max(Number(args.qty) || 1, 1), Math.min(3, med.stock));
      const approved = await this.onConfirm({
        title: "Confirm Subsidized Pharmacy Pickup",
        summary: `Reserve ${qty}x ${med.name}`,
        meta: `Total: $${((med.priceCents * qty) / 100).toFixed(2)} · ${med.rxRequired ? "Bring prescription at counter" : "OTC pickup"} · State v${state.version}`
      });
      if (!approved) {
        this.onTrace({ agent: "booking_specialist", step: "declined", detail: "Visitor declined reservation confirmation." });
        return { ok: false, cancelled: true, message: "Reservation cancelled by visitor." };
      }
      const result = this.onReserve(med.id, qty, state.version);
      this.onTrace({ agent: "booking_specialist", step: "committed", detail: `Reserved ${qty}x ${med.name}` });
      return result;
    }

    return { ok: false, error: `Unknown tool ${toolName}` };
  }

  async sendMessage(userText) {
    const settings = loadLlmSettings();
    if (settings.provider !== "local-deterministic" && settings.apiKey) {
      try {
        return await this.runWithByokLlm(userText, settings);
      } catch (err) {
        this.onTrace({
          agent: "runtime",
          step: "byok-fallback",
          detail: `BYOK call failed (${err.message}); falling back to local deterministic runtime.`
        });
      }
    }
    return this.runDeterministic(userText);
  }

  async runWithByokLlm(userText, settings) {
    this.onTrace({ agent: "coordinator", step: "byok-call", detail: `Calling ${settings.provider} (${settings.model}) from browser` });
    const stateSnapshot = await this.runTool("website_get_clinic_state");

    const systemPrompt = [
      `You are the ${this.network.network_name} multi-agent network running in the visitor's browser.`,
      `Available specialists: ${this.network.agents.map((a) => `${a.name} (${a.role})`).join(", ")}.`,
      `Live clinic state JSON: ${JSON.stringify(stateSnapshot)}`,
      `Answer concisely from live state only. If the user asks to book an appointment or reserve medicine, respond with a short confirmation note and include an exact JSON action block like {"action":"book","doctorId":"doc-1","patientName":"Alex"} or {"action":"reserve","medicineId":"med-1","qty":1}.`
    ].join("\n");

    const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content || "No reply returned from model.";

    const actionMatch = reply.match(/\{[\s\S]*?"action"\s*:\s*"(book|reserve)"[\s\S]*?\}/);
    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[0]);
        if (parsed.action === "book") {
          const outcome = await this.runTool("website_book_appointment", parsed);
          return outcome.ok
            ? `${reply.replace(actionMatch[0], "").trim()}\n\nConfirmed: Appointment booked (ID ${outcome.booking.id}).`
            : `${reply.replace(actionMatch[0], "").trim()}\n\nAction not executed: ${outcome.message || outcome.error}`;
        }
        if (parsed.action === "reserve") {
          const outcome = await this.runTool("website_reserve_medicine", parsed);
          return outcome.ok
            ? `${reply.replace(actionMatch[0], "").trim()}\n\nConfirmed: Pharmacy pickup reserved (ID ${outcome.reservation.id}).`
            : `${reply.replace(actionMatch[0], "").trim()}\n\nAction not executed: ${outcome.message || outcome.error}`;
        }
      } catch {}
    }
    return reply;
  }

  async runDeterministic(userText) {
    const q = userText.toLowerCase();
    this.onTrace({ agent: "coordinator", step: "route", detail: `Received query: "${userText.slice(0, 60)}"` });
    const state = await this.runTool("website_get_clinic_state");

    // Booking intent
    if (/(book|schedule|appointment|slot)/.test(q)) {
      this.onTrace({ agent: "coordinator", step: "delegate", detail: "Delegating to booking_specialist" });
      const open = state.open_doctors;
      if (!open.length) return "All clinic slots are currently booked. Try refreshing or checking back tomorrow.";

      let target = open[0];
      if (/pediatr|child/.test(q)) target = open.find((d) => /pediatr/i.test(d.specialty)) || target;
      else if (/cardio|heart/.test(q)) target = open.find((d) => /cardio/i.test(d.specialty)) || target;
      else if (/dental|tooth/.test(q)) target = open.find((d) => /dental/i.test(d.specialty)) || target;
      else if (/general|earliest|shortest/.test(q)) {
        target = [...open].sort((a, b) => a.waitMins - b.waitMins)[0];
      }

      const nameMatch = userText.match(/for\s+([A-Za-z][A-Za-z\s]{1,24})/i);
      const patientName = nameMatch ? nameMatch[1].trim() : "Walk-in Visitor";
      const res = await this.runTool("website_book_appointment", { doctorId: target.id, patientName });
      if (res.ok) {
        return `Booked ${target.name} (${target.specialty}) at ${target.slot} for ${patientName}. Confirmation ID: ${res.booking.id} (state v${res.version}).`;
      }
      return res.cancelled ? "Appointment booking was cancelled — no changes were made." : res.error;
    }

    // Reserve medicine intent
    if (/(reserve|pickup|order|pack)/.test(q)) {
      this.onTrace({ agent: "coordinator", step: "delegate", detail: "Delegating to pharmacy_specialist -> booking_specialist" });
      const med =
        state.pharmacy_items.find((m) => q.includes(m.name.split(" ")[0].toLowerCase())) ||
        state.pharmacy_items[0];
      const qtyMatch = q.match(/(\d+)\s*(pack|box|strip|x)?/);
      const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
      const res = await this.runTool("website_reserve_medicine", { medicineId: med.id, qty });
      if (res.ok) {
        return `Reserved ${qty}x ${med.name} ($${((med.priceCents * qty) / 100).toFixed(2)}). Pickup code: ${res.reservation.id}.`;
      }
      return res.cancelled ? "Pharmacy reservation was cancelled — stock unchanged." : res.error;
    }

    // Pharmacy stock search
    if (/(medicine|pharmacy|stock|price|metformin|amoxicillin|paracetamol|cetirizine|ors|hydration|fever|diabetes)/.test(q)) {
      this.onTrace({ agent: "coordinator", step: "delegate", detail: "Delegating to pharmacy_specialist" });
      const term =
        ["metformin", "amoxicillin", "paracetamol", "cetirizine", "hydration", "fever", "diabetes"].find((w) => q.includes(w)) || "";
      const res = await this.runTool("website_search_pharmacy", { query: term });
      const lines = res.matches.map(
        (m) => `• ${m.name} — $${(m.priceCents / 100).toFixed(2)} (${m.stock} in stock, ${m.rxRequired ? "Rx required" : "OTC"})`
      );
      return `Live Subsidized Pharmacy Inventory (state v${res.version}):\n${lines.join("\n")}\n\nSay "Reserve 1 pack of Paracetamol" to hold an item with 1-click confirmation.`;
    }

    // Default: Doctor availability & wait times
    this.onTrace({ agent: "coordinator", step: "delegate", detail: "Delegating to triage_specialist" });
    const sorted = [...state.open_doctors].sort((a, b) => a.waitMins - b.waitMins);
    if (!sorted.length) return "No open doctor slots remain today.";
    const lines = sorted.map(
      (d) => `• ${d.name} (${d.specialty}) — ${d.slot}, ~${d.waitMins} min wait, ${d.feeCents === 0 ? "Free" : "$" + (d.feeCents / 100).toFixed(2)}`
    );
    return `Open Clinic Slots (shortest wait first, state v${state.version}):\n${lines.join("\n")}\n\nSay "Book me the earliest General Medicine slot for Alex" to trigger a confirmed booking.`;
  }
}
