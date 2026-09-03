import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";
import * as d3 from "d3";
import {
  extractMindMap,
  getCurrentSessionId,
  loadSessions,
  setCurrentSessionId,
  upsertSession,
  type Session,
} from "@/lib/sessions";

export const Route = createFileRoute("/cognitive-maps")({
  head: () => ({ meta: [{ title: "Cognitive Maps — Aethelgard" }] }),
  component: CognitiveMaps,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeDatum = d3.SimulationNodeDatum & {
  id: string;
  label: string;
  type: "center" | "fact";
  r: number;
};

type LinkDatum = d3.SimulationLinkDatum<NodeDatum> & {
  source: NodeDatum;
  target: NodeDatum;
};

// ── ForceGraph ────────────────────────────────────────────────────────────────

function ForceGraph({
  topic,
  facts,
  onSelectFact,
  selectedFact,
}: {
  topic: string;
  facts: string[];
  onSelectFact: (fact: string | null) => void;
  selectedFact: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<NodeDatum, LinkDatum> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const buildGraph = useCallback(() => {
    const svg = d3.select(svgRef.current!);
    const width = svgRef.current!.clientWidth || 700;
    const height = svgRef.current!.clientHeight || 420;

    svg.selectAll("*").remove();

    // Defs — glow filter + arrow
    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Zoom container
    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);
    zoomRef.current = zoom;

    // Build nodes
    const centerNode: NodeDatum = { id: "center", label: topic, type: "center", r: 28, x: width / 2, y: height / 2 };
    const factNodes: NodeDatum[] = facts.map((f, i) => ({
      id: `fact-${i}`,
      label: f,
      type: "fact",
      r: 10,
      x: width / 2 + Math.cos((i / facts.length) * Math.PI * 2) * 160,
      y: height / 2 + Math.sin((i / facts.length) * Math.PI * 2) * 120,
    }));
    const nodes: NodeDatum[] = [centerNode, ...factNodes];
    const links: LinkDatum[] = factNodes.map((n) => ({ source: centerNode, target: n } as LinkDatum));

    // Simulation
    const sim = d3.forceSimulation<NodeDatum>(nodes)
      .force("link", d3.forceLink<NodeDatum, LinkDatum>(links).id((d) => d.id).distance(170).strength(0.6))
      .force("charge", d3.forceManyBody<NodeDatum>().strength(-380))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<NodeDatum>((d) => (d.type === "center" ? 80 : 70)))
      .alphaDecay(0.03);

    simulationRef.current = sim;

    // Links
    const link = g.append("g").selectAll<SVGLineElement, LinkDatum>("line")
      .data(links)
      .join("line")
      .attr("stroke", "oklch(0.78 0.11 80 / 0.25)")
      .attr("stroke-width", 1);

    // Fact node groups
    const factGroup = g.append("g").selectAll<SVGGElement, NodeDatum>("g.fact")
      .data(factNodes)
      .join("g")
      .attr("class", "fact")
      .style("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, NodeDatum>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
          }) as never
      )
      .on("click", (_event, d) => {
        onSelectFact(selectedFact === d.label ? null : d.label);
      });

    // Fact dot
    factGroup.append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", "oklch(0.78 0.11 80 / 0.15)")
      .attr("stroke", (d) => d.label === selectedFact ? "oklch(0.78 0.11 80)" : "oklch(0.78 0.11 80 / 0.5)")
      .attr("stroke-width", (d) => d.label === selectedFact ? 2 : 1);

    // Fact label background (foreignObject for wrapping)
    factGroup.each(function (d) {
      const fo = d3.select(this).append("foreignObject")
        .attr("width", 130)
        .attr("height", 60)
        .attr("x", 14)
        .attr("y", -20);

      fo.append("xhtml:div")
        .attr("class", "fact-label")
        .style("font-size", "10px")
        .style("line-height", "1.4")
        .style("color", d.label === selectedFact ? "oklch(0.92 0.015 80)" : "oklch(0.72 0.015 80)")
        .style("background", "oklch(0.16 0.008 60 / 0.85)")
        .style("padding", "3px 6px")
        .style("border-radius", "2px")
        .style("border", d.label === selectedFact ? "0.5px solid oklch(0.78 0.11 80 / 0.6)" : "0.5px solid oklch(0.28 0.008 60)")
        .style("max-width", "130px")
        .style("word-wrap", "break-word")
        .text(d.label.length > 55 ? d.label.slice(0, 55) + "…" : d.label);
    });

    // Center node
    const center = g.append("g").datum(centerNode).style("cursor", "default");

    center.append("circle")
      .attr("r", centerNode.r)
      .attr("fill", "oklch(0.78 0.11 80 / 0.2)")
      .attr("stroke", "oklch(0.78 0.11 80)")
      .attr("stroke-width", 1.5)
      .attr("filter", "url(#glow)");

    center.append("foreignObject")
      .attr("width", 120).attr("height", 60)
      .attr("x", -60).attr("y", -30)
      .append("xhtml:div")
      .style("font-size", "11px")
      .style("font-family", "Cormorant Garamond, serif")
      .style("font-style", "italic")
      .style("font-weight", "500")
      .style("color", "oklch(0.88 0.11 80)")
      .style("text-align", "center")
      .style("line-height", "1.3")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("height", "100%")
      .text(topic.length > 30 ? topic.slice(0, 30) + "…" : topic);

    // Tick
    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as NodeDatum).x!)
        .attr("y1", (d) => (d.source as NodeDatum).y!)
        .attr("x2", (d) => (d.target as NodeDatum).x!)
        .attr("y2", (d) => (d.target as NodeDatum).y!);

      factGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
      center.attr("transform", `translate(${centerNode.x},${centerNode.y})`);
    });
  }, [topic, facts, selectedFact, onSelectFact]);

  useEffect(() => {
    if (!svgRef.current || facts.length === 0) return;
    buildGraph();
    return () => { simulationRef.current?.stop(); };
  }, [buildGraph]);

  // Resize observer
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(() => {
      if (facts.length > 0) buildGraph();
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, [buildGraph, facts.length]);

  const zoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.4);
  };
  const zoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.7);
  };
  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity);
  };

  return (
    <div className="relative border border-border bg-card/30 rounded-sm" style={{ height: 420 }}>
      <svg ref={svgRef} className="w-full h-full" />

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        {[
          { icon: <ZoomIn size={12} />, fn: zoomIn, title: "Zoom in" },
          { icon: <ZoomOut size={12} />, fn: zoomOut, title: "Zoom out" },
          { icon: <Maximize2 size={12} />, fn: resetZoom, title: "Reset" },
        ].map((b, i) => (
          <button
            key={i}
            onClick={b.fn}
            title={b.title}
            className="w-6 h-6 flex items-center justify-center border border-border bg-background/80 text-muted-foreground hover:text-gold hover:border-gold/40 rounded-sm transition-colors"
          >
            {b.icon}
          </button>
        ))}
      </div>

      <div className="absolute bottom-3 left-3 label-mono text-[0.55rem] text-muted-foreground/50">
        Drag nodes · scroll to zoom · click a fact to inspect
      </div>
    </div>
  );
}

