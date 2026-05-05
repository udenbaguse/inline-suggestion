# LoRA Finetune Template (CodeGen 350M)

Template ini memakai dataset final:

- `data/codesearchnet/final/train.jsonl`
- `data/codesearchnet/final/val.jsonl`

## 1) Install dependency

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r training/requirements.txt
```

## 2) Jalankan training

```powershell
$env:TRAIN_MODEL_NAME="Salesforce/codegen-350M-mono"
$env:TRAIN_FILE="data/codesearchnet/final/train.jsonl"
$env:VAL_FILE="data/codesearchnet/final/val.jsonl"
$env:OUTPUT_DIR="training/output/codegen350m-lora"
$env:MAX_LENGTH=512
$env:EPOCHS=2
$env:BATCH_SIZE=2
$env:GRAD_ACCUM=8
python training/train_lora_codegen.py
```

## 3) Output

Adapter LoRA disimpan di:

- `training/output/codegen350m-lora`

Kamu bisa lanjut merge adapter ke base model (opsional), atau load adapter saat inference.
