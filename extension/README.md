# OpportunityOS — Browser Extension (Manifest V3)

1-click browser extension to save job, internship, and hackathon postings directly into your OpportunityOS inbox from LinkedIn, Internshala, Unstop, and corporate career portals.

---

## 🚀 How to Install in Chrome, Edge, or Brave (30 Seconds)

1. Open your browser's extension management page:
   - **Google Chrome:** Visit `chrome://extensions`
   - **Microsoft Edge:** Visit `edge://extensions`
   - **Brave:** Visit `brave://extensions`
2. Turn ON **Developer mode** (toggle in the top-right corner).
3. Click the **Load unpacked** button in the top-left corner.
4. Select the directory:
   ```
   C:\OpportunityOS\extension
   ```
5. Click **Select Folder**. The **OpportunityOS** icon will appear in your browser toolbar!

> **Tip:** Click the puzzle icon in your toolbar and pin **OpportunityOS** so it is always 1 click away.

---

## 💡 How to Use

1. Browse to any opportunity on **LinkedIn**, **Internshala**, **Unstop**, **Greenhouse**, or any career site.
2. Click the **OpportunityOS icon** in your toolbar (or press `Alt + S`).
3. The popup instantly extracts:
   - Job/Internship Title
   - Company / Organization
   - Clean, untracked application URLs
   - Role description & requirements
4. Click **Save to OpportunityOS**!
5. The opportunity is sent to your local instance (`http://localhost:3000`) and queued for AI evaluation in your inbox.

---

## 🔒 Security & Privacy Guarantees

* **No Password or Form Access:** The extension completely ignores `<form>`, `<input>`, `<password>`, and hidden fields.
* **No Cookie or Auth Theft:** Content scripts run in an isolated environment and never read or send host-page cookies.
* **Isolated from Page CSP:** Unlike bookmarklets, the extension cannot be blocked by strict site Content Security Policies.
* **Single-Use Nonce Security:** Communication with OpportunityOS uses short-lived, single-use cryptographic nonces bound to request UUIDs.
