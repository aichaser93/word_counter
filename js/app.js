(() => {
  "use strict";

  const READING_WPM = 200;
  const SPEAKING_WPM = 130;
  const COMMON_WORDS = new Set((
    "a an and are as at be been being but by can could did do does doing " +
    "for from had has have he her here hers herself him himself his how i " +
    "if in into is it its itself just me more most my myself no nor not of " +
    "on once only or other our ours ourselves out over own same she should " +
    "so some such than that the their theirs them themselves then there " +
    "these they this those through to too under until up very was we were " +
    "what when where which while who whom why will with would you your " +
    "yours yourself yourselves"
  ).split(" "));

  function createSegmenter(granularity) {
    return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter("en", { granularity })
      : null;
  }

  const graphemeSegmenter = createSegmenter("grapheme");
  const wordSegmenter = createSegmenter("word");

  function getWords(text) {
    // Keep apostrophes, hyphenated compounds, and decimal numbers together.
    const tokens = text.match(/\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-‐‑][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu) || [];
    if (!wordSegmenter) return tokens;

    const words = [];
    for (const token of tokens) {
      if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u.test(token)) {
        for (const part of wordSegmenter.segment(token)) {
          if (part.isWordLike) words.push(part.segment);
        }
      } else {
        words.push(token);
      }
    }
    return words;
  }

  function countCharacters(text) {
    if (!graphemeSegmenter) return Array.from(text).length;
    let count = 0;
    for (const unused of graphemeSegmenter.segment(text)) count += 1;
    return count;
  }

  function getParagraphs(text) {
    return text.replace(/\r\n?/g, "\n").split(/\n[^\S\n]*\n+/).map(part => part.trim()).filter(Boolean);
  }

  function countSentences(paragraphs) {
    let count = 0;
    for (const paragraph of paragraphs) {
      // Protect dots that usually belong to numbers, abbreviations, or initials.
      const protectedText = paragraph
        .replace(/(\p{N})\.(?=\p{N})/gu, "$1\uE000")
        .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|e\.g|i\.e|a\.m|p\.m)\./gi, match => match.replace(/\./g, "\uE000"))
        .replace(/\b(?:\p{L}\.){2,}/gu, (match, offset, source) => {
          const nextText = source.slice(offset + match.length);
          const startsNewThought = /^\s+["“‘']?\p{Lu}/u.test(nextText);
          return startsNewThought ? match.slice(0, -1).replace(/\./g, "\uE000") + "." : match.replace(/\./g, "\uE000");
        })
        .replace(/\b(?<![.\uE000])\p{L}\.(?=\s+\p{L})/gu, match => match.replace(".", "\uE000"));
      const fragments = protectedText.split(/[.!?。！？]+["'”’»）)]*/u);
      for (const fragment of fragments) {
        if (/[\p{L}\p{N}]/u.test(fragment)) count += 1;
      }
    }
    return count;
  }

  function getKeywordDensity(words, hideCommon = false, limit = 10) {
    const frequencies = new Map();
    for (const word of words) {
      const normalized = word.normalize("NFC").toLocaleLowerCase("en").replace(/’/g, "'").replace(/[‐‑]/g, "-");
      if (hideCommon && COMMON_WORDS.has(normalized)) continue;
      frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
    }
    return Array.from(frequencies, ([word, count]) => ({
      word,
      count,
      density: words.length ? count / words.length * 100 : 0
    })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "en")).slice(0, limit);
  }

  function analyzeText(text) {
    const words = getWords(text);
    const paragraphs = getParagraphs(text);
    return {
      words,
      wordCount: words.length,
      characters: countCharacters(text),
      charactersWithoutSpaces: countCharacters(text.replace(/\s/gu, "")),
      sentences: countSentences(paragraphs),
      paragraphs: paragraphs.length,
      readingSeconds: Math.ceil(words.length / READING_WPM * 60),
      speakingSeconds: Math.ceil(words.length / SPEAKING_WPM * 60)
    };
  }

  function formatTime(seconds) {
    if (seconds < 60) return `${seconds} sec`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainder = seconds % 60;
    if (hours) return `${hours} hr${minutes ? ` ${minutes} min` : ""}`;
    return `${minutes} min${remainder ? ` ${remainder} sec` : ""}`;
  }

  function formatCount(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
  }

  async function copyText(text, editor) {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Local files and restricted browsers may need a selection-based copy.
      }
    }
    const previousFocus = document.activeElement;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const direction = editor.selectionDirection;
    editor.focus({ preventScroll: true });
    editor.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    if (copied) {
      editor.setSelectionRange(start, end, direction);
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
    }
    return copied;
  }

  function initializeApp() {
    const byId = id => document.getElementById(id);
    const editor = byId("text-input");
    const copyButton = byId("copy-button");
    const clearButton = byId("clear-button");
    const sampleButton = byId("sample-button");
    const hideCommon = byId("hide-common");
    const goalSelect = byId("word-goal");
    const progress = byId("goal-progress");
    const notification = byId("notification");
    const undoButton = byId("undo-button");
    const numberFormat = new Intl.NumberFormat("en");
    let analysis = analyzeText("");
    let undoSnapshot = null;
    let analysisFrame = null;
    let announcementTimer;
    let notificationTimer;
    let copying = false;

    function notify(message, undo = false) {
      window.clearTimeout(notificationTimer);
      byId("notification-message").textContent = message;
      undoButton.hidden = !undo;
      notification.hidden = false;
      notificationTimer = window.setTimeout(() => {
        // Keep an actionable notification available until the user dismisses it by editing.
        if (!undo) notification.hidden = true;
      }, 5000);
    }

    function renderKeywords() {
      const keywords = getKeywordDensity(analysis.words, hideCommon.checked);
      byId("keyword-empty").hidden = keywords.length > 0;
      byId("keyword-results").hidden = keywords.length === 0;
      const empty = byId("keyword-empty");
      empty.querySelector("h3").textContent = analysis.wordCount ? "A little more variety?" : "A pattern is waiting to appear.";
      empty.querySelector("p").textContent = analysis.wordCount
        ? "No words match this filter. Uncheck it to see every word."
        : "Start writing to see your most-used words and their density.";
      const fragment = document.createDocumentFragment();
      for (const keyword of keywords) {
        const item = document.createElement("li");
        item.className = "keyword-item";
        const word = document.createElement("span");
        word.className = "keyword-word";
        word.textContent = keyword.word;
        const count = document.createElement("span");
        count.className = "keyword-uses";
        count.textContent = numberFormat.format(keyword.count);
        count.setAttribute("aria-label", formatCount(keyword.count, "occurrence"));
        const density = document.createElement("span");
        density.className = "keyword-density";
        density.textContent = keyword.density > 0 && keyword.density < .1 ? "<0.1%" : `${keyword.density.toFixed(1)}%`;
        density.setAttribute("aria-label", `${keyword.density.toFixed(2)} percent of all words`);
        item.append(word, count, density);
        fragment.append(item);
      }
      byId("keyword-list").replaceChildren(fragment);
    }

    function renderGoal() {
      const goal = Number(goalSelect.value);
      progress.max = goal || 1;
      progress.value = goal ? Math.min(analysis.wordCount, goal) : 0;
      progress.hidden = !goal;
      progress.setAttribute("aria-valuetext", goal ? `${analysis.wordCount} of ${goal} words` : "No writing goal");
      byId("goal-value").textContent = goal ? `${numberFormat.format(analysis.wordCount)} / ${numberFormat.format(goal)} words` : "Write at your own pace";
      byId("goal-message").textContent = !goal ? "A little room for your ideas."
        : analysis.wordCount >= goal ? "You made it. Keep that flow going!"
        : analysis.wordCount === 0 ? "Every great piece starts somewhere."
        : `${numberFormat.format(goal - analysis.wordCount)} words to go. You’ve got this.`;
    }

    function updateCounts() {
      analysis = analyzeText(editor.value);
      const values = {
        "word-count": analysis.wordCount,
        "character-count": analysis.characters,
        "character-no-spaces": analysis.charactersWithoutSpaces,
        "sentence-count": analysis.sentences,
        "paragraph-count": analysis.paragraphs
      };
      for (const [id, value] of Object.entries(values)) byId(id).textContent = numberFormat.format(value);
      byId("reading-time").textContent = formatTime(analysis.readingSeconds);
      byId("speaking-time").textContent = formatTime(analysis.speakingSeconds);
      copyButton.disabled = !editor.value.length || copying;
      clearButton.disabled = !editor.value.length;
      sampleButton.disabled = !!editor.value.trim();
      sampleButton.title = sampleButton.disabled ? "Clear your text before loading a sample" : "Load a short example";
      renderKeywords();
      renderGoal();
      window.clearTimeout(announcementTimer);
      announcementTimer = window.setTimeout(() => {
        byId("live-summary").textContent = `${formatCount(analysis.wordCount, "word")}, ${formatCount(analysis.characters, "character")}, ${formatCount(analysis.sentences, "sentence")}, ${formatCount(analysis.paragraphs, "paragraph")}. Reading time: ${formatTime(analysis.readingSeconds)}.`;
      }, 650);
    }

    function flushCounts() {
      if (analysisFrame !== null) window.cancelAnimationFrame(analysisFrame);
      analysisFrame = null;
      updateCounts();
    }

    editor.addEventListener("input", () => {
      undoSnapshot = null;
      if (!undoButton.hidden) notification.hidden = true;
      undoButton.hidden = true;
      if (analysisFrame !== null) window.cancelAnimationFrame(analysisFrame);
      analysisFrame = window.requestAnimationFrame(() => {
        analysisFrame = null;
        updateCounts();
      });
    });

    clearButton.addEventListener("click", () => {
      undoSnapshot = { text: editor.value, start: editor.selectionStart, end: editor.selectionEnd };
      editor.value = "";
      flushCounts();
      editor.focus();
      notify("A fresh page. Your text has been cleared.", true);
    });

    undoButton.addEventListener("click", () => {
      if (!undoSnapshot) return;
      editor.value = undoSnapshot.text;
      editor.setSelectionRange(undoSnapshot.start, undoSnapshot.end);
      undoSnapshot = null;
      flushCounts();
      editor.focus();
      notify("Your writing is back.");
    });

    copyButton.addEventListener("click", async () => {
      copying = true;
      copyButton.disabled = true;
      const copied = await copyText(editor.value, editor);
      copying = false;
      copyButton.disabled = !editor.value.length;
      notify(copied ? "Copied. Your words are ready to go." : "Copy is unavailable here. Your text is selected; use Ctrl+C or ⌘C.");
    });

    sampleButton.addEventListener("click", () => {
      if (editor.value.trim()) return;
      undoSnapshot = null;
      editor.value = "Good writing begins with curiosity. A small idea becomes a sentence, and a sentence becomes a story. You don't need perfect words to begin. You just need a little space to think.\n\nWrite something honest. Write something useful. Write something that sounds like you. Then take a breath, read it again, and make every word count.";
      flushCounts();
      editor.focus();
      notify("A little inspiration to get you started.");
    });

    hideCommon.addEventListener("change", () => {
      flushCounts();
      window.clearTimeout(announcementTimer);
      const keywords = getKeywordDensity(analysis.words, hideCommon.checked);
      byId("live-summary").textContent = `${hideCommon.checked ? "Common English words hidden." : "All words included."} ${keywords.length} keywords shown.`;
    });
    goalSelect.addEventListener("change", () => {
      flushCounts();
      window.clearTimeout(announcementTimer);
      byId("live-summary").textContent = byId("goal-value").textContent;
    });
    window.addEventListener("pageshow", flushCounts);
    updateCounts();
  }

  if (typeof document !== "undefined") initializeApp();
  // The same pure functions can be checked with Node, without a browser or dependencies.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { getWords, countCharacters, getParagraphs, countSentences, getKeywordDensity, analyzeText, formatTime };
  }
})();
