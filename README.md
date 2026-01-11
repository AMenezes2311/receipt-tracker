## 🧾 Project Overview

This project is a **full-stack web application** built with **Next.js** and **Supabase** that uses **AI-powered document understanding** to transform receipt photos into structured transaction data. The application focuses on accuracy, privacy, and usability, enabling users to review and manage extracted financial information with confidence.

---

## 🧠 Key Features

- **AI-Powered Receipt Parsing**  
  Automatically extracts merchant name, date, category, and amount from receipt images using AI-based image understanding and text extraction.

- **Secure Authentication & Authorization**  
  Implements secure user authentication, ensuring each user can only access their own data.

- **Private Image Storage**  
  Receipt images are stored privately per user using Supabase storage, protecting sensitive financial information.

- **Human-in-the-Loop Corrections**  
  Users can review, edit, and correct extracted transaction details, improving reliability and transparency.

- **Transaction History & Management**  
  Provides a structured transaction history interface where users can filter, update, and manage past receipts.

---

## 🔁 Application Flow

1. User authenticates and uploads a receipt image  
2. AI extracts structured transaction fields  
3. Data is stored securely in the database  
4. User reviews and edits extracted information  
5. Transactions are saved and displayed in history view  

---

## 🛠️ Tech Stack

- **Frontend:** Next.js, React, TypeScript  
- **Backend:** Supabase (Auth, Database, Storage)  
- **AI / Data Processing:** AI-based OCR and information extraction  
- **Focus Areas:** Security, data privacy, usability, reliability

---

## 🔐 Privacy & Security Notes

- Receipt images are stored in **private, user-scoped buckets**.
- Sensitive data access is restricted through row-level security policies.
- No financial data is shared across users.

##📜 License & Usage Modification: Not permitted.

Redistribution: Only allowed with proper attribution and without any changes to the original files.

Commercial Use: Only with prior written consent.

📌 Attribution All credits for the creation, design, and development of this project go to:

Andre Menezes 📧 Contact: andremenezes231@hotmail.com 🌐 Website: https://andremenezes.dev

If this project is used, cited, or referenced in any form (including partial code, design elements, or documentation), you must provide clear and visible attribution to the original author(s).

⚠️ Disclaimer This project is provided without any warranty of any kind, either expressed or implied. Use at your own risk.

📂 File Integrity Do not alter, rename, or remove any files, directories, or documentation included in this project. Checksum or signature verification may be used to ensure file authenticity.

© 2025 Andre Menezes. All Rights Reserved.
