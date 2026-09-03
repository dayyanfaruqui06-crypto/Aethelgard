import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from qwythos_config import *


def load_model():
    # -----------------------------
    # NOTE on quantization: MODEL_NAME now points at an already-quantized
    # NF4 checkpoint (Qwythos-9B-NF4). Its config.json embeds its own
    # "quantization_config" block (bitsandbytes/nf4/double-quant), which
    # AutoModelForCausalLM.from_pretrained reads and applies automatically.
    # We deliberately do NOT construct a fresh BitsAndBytesConfig here —
    # these weights are already packed 4-bit tensors on disk, not fp16
    # weights waiting to be quantized at load time. Passing a duplicate/
    # separate quantization_config on top of an already-quantized
    # checkpoint is redundant and can conflict with the saved config.
    #
    # If you ever point MODEL_NAME back at a full-precision (fp16/bf16)
    # checkpoint, you'll need to reinstate an explicit BitsAndBytesConfig
    # and pass it as quantization_config= below.

    # -----------------------------
    # Tokenizer
    # -----------------------------
    # NOTE: use_fast=True is recommended for Qwen2.5-family checkpoints —
    # that's the tokenizer Qwen actually ships/tests against, and it's far
    # less likely to split special tokens like <|im_start|>, <think>,
    # </think> into multiple sub-pieces. If you have a specific reason to
    # keep use_fast=False, run the atomic-token check below FIRST and
    # confirm every special token still tokenizes to a single ID.
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME,
        use_fast=True,
        trust_remote_code=True
    )

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Training (and this repo's DataCollatorForSeq2Seq) expects right-padding.
    # Left-padding is a generation-time convention only — don't inherit
    # whatever the checkpoint's default happens to be.
    tokenizer.padding_side = "right"

    # -----------------------------
    # Sanity check: are special/chat tokens atomic?
    # -----------------------------
    # Run once and inspect the output before trusting offset-based masking
    # in dataset.py. If any of these print "SPLIT", either fix use_fast
    # above, or register the token via tokenizer.add_special_tokens and
    # resize model embeddings accordingly.
    _special_tokens_to_check = [
        "<|im_start|>", "<|im_end|>", "<think>", "</think>",
        "<|vision_start|>", "<|image_pad|>", "<|vision_end|>",
    ]
    for tok in _special_tokens_to_check:
        ids = tokenizer(tok, add_special_tokens=False)["input_ids"]
        status = "atomic" if len(ids) == 1 else "SPLIT — check tokenizer config"
        print(f"[tokenizer check] {tok!r} -> {ids} ({status})")

    # -----------------------------
    # Model — load onto CPU first
    # -----------------------------
    # Loading here does NOT require GPU compute: the checkpoint is already
    # quantized on disk (packed 4-bit tensors), so this is pure
    # deserialization, not the quantize-on-the-fly path. Keeping it on CPU
    # means the upcoming freeze + selective fp32 upcast happens in system
    # RAM (typically much roomier than 12GB VRAM) instead of on the GPU,
    # avoiding the transient double-buffer spike that OOM'd earlier.
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        device_map={"": "cpu"},
        trust_remote_code=True
    )

    # Keep model config's pad token in sync with the tokenizer — otherwise
    # generation/eval code can fall back to stale or None config values.
    model.config.pad_token_id = tokenizer.pad_token_id

    # -----------------------------
    # QLoRA prep (IMPORTANT) — selective upcast, done on CPU
    # -----------------------------
    # Same reasoning as before: only upcast small numerically-sensitive
    # norm params to fp32, leave the huge embed_tokens/lm_head in bf16.
    # Doing this on CPU means even the transient old+new tensor duplicate
    # during the dtype conversion is happening in system RAM, not VRAM.
    for name, param in model.named_parameters():
        param.requires_grad = False

    for name, param in model.named_parameters():
        if param.dtype in (torch.float16, torch.bfloat16):
            if "norm" in name.lower():
                param.data = param.data.to(torch.float32)

    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()
    else:
        def make_inputs_require_grad(module, input, output):
            output.requires_grad_(True)
        model.get_input_embeddings().register_forward_hook(make_inputs_require_grad)

    # -----------------------------
    # Move the already-prepared (and now smaller-footprint) model to GPU
    # -----------------------------
    # This is one steady, single-copy transfer of the final resident
    # size — no fp32-upcast spike happens here because that already
    # happened on CPU above. bitsandbytes Linear4bit layers correctly
    # move their packed weights + quant state along with everything else
    # via .to(), no requantization needed since data is already 4-bit.
    torch.cuda.empty_cache()
    model = model.to("cuda")

    # 🔥 CRITICAL VRAM SAVER
    model.gradient_checkpointing_enable()
    model.config.use_cache = False

    return model, tokenizer
