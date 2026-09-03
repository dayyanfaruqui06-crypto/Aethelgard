// Parses structured model output with labelled sections into typed fields.
// Two modes:
//   parseStructuredOutput()  — final parse after stream ends (full accuracy)
//   parseStreamingOutput()   — live parse while streaming (tolerates partial text)

export type ParsedConfidence = {
  label: string;
  level: number; // 0–100
  note: string;
};

export type ParsedOutput = {
  facts: string[];
  reasoning: string;
  reasoningHighlight: string;
  otherExplanations: string[];
  inPractice: string;
  confidence: ParsedConfidence | null;
  answer: string;
  isStructured: boolean;
};

const CONFIDENCE_LEVELS: Record<string, number> = {
  "very low": 10,
  "low": 20,
  "moderate": 55,
  "medium": 55,
  "high": 80,
  "very high": 95,
};

function confidenceLevel(label: string): number {
  const key = label.toLowerCase().trim();
  for (const [k, v] of Object.entries(CONFIDENCE_LEVELS)) {
    if (key.includes(k)) return v;
  }
  return 50;
}

function extractHighlight(reasoning: string): string {
  const sentences = reasoning.split(/(?<=[.!?])\s+/);
  const markers = [/aligns with/i, /suggests/i, /indicates/i, /consistent with/i, /explains/i, /because/i, /key/i];
  for (const s of sentences) {
    if (markers.some((m) => m.test(s)) && s.length > 30) return s.trim();
  }
  return "";
}

function parseFacts(raw: string): string[] {
  return raw
    .split(/\n|\s*\|\s*-\s*|\s+-\s+/)
    .map((l) => l.replace(/^[-\u2013\u2014\u2022*\d.]+\s*/, "").trim())
    .filter((l) => l.length > 2);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*\|\s*/gm, "")
    .replace(/\s*\|\s*$/gm, "")
    .trim();
}

function parseOtherExplanations(raw: string): string[] {
  if (!raw.trim()) return [];

  // Split by newline, merge "Name\n  Explanation: text" into "Name: text"
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  let current = "";

  for (const line of lines) {
    if (/^Explanation:\s*/i.test(line)) {
      // Append explanation to the current name
      const explanation = line.replace(/^Explanation:\s*/i, "").trim();
      current = current ? current + ": " + explanation : explanation;
    } else {
      // New pattern name — save previous if exists
      if (current) items.push(current.trim());
      current = line;
    }
  }
  if (current.trim()) items.push(current.trim());

  return items.filter((s) => s.length > 2);
}

function parseConfidence(raw: string): ParsedConfidence | null {
  if (!raw.trim()) return null;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const label = lines[0];
  const rest = lines.slice(1).join(" ").replace(/^Rationale:\s*/i, "").trim();
  return { label, level: confidenceLevel(label), note: rest };
}

function buildSections(text: string) {
  const sectionRe =
    /\*?\*?(Facts|Reasoning|Other possible explanations|Confidence|In practice)\*?\*?[^:\n]*:/gi;
  const sections: { name: string; start: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(text)) !== null) {
    const raw = m[1].toLowerCase().trim();
    const name =
      raw.startsWith("other") ? "other" :
      raw.startsWith("in practice") ? "inpractice" :
      raw;
    sections.push({ name, start: m.index, contentStart: m.index + m[0].length });
  }
  return sections;
}

function getSection(
  text: string,
  sections: ReturnType<typeof buildSections>,
  name: string,
): string {
  const idx = sections.findIndex((x) => x.name === name);
  if (idx === -1) return "";
  const start = sections[idx].contentStart;
  const end = idx + 1 < sections.length ? sections[idx + 1].start : text.length;
  return text.slice(start, end).trim();
}

// ── Final parse (called once stream ends) ────────────────────────────────────

