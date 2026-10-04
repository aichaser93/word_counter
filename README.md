# Wordwell

An original, private writing companion built with HTML5, CSS3, and vanilla JavaScript. No framework, build step, backend, database, external fonts, or external API. All text analysis takes place in the browser.

## Run

Open `index.html` in a modern browser. The app works offline, including when opened directly from disk. For a local HTTP preview, run this from the project directory:

```sh
python3 -m http.server 8080
```

Then visit `http://localhost:8080`. Deploy the three frontend files with their folder structure to any static host. No dependencies need to be installed.

## Project structure

```text
index.html       Semantic layout, accessible editor, and inline SVG icons
css/style.css    Responsive layout, components, focus and reduced-motion styles
js/app.js        Reusable analysis functions and browser UI event handlers
README.md       Setup, behavior, and verification notes
```

## Features

- Live words, characters with and without whitespace, sentences, and paragraphs.
- Reading and speaking estimates, at 200 and 130 words per minute respectively.
- Top ten words, counts, and density; optional common English word filter.
- Copy, clear with an undo action, and a sample to explore the app.
- Optional writing goal, with an accessible progress bar.
- Responsive desktop and mobile layouts, labeled controls, keyboard focus indicators, skip link, polite screen-reader announcements, and reduced-motion support.
- Text never leaves the page. There are no analytics, network requests, saved drafts, cookies, or local storage. Reloading or closing the page can discard your work; copy anything you want to keep.

## Counting rules

- **Words:** Unicode letters and numbers are included. Contractions (`don't`, `we’re`), hyphenated compounds (`well-being`), decimals (`3.14`), and grouped numbers (`1,000`) count as one word each. Standalone punctuation and emoji do not count. Mixed punctuation otherwise separates words. `Intl.Segmenter` supplies word boundaries for Chinese, Japanese, Thai, Lao, Khmer, and Burmese where available; its dictionary and browser version can affect results. Other scripts with spaces use the Unicode tokenizer. Without `Intl.Segmenter`, unspaced sequences use the tokenizer and may count as one word.
- **Characters:** Extended grapheme clusters are counted when `Intl.Segmenter` is available, so an emoji or a letter with combining accents is one character. Spaces, tabs, and line breaks are included. Without that API, the fallback counts Unicode code points. The browser normalizes textarea line endings; CRLF is one grapheme when analyzed directly.
- **Characters without whitespace:** Spaces, tabs, line breaks, and other JavaScript Unicode whitespace are removed before counting.
- **Sentences:** Nonempty word-bearing fragments split at `.`, `!`, `?`, `。`, `！`, or `？`. Repeated punctuation does not add sentences. Common titles, abbreviations, initials, and decimal points are protected. An unfinished fragment counts as a sentence. Blank-line paragraphs are analyzed separately. Sentence detection is a heuristic: ambiguous abbreviations, websites, and unusual punctuation may need human interpretation.
- **Paragraphs:** Nonempty text blocks separated by one or more blank lines. Whitespace-only blank lines and Windows line endings are supported. A single line break within a block does not create a new paragraph. Punctuation-only text still forms a paragraph.
- **Time:** Word count divided by the stated pace, rounded up to the next whole second. Estimates do not account for pauses or subject complexity.
- **Keywords:** Case-insensitive, Unicode-normalized single words. Curly apostrophes and alternate hyphens are normalized. Ties sort alphabetically. Density is occurrences divided by **all** counted words, even when the common word filter is on. Display rounds to one decimal; tiny nonzero densities display as `<0.1%`. The filter is English only.

## Implementation and verification

The analysis functions are independent of the DOM, and `js/app.js` exposes them through `module.exports` when loaded with Node. You can check inputs without installing anything:

```sh
node --check js/app.js
node -e 'const { analyzeText } = require("./js/app.js"); console.log(analyzeText("Hello world.\n\nA new paragraph!"));'
```

Input events are coalesced with `requestAnimationFrame`. Screen-reader summaries are delayed until typing pauses to avoid announcing every keystroke. Keyword rendering uses `textContent` so pasted markup is never executed. Sample loading is disabled while nonempty writing is present. Copy first uses the browser clipboard API; a selection-based fallback handles local files and restricted clipboard permissions. If both fail, the text stays selected for manual copying.

Useful manual checks: type and paste text; change the word filter and writing goal; copy text; clear and undo; navigate every control by keyboard; resize to 320px and desktop widths; and try accented text, emoji, whitespace, punctuation-only text, contractions, numbers, abbreviations, and blank-line paragraphs. Browser clipboard policies may require manual copying. Analysis remains synchronous, so exceptionally large documents can pause the UI; this is designed for everyday writing rather than multi-megabyte data processing.

Verified during implementation: 46 assertions covering counting samples, Unicode graphemes and whitespace, language segmentation, keyword normalization and filtering, timing boundaries, and the segmentation fallback. A 50,000-character sample was also checked. Browser checks covered live updates, clipboard contents, clear/undo, sample loading, filter empty states, writing goals, keyboard focus, and safe rendering of pasted markup. Layout was checked at 320, 375, 600, 768, 1024, and 1440 pixels without horizontal overflow. JavaScript syntax, local asset references, unique HTML IDs, form labels, and browser console errors were checked too.
