import os
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


BASE_MODEL = os.getenv("INFER_BASE_MODEL", "Salesforce/codegen-350M-mono")
ADAPTER_DIR = os.getenv("INFER_ADAPTER_DIR", "training/output/codegen350m-lora")
PROMPT = os.getenv(
    "INFER_PROMPT",
    "Continue the following javascript code:\nfunction sum(a, b) {\n  return a + b"
)
MAX_NEW_TOKENS = int(os.getenv("INFER_MAX_NEW_TOKENS", "64"))
TEMPERATURE = float(os.getenv("INFER_TEMPERATURE", "0.2"))


def generate(model, tokenizer, prompt):
    inputs = tokenizer(prompt, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False if TEMPERATURE <= 0 else True,
            temperature=TEMPERATURE,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(out[0], skip_special_tokens=True)
    return text[len(prompt):].strip()


def main():
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base = AutoModelForCausalLM.from_pretrained(BASE_MODEL)
    lora = PeftModel.from_pretrained(base, ADAPTER_DIR)
    lora.eval()
    base.eval()

    base_out = generate(base, tokenizer, PROMPT)
    lora_out = generate(lora, tokenizer, PROMPT)

    print("=== PROMPT ===")
    print(PROMPT)
    print("\n=== BASE OUTPUT ===")
    print(base_out)
    print("\n=== LORA OUTPUT ===")
    print(lora_out)


if __name__ == "__main__":
    main()
