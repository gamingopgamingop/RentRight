import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PhoneCall, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { placeOutperoCall, type OutperoCallResult } from "../utils/outperoApi";
import { toast } from "sonner";

const DEFAULT_EMPLOYEE_ID =
  (import.meta.env.VITE_OUTPERO_EMPLOYEE_ID as string) || "";

type CallIntent =
  | "Property enquiry follow-up"
  | "Viewing confirmation"
  | "Deposit & agreement clarification"
  | "Maintenance update";

/**
 * OutperoCallWidget: asks Outpero's AI voice agent to place a real outbound
 * call to a phone number (rental follow-ups, viewing confirmations, etc).
 * The browser only calls our own /api/outpero-call server endpoint — the API
 * key stays server-side and never reaches the page.
 *
 * Includes a demo fallback: if the live call fails (Outpero/Vercel downtime,
 * missing server env var, 0 credits, etc.) we show a clearly-labelled
 * SIMULATED success so the RentRight flow can always be demoed end-to-end.
 */
export const OutperoCallWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState<CallIntent>("Property enquiry follow-up");
  const [property, setProperty] = useState("");
  const [employeeId, setEmployeeId] = useState(DEFAULT_EMPLOYEE_ID);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OutperoCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const reset = () => {
    setResult(null);
    setError(null);
    setSimulated(false);
    setFallbackReason(null);
  };

  const simulateCall = (reason: string | null) => {
    setSimulated(true);
    setFallbackReason(reason);
    setResult({ id: `simulated-${Date.now()}`, status: "queued (simulated)", raw: {} });
  };

  const handleCall = async () => {
    reset();

    // Validate inputs up front so we never "mock" a bad-number mistake.
    const cleanPhone = phone.replace(/[\s\-()]/g, "");
    if (!/^\+?\d{7,15}$/.test(cleanPhone)) {
      setError("Enter a valid phone number, e.g. +919876543210");
      return;
    }
    if (!employeeId.trim()) {
      setError("Add an agent (employee) ID under 'Advanced'.");
      return;
    }

    if (demoMode) {
      simulateCall(null);
      toast.info("Simulated call (demo mode) — no Outpero credits used.");
      return;
    }

    setBusy(true);
    try {
      const call = await placeOutperoCall({
        phone,
        employeeId,
        variables: { intent, property },
      });
      setSimulated(false);
      setResult(call);
      toast.success(`AI agent is calling ${phone} (${call.status})`);
    } catch (e: any) {
      const msg =
        (e instanceof Error && e.message) ||
        (typeof e === "string" ? e : "") ||
        "Could not place the call.";
      console.error("[Outpero] live call failed — using demo fallback:", msg);
      // Never block the RentRight demo on Outpero/Vercel uptime.
      simulateCall(msg);
      toast.warning("Outpero unavailable — showing a simulated call for the demo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-5 h-12 w-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg z-50 p-0"
        aria-label="Have the AI voice agent call a number"
        title="AI voice agent phone call (Outpero)"
      >
        <PhoneCall className="w-5 h-5" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <PhoneCall className="w-4 h-4 text-indigo-600" /> AI Voice Agent Call
            </DialogTitle>
            <DialogDescription className="text-xs">
              Outpero's AI agent will place a live call to the number below using your configured
              rental script. The browser only calls our own server endpoint — the API key stays
              server-side and never reaches this page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-800 block mb-1">Phone number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
                inputMode="tel"
                className="h-9 text-sm"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-800 block mb-1">Call purpose</label>
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value as CallIntent)}
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
              >
                {(["Property enquiry follow-up", "Viewing confirmation", "Deposit & agreement clarification", "Maintenance update"] as CallIntent[]).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-800 block mb-1">
                Property / locality <span className="text-slate-400 font-normal">(optional, passed to the agent)</span>
              </label>
              <Input
                value={property}
                onChange={(e) => setProperty(e.target.value)}
                placeholder="e.g. 2 BHK, Koramangala"
                className="h-9 text-sm"
              />
            </div>

            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer select-none font-medium">Advanced: agent (employee) ID</summary>
              <Input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="Employee ID"
                className="h-8 text-[11px] mt-1.5 font-mono"
              />
            </details>

            <label className="flex items-center gap-2 text-[11px] text-slate-600 select-none">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Demo mode — simulate the call (no Outpero/credits used)
            </label>

            {result && (
              <div
                className={`rounded-lg border p-2.5 flex items-start gap-2 ${
                  simulated
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  {simulated ? (
                    <>
                      <span className="font-semibold uppercase tracking-wide text-[10px] block">
                        Simulated (demo)
                      </span>
                      AI agent will call <strong>{phone}</strong> for {intent.toLowerCase()}
                      {property ? ` — ${property}` : ""}.
                      {fallbackReason && (
                        <span className="block text-[10px] text-amber-700 mt-1">
                          Live call failed: {fallbackReason}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      Call placed — status <strong>{result.status}</strong>
                      {result.id && (
                        <span className="block text-[10px] text-emerald-700 font-mono mt-0.5">
                          id: {result.id}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
              <ShieldCheck className="w-3 h-3 shrink-0 mt-0.5 text-emerald-600" />
              <span>
                If this fails with an auth error, set a fresh <code>OUTPERO_API_KEY</code> in{" "}
                <code>.env</code> (server-side only) and restart <code>npm run dev</code>.
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="text-xs">
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleCall}
              disabled={busy || phone.trim() === ""}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
            >
              {busy ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calling…</>
              ) : (
                <><PhoneCall className="w-3.5 h-3.5" /> Place AI Call</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OutperoCallWidget;
