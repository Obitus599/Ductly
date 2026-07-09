"use client";

import { useState, useEffect } from "react";

interface Schedule {
  id: string;
  team_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

interface Team {
  id: string;
  name: string;
  whatsapp_number: string | null;
  active: boolean;
  created_at: string;
  schedules: Schedule[];
  bookings_this_week: number;
  bookings_this_month: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ teamId: string; ok: boolean; message: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  async function fetchTeams() {
    const res = await fetch("/api/admin/teams");
    const data = await res.json();
    setTeams(data.teams || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchTeams();
  }, []);

  async function toggleTeam(id: string, active: boolean) {
    setToggling(id);
    await fetch("/api/admin/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, active: !active } : t))
    );
    setToggling(null);
  }

  async function testPing(teamId: string) {
    setPinging(teamId);
    setPingResult(null);
    try {
      const res = await fetch("/api/admin/teams/test-ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId }),
      });
      const data = await res.json();
      if (res.ok) {
        setPingResult({
          teamId,
          ok: true,
          message: `Test WhatsApp sent (Twilio status: ${data.status})`,
        });
      } else {
        const detail = data.twilio_message
          ? `${data.error} — ${data.twilio_message}`
          : data.error;
        setPingResult({ teamId, ok: false, message: detail || "Failed" });
      }
    } catch (err) {
      setPingResult({
        teamId,
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setPinging(null);
    }
  }

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          whatsapp_number: newWhatsapp.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to add team.");
        return;
      }
      setTeams((prev) => [
        ...prev,
        { ...data.team, schedules: [], bookings_this_week: 0, bookings_this_month: 0 },
      ]);
      setNewName("");
      setNewWhatsapp("");
      setShowAdd(false);
    } catch {
      setAddError("Network error.");
    } finally {
      setAdding(false);
    }
  }

  function formatTime(t: string) {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${m} ${ampm}`;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div
          className="w-8 h-8 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-[18px] font-normal tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
        >
          Teams ({teams.length})
        </h2>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-[13px] font-medium px-4 py-2 rounded-full text-white transition-all hover:brightness-110"
          style={{
            fontFamily: "var(--font-cta)",
            background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
          }}
        >
          {showAdd ? "Cancel" : "Add Team"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addTeam} className="p-5 mb-5" style={CARD}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[13px] font-medium text-[rgb(80,85,95)] mb-1.5"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Name *
              </label>
              <input
                className="w-full rounded-[12px] border-2 border-[rgb(230,230,230)] bg-white px-4 py-3 text-[14px] text-[rgb(61,61,61)] placeholder:text-[rgb(185,185,185)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Team name"
                required
              />
            </div>
            <div>
              <label
                className="block text-[13px] font-medium text-[rgb(80,85,95)] mb-1.5"
                style={{ fontFamily: "var(--font-body)" }}
              >
                WhatsApp Number
              </label>
              <input
                className="w-full rounded-[12px] border-2 border-[rgb(230,230,230)] bg-white px-4 py-3 text-[14px] text-[rgb(61,61,61)] placeholder:text-[rgb(185,185,185)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
                value={newWhatsapp}
                onChange={(e) => setNewWhatsapp(e.target.value)}
                placeholder="+917042009519"
              />
            </div>
          </div>
          {addError && (
            <p className="text-[13px] mt-3" style={{ fontFamily: "var(--font-body)", color: "rgb(239,68,68)" }}>
              {addError}
            </p>
          )}
          <button
            type="submit"
            disabled={!newName.trim() || adding}
            className="mt-4 px-6 py-2.5 rounded-full text-[14px] font-medium text-white transition-all disabled:opacity-40"
            style={{
              fontFamily: "var(--font-cta)",
              background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
            }}
          >
            {adding ? "Adding..." : "Create Team"}
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {teams.map((team) => {
          const activeDays = team.schedules
            .filter((s) => s.active)
            .sort((a, b) => a.day_of_week - b.day_of_week);

          return (
            <div key={team.id} className="p-6" style={CARD}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[14px] font-medium"
                      style={{
                        background: team.active
                          ? "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))"
                          : "rgb(238,240,244)",
                        color: team.active ? "white" : "rgb(160,165,175)",
                        fontFamily: "var(--font-badge)",
                      }}
                    >
                      {team.name.charAt(0)}
                    </div>
                    <div>
                      <h2
                        className="text-[16px] font-normal tracking-[-0.02em]"
                        style={{
                          fontFamily: "var(--font-heading)",
                          color: "rgb(61,61,61)",
                        }}
                      >
                        {team.name}
                      </h2>
                      {team.whatsapp_number && (
                        <p
                          className="text-[12px] mt-0.5"
                          style={{
                            fontFamily: "var(--font-body)",
                            color: "rgb(160,165,175)",
                          }}
                        >
                          {team.whatsapp_number}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pinging === team.id || !team.whatsapp_number}
                    onClick={() => testPing(team.id)}
                    className="text-[13px] px-4 py-2 rounded-[10px] border-2 font-medium transition-all disabled:opacity-50"
                    style={{
                      fontFamily: "var(--font-cta)",
                      borderColor: "rgba(59,130,246,0.2)",
                      color: "rgb(59,130,246)",
                      background: "rgba(59,130,246,0.04)",
                    }}
                    title={
                      team.whatsapp_number
                        ? "Send a test SMS via Twilio to verify reachability"
                        : "No phone number on file"
                    }
                  >
                    {pinging === team.id ? "Sending…" : "Test ping"}
                  </button>
                  <button
                    type="button"
                    disabled={toggling === team.id}
                    onClick={() => toggleTeam(team.id, team.active)}
                    className="text-[13px] px-4 py-2 rounded-[10px] border-2 font-medium transition-all disabled:opacity-50"
                    style={{
                      fontFamily: "var(--font-cta)",
                      borderColor: team.active
                        ? "rgba(239,68,68,0.2)"
                        : "rgba(34,197,94,0.2)",
                      color: team.active ? "rgb(239,68,68)" : "rgb(34,197,94)",
                      background: team.active
                        ? "rgba(239,68,68,0.04)"
                        : "rgba(34,197,94,0.04)",
                    }}
                  >
                    {team.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>

              {pingResult && pingResult.teamId === team.id && (
                <div
                  className="mt-3 text-[12px] px-3 py-2 rounded-[8px]"
                  style={{
                    fontFamily: "var(--font-body)",
                    background: pingResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                    color: pingResult.ok ? "rgb(34,160,84)" : "rgb(200,55,55)",
                  }}
                >
                  {pingResult.message}
                </div>
              )}

              {/* Schedule */}
              <div className="mt-5 flex flex-wrap gap-2">
                {DAYS.map((day, i) => {
                  const sched = activeDays.find((s) => s.day_of_week === i);
                  return (
                    <span
                      key={day}
                      className="text-[12px] px-3 py-1.5 rounded-[8px] font-medium"
                      style={{
                        fontFamily: "var(--font-badge)",
                        background: sched
                          ? "rgba(147,216,216,0.12)"
                          : "rgb(247,248,250)",
                        color: sched
                          ? "rgb(60,140,130)"
                          : "rgb(190,195,205)",
                      }}
                    >
                      {day}
                      {sched && (
                        <span
                          className="ml-1.5"
                          style={{ color: "rgb(100,170,160)" }}
                        >
                          {formatTime(sched.start_time)}-
                          {formatTime(sched.end_time)}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              {/* Workload + ID */}
              <div
                className="mt-4 pt-4 flex items-center justify-between border-t"
                style={{ borderColor: "rgb(245,246,248)" }}
              >
                <div className="flex gap-5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-[4px] h-[14px] rounded-full"
                      style={{ background: "rgb(147,216,216)" }}
                    />
                    <span
                      className="text-[12px]"
                      style={{
                        fontFamily: "var(--font-body)",
                        color: "rgb(140,145,155)",
                      }}
                    >
                      Week: {team.bookings_this_week}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-[4px] h-[14px] rounded-full"
                      style={{ background: "rgb(149,207,140)" }}
                    />
                    <span
                      className="text-[12px]"
                      style={{
                        fontFamily: "var(--font-body)",
                        color: "rgb(140,145,155)",
                      }}
                    >
                      Month: {team.bookings_this_month}
                    </span>
                  </div>
                </div>
                <span
                  className="text-[11px] font-mono"
                  style={{ color: "rgb(200,205,215)" }}
                >
                  {team.id.slice(0, 8)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
