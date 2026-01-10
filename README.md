# SafeDLBuddy – AI-Powered File Scanning System for Secure Downloads

**Final B.Sc. Software Engineering Project**

## Overview
SafeDLBuddy is an AI-powered cybersecurity system that automates security assessment of downloadable files.
Users submit a download-page URL, the system extracts real download links using browser automation, downloads the selected file to secure temporary storage, scans it using multiple antivirus engines, and returns a weighted risk verdict with AI-generated explanations.

## Key Innovations
- Automated extraction of download links using Playwright
- Multi-engine antivirus scanning
- Weighted score aggregation
- Dynamic weight redistribution on API failure
- Conflict resolution when engines disagree
- Natural-language explanations via ChatGPT
- Automatic file deletion after processing

## Architecture
### Backend (Node.js / Express)
- `openAi_server.js` – AI chat and process coordination  
- `antivirus_server.js` – Multi-engine scanning service  
- `app.js` – Express configuration  

### Download Handlers
- `file_handler.js` – Main download router  
- `dropbox_handling.js`, `google_drive_handling.js`, `github_handling.js`, `mega_nz_handling.js`, `OneDrive_handling.js`
- `href_handling.js`, `general_handler.js`, `torrent.mjs`

### Frontend (Vue.js)
- `ChatBot.vue` – Main user interface

## How to Run
### Option 1 – Manual
```bash
npm install
node openai_server.js
node antivirus_server.js
npm run dev

### Option 2 – Docker
docker-compose up --build
