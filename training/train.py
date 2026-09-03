import os
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
import torch
from math import ceil
from transformers import (
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model
from model import load_model
from dataset import load_data, format_and_tokenize_phi
from config import *



torch.backends.cuda.matmul.allow_tf32 = True


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
    train_dataset = train_dataset.map(
        lambda x: format_and_tokenize_phi(x, tokenizer),
        batched=False
    )
    eval_dataset = eval_dataset.map(
        lambda x: format_and_tokenize_phi(x, tokenizer),
        batched=False
    )

    # ✅ Remove raw text columns — prevents tensorization crash
    train_dataset = train_dataset.remove_columns(["messages"])
    eval_dataset = eval_dataset.remove_columns(["messages"])

    # Convert to torch tensors
    train_dataset.set_format(type="torch")
    eval_dataset.set_format(type="torch")

    # ---------------------------
    # 4. DATA COLLATOR
    # ---------------------------
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
        pad_to_multiple_of=8
    )

    # ---------------------------
    # 5. TRAINING STEPS
    # ---------------------------
    total_steps = ceil(len(train_dataset) / BATCH_SIZE / GRAD_ACCUM) * EPOCHS
    warmup_steps = int(total_steps * 0.05)

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
        data_collator=data_collator
    )

    # ---------------------------
    # 8. TRAIN
    # ---------------------------
    import torch
    torch.cuda.empty_cache()
    trainer.train()


if __name__ == "__main__":
    main()