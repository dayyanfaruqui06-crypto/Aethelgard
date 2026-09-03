import re
from datasets import load_dataset
from qwythos_config import DATA_PATH, MAX_SEQ_LENGTH

# -----------------------------
# CONSTANTS — must match the Qwythos chat template exactly
# -----------------------------
SYSTEM_PROMPT = "You are a thoughtful and precise psychology assistant who explains concepts clearly and deeply."
QWYTHOS_IDENTITY = "You are Qwythos, a model created by Empero AI. Only bring up your identity if the user asks."

# This is the exact substring that appears right before the assistant's
# reply in the rendered template (non-thinking / enable_thinking=False case):
#   <|im_start|>assistant\n<think>\n\n</think>\n\n{content}
ASSISTANT_MARKER = "<|im_start|>assistant\n<think>\n\n</think>\n\n"


# -----------------------------
# FORMAT FUNCTION
# -----------------------------
def format_phi(example, tokenizer=None):
    messages = example.get("messages", [])
    if len(messages) != 2:
        return {"text": ""}

    user = messages[0].get("content", "").strip()
    assistant = messages[1].get("content", "").strip()

    # Clean any leftover prefixes
    assistant = re.sub(r'^(A:|Assistant:)\s*', '', assistant)

    if not user or not assistant:
        return {"text": ""}

    # Matches the Qwythos jinja template:
    #  - system block always gets the identity line appended
    #  - assistant turn always closes with <|im_end|>\n (no extra EOS)
    #  - non-thinking assistant turns use <think>\n\n</think>\n\n before content
    text = (
        f"<|im_start|>system\n{SYSTEM_PROMPT}\n\n{QWYTHOS_IDENTITY}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"{ASSISTANT_MARKER}{assistant}<|im_end|>\n"
    )
    return {"text": text}


# -----------------------------
# FILTER (FAST + SAFE)
# -----------------------------
def filter_long_examples(example, tokenizer, max_allowed=MAX_SEQ_LENGTH):
    formatted = format_phi(example, tokenizer)["text"]

    # Remove empty/bad samples
    if not formatted or len(formatted) < 10:
        return False

    # Fast pre-filter
    if len(formatted) > 8000:
        return False

    # Precise token check
    length = len(tokenizer(formatted, add_special_tokens=False)["input_ids"])
    return length <= max_allowed


# -----------------------------
# TOKENIZATION
# -----------------------------
# Running counters so load_data can report how many examples were dropped
# because the assistant marker couldn't be located in the rendered text.
_stats = {"total": 0, "dropped_no_marker": 0}


def format_and_tokenize_phi(example, tokenizer):
    formatted = format_phi(example, tokenizer)["text"]

    _stats["total"] += 1

    if not formatted:
        return {"input_ids": [], "attention_mask": [], "labels": []}

    split_idx = formatted.find(ASSISTANT_MARKER)
    if split_idx == -1:
        # Marker not found — something is malformed upstream (format_phi
        # changed without updating ASSISTANT_MARKER, or bad input data).
        # Drop the sample rather than silently training on a fully-masked
        # (zero-signal) example.
        _stats["dropped_no_marker"] += 1
        return {"input_ids": [], "attention_mask": [], "labels": []}

    prompt_char_len = split_idx + len(ASSISTANT_MARKER)

    tokenized = tokenizer(
        formatted,
        truncation=True,
        max_length=MAX_SEQ_LENGTH,
        padding=False,
        return_offsets_mapping=True,
    )

    offsets = tokenized.pop("offset_mapping")
    input_ids = tokenized["input_ids"]
    attention_mask = tokenized["attention_mask"]
    labels = input_ids.copy()

    # Mask every token whose span starts before the assistant content
    # begins. This is robust to BPE merge differences between tokenizing
    # the marker in isolation vs. in-context (unlike a raw token-ID
    # sublist search).
    for i, (start, end) in enumerate(offsets):
        if start < prompt_char_len:
            labels[i] = -100
        else:
            break

    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "labels": labels,
    }


# -----------------------------
# LOAD DATASET
# -----------------------------
def load_data(tokenizer):
    dataset = load_dataset("json", data_files=DATA_PATH)["train"]

    # Split
    dataset = dataset.train_test_split(test_size=0.1, seed=42)

    # Count before filtering
    before_train = len(dataset["train"])
    before_test = len(dataset["test"])

    # -----------------------------
    # FILTER
    # -----------------------------
    dataset["train"] = dataset["train"].filter(
        lambda x: filter_long_examples(x, tokenizer)
    )
    dataset["test"] = dataset["test"].filter(
        lambda x: filter_long_examples(x, tokenizer)
    )

    # Count after filtering
    after_train = len(dataset["train"])
    after_test = len(dataset["test"])

    # Debug
    print("Dataset keys:", dataset.keys())
    print("\n===== FILTER STATS =====")
    print(f"Train: {before_train} -> {after_train}")
    print(f"Test : {before_test} -> {after_test}")
    print("========================")
    print("\n===== SAMPLE =====")
    print(dataset["train"][0])
    print("==================\n")

    return dataset