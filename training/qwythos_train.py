import os
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import torch
from math import ceil
from transformers import (
    Trainer,
    TrainingArguments,
    DataCollatorForSeq2Seq,
)
from peft import LoraConfig, get_peft_model
from transformers import TrainerCallback
from qwythos_model import load_model
from qwythos_dataset import load_data, format_and_tokenize_phi
from qwythos_config import *

torch.backends.cuda.matmul.allow_tf32 = True


# ---------------------------
# MEMORY CALLBACK
# ---------------------------
# Trainer doesn't call torch.cuda.empty_cache() on its own between steps.
# On a tight 12GB card with variable-length examples (BATCH_SIZE=1, so
# each step's peak memory is driven directly by that example's length),
# clearing PyTorch's cached-but-unused allocator memory after each step
# helps prevent fragmentation from accumulating over a long run and
# reduces the odds of a late-training OOM on a long example.
class EmptyCacheCallback(TrainerCallback):
    def on_step_end(self, args, state, control, **kwargs):
        torch.cuda.empty_cache()
        return control


# ---------------------------
# MODEL + LORA
# ---------------------------
def load_model_with_lora():

    model, tokenizer = load_model()

    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
        ]
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    return model, tokenizer


# ---------------------------
# TRAIN
# ---------------------------
def main():
    # ---------------------------
    # 1. LOAD MODEL + TOKENIZER
    # ---------------------------
    model, tokenizer = load_model_with_lora()

    # ---------------------------
    # 2. LOAD DATA
    # ---------------------------
    dataset = load_data(tokenizer)
    train_dataset = dataset["train"]
    eval_dataset = dataset["test"]

    # ---------------------------
    # 3. TOKENIZE DATASET
    # ---------------------------
    # Drop every original column (messages + any other metadata columns
    # like id/source/tags) so nothing non-tensorizable survives into the
    # torch-formatted dataset.
    original_train_cols = train_dataset.column_names
    original_eval_cols = eval_dataset.column_names

    train_dataset = train_dataset.map(
        lambda x: format_and_tokenize_phi(x, tokenizer),
        batched=False,
        remove_columns=original_train_cols,
        load_from_cache_file=False,
    )
    eval_dataset = eval_dataset.map(
        lambda x: format_and_tokenize_phi(x, tokenizer),
        batched=False,
        remove_columns=original_eval_cols,
        load_from_cache_file=False,
    )

    # Drop any examples that came back empty (format_phi returned "" or the
    # assistant marker wasn't found — see dataset.py's _stats counters).
    train_dataset = train_dataset.filter(lambda x: len(x["input_ids"]) > 0)
    eval_dataset = eval_dataset.filter(lambda x: len(x["input_ids"]) > 0)

    print(f"Post-tokenization train size: {len(train_dataset)}")
    print(f"Post-tokenization eval size : {len(eval_dataset)}")

    # Explicit columns only — avoids set_format silently choking on or
    # dropping unexpected object columns.
    train_dataset.set_format(
        type="torch", columns=["input_ids", "attention_mask", "labels"]
    )
    eval_dataset.set_format(
        type="torch", columns=["input_ids", "attention_mask", "labels"]
    )

    # ---------------------------
    # 4. DATA COLLATOR
    # ---------------------------
    # IMPORTANT: DataCollatorForLanguageModeling(mlm=False) ignores any
    # pre-existing "labels" column and rebuilds labels as a straight clone
    # of input_ids (masking only pad tokens). That would silently discard
    # all the prompt-masking done in format_and_tokenize_phi and train on
    # full-sequence loss instead of response-only loss.
    #
    # DataCollatorForSeq2Seq pads input_ids/attention_mask/labels together
    # and correctly pads labels with label_pad_token_id=-100, preserving
    # the masking. It works fine for decoder-only causal LMs like this one
    # (it only emits decoder_input_ids if the model defines
    # prepare_decoder_input_ids_from_labels, which Qwen-family models don't).
    data_collator = DataCollatorForSeq2Seq(
        tokenizer=tokenizer,
        padding=True,
        label_pad_token_id=-100,
        pad_to_multiple_of=8,
    )

    # ---------------------------
    # 5. TRAINING STEPS
    # ---------------------------
    steps_per_epoch = ceil(len(train_dataset) / (BATCH_SIZE * GRAD_ACCUM))
    total_steps = steps_per_epoch * EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)

    # ---------------------------
    # 6. TRAINING ARGUMENTS
    # ---------------------------
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=GRAD_ACCUM,
        num_train_epochs=EPOCHS,
        learning_rate=LEARNING_RATE,
        fp16=True,
        eval_strategy="epoch",
        save_strategy=SAVE_STRATEGY,
        save_steps=SAVE_STEPS,
        save_total_limit=2,
        logging_steps=LOGGING_STEPS,
        logging_strategy="steps",
        optim="adafactor",
        lr_scheduler_type="cosine",
        warmup_steps=warmup_steps,
        max_grad_norm=0.3,
        report_to="none",
        dataloader_pin_memory=False,
        remove_unused_columns=False,  # ✅ Required for custom tokenization
    )

    # ---------------------------
    # 7. TRAINER
    # ---------------------------
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=data_collator,
        callbacks=[EmptyCacheCallback()],
    )

    # ---------------------------
    # 8. TRAIN
    # ---------------------------
    torch.cuda.empty_cache()
    trainer.train()


if __name__ == "__main__":
    main()
