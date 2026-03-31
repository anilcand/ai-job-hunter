# 🚀 AI Job Hunter (Autonomous HR Assistant)

An autonomous, cloud-based job-hunting assistant built with **Google Apps Script** and the **Google Gemini AI API**. 

Instead of manually sifting through hundreds of daily job alerts and career site updates, this autonomous agent scans incoming emails, scrapes targeted company career pages, evaluates the job descriptions against my personal CV using AI, and logs high-matching opportunities directly into a Google Sheet.

## 🧠 Why I Built This
As a data-driven professional passionate about **process optimization, data analysis, and HR IT systems**, I believe in letting technology handle repetitive tasks. This project demonstrates my ability to:
- Identify process bottlenecks (manual job searching).
- Design and deploy cloud-based automation (Google Apps Script / Cron Jobs).
- Integrate modern LLMs (Gemini API) for intelligent decision-making.
- Parse and scrape complex web data using Regex.

## ✨ Key Features

- **🤖 AI-Powered CV Matching:** Uses Gemini AI to act as an expert ATS (Applicant Tracking System). It reads the job description, compares it to my CV, and assigns a match score (0-100) along with a 2-sentence logical reasoning.
- **🕸️ Web Scraping Spider:** Bypasses basic email links by directly scraping career portals (e.g., Siemens, Nordex) using Regex to find fresh job URLs.
- **📩 Gmail Inbox Parsing:** Automatically reads unread emails under a specific Gmail label (`job_search_scanning`), extracts the job text, and processes it.
- **🧹 Automated Maintenance (The "Night Watchman"):** A time-driven trigger runs every night to clear the Google Sheet, ensuring a fresh start for the next day's hunt.
- **🛡️ Quota Protection:** Built-in sleep functions and error-handling mechanisms to respect API rate limits and execution time boundaries.

## 🏗️ System Architecture

1. **Trigger:** Time-driven triggers wake the bot hourly.
2. **Fetch:** The bot scrapes designated URLs and scans specific Gmail labels.
3. **Analyze:** Extracts text and sends a structured prompt + CV data to the Gemini API.
4. **Evaluate:** AI returns a structured JSON containing the match score, job title, and reasoning.
5. **Log:** Matches scoring above 65% are appended to a Google Sheet with direct application links.

## 🚀 Setup & Installation

If you want to run this autonomous agent on your own Google Account:

**1. Prepare Your Documents:**
- Create a Google Doc containing your plain-text CV and copy its ID from the URL.
- Create a blank Google Sheet with headers (Date, Score, Title, AI Reason, Summary, Link) and copy its ID.

**2. Configure Gmail:**
- Create a label in Gmail (e.g., `job_search_scanning`).
- Set up auto-forwarding rules/filters to send job alerts from specific domains to this label.

**3. Deploy the Script:**
- Go to [script.google.com](https://script.google.com) and create a new project.
- Paste the `ai_job_hunter.js` code into the editor.
- Update the User Settings block at the top of the code with your specific Doc ID, Sheet ID, and Label Name.

**4. Add Your API Key:**
- Get a free API key from [Google AI Studio](https://aistudio.google.com/).
- In your Apps Script project, go to **Project Settings (gear icon) > Script Properties**.
- Add a new property: Property = `GEMINI_API_KEY`, Value = `YOUR_API_KEY`.

**5. Set the Triggers (Cron Jobs):**
- Click the **Clock icon (Triggers)** on the left menu.
- Add an hourly trigger for `runEmailScanner` (Email Scanner).
- Add a 2-hour trigger for `runWebSpider` (Web Spider).
- Add a daily trigger (e.g., 3 AM) for `resetGoogleSheet` (Table reset).

## 🛠️ Tech Stack
- **JavaScript (ES5/ES6)**
- **Google Apps Script** (GmailApp, DocumentApp, SpreadsheetApp, UrlFetchApp)
- **Google Gemini API** (Generative AI)
- **Regex (Regular Expressions)**

---
*Disclaimer: This project was built for educational and personal productivity purposes. Web scraping modules should be used responsibly and in accordance with the target websites' Terms of Service.*