// ── CognitiveMaps ─────────────────────────────────────────────────────────────

function CognitiveMaps() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [regen, setRegen] = useState(false);
  const [selectedFact, setSelectedFact] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const all = loadSessions();
      setSessions(all);
      const cur = getCurrentSessionId();
      setActiveId((prev) => prev ?? cur ?? all[0]?.id ?? null);
    };
    refresh();
    window.addEventListener("aethelgard:sessions-updated", refresh);
    return () => window.removeEventListener("aethelgard:sessions-updated", refresh);
  }, []);

  const active = sessions.find((s) => s.id === activeId) ?? null;

  async function regenerate() {
    if (!active) return;
    setRegen(true);
    try {
      const model = localStorage.getItem("aethelgard.model") || "deepseek-r1-distill-qwen-7b";
      const result = await extractMindMap({
        endpoint: "/api/chat",
        model,
        messages: active.messages,
      });
      if (result) {
        const updated: Session = {
          ...active,
          topic: result.topic || active.topic,
          title: result.topic || active.title,
          facts: result.facts.map((text, i) => ({ id: `f_${i}_${Date.now()}`, text })),
          summary: result.summary,
        };
        upsertSession(updated);
        setSessions(loadSessions());
        setSelectedFact(null);
      }
    } finally {
      setRegen(false);
    }
  }

  function selectSession(id: string) {
    setActiveId(id);
    setCurrentSessionId(id);
    setSelectedFact(null);
  }

  return (
    <div className="px-6 md:px-12 py-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="label-mono mb-2">Conceptual Topology</div>
        <h1 className="serif italic text-5xl">Cognitive Maps</h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Each inquiry charted as a force-directed constellation. Drag nodes, scroll to zoom, click a fact to inspect.
        </p>
      </div>

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          {/* Session list */}
          <aside className="border border-border bg-card/30 rounded-sm p-3 h-fit md:sticky md:top-6">
            <div className="label-mono mb-2 px-1">Sessions</div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {sessions.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectSession(s.id)}
                    className={`w-full text-left px-2 py-2 rounded-sm transition-colors ${
                      isActive
                        ? "bg-background/60 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/30"
                    }`}
                  >
                    <div className="text-xs truncate flex items-center gap-2">
                      <Network size={12} className={isActive ? "text-gold" : ""} />
                      {s.title || "Untitled"}
                    </div>
                    <div className="label-mono text-[0.55rem] opacity-60 mt-0.5">
                      {s.facts.length} facts
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Detail */}
          <div className="space-y-5 min-w-0">
            {active && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="label-mono">Central Topic</div>
                    <h2 className="serif italic text-2xl gold-text">{active.topic || "—"}</h2>
                  </div>
                  <button
                    onClick={regenerate}
                    disabled={regen || active.messages.length === 0}
                    className="flex items-center gap-2 text-xs border border-gold/40 text-gold px-3 py-2 rounded-sm hover:bg-gold/10 disabled:opacity-40"
                  >
                    <RefreshCw size={12} className={regen ? "animate-spin" : ""} />
                    {regen ? "Charting…" : "Regenerate map"}
                  </button>
                </div>

                {active.facts.length === 0 ? (
                  <div className="border border-border bg-card/30 h-[420px] rounded-sm flex items-center justify-center text-sm text-muted-foreground">
                    No facts extracted yet — continue the conversation or click Regenerate.
                  </div>
                ) : (
                  <ForceGraph
                    topic={active.topic || active.title || "Inquiry"}
                    facts={active.facts.map((f) => f.text)}
                    onSelectFact={setSelectedFact}
                    selectedFact={selectedFact}
                  />
                )}

                {/* Fact inspector */}
                {selectedFact && (
                  <div className="border border-gold/30 bg-gold/5 rounded-sm p-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="label-mono text-gold/70 mb-1">Selected fact</div>
                      <p className="text-sm text-foreground/90 leading-relaxed">{selectedFact}</p>
                    </div>
                    <button
                      onClick={() => setSelectedFact(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <SectionSummaries summary={active.summary} factsCount={active.facts.length} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-border bg-card/30 rounded-sm p-12 text-center">
      <div className="serif text-5xl text-gold/40 mb-3">∅</div>
      <p className="serif italic text-xl">No sessions to chart yet.</p>
      <p className="text-sm text-muted-foreground mt-2">
        Start a conversation in <span className="text-gold/80">Intelligence</span> — facts will be extracted automatically and rendered here.
      </p>
    </div>
  );
}

function SectionSummaries({
  summary,
  factsCount,
}: {
  summary?: Session["summary"];
  factsCount: number;
}) {
  const cards = [
    { key: "synthesis", label: "Synthesis", text: summary?.synthesis },
    { key: "archives", label: "Archives", text: summary?.archives },
    { key: "vault", label: "Research Vault", text: summary?.vault },
    { key: "historical", label: "Historical Context", text: summary?.historical },
  ];
  const hasAny = cards.some((c) => c.text?.trim());
  if (!hasAny && factsCount === 0) return null;

  return (
    <div>
      <div className="label-mono mb-3">Cross-Section Summary</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.key} className="border border-border bg-card/30 rounded-sm p-4">
            <div className="serif italic text-lg gold-text mb-1">{c.label}</div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {c.text?.trim() || (
                <span className="text-muted-foreground/60 italic">No insight yet.</span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
