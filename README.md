# SmartEval

**AI-Assisted Evaluation of Handwritten Answer Scripts using Handwriting Recognition and Semantic Similarity**

![Status](https://img.shields.io/badge/status-proposal-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> Sahyadri College of Engineering & Management, Mangaluru
> Department of Computer Science & Engineering (AI & ML)
> Mini-Project Poster Presentation · 16 October 2026 · Application-Oriented Product

---

## Overview

SmartEval is a lecturer-in-the-loop web application that reads photographed
handwritten answer scripts, compares each answer against an uploaded answer key
using **semantic similarity**, and proposes marks. Anything the system is unsure
about is flagged for human review instead of being auto-graded.

The lecturer stays the final authority: the tool drafts, the lecturer decides.

---

## Problem Statement

- Faculty manually evaluate hundreds of CIE/SEE answer books every exam cycle —
  slow, repetitive, high-effort work.
- Long evaluation hours cause fatigue, leading to **inconsistent scoring** across
  scripts and across evaluators.
- Manual evaluation creates **long delays** in result processing, affecting
  students and academic timelines.
- Existing digital evaluation tools **cannot read free-hand handwriting** and
  offer **no lecturer-controlled assistance**.

**Need:** an AI-assisted system that digitizes handwritten answer books from
simple photographs, compares answers with the official answer key, suggests
scores, and flags only ambiguous cases for human review.

---

## Objectives

1. Build a handwriting recognition pipeline using pre-trained **TrOCR**
   (transformer OCR) to digitize handwritten answers from answer-book photographs.
2. Compute **semantic similarity** between extracted student answers and model
   answers using sentence embeddings, and map similarity scores to provisional marks.
3. Implement **lecturer-configurable tolerance levels** (subject-wise) plus a
   **human-in-the-loop** review interface that flags low-confidence OCR outputs
   and borderline answers for manual verification.
4. Generate a consolidated digital **marksheet (CSV)** from the evaluated scripts.
5. Validate the system on **OCR accuracy** and on **agreement of suggested scores
   with faculty-given marks**.

---

## Proposed Methodology

```
Answer Key / Schema            Photograph Answer Book        OpenCV Preprocessing
(subject, questions,   --->    (using smartphone      --->   (region / line
 model answers)                 camera)                        cropping)
                                                                     |
                                                                     v
                                                              TrOCR Handwriting
                                                              Recognition
                                                              (transformer-based OCR)
                                                                     |
                                                                     v
                                                              Sentence Embeddings
                                                              (student vs model answer)
                                                                     |
                                                                     v
                                                              Similarity
                                                              (cosine similarity)
                                                                     |
                                                                     v
                                                              Provisional Score
                                                              (tolerance-based)
                                                                     |
                                                                     v
                                                    +--------------------------------+
                                                    |  Low confidence / borderline?  |
                                                    +--------------------------------+
                                                       |                        |
                                                    YES |                        | NO
                                                       v                        v
                                              +------------------+     +---------------------+
                                              |  Flag for Human  |     | Accept Provisional  |
                                              |     Review       |     |       Score         |
                                              +------------------+     +---------------------+
                                                       |                        |
                                                       +-----------+------------+
                                                                   v
                                                      CSV Marksheet Export
                                          (lecturer reviews flagged cases & approves
                                                   the final marksheet)
```

### Notes on the design

- **Paraphrases are handled** because similarity is *semantic*, not exact word
  matching — a correctly reworded answer still scores well.
- **Diagrams and equations are always flagged for human review** and are never
  auto-graded.

---

## System Design (3-Tier Architecture)

### 1. Presentation Layer — Streamlit Web App

- Answer-key upload
- Photo upload
- Tolerance sliders (subject-wise)
- Review dashboard
- Marksheet export

*Flow:* lecturer uploads the key once, reviews flagged answers, approves the
final marks.

### 2. Processing Layer — AI Pipeline

| Stage | Component |
| --- | --- |
| 1 | **OpenCV** — preprocessing (deskew, binarize, line/region cropping) |
| 2 | **TrOCR** — handwriting recognition (Hugging Face) |
| 3 | **Sentence-Transformers** — embeddings for student and model answers |
| 4 | **Cosine Similarity** — semantic comparison |
| 5 | **Tolerance-based Scoring** — similarity → provisional marks |

### 3. Data Layer

- **SQLite** — evaluation records, review flags
- **pandas** — marksheet generation
- **Photos + Answer Keys** — stored on disk

---

## Tech Stack

| Category | Tools |
| --- | --- |
| Language | Python 3.10+ |
| Deep learning | PyTorch |
| OCR | TrOCR (Hugging Face `transformers`) |
| Embeddings | Sentence-Transformers (Sentence-BERT) |
| Image processing | OpenCV |
| Web UI | Streamlit |
| Storage | SQLite, pandas |
| Hardware | Standard laptop CPU (GPU optional) + smartphone camera |

---

## Expected Outcomes

- A working prototype web application: the lecturer uploads the answer key once,
  photographs each answer book, and receives suggested scores per answer with
  unclear cases flagged for review.
- Final marks exported as a **digital marksheet (CSV)**, reducing manual effort
  while keeping grading fair, consistent, and auditable.
- **Measurable evaluation:** OCR accuracy via character error rate (CER) and
  agreement of suggested scores with faculty-given marks over the collected dataset.
- Extensible to coaching centres and competitive-exam evaluation cells for
  faster, more consistent results.

---

## Evaluation Metrics

| Metric | What it measures |
| --- | --- |
| **CER** (Character Error Rate) | Handwriting recognition quality |
| **Score agreement** (suggested vs faculty) | Reliability of the provisional scoring |
| **Flag rate** | Share of answers routed to human review |
| **Review time saved** | Practical impact on evaluation workload |

---

## Project Structure (planned)

```
smartEval/
├── app.py                  # Streamlit entry point
├── src/
│   ├── preprocessing.py    # OpenCV: deskew, crop, binarize
│   ├── ocr.py              # TrOCR inference wrapper
│   ├── embeddings.py       # Sentence-Transformer encoding
│   ├── scoring.py          # Cosine similarity + tolerance mapping
│   ├── database.py         # SQLite access layer
│   └── export.py           # pandas CSV marksheet generation
├── data/
│   ├── answer_keys/        # Uploaded model answers
│   └── scripts/            # Captured answer-book images
├── tests/
├── requirements.txt
└── README.md
```

---

## Getting Started

> The implementation is in progress; the commands below reflect the intended setup.

```bash
# 1. Clone
git clone https://github.com/Mitrakulal/smartEval.git
cd smartEval

# 2. Create an environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux / macOS

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
streamlit run app.py
```

Expected core dependencies:

```
torch
transformers
sentence-transformers
opencv-python
streamlit
pandas
pillow
```

---

## Team

| Name | USN | Role |
| --- | --- | --- |
| Mitra Kulal | 4SF24CI085 | Team Leader |
| Sanvil S Bhandary | 4SF24CI146 | Team Member |
| Vikas Tharanath Shettigar | 4SF24CI185 | Team Member |
| Puneet K C | 4SF34CI129 | Team Member |

**Guide:** Ms. Shreekshitha
**Domain:** Artificial Intelligence — Computer Vision & Natural Language Processing

---

## References

1. M. Li et al., "TrOCR: Transformer-based Optical Character Recognition with
   Pre-trained Models," arXiv:2109.10282, 2021.
2. N. Reimers, I. Gurevych, "Sentence-BERT: Sentence Embeddings using Siamese
   BERT-Networks," EMNLP-IJCNLP, 2019.
3. R. Smith, "An Overview of the Tesseract OCR Engine," ICDAR, 2007.
4. M. D. Shermis & J. Burstein (Eds.), *Handbook of Automated Essay Scoring*,
   Routledge, 2013.

---

## License

Released under the MIT License. See `LICENSE` for details.
