const fs = require('fs');
const file = 'c:/Users/allen/Documents/booksync/pages/index.js';
const content = fs.readFileSync(file,'utf8');
console.log('Loaded index.js length', content.length);
// We won't execute React code here; instead we'll emulate the parsing logic used in parseTextToSentences
const parseTextToSentences = (text) => {
  const sentences = [];
  const chapters = [];
  let currentChapter = null;
  let sentenceId = 1;
  let currentTime = 0;

  const lines = text.split('\n');
  let currentText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const epubChapterMatch = line.match(/^\s*\[\[CHAPTER:(.+?)\]\]\s*$/i);
    if (epubChapterMatch) {
      if (currentText.trim()) {
        const chapterSentences = currentText.match(/[^.!?]+[.!?]+/g) || [];
        chapterSentences.forEach((sentence) => {
          sentences.push({ id: sentenceId++, text: sentence.trim(), chapter: currentChapter });
        });
        currentText = '';
      }
      const chapterTitle = epubChapterMatch[1];
      currentChapter = { id: chapters.length + 1, title: chapterTitle };
      chapters.push(currentChapter);
      continue;
    }
    currentText += line + '\n';
  }

  if (currentText.trim()) {
    const chapterSentences = currentText.match(/[^.!?]+[.!?]+/g) || [];
    chapterSentences.forEach((sentence) => {
      sentences.push({ id: sentenceId++, text: sentence.trim(), chapter: currentChapter });
    });
  }
  return { sentences, chapters };
}

const testText = `[[CHAPTER:Chapter 1]]\nThis is the first sentence. This is the second sentence.\n\n[[CHAPTER:Chapter 2]]\nChapter two starts here. Another sentence.`;
const res = parseTextToSentences(testText);
console.log('Chapters:', res.chapters);
console.log('Sentences:', res.sentences.map(s=>s.text));
