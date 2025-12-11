// Background Service Worker for COURSEMOS PDF Downloader
// Handles image downloads to bypass CORS restrictions

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadImage') {
        // Download image from background context (no CORS)
        (async () => {
            try {
                const response = await fetch(request.url);

                if (!response.ok) {
                    sendResponse({ success: false, status: response.status });
                    return;
                }

                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();

                // Convert to base64 for message passing
                const base64 = arrayBufferToBase64(arrayBuffer);
                sendResponse({ success: true, data: base64 });
            } catch (error) {
                console.error('Background fetch error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();

        // Return true to indicate async response
        return true;
    }

    if (request.action === 'downloadPDF') {
        // Download PDF using data URL (service workers can't use URL.createObjectURL)
        (async () => {
            try {
                // Create data URL from base64
                const dataUrl = `data:application/pdf;base64,${request.data}`;

                chrome.downloads.download({
                    url: dataUrl,
                    filename: request.filename,
                    saveAs: false
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error('Download error:', chrome.runtime.lastError);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        console.log('PDF download started:', downloadId);
                        sendResponse({ success: true, downloadId: downloadId });
                    }
                });
            } catch (error) {
                console.error('PDF creation error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true;
    }
});

// Helper: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper: Convert Base64 to Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

console.log('COURSEMOS PDF Downloader background service worker loaded');
