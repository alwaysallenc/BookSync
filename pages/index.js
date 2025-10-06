import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Book, Settings, Volume2, Library, Plus, Upload, X, ArrowLeft, Trash2, List } from 'lucide-react';

export default function AudiobookReader() {
  const [currentPage, setCurrentPage] = useState('library'); // 'library', 'reader', 'upload'
  const [books, setBooks] = useState([
    {
      id: 1,
      title: "Luna's Adventure",
      author: "Demo Book",
      cover: "🦊",
      content: [
        { id: 1, text: "Once upon a time, in a magical forest far away,", start: 0, end: 3.5, chapter: { id: 1, title: "Chapter 1: The Beginning" } },
        { id: 2, text: "there lived a curious young fox named Luna.", start: 3.5, end: 6.8, chapter: { id: 1, title: "Chapter 1: The Beginning" } },
        { id: 3, text: "Luna loved to explore every corner of the woods,", start: 6.8, end: 10.2, chapter: { id: 1, title: "Chapter 1: The Beginning" } },
        { id: 4, text: "discovering hidden streams and ancient trees.", start: 10.2, end: 13.5, chapter: { id: 1, title: "Chapter 1: The Beginning" } },
        { id: 5, text: "One day, she found a mysterious glowing stone", start: 13.5, end: 17.0, chapter: { id: 2, title: "Chapter 2: The Discovery" } },
        { id: 6, text: "buried beneath the roots of the oldest oak.", start: 17.0, end: 20.2, chapter: { id: 2, title: "Chapter 2: The Discovery" } },
        { id: 7, text: "As she touched it, the forest came alive", start: 20.2, end: 23.5, chapter: { id: 2, title: "Chapter 2: The Discovery" } },
        { id: 8, text: "with colors and sounds she had never seen before.", start: 23.5, end: 27.0, chapter: { id: 2, title: "Chapter 2: The Discovery" } },
      ],
      chapters: [
        { id: 1, title: "Chapter 1: The Beginning", startSentence: 1, startTime: 0 },
        { id: 2, title: "Chapter 2: The Discovery", startSentence: 5, startTime: 13.5 }
      ],
      audioUrl: null,
      duration: 27
    }
  ]);
  const [currentBook, setCurrentBook] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  
  // Upload form states
  const [uploadForm, setUploadForm] = useState({
    title: '',
    author: '',
    text: '',
    audioFile: null,
    audioUrl: null,
    textFileName: null
  });

  const audioRef = useRef(null);
  const audioFileInputRef = useRef(null);
  const textFileInputRef = useRef(null);

  // Load JSZip from CDN for EPUB parsing
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.JSZip) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      document.head.appendChild(script);
    }
  }, []);

  // Open a book
  const openBook = (book) => {
    setCurrentBook(book);
    setCurrentPage('reader');
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // Handle audio file upload
  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadForm({ ...uploadForm, audioFile: file, audioUrl: url });
    }
  };

  // Handle text file upload
  const handleTextFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileExtension = file.name.split('.').pop().toLowerCase();
      
      // Handle EPUB files
      if (fileExtension === 'epub') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const JSZip = window.JSZip;
          const zip = await JSZip.loadAsync(arrayBuffer);
          
          let extractedText = '';
          let title = '';
          let author = '';
          const detectedChapters = [];
          
          // Try to extract metadata and navigation from OPF / NCX / nav.xhtml
          try {
            const opfFiles = Object.keys(zip.files).filter((filename) => filename.toLowerCase().endsWith('.opf'));
            let spineOrder = null;
            let manifestMap = {};
            if (opfFiles.length > 0) {
              const opfPath = opfFiles[0];
              const opfContent = await zip.files[opfPath].async('text');
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(opfContent, 'text/xml');

              // Extract title and author (dc:title / dc:creator)
              const titleElement = xmlDoc.querySelector('title, dc\\:title, [name="dc:title"]');
              if (titleElement) title = titleElement.textContent.trim();
              const authorElement = xmlDoc.querySelector('creator, dc\\:creator, [name="dc:creator"]');
              if (authorElement) author = authorElement.textContent.trim();

              // Build manifest map (id -> href)
              const manifest = xmlDoc.querySelectorAll('manifest > item');
              manifest.forEach((it) => {
                const id = it.getAttribute('id');
                const href = it.getAttribute('href');
                if (id && href) manifestMap[id] = href;
              });

              // Build spine order (array of hrefs)
              const spine = xmlDoc.querySelectorAll('spine > itemref');
              if (spine.length > 0) {
                spineOrder = Array.from(spine).map((ref) => {
                  const idref = ref.getAttribute('idref');
                  const href = manifestMap[idref] || idref;
                  // resolve relative to opf folder
                  const base = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
                  return base + href;
                });
              }

              // Try to find a nav (nav.xhtml) or a toc (.ncx)
              const allFiles = Object.keys(zip.files);
              let navEntries = [];
              const navFile = allFiles.find((f) => f.toLowerCase().endsWith('nav.xhtml') || f.toLowerCase().endsWith('nav.html'));
              if (navFile) {
                try {
                  const navContent = await zip.files[navFile].async('text');
                  const navDoc = parser.parseFromString(navContent, 'text/html');
                  const nav = navDoc.querySelector('nav[epub\\:type="toc"], nav[role="doc-toc"]') || navDoc.querySelector('nav');
                  if (nav) {
                    const anchors = nav.querySelectorAll('a');
                    anchors.forEach((a) => {
                      const href = a.getAttribute('href');
                      const text = (a.textContent || '').trim();
                      if (href && text) navEntries.push({ href, title: text });
                    });
                  }
                } catch (e) {
                  // ignore nav parse errors
                }
              } else {
                // try NCX
                const ncxFile = allFiles.find((f) => f.toLowerCase().endsWith('.ncx'));
                if (ncxFile) {
                  try {
                    const ncxContent = await zip.files[ncxFile].async('text');
                    const ncxDoc = parser.parseFromString(ncxContent, 'text/xml');
                    const navPoints = ncxDoc.querySelectorAll('navPoint');
                    navPoints.forEach((np) => {
                      const label = np.querySelector('navLabel > text');
                      const contentElem = np.querySelector('content');
                      const src = contentElem ? contentElem.getAttribute('src') : null;
                      if (label && src) navEntries.push({ href: src, title: label.textContent.trim() });
                    });
                  } catch (e) {}
                }
              }

              // If we got a spineOrder, prefer it to build the htmlFiles order
              if (spineOrder && spineOrder.length > 0) {
                const fileSet = new Set(Object.keys(zip.files));
                const orderedHtmlFiles = [];
                spineOrder.forEach((p) => {
                  const candidates = [p, p.replace(/^[.\\/]+/, '')];
                  for (const c of candidates) {
                    if (fileSet.has(c)) {
                      orderedHtmlFiles.push(c);
                      break;
                    }
                  }
                });
                if (orderedHtmlFiles.length > 0) {
                  // replace the htmlFiles list below by mutating the variable later
                  var epubSpineOrdered = orderedHtmlFiles;
                }
              }

              if (navEntries.length > 0) {
                // normalize nav hrefs
                var epubNav = navEntries.map((ne) => ({ href: ne.href.split('#')[0].replace(/^[.\\/]+/, ''), title: ne.title }));
              }
            }
          } catch (metaError) {
            console.log('Could not extract metadata or nav:', metaError);
          }
          
          // Find and read all HTML/XHTML files in the EPUB
          const htmlFiles = Object.keys(zip.files)
            .filter(filename => 
              (filename.endsWith('.html') || filename.endsWith('.xhtml')) &&
              !filename.includes('nav.') && 
              !filename.includes('toc.')
            )
            .sort(); // Keep files in order
          
          // Extract text from each HTML file and detect chapters
          // If we parsed an EPUB spine order earlier, prefer that order
          const filesToProcess = (typeof epubSpineOrdered !== 'undefined' && epubSpineOrdered.length > 0) ? epubSpineOrdered : htmlFiles;
          for (let fileIndex = 0; fileIndex < filesToProcess.length; fileIndex++) {
            const filename = filesToProcess[fileIndex];
            // skip files that may not be present
            if (!zip.files[filename]) continue;
            const content = await zip.files[filename].async('text');

            // Parse HTML to detect chapter structure
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;

            // First, try to find a matching nav entry for this file (if we parsed one)
            let chapterTitle = '';
            if (typeof epubNav !== 'undefined' && epubNav && epubNav.length > 0) {
              const match = epubNav.find((ne) => {
                const hrefName = ne.href.split('/').pop();
                const fileName = filename.split('/').pop();
                return hrefName === fileName || ne.href === filename;
              });
              if (match) chapterTitle = match.title;
            }

            // If nav didn't give a title, inspect headings inside the HTML
            if (!chapterTitle) {
              const h1 = tempDiv.querySelector('h1');
              const h2 = tempDiv.querySelector('h2');
              const titleElement = tempDiv.querySelector('[class*="chapter"], [class*="title"], [id*="chapter"]');
              if (h1 && h1.textContent.trim().length > 0 && h1.textContent.trim().length < 200) {
                chapterTitle = h1.textContent.trim().replace(/\s+/g, ' ');
              } else if (h2 && h2.textContent.trim().length > 0 && h2.textContent.trim().length < 200) {
                chapterTitle = h2.textContent.trim().replace(/\s+/g, ' ');
              } else if (titleElement && titleElement.textContent.trim().length > 0 && titleElement.textContent.trim().length < 200) {
                const titleText = titleElement.textContent.trim().replace(/\s+/g, ' ').split('\n')[0];
                if (titleText.length < 200) chapterTitle = titleText;
              }
            }

            // Extract cleaned text content
            const text = tempDiv.textContent || tempDiv.innerText || '';

            // Only add chapter marker if we have actual text content in this file
            if (text.trim().length > 0) {
              if (chapterTitle) {
                detectedChapters.push({ marker: `[[CHAPTER:${chapterTitle}]]`, title: chapterTitle });
                extractedText += `[[CHAPTER:${chapterTitle}]]\n\n`;
              } else if (filesToProcess.length > 1) {
                const chapterNum = detectedChapters.length + 1;
                const genericTitle = `Chapter ${chapterNum}`;
                detectedChapters.push({ marker: `[[CHAPTER:${genericTitle}]]`, title: genericTitle });
                extractedText += `[[CHAPTER:${genericTitle}]]\n\n`;
              }

              extractedText += text + '\n\n';
            }
          }
          
          // Clean up the extracted text thoroughly
          // - remove HTML tags
          // - replace HTML entities
          // - preserve newlines so chapter markers (which are placed on their own lines)
          //   remain detectable by the chapter parser
          extractedText = extractedText
            .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
            .replace(/&nbsp;/g, ' ') // Replace HTML spaces
            .replace(/&amp;/g, '&') // Replace HTML ampersands
            .replace(/&lt;/g, '<') // Replace HTML less than
            .replace(/&gt;/g, '>') // Replace HTML greater than
            .replace(/&quot;/g, '"') // Replace HTML quotes
            .replace(/&#39;/g, "'") // Replace HTML apostrophes
            // normalize CRLF to LF
            .replace(/\r\n/g, '\n')
            // collapse consecutive spaces/tabs but keep newlines
            .replace(/[ \t]+/g, ' ')
            // collapse more than two newlines into two
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            .trim();
          
          // If no metadata found, try to extract from filename
          if (!title) {
            title = file.name.replace('.epub', '').replace(/[-_]/g, ' ');
          }
          
          setUploadForm({ 
            ...uploadForm, 
            text: extractedText, 
            textFileName: file.name,
            title: title || uploadForm.title,
            author: author || uploadForm.author
          });
        } catch (error) {
          alert('Error reading EPUB file. Please try a different file or paste text manually.');
          console.error('EPUB parsing error:', error);
        }
      } 
      // Handle regular text files
      else {
        const reader = new FileReader();
        reader.onload = (event) => {
          let text = event.target.result;
          let title = '';
          let author = '';
          
          // Try to extract title and author from first few lines
          const lines = text.split('\n').filter(line => line.trim().length > 0);
          
          // Look for common patterns in first 10 lines
          for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i].trim();
            
            // Check for "Title:" or "TITLE:"
            if (/^title:\s*/i.test(line)) {
              title = line.replace(/^title:\s*/i, '').trim();
            }
            // Check for "Author:" or "by" patterns
            else if (/^(author|by):\s*/i.test(line)) {
              author = line.replace(/^(author|by):\s*/i, '').trim();
            }
            // Check for "by [Author Name]" pattern
            else if (/^by\s+/i.test(line)) {
              author = line.replace(/^by\s+/i, '').trim();
            }
          }
          
          // If no title found, use filename
          if (!title) {
            title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          }
          
          setUploadForm({ 
            ...uploadForm, 
            text: text, 
            textFileName: file.name,
            title: title || uploadForm.title,
            author: author || uploadForm.author
          });
        };
        reader.readAsText(file);
      }
    }
  };

  // Parse text into sentences with chapter detection
  const parseTextToSentences = (text) => {
    const sentences = [];
    const chapters = [];
    let currentChapter = null;
    let sentenceId = 1;
    let currentTime = 0;
    
    // Split text into lines first to detect chapters
    const lines = text.split('\n');
    let currentText = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
  // Check for EPUB chapter markers first (inserted during EPUB parsing)
  // Accept markers with optional surrounding whitespace
  const epubChapterMatch = line.match(/^\s*\[\[CHAPTER:(.+?)\]\]\s*$/i);
      
      if (epubChapterMatch) {
        // Save previous chapter's content
        if (currentText.trim()) {
          const chapterSentences = currentText.match(/[^.!?]+[.!?]+/g) || [];
          chapterSentences.forEach((sentence) => {
            sentences.push({
              id: sentenceId++,
              text: sentence.trim(),
              start: currentTime,
              end: currentTime + 3.5,
              chapter: currentChapter
            });
            currentTime += 3.5;
          });
          currentText = '';
        }
        
        // Create new chapter from EPUB marker
        const chapterTitle = epubChapterMatch[1];
        currentChapter = {
          id: chapters.length + 1,
          title: chapterTitle,
          startSentence: sentenceId,
          startTime: currentTime
        };
        chapters.push(currentChapter);
        continue; // Skip this line, don't add it to text
      }
      
      // Detect chapter markers from plain text (various formats)
      const chapterMatch = line.match(/^(chapter|ch\.?|section|part|prologue|epilogue|introduction|preface)\s*(\d+|[IVXLCDM]+)?:?\s*(.*)$/i);
      
      if (chapterMatch && line.length < 100) {
        // Save previous chapter's content
        if (currentText.trim()) {
          const chapterSentences = currentText.match(/[^.!?]+[.!?]+/g) || [];
          chapterSentences.forEach((sentence) => {
            sentences.push({
              id: sentenceId++,
              text: sentence.trim(),
              start: currentTime,
              end: currentTime + 3.5,
              chapter: currentChapter
            });
            currentTime += 3.5;
          });
          currentText = '';
        }
        
        // Create new chapter
        const chapterType = chapterMatch[1];
        const chapterNumber = chapterMatch[2] || '';
        const chapterTitle = chapterMatch[3] || '';
        const fullTitle = `${chapterType} ${chapterNumber} ${chapterTitle}`.trim();
        
        currentChapter = {
          id: chapters.length + 1,
          title: fullTitle || `${chapterType} ${chapterNumber}`.trim(),
          startSentence: sentenceId,
          startTime: currentTime
        };
        chapters.push(currentChapter);
      } else {
        currentText += line + ' ';
      }
    }
    
    // Process remaining text
    if (currentText.trim()) {
      const chapterSentences = currentText.match(/[^.!?]+[.!?]+/g) || [];
      chapterSentences.forEach((sentence) => {
        sentences.push({
          id: sentenceId++,
          text: sentence.trim(),
          start: currentTime,
          end: currentTime + 3.5,
          chapter: currentChapter
        });
        currentTime += 3.5;
      });
    }
    
    // If no chapters detected, return sentences without chapters
    if (chapters.length === 0) {
      return { sentences, chapters: null };
    }
    
    return { sentences, chapters };
  };

  // Add new book
  const handleAddBook = () => {
    if (!uploadForm.title || !uploadForm.text) {
      alert('Please fill in at least the title and text');
      return;
    }

    const { sentences, chapters } = parseTextToSentences(uploadForm.text);

    const newBook = {
      id: books.length + 1,
      title: uploadForm.title,
      author: uploadForm.author || 'Unknown Author',
      cover: uploadForm.title[0].toUpperCase(),
      content: sentences,
      chapters: chapters,
      audioUrl: uploadForm.audioUrl,
      duration: 0
    };

    setBooks([...books, newBook]);
    setUploadForm({ title: '', author: '', text: '', audioFile: null, audioUrl: null, textFileName: null });
    setCurrentPage('library');
  };

  // Delete book
  const handleDeleteBook = (bookId, e) => {
    e.stopPropagation(); // Prevent opening the book when clicking delete
    if (confirm('Are you sure you want to delete this book?')) {
      setBooks(books.filter(book => book.id !== bookId));
    }
  };

  // Jump to chapter
  const jumpToChapter = (chapter) => {
    const firstSentence = currentBook.content.find(s => s.id === chapter.startSentence);
    if (firstSentence && audioRef.current) {
      audioRef.current.currentTime = firstSentence.start;
      setShowChapters(false);
    }
  };

  // Reader functions
  const getCurrentSentence = () => {
    if (!currentBook) return null;
    return currentBook.content.find(
      sentence => currentTime >= sentence.start && currentTime < sentence.end
    );
  };

  const currentSentence = getCurrentSentence();

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const skip = (seconds) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handlePlaybackRateChange = (rate) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleProgressClick = (e) => {
    if (audioRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      audioRef.current.currentTime = pos * duration;
    }
  };

  const jumpToSentence = (sentence) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sentence.start;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // LIBRARY PAGE
  if (currentPage === 'library') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <header className="bg-white shadow-md">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Library className="text-indigo-600" size={32} />
                <h1 className="text-3xl font-bold text-gray-800">My Library</h1>
              </div>
              <button
                onClick={() => setCurrentPage('upload')}
                className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus size={20} />
                <span>Add Book</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book) => (
              <div
                key={book.id}
                className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all overflow-hidden group relative"
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => handleDeleteBook(book.id, e)}
                  className="absolute top-3 right-3 z-10 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                  title="Delete book"
                >
                  <Trash2 size={18} />
                </button>

                <div 
                  onClick={() => openBook(book)}
                  className="cursor-pointer"
                >
                  <div className="bg-gradient-to-br from-indigo-400 to-purple-500 h-48 flex items-center justify-center text-white text-6xl font-bold">
                    {book.cover}
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-indigo-600 transition-colors">
                      {book.title}
                    </h3>
                    <p className="text-gray-600 mb-4">{book.author}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">{book.content.length} segments</span>
                      <Play size={20} className="text-indigo-600" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {books.length === 0 && (
            <div className="text-center py-16">
              <Book size={64} className="text-gray-300 mx-auto mb-4" />
              <h3 className="text-2xl font-semibold text-gray-600 mb-2">No books yet</h3>
              <p className="text-gray-500 mb-6">Add your first audiobook to get started</p>
              <button
                onClick={() => setCurrentPage('upload')}
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Add Your First Book
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // UPLOAD PAGE
  if (currentPage === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <header className="bg-white shadow-md">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setCurrentPage('library')}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft size={24} className="text-gray-600" />
              </button>
              <Upload className="text-indigo-600" size={32} />
              <h1 className="text-3xl font-bold text-gray-800">Add New Book</h1>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Book Title *
                </label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder="Enter book title"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                />
              </div>

              {/* Author */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Author
                </label>
                <input
                  type="text"
                  value={uploadForm.author}
                  onChange={(e) => setUploadForm({ ...uploadForm, author: e.target.value })}
                  placeholder="Enter author name"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                />
              </div>

              {/* Audio Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Audio File (MP3, M4A, WAV)
                </label>
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                />
                <button
                  onClick={() => audioFileInputRef.current?.click()}
                  className="w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-500 transition-colors text-center"
                >
                  {uploadForm.audioFile ? (
                    <div className="flex items-center justify-center space-x-2 text-indigo-600">
                      <Volume2 size={24} />
                      <span>{uploadForm.audioFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      <Upload size={32} className="mx-auto mb-2" />
                      <p>Click to upload audio file</p>
                    </div>
                  )}
                </button>
              </div>

              {/* Text Content */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Book Text *
                </label>
                
                {/* File Upload Option */}
                <input
                  ref={textFileInputRef}
                  type="file"
                  accept=".txt,.doc,.docx,.epub"
                  onChange={handleTextFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => textFileInputRef.current?.click()}
                  className="w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-500 transition-colors text-center mb-4"
                >
                  {uploadForm.textFileName ? (
                    <div className="flex items-center justify-center space-x-2 text-indigo-600">
                      <Book size={24} />
                      <span>{uploadForm.textFileName}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      <Upload size={24} className="mx-auto mb-2" />
                      <p className="text-sm">Click to upload text file (.txt, .doc, .docx, .epub)</p>
                    </div>
                  )}
                </button>

                <div className="text-center text-gray-500 text-sm mb-2">OR</div>

                <textarea
                  value={uploadForm.text}
                  onChange={(e) => setUploadForm({ ...uploadForm, text: e.target.value })}
                  placeholder="Paste your book text here. Each sentence will be automatically detected."
                  rows={12}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all resize-none font-mono text-sm"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Tip: Make sure each sentence ends with proper punctuation (. ! ?)
                </p>
              </div>

              {/* Buttons */}
              <div className="flex space-x-4">
                <button
                  onClick={handleAddBook}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl font-semibold"
                >
                  Add Book to Library
                </button>
                <button
                  onClick={() => setCurrentPage('library')}
                  className="px-6 py-3 rounded-xl border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="font-semibold text-blue-900 mb-2">How it works:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Upload your audiobook file (MP3, M4A, or WAV)</li>
              <li>• Upload a text file (.txt, .doc, .docx, .epub) OR paste text directly</li>
              <li>• EPUB files will auto-fill title and author from metadata</li>
              <li>• Text files will try to extract title/author from first lines</li>
              <li>• The app will automatically split text into sentences</li>
              <li>• Timing will be estimated (3.5 seconds per sentence)</li>
              <li>• You can adjust any field before adding to library</li>
            </ul>
          </div>
        </main>
      </div>
    );
  }

  // READER PAGE
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  setCurrentPage('library');
                  setIsPlaying(false);
                  if (audioRef.current) audioRef.current.pause();
                }}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft size={24} className="text-gray-600" />
              </button>
              <Book className="text-amber-600" size={28} />
              <div>
                <h1 className="text-xl font-bold text-gray-800">{currentBook?.title}</h1>
                <p className="text-sm text-gray-600">{currentBook?.author}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {currentBook?.chapters && (
                <button
                  onClick={() => setShowChapters(!showChapters)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Chapters"
                >
                  <List size={24} className="text-gray-600" />
                </button>
              )}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Settings size={24} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Chapters Menu */}
      {showChapters && currentBook?.chapters && (
        <div className="bg-white border-b shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Chapters</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {currentBook.chapters.map((chapter) => {
                const isCurrentChapter = currentSentence?.chapter?.id === chapter.id;
                return (
                  <button
                    key={chapter.id}
                    onClick={() => jumpToChapter(chapter)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      isCurrentChapter
                        ? 'bg-amber-100 text-amber-900 font-semibold border-2 border-amber-400'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate mr-4">{chapter.title}</span>
                      <span className="text-sm text-gray-500 flex-shrink-0">{formatTime(chapter.startTime)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Font Size: {fontSize}px
              </label>
              <input
                type="range"
                min="14"
                max="28"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Playback Speed: {playbackRate}x
              </label>
              <div className="flex space-x-2">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handlePlaybackRateChange(rate)}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      playbackRate === rate
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="space-y-4" style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}>
            {currentBook?.content.map((sentence) => {
              // Check if this is the start of a new chapter
              const isChapterStart = sentence.chapter && 
                currentBook.content.find(s => s.id === sentence.id - 1)?.chapter?.id !== sentence.chapter.id;
              
              return (
                <div key={sentence.id}>
                  {isChapterStart && (
                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4 pb-2 border-b-2 border-amber-400">
                      {sentence.chapter.title}
                    </h2>
                  )}
                  <p
                    onClick={() => jumpToSentence(sentence)}
                    className={`cursor-pointer transition-all duration-300 rounded-lg px-3 py-2 ${
                      currentSentence?.id === sentence.id
                        ? 'bg-amber-200 text-amber-900 font-semibold scale-105 shadow-md'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {sentence.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sticky bottom-4">
          <div
            className="bg-gray-200 h-2 rounded-full mb-4 cursor-pointer overflow-hidden"
            onClick={handleProgressClick}
          >
            <div
              className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-100"
              style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
            />
          </div>

          <div className="flex justify-between text-sm text-gray-600 mb-4">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="flex items-center justify-center space-x-6">
            <button
              onClick={() => skip(-10)}
              className="p-3 rounded-full hover:bg-gray-100 transition-colors"
            >
              <SkipBack size={24} className="text-gray-700" />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg hover:shadow-xl"
            >
              {isPlaying ? (
                <Pause size={32} className="text-white" fill="white" />
              ) : (
                <Play size={32} className="text-white" fill="white" />
              )}
            </button>

            <button
              onClick={() => skip(10)}
              className="p-3 rounded-full hover:bg-gray-100 transition-colors"
            >
              <SkipForward size={24} className="text-gray-700" />
            </button>
          </div>

          <audio
            ref={audioRef}
            src={currentBook?.audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
          />

          {!currentBook?.audioUrl && (
            <div className="mt-4 text-center text-sm text-gray-500 bg-amber-50 rounded-lg p-3">
              <Volume2 size={16} className="inline mr-2" />
              No audio file attached to this book
            </div>
          )}
        </div>
      </main>
    </div>
  );
}