import os
from dataclasses import dataclass

from datasets import load_dataset
from peft import LoraConfig, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
    set_seed,
)


@dataclass
class Config:
    model_name: str = os.getenv("TRAIN_MODEL_NAME", "Salesforce/codegen-350M-mono")
    train_file: str = os.getenv("TRAIN_FILE", "data/codesearchnet/final/train.jsonl")
    val_file: str = os.getenv("VAL_FILE", "data/codesearchnet/final/val.jsonl")
    output_dir: str = os.getenv("OUTPUT_DIR", "training/output/codegen350m-lora")
    max_length: int = int(os.getenv("MAX_LENGTH", "512"))
    lr: float = float(os.getenv("LR", "2e-4"))
    epochs: float = float(os.getenv("EPOCHS", "2"))
    batch_size: int = int(os.getenv("BATCH_SIZE", "2"))
    grad_accum: int = int(os.getenv("GRAD_ACCUM", "8"))
    warmup_ratio: float = float(os.getenv("WARMUP_RATIO", "0.03"))
    logging_steps: int = int(os.getenv("LOGGING_STEPS", "20"))
    eval_steps: int = int(os.getenv("EVAL_STEPS", "200"))
    save_steps: int = int(os.getenv("SAVE_STEPS", "200"))
    warmup_steps: int = int(os.getenv("WARMUP_STEPS", "0"))
    max_steps: int = int(os.getenv("MAX_STEPS", "-1"))
    train_samples: int = int(os.getenv("TRAIN_SAMPLES", "0"))
    val_samples: int = int(os.getenv("VAL_SAMPLES", "0"))
    seed: int = int(os.getenv("SEED", "42"))


def format_example(prompt: str, completion: str) -> str:
    return f"{prompt}\n{completion}"


def main() -> None:
    cfg = Config()
    set_seed(cfg.seed)

    dataset = load_dataset(
        "json",
        data_files={"train": cfg.train_file, "validation": cfg.val_file},
    )

    tokenizer = AutoTokenizer.from_pretrained(cfg.model_name, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    def preprocess(batch):
        texts = [
            format_example(p, c)
            for p, c in zip(batch["prompt"], batch["completion"])
        ]
        return tokenizer(
            texts,
            truncation=True,
            max_length=cfg.max_length,
            padding="max_length",
        )

    tokenized = dataset.map(
        preprocess,
        batched=True,
        remove_columns=dataset["train"].column_names,
    )

    if cfg.train_samples > 0:
        tokenized["train"] = tokenized["train"].select(range(min(cfg.train_samples, len(tokenized["train"]))))
    if cfg.val_samples > 0:
        tokenized["validation"] = tokenized["validation"].select(
            range(min(cfg.val_samples, len(tokenized["validation"])))
        )

    model = AutoModelForCausalLM.from_pretrained(cfg.model_name)
    model.config.use_cache = False

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["qkv_proj", "out_proj", "fc_in", "fc_out"],
    )
    model = get_peft_model(model, lora_config)

    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    eval_strategy = "steps" if cfg.max_steps < 0 else "no"

    args = TrainingArguments(
        output_dir=cfg.output_dir,
        learning_rate=cfg.lr,
        num_train_epochs=cfg.epochs,
        max_steps=cfg.max_steps,
        per_device_train_batch_size=cfg.batch_size,
        per_device_eval_batch_size=cfg.batch_size,
        gradient_accumulation_steps=cfg.grad_accum,
        warmup_ratio=cfg.warmup_ratio if cfg.warmup_steps == 0 else 0.0,
        warmup_steps=cfg.warmup_steps,
        logging_steps=cfg.logging_steps,
        logging_first_step=True,
        eval_strategy=eval_strategy,
        eval_steps=cfg.eval_steps,
        save_steps=cfg.save_steps,
        save_total_limit=2,
        dataloader_pin_memory=False,
        dataloader_num_workers=0,
        use_cpu=True,
        fp16=False,
        bf16=False,
        report_to="none",
        remove_unused_columns=False,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        data_collator=collator,
    )

    trainer.train()
    trainer.save_model(cfg.output_dir)
    tokenizer.save_pretrained(cfg.output_dir)
    print(f"Done. LoRA adapter saved in: {cfg.output_dir}")


if __name__ == "__main__":
    main()
