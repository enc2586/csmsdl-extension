// COURSEMOS PDF Downloader Content Script
(function () {
  'use strict';

  // Helper: Convert Base64 to ArrayBuffer
  function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Helper: Convert ArrayBuffer to Base64
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Check if current URL is a COURSEMOS document page
  function isCoursemosURL() {
    const currentURL = window.location.href;
    return currentURL.includes('lms.gist.ac.kr/local/ubdoc/');
  }

  // Wait for iframe to be available
  function waitForIframe(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkIframe = () => {
        const iframe = document.querySelector('iframe');

        if (iframe && iframe.src && iframe.src.includes('doc.coursemos.co.kr/view/v1/viewer/doc.html')) {
          resolve(iframe);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Iframe not found within timeout'));
        } else {
          setTimeout(checkIframe, 100);
        }
      };

      checkIframe();
    });
  }

  // Extract document parameters from iframe URL
  function extractDocumentParams(iframe) {
    if (!iframe) return null;

    try {
      const url = new URL(iframe.src);
      const fn = url.searchParams.get('fn');
      const rs = url.searchParams.get('rs');
      const rmn = url.searchParams.get('rmn') || 'document';

      if (!fn || !rs) return null;

      return { fn, rs, rmn };
    } catch (e) {
      console.error('Failed to extract document parameters:', e);
      return null;
    }
  }

  // Create floating download button
  function createDownloadButton() {
    const button = document.createElement('button');
    button.id = 'coursemos-download-btn';
    button.title = 'Download as PDF';

    // Progress ring SVG
    const progressRing = `
      <svg class="progress-ring" viewBox="0 0 62 62">
        <circle
          class="progress-ring-circle"
          cx="31"
          cy="31"
          r="28"
          stroke-dasharray="175.93"
          stroke-dashoffset="175.93"
        />
      </svg>
    `;

    // Download icon SVG
    const downloadIcon = `
      <svg viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `;

    button.innerHTML = progressRing + downloadIcon;
    document.body.appendChild(button);

    // Create progress text
    const progressText = document.createElement('div');
    progressText.id = 'coursemos-progress-text';
    document.body.appendChild(progressText);

    return button;
  }

  // Update progress indicator
  function updateProgress(current, total, status) {
    const progressText = document.getElementById('coursemos-progress-text');
    const progressCircle = document.querySelector('.progress-ring-circle');

    if (status) {
      progressText.textContent = status;
      progressText.classList.add('visible');
    }

    if (current !== null && total !== null && total > 0) {
      const percentage = current / total;
      const circumference = 175.93;
      const offset = circumference * (1 - percentage);
      progressCircle.style.strokeDashoffset = offset;
    }
  }

  // Hide progress indicator
  function hideProgress() {
    const progressText = document.getElementById('coursemos-progress-text');
    const progressCircle = document.querySelector('.progress-ring-circle');

    progressText.classList.remove('visible');
    progressCircle.style.strokeDashoffset = 175.93;
  }

  // Download images and convert to PDF
  async function downloadAsPDF(iframe) {
    const button = document.getElementById('coursemos-download-btn');
    if (button.classList.contains('downloading')) return;

    const params = extractDocumentParams(iframe);
    if (!params) {
      alert('Failed to extract document parameters');
      return;
    }

    button.classList.add('downloading');

    try {
      const { fn, rs, rmn } = params;
      const baseURL = `https://doc.coursemos.co.kr${rs}/${fn}.files`;

      // Step 1: Download all images
      updateProgress(0, 100, 'Scanning pages...');
      const images = [];
      let pageNum = 1;

      while (true) {
        const imageURL = `${baseURL}/${pageNum}.png`;

        try {
          updateProgress(pageNum, pageNum + 1, `Scanning page ${pageNum}...`);

          // Use background script to bypass CORS
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { action: 'downloadImage', url: imageURL },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              }
            );
          });

          if (!response.success) {
            // No more pages (404 or other error)
            if (response.status === 404) {
              break;
            }
            throw new Error(response.error || 'Download failed');
          }

          // Convert base64 back to ArrayBuffer
          const arrayBuffer = base64ToArrayBuffer(response.data);
          images.push(arrayBuffer);
          pageNum++;
        } catch (e) {
          console.error(`Failed to download page ${pageNum}:`, e);
          break;
        }
      }

      if (images.length === 0) {
        alert('No images found to download');
        hideProgress();
        button.classList.remove('downloading');
        return;
      }

      // Step 2: Create PDF
      updateProgress(0, images.length, 'Creating PDF...');

      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < images.length; i++) {
        updateProgress(i + 1, images.length, `Adding page ${i + 1}/${images.length} to PDF...`);

        const image = await pdfDoc.embedPng(images[i]);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }

      // Step 3: Save PDF
      updateProgress(images.length, images.length, 'Saving PDF...');
      const pdfBytes = await pdfDoc.save();

      // Create Blob and download directly (content script has URL.createObjectURL)
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = rmn; // Use the filename from iframe parameters
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      updateProgress(images.length, images.length, 'Complete!');
      setTimeout(() => {
        hideProgress();
        button.classList.remove('downloading');
      }, 2000);

    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to create PDF: ' + error.message);
      hideProgress();
      button.classList.remove('downloading');
    }
  }

  // Initialize
  async function init() {
    // First check if we're on the correct URL
    if (!isCoursemosURL()) {
      console.log('Not a COURSEMOS document page URL');
      return;
    }

    console.log('COURSEMOS URL detected, waiting for iframe...');

    try {
      // Wait for iframe to load
      const iframe = await waitForIframe();

      console.log('Iframe found, creating download button');

      // Create download button
      const button = createDownloadButton();
      button.addEventListener('click', () => downloadAsPDF(iframe));

      console.log('COURSEMOS PDF Downloader initialized');
    } catch (error) {
      console.error('Failed to initialize:', error.message);
    }
  }

  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
