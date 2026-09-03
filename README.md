# Structured Reasoning Under Uncertainty — QLoRA Fine-Tuned 7B Model

An independent project fine-tuning **DeepSeek-R1-Distill-Qwen-7B** via QLoRA to produce structured,
multi-part psychological reasoning outputs — running **fully offline** on consumer hardware.

Built by Dayyan Faruqui, BTech 3rd Year (ECE), Nirma University — no institutional affiliation or lab access.

---

## What it does

Given a messy, emotional, first-person statement, the model returns a structured five-block response:

1. **Facts** — only what is explicitly stated, zero assumptions
2. **Reasoning** — psychological analysis grounded in a named theory or mechanism
3. **Other Possible Explanations** — genuinely distinct alternative frameworks
4. **Confidence** — declared explicitly (High / Medium / Low) with a rationale
5. **In Practice** — one concrete, actionable step

This is framed as an **engineering / applied-ML project**, not a clinical tool. No claim is made about
therapeutic efficacy or diagnostic validity.

---

## Why offline-only

A core design constraint: cognitive and introspective data should never leave the user's device. The
entire system — model, backend, and frontend — runs locally with no cloud dependency.

---

## Architecture

| Layer | Stack |
|---|---|
| Model | DeepSeek-R1-Distill-Qwen-7B, QLoRA (4-bit NF4, double quantization) |
| Backend | FastAPI (port 8000) — model loading, ChatML construction, streaming inference |
| Frontend | Vite + React + TanStack Router (port 8080) |
| Auth / sessions | Supabase |
| Hardware used | NVIDIA RTX 3060, 12GB VRAM |

LoRA target modules: `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj` (embeddings excluded after an
earlier configuration caused overfitting and phrase repetition).

---

## Dataset

- ~2,700 synthetic samples, generated via iterative prompt engineering across ~15 dataset versions
- 275 empathy-forward samples from [EmpatheticDialogues](https://arxiv.org/abs/1811.00207) (Rashkin et al., 2019), added after early models showed flat affect
- All training inputs are raw, emotionally confused first-person statements — not structured self-reports
- No real user data used; synthetically generated to avoid consent/privacy concerns at this stage

## Known limitations

- Prompt templates across the 15 iterations were not version-controlled — reproducibility is limited
- No expert clinical review of generated samples
- Single hardware configuration tested (RTX 3060 12GB)
- No input-type classifier to route off-domain, ambiguous-distress, or crisis inputs before inference

---

## Evaluation summary

Benchmarked on 26 prompts across 7 categories, scored by two independent LLM judges on a fixed rubric.

- **Format adherence:** 23/23 (100%) on non-crisis prompts — the five-block structure is genuinely learned into weights, not a prompted surface behavior
- **Confidence calibration finding:** every non-crisis output returned `Medium` confidence, including prompts designed to elicit `Low` — the confidence *label* is currently a learned default, not calibrated to input characteristics (the accompanying rationale text is still informative)
- **Fine-tuning's actual contribution** (vs. base model + system prompt): generation discipline and reasoning specificity — clean termination, no looping, no content contamination, and mechanism-grounded reasoning rather than generic labels

Full baseline comparison and category breakdown: see [`/docs/technical-report.pdf`](./docs/technical-report.pdf).

---

## ⚠️ Crisis input handling

Three suicidal-ideation test inputs produced standard structured-reasoning output with **no recognition
of elevated risk** in the base fine-tuned model. This is documented as an empirical finding, not glossed over.

**Remediation implemented:** a pre-inference keyword filter now bypasses the model entirely for flagged
inputs and returns a crisis-helpline response (KIRAN Mental Health Helpline: **1800-599-0019**) instead of
structured analysis. The filter is intentionally conservative — false positives are preferred over false
negatives.

This tool is **not** a diagnostic or therapeutic instrument and has not been reviewed by a clinical
psychologist or psychiatrist.

---

## Getting started

```bash
# clone
git clone https://github.com/<dayyanfaruqui06-crypto>/<Aethelgard>.git
cd <your-repo>

# backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# frontend
cd ../frontend
npm install
npm run dev
```

---

## Open questions / next steps

- Ablation on reasoning-shuffled data to separate genuine reasoning from format mimicry
- Scaling relationship between model size, LoRA target-module count, and minimum viable dataset size
- Whether R1-Distill's distillation residue outperforms comparable base models (Mistral-7B, Qwen2.5-7B) in a think-suppressed configuration
- Replacing the qualitative confidence label with a **split conformal prediction** layer using the benchmark set as calibration data

---

## Disclaimer

This is a research/engineering prototype built independently, without clinical review. It is not a
medical device, diagnostic tool, or substitute for professional mental health support.
