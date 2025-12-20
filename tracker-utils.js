// tracker-utils.js
(function () {
    'use strict';

    window.GistAssignmentTracker = window.GistAssignmentTracker || {};

    // Queue system for rate limiting
    const fetchQueue = [];
    let isProcessingQueue = false;

    function processQueue() {
        if (fetchQueue.length === 0) {
            isProcessingQueue = false;
            return;
        }

        isProcessingQueue = true;
        const task = fetchQueue.shift();
        task();

        setTimeout(processQueue, window.GistAssignmentTracker.Config.FETCH_INTERVAL);
    }

    window.GistAssignmentTracker.Utils = {
        enqueueFetch: function (fn) {
            fetchQueue.push(fn);
            if (!isProcessingQueue) {
                processQueue();
            }
        },

        // Helper: Parse Date string
        // Supports: "2025-12-10 09:00" and "2025년 12월 10일 ... 09:00"
        parseDate: function (dateStr) {
            if (!dateStr) return null;
            try {
                // 1. Try YYYY-MM-DD HH:MM
                let matches = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
                if (matches) {
                    return new Date(matches[1], matches[2] - 1, matches[3], matches[4], matches[5]);
                }

                // 2. Try Korean format
                matches = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*(\d{1,2}):(\d{1,2})/);
                if (matches) {
                    return new Date(matches[1], matches[2] - 1, matches[3], matches[4], matches[5]);
                }

                return null;
            } catch (e) {
                console.error('Date parsing error:', e);
                return null;
            }
        },

        // Helper: Format date string with zero-padding
        formatDateWithPadding: function (dateStr) {
            if (!dateStr) return dateStr;

            // Format: YYYY-MM-DD HH:MM to YYYY-MM-DD HH:MM with zero-padding
            const match = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
            if (match) {
                const year = match[1];
                const month = match[2].padStart(2, '0');
                const day = match[3].padStart(2, '0');
                const hour = match[4].padStart(2, '0');
                const minute = match[5].padStart(2, '0');
                return `${year}-${month}-${day} ${hour}:${minute}`;
            }

            return dateStr;
        },

        // Helper: Calculate remaining time
        calculateTimeRemaining: function (dueDate) {
            const now = new Date();
            const diff = dueDate - now;

            if (diff <= 0) return '';

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

            const parts = [];
            if (days > 0) parts.push(`${days}일`);
            if (hours > 0) parts.push(`${hours}시간`);
            if (minutes > 0) parts.push(`${minutes}분`);

            return parts.length > 0 ? ` (${parts.join(' ')} 남음)` : '';
        },

        // Helper: Determine status based on deadline and submission
        getAssignmentStatus: function (deadline, isSubmitted) {
            const dueDate = this.parseDate(deadline);
            const now = new Date();

            let chipText = '미제출';
            let chipClass = 'status-default';
            let status = 'remaining'; // submitted, overdue, remaining, urgent

            if (isSubmitted) {
                chipText = '제출완료';
                chipClass = 'status-submitted';
                status = 'submitted';
            } else if (dueDate) {
                const diffMs = dueDate - now;
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffMs < 0) {
                    chipText = '마감지남';
                    chipClass = 'status-overdue';
                    status = 'overdue';
                } else if (diffHours <= 72) {
                    chipText = '마감임박';
                    chipClass = 'status-warning';
                    status = 'urgent';
                }
            }

            return { chipText, chipClass, status, dueDate };
        }
    };

})();