export function parseStructuredOutput(raw: string): ParsedOutput {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  console.log("parseStructuredOutput called, text length:", text.length);
  console.log("first 200 chars:", text.slice(0, 200));

  const hasStructure =
    /\*?\*?Facts\*?\*?[^:\n]*:/i.test(text) || /\*?\*?Reasoning\*?\*?[^:\n]*:/i.test(text);

  if (!hasStructure) {
    return {
      facts: [],
      reasoning: "",
      reasoningHighlight: "",
      otherExplanations: [],
      inPractice: "",
      confidence: null,
      answer: text,
      isStructured: false,
    };
  }

  const sections = buildSections(text);
  const factsRaw      = stripMarkdown(getSection(text, sections, "facts"));
  const reasoningRaw  = stripMarkdown(getSection(text, sections, "reasoning"));
  const otherRaw      = stripMarkdown(getSection(text, sections, "other"));
  console.log("OTHER RAW:", JSON.stringify(otherRaw));
console.log("OTHER ITEMS:", JSON.stringify(parseOtherExplanations(otherRaw)));
  const confidenceRaw = stripMarkdown(getSection(text, sections, "confidence"));
  const inPracticeRaw = stripMarkdown(getSection(text, sections, "inpractice"));

  const firstSection = sections[0];
  const lastSection  = sections[sections.length - 1];
  const beforeFirst  = firstSection ? text.slice(0, firstSection.start).trim() : "";
  const afterLast    = lastSection
    ? text.slice(lastSection.contentStart + getSection(text, sections, lastSection.name).length).trim()
    : "";
  const answer = [beforeFirst, afterLast].filter(Boolean).join("\n\n").trim();

  const parsed: ParsedOutput = {
    facts:              parseFacts(factsRaw),
    reasoning:          reasoningRaw,
    reasoningHighlight: extractHighlight(reasoningRaw),
    otherExplanations:  parseOtherExplanations(otherRaw),
    inPractice:         inPracticeRaw,
    confidence:         parseConfidence(confidenceRaw),
    answer:             answer.length > 10 ? answer : "",
    isStructured:       true,
  };

  console.log("parseStructuredOutput result:", JSON.stringify({
    factsCount:      parsed.facts.length,
    reasoningLength: parsed.reasoning.length,
    otherCount:      parsed.otherExplanations.length,
    inPracticeLen:   parsed.inPractice.length,
    confidence:      parsed.confidence,
    answerLength:    parsed.answer.length,
  }));

  return parsed;
}

// ── Streaming parse (called on every delta — tolerates partial text) ─────────

export function parseStreamingOutput(acc: string): ParsedOutput {
  const text = acc.replace(/<think>[\s\S]*?<\/think>/g, "");

  const hasStructure =
    /\*?\*?Facts\*?\*?[^:\n]*:/i.test(text) || /\*?\*?Reasoning\*?\*?[^:\n]*:/i.test(text);

  if (!hasStructure) {
    return {
      facts: [],
      reasoning: "",
      reasoningHighlight: "",
      otherExplanations: [],
      inPractice: "",
      confidence: null,
      answer: text.trim(),
      isStructured: false,
    };
  }

  const sections      = buildSections(text);
  const factsRaw      = stripMarkdown(getSection(text, sections, "facts"));
  const reasoningRaw  = stripMarkdown(getSection(text, sections, "reasoning"));
  const otherRaw      = stripMarkdown(getSection(text, sections, "other"));
  const confidenceRaw = stripMarkdown(getSection(text, sections, "confidence"));
  const inPracticeRaw = stripMarkdown(getSection(text, sections, "inpractice"));

  const firstSection = sections[0];
  const beforeFirst  = firstSection ? text.slice(0, firstSection.start).trim() : "";

  return {
    facts:              parseFacts(factsRaw),
    reasoning:          reasoningRaw,
    reasoningHighlight: reasoningRaw.length > 120 ? extractHighlight(reasoningRaw) : "",
    otherExplanations:  otherRaw ? parseOtherExplanations(otherRaw) : [],
    inPractice:         inPracticeRaw,
    confidence:         confidenceRaw.trim() ? parseConfidence(confidenceRaw) : null,
    answer:             beforeFirst,
    isStructured:       true,
  };
}