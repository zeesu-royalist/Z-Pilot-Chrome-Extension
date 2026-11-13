import { describe, it, expect } from 'vitest';
import { scanDocumentVideos } from '../content/dom-video-scanner.js';

describe('dom-video-scanner', () => {
  it('discovers <video>, <source>, OpenGraph meta, JSON-LD VideoObject, and inline script URLs', () => {
    document.title = 'Demo Video Page';
    document.head.innerHTML = `
      <meta property="og:title" content="OG Clip Title" />
      <meta property="og:image" content="https://example.com/thumb.jpg" />
      <meta property="og:video:secure_url" content="https://cdn.example.com/og-clip.mp4" />
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          "name": "Structured Clip",
          "contentUrl": "https://cdn.example.com/jsonld.webm"
        }
      </script>
    `;

    document.body.innerHTML = `
      <video poster="/poster.png" width="1280" height="720">
        <source src="/media/hero.mp4" type="video/mp4" />
      </video>
      <div id="shadow-host"></div>
      <script>
        var streamUrl = "https:\\/\\/cdn.example.com\\/hls\\/stream.m3u8?token=abc";
      </script>
    `;

    const host = document.getElementById('shadow-host')!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<video src="https://cdn.example.com/shadow.mp4"></video>`;

    const found = scanDocumentVideos(document, 'https://example.com/watch');
    const urls = found.map((v) => v.url);

    expect(urls).toContain('https://example.com/media/hero.mp4');
    expect(urls).toContain('https://cdn.example.com/shadow.mp4');
    expect(urls).toContain('https://cdn.example.com/og-clip.mp4');
    expect(urls).toContain('https://cdn.example.com/jsonld.webm');
    expect(urls).toContain('https://cdn.example.com/hls/stream.m3u8?token=abc');
  });

  it('scans <audio> elements, nested audio <source> tags, and audio anchor links', () => {
    document.title = 'Podcast Audio Page';
    document.head.innerHTML = `
      <meta property="og:audio" content="https://cdn.example.com/podcast-meta.mp3" />
    `;
    document.body.innerHTML = `
      <audio title="Interview Episode">
        <source src="https://cdn.example.com/episode.mp3" type="audio/mpeg" />
      </audio>
      <audio src="https://cdn.example.com/voice.m4a" title="Voice Note"></audio>
      <a href="https://cdn.example.com/music-track.wav">Download Song (WAV)</a>
    `;

    const candidates = scanDocumentVideos(document, 'https://example.com/podcast');
    const audioCandidates = candidates.filter((c) => c.format === 'audio');
    const urls = audioCandidates.map((c) => c.url);

    expect(urls).toContain('https://cdn.example.com/episode.mp3');
    expect(urls).toContain('https://cdn.example.com/voice.m4a');
    expect(urls).toContain('https://cdn.example.com/podcast-meta.mp3');
    expect(urls).toContain('https://cdn.example.com/music-track.wav');
    expect(audioCandidates.find((c) => c.url.includes('episode.mp3'))?.title).toBe(
      'Interview Episode'
    );
  });

  it('extracts specific video and lesson title on course pages when page title is generic site brand', () => {
    document.title = 'Apna College';
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <div class="course-syllabus">
        <div class="module-title">08 Installation</div>
        <div class="lesson-item active">
          <span class="lesson-num">95</span>
          <span class="lesson-name">Installing Anaconda</span>
          <span class="badge">VIDEO</span>
        </div>
        <div class="lesson-item">
          <span class="lesson-num">96</span>
          <span class="lesson-name">Conda Prompt</span>
          <span class="badge">VIDEO</span>
        </div>
      </div>
      <div class="video-container">
        <video src="https://cdn.example.com/lecture.mp4"></video>
      </div>
    `;

    const candidates = scanDocumentVideos(document, 'https://apnacollege.in/course/python');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('95 Installing Anaconda');
  });
});

