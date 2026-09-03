import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import prepare_model_for_kbit_training
from config import *


def load_model():

    # -----------------------------
    # 4-bit NF4 quantization (QLoRA)
    # -----------------------------
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True
    )

    # -----------------------------
    # Tokenizer
    # -----------------------------
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME,
        use_fast=False,
        trust_remote_code=True
    )

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # -----------------------------
    # Model
    # -----------------------------
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True
    )

    # -----------------------------
    # QLoRA prep (IMPORTANT)
    # -----------------------------
    model = prepare_model_for_kbit_training(model)

    # 🔥 CRITICAL VRAM SAVER
    model.gradient_checkpointing_enable()

    model.config.use_cache = False

    return model, tokenizer