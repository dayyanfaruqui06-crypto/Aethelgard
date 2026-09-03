import re
from datasets import load_dataset
from config import DATA_PATH, MAX_SEQ_LENGTH


# -----------------------------
# FORMAT FUNCTION
# -----------------------------
def format_phi(example, tokenizer=None):
    system = "You are a thoughtful and precise psychology assistant who explains concepts clearly and deeply."
    messages = example.get("messages", [])

    if len(messages) != 2:
        return {"text": ""}

    user = messages[0].get("content", "").strip()
    assistant = messages[1].get("content", "").strip()

    # Clean any leftover prefixes
    assistant = re.sub(r'^(A:|Assistant:)\s*', '', assistant)

    # EOS token for clean stopping
    eos = tokenizer.eos_token if tokenizer else ""

    # ✅ Correct Qwen/DeepSeek-R1 chat format
    text = (
         f"<|im_start|>system\n{system}<|im_end|>\n"
         f"<|im_start|>user\n{user}<|im_end|>\n"
         f"<|im_start|>assistant\n<think>\n\n</think>\n{assistant}<|im_end|>{eos}"
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
    length = len(tokenizer(formatted)["input_ids"])
    return length <= max_allowed


# -----------------------------
# TOKENIZATION
# -----------------------------
def format_and_tokenize_phi(example, tokenizer):
    formatted = format_phi(example, tokenizer)["text"]

    # Skip empty safely
    if not formatted:
        return {"input_ids": [], "labels": []}

    tokenized = tokenizer(
        formatted,
        truncation=True,
        max_length=MAX_SEQ_LENGTH,
        padding=False
    )

    input_ids = tokenized["input_ids"]
    labels = input_ids.copy()

    # ✅ Correct Qwen assistant token
    assistant_token = tokenizer(
        "<|im_start|>assistant",
        add_special_tokens=False
    )["input_ids"]

    def find_sublist(lst, sub):
        for i in range(len(lst) - len(sub) + 1):
            if lst[i:i+len(sub)] == sub:
                return i
        return -1

    start = find_sublist(labels, assistant_token)

    if start != -1:
        # Mask everything up to and including the assistant tag
        for i in range(start + len(assistant_token)):
            if i < len(labels):
                labels[i] = -100
    else:
        # If assistant token not found, mask everything (skip sample)
        labels = [-100] * len(labels)

    return {
        "input_ids": input_ids,
        "labels": labels
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
    print(f"Train: {before_train} → {after_train}")
    print(f"Test : {before_test} → {after_test}")
    print("========================")
    print("\n===== SAMPLE =====")
    print(dataset["train"][0])
    print("==================\n")

    return dataset