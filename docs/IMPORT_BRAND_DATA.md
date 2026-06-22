# Importing Historical Brand Data

If you've spent months or years developing your brand voice in ChatGPT (or another AI tool), you can import that history into Spring Post so the posts we generate reflect your real brand voice — not a generic profile.

## What gets imported

We extract and merge into your Brand Voice profile:

- What your brand is about (summary)
- Who you're talking to (audience)
- How you sound (tone)
- Key things you want to say (messaging pillars)
- Words & phrases you use (do rules)
- Words & phrases you avoid (don't rules)
- How you ask people to take action (CTA preferences)
- Hashtag topics

You review every change before it's saved. Nothing is overwritten without your confirmation.

## Privacy

Your imported text is processed in memory and immediately discarded. Spring Post stores only the structured brand voice fields you choose to apply, plus a small audit record (filename, date, fields applied) so you can see what you imported.

---

## Option A — Copy and paste (easiest)

Recommended for most users. Works for ChatGPT, Claude, Gemini — anything where you can read the conversation in a browser.

1. Open ChatGPT and click into a conversation that's relevant to your brand.
2. Press **Cmd+A** (Mac) or **Ctrl+A** (Windows) to select everything in the conversation.
3. Press **Cmd+C** / **Ctrl+C** to copy.
4. In Spring Post, go to **Brand Voice** and click **"Import from past chats"**.
5. Paste into the box. You can paste several conversations one after another in the same box — Spring Post will figure it out.
6. Click **Process**. Review what was extracted. Apply the changes you want.

**Tip:** If you paste a lot, expect 30–60 seconds for processing. The progress bar tells you what's happening.

---

## Option B — Bulk upload (for many conversations at once)

If you have dozens of conversations, copy-pasting one at a time gets tedious. Use a browser extension to save each conversation as a markdown file, then upload them in bulk.

1. Install a "ChatGPT Exporter" browser extension (search the Chrome/Firefox extension store — there are a few good ones).
2. Open each conversation you want to import. Click the extension's "Export as markdown" button. Save the `.md` file to a folder on your computer.
3. In Spring Post, go to **Brand Voice** → **"Import from past chats"** → switch to the **Upload files** tab.
4. Drag your `.md` files into the upload area, or click to choose them. You can upload up to 20 files (5 MB each).
5. Click **Process**, review, and apply.

---

## What if I have the official ChatGPT export (the zip file)?

ChatGPT's "Export data" feature emails you a zip with a `conversations.json` file. **For now, Spring Post doesn't read this file directly** — you'd need to convert it to markdown or text first using a community tool, or open each conversation in ChatGPT and use Option A.

We're considering native support for the official export zip in a future release.

---

## Tips for better results

- **Pick conversations that talk about your brand**, not random questions. The more on-topic the input, the cleaner the extraction.
- **The "Include AI replies" toggle** is off by default. Turn it on if the assistant's responses contain final, kept brand copy that represents your voice — for example, a tagline you accepted from ChatGPT and have used since.
- **Empty fields default to "use new"** — so a fresh brand profile fills in fully on import without you having to flip every toggle. Already-filled fields default to "keep mine" so you don't accidentally overwrite tuned values.

## Limits

- Free / trial: 1 import per day
- Paid plans: 10 imports per day
- Per import: up to 20 files at 5 MB each, or up to 5 MB of pasted text

If you hit the limit, try again tomorrow — or batch more content into a single import.
