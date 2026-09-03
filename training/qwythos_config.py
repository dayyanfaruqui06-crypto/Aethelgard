MODEL_NAME = "/home/dayyan/tf-gpu/dl/N.L.P/cog_psychology/models/Qwythos-9B-NF4"

DATA_PATH = "the_last_and_final_updated.jsonl"
OUTPUT_DIR = "/home/dayyan/tf-gpu/dl/N.L.P/cog_psychology/models/tensor/run_v2_empathy/qwythos"

MAX_SEQ_LENGTH = 600   # reduced for VRAM safety

BATCH_SIZE = 1
GRAD_ACCUM = 4

EPOCHS = 3
LEARNING_RATE = 2e-5

LORA_R = 16              # reduced
LORA_ALPHA = 32
LORA_DROPOUT = 0

WARMUP_RATIO = 0.05
LOGGING_STEPS = 10

SAVE_STRATEGY = "steps"
SAVE_STEPS = 100       # checkpoint every 200 steps
SAVED_TENSORS_DIR = "/home/dayyan/tf-gpu/dl/N.L.P/cog_psychology/models/tensor"
