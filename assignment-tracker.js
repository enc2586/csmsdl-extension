// Assignment Tracker for GIST LMS
// Handles fetching, caching, and displaying assignment deadlines and submission status

(function () {
    'use strict';

    // Configuration
    const FETCH_INTERVAL = 200; // 200ms between requests
    const CACHE_TTL_DEFAULT = 60 * 1000; // 1 minute
    const CACHE_TTL_SUBMITTED = 7 * 24 * 60 * 60 * 1000; // 1 week

    // Feather Icons (SVGs)
    const ICONS = {
        clock: `<svg viewBox="0 0 24 24" class="assignment-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        check: `<svg viewBox="0 0 24 24" class="assignment-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
        xCircle: `<svg viewBox="0 0 24 24" class="assignment-icon"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
    };

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

        setTimeout(processQueue, FETCH_INTERVAL);
    }

    function enqueueFetch(fn) {
        fetchQueue.push(fn);
        if (!isProcessingQueue) {
            processQueue();
        }
    }

    // Helper: Parse Date string
    // Supports: "2025-12-10 09:00" and "2025년 12월 10일 ... 09:00"
    function parseDate(dateStr) {
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
    }

    // Helper: Format date string with zero-padding
    function formatDateWithPadding(dateStr) {
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
    }

    // Helper: Calculate remaining time
    function calculateTimeRemaining(dueDate) {
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
    }

    // Create UI Element
    function createAssignmentInfoElement() {
        const container = document.createElement('div');
        container.className = 'assignment-info-container';
        return container;
    }

    // Render Assignment Info
    function renderAssignmentInfo(container, data, error = null, assignmentUrl = null) {
        container.innerHTML = '';

        if (error) return;

        if (!data) {
            // Loading state
            container.innerHTML = `
        <span class="assignment-loading">
          <span class="assignment-spinner"></span>
          불러오는 중...
        </span>
      `;
            return;
        }

        const { deadline, isSubmitted, content } = data;
        const dueDate = parseDate(deadline);
        const now = new Date();

        // Determine status chip
        let chipText = '미제출';
        let chipClass = 'status-default';

        if (isSubmitted) {
            chipText = '제출완료';
            chipClass = 'status-submitted';
        } else if (dueDate) {
            const diffMs = dueDate - now;
            const diffHours = diffMs / (1000 * 60 * 60);

            if (diffMs < 0) {
                chipText = '마감지남';
                chipClass = 'status-overdue';
            } else if (diffHours <= 72) {
                chipText = '마감임박';
                chipClass = 'status-warning';
            }
        }

        // Format deadline with padding and add '까지'
        const formattedDeadline = deadline ? formatDateWithPadding(deadline) + '까지' : '마감일 정보 없음';

        // Calculate remaining time if not submitted and deadline is in the future
        const remainingTime = (!isSubmitted && dueDate && dueDate > now) ? calculateTimeRemaining(dueDate) : '';

        // Check if we should show content
        chrome.storage.local.get(['showAssignmentContent'], (result) => {
            const showContent = result.showAssignmentContent !== undefined ? result.showAssignmentContent : true;
            const contentHtml = showContent && content
                ? `<div class="assignment-content-preview">${content}</div>`
                : '';

            // Wrap everything in a link if assignmentUrl is provided
            if (assignmentUrl) {
                container.innerHTML = `
                  <a href="${assignmentUrl}" class="assignment-info-link">
                    <div class="assignment-status-row">
                      <div class="assignment-status-chip ${chipClass}">
                        ${chipText}
                      </div>
                      <div class="assignment-deadline-text">${formattedDeadline}${remainingTime}</div>
                    </div>
                    ${contentHtml}
                  </a>
                `;
            } else {
                container.innerHTML = `
                  <div class="assignment-status-row">
                    <div class="assignment-status-chip ${chipClass}">
                      ${chipText}
                    </div>
                    <div class="assignment-deadline-text">${formattedDeadline}${remainingTime}</div>
                  </div>
                  ${contentHtml}
                `;
            }
        });
    }

    // Render Compact Assignment Info (for course overview section)
    function renderAssignmentInfoCompact(container, data, error = null, assignmentUrl = null) {
        container.innerHTML = '';

        if (error) return;

        if (!data) {
            // Loading state
            container.innerHTML = `
        <span class="assignment-loading">
          <span class="assignment-spinner"></span>
        </span>
      `;
            return;
        }

        const { deadline, isSubmitted } = data;
        const dueDate = parseDate(deadline);
        const now = new Date();

        // Determine status chip
        let chipText = '미제출';
        let chipClass = 'status-default';

        if (isSubmitted) {
            chipText = '제출완료';
            chipClass = 'status-submitted';
        } else if (dueDate) {
            const diffMs = dueDate - now;
            const diffHours = diffMs / (1000 * 60 * 60);

            if (diffMs < 0) {
                chipText = '마감지남';
                chipClass = 'status-overdue';
            } else if (diffHours <= 72) {
                chipText = '마감임박';
                chipClass = 'status-warning';
            }
        }

        // Calculate remaining time only if deadline is in future
        const remainingTimeText = (dueDate && dueDate > now) ? calculateTimeRemaining(dueDate).replace(/[()]/g, '').trim() : '';

        // Create clickable link wrapper
        const link = assignmentUrl || '#';

        container.innerHTML = `
          <a href="${link}" class="assignment-compact-link">
            <div class="assignment-compact-chip ${chipClass}">
              ${chipText}
            </div>
            ${remainingTimeText ? `<div class="assignment-compact-remaining">${remainingTimeText}</div>` : ''}
          </a>
        `;
    }

    // Fetch Assignment Details
    async function fetchAssignmentDetails(url, id, containerUrl, courseId) {
        try {
            // credentials: 'include' ensures cookies are sent with the request
            const response = await fetch(url, { credentials: 'include' });
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // Debug: Check if we are on the right page
            const title = doc.querySelector('title')?.textContent || '';
            const hasContent = text.includes('제출 상황');

            console.log(`[Tracker] Fetched ${id}: Title="${title}", HasContent=${hasContent}`);

            if (!hasContent) {
                console.warn(`[Tracker] "제출 상황" missing! Redirected? URL=${response.url}`);
                // If it looks like a login page, we can't do anything
                return null;
            }

            // Improved scraper logic
            const getValueByHeader = (headerText) => {
                // Try searching in the submission summary table specifically first (most reliable)
                const summaryTable = doc.querySelector('.submissionsummarytable');
                if (summaryTable) {
                    // Moodle often uses <td class="cell c0">Header</td><td class="cell c1">Value</td>
                    // instead of <th>. Let's look for both.
                    const cells = Array.from(summaryTable.querySelectorAll('th, td.cell.c0, td.c0'));
                    const targetCell = cells.find(cell => cell.textContent.includes(headerText));

                    if (targetCell) {
                        // Should be the next sibling or in same row
                        const row = targetCell.closest('tr');
                        if (row) {
                            // We want the cell that is NOT the header cell
                            // usually the last column or the one with class c1
                            const valueCell = row.querySelector('td.cell.c1, td.c1, td:not(.c0):not(.cell)');
                            if (valueCell) return valueCell.textContent.trim();

                            // Fallback: just get the next td
                            const nextTd = targetCell.nextElementSibling;
                            if (nextTd && nextTd.tagName === 'TD') return nextTd.textContent.trim();
                        }
                    }
                }

                // Fallback to old th search if table not found or standard structure
                let ths = Array.from(doc.querySelectorAll('th'));
                let targetTh = ths.find(th => th.textContent.includes(headerText));

                if (targetTh) {
                    const row = targetTh.closest('tr');
                    if (row) {
                        const td = row.querySelector('td');
                        if (td) return td.textContent.trim();
                    }
                }
                return null;
            };

            const submissionStatus = getValueByHeader('제출 여부');
            const dueDate = getValueByHeader('종료 일시');

            // Check if this assignment requires online submission
            const noSubmissionRequired = submissionStatus && submissionStatus.includes('온라인 제출물을 요구하지 않습니다');

            let isSubmitted;
            if (noSubmissionRequired) {
                // For assignments that don't require submission:
                // - Before deadline: treat as not submitted (미제출)
                // - After deadline: treat as submitted (제출함)
                const parsedDueDate = parseDate(dueDate);
                if (parsedDueDate) {
                    const now = new Date();
                    isSubmitted = now > parsedDueDate;
                } else {
                    // If no due date, treat as not submitted
                    isSubmitted = false;
                }
            } else {
                // Normal logic: check for '제출함' or '제출 완료' in submission status
                isSubmitted = submissionStatus && (submissionStatus.includes('제출함') || submissionStatus.includes('제출 완료'));
            }

            // Extract assignment title - use specific selector
            const titleElement = doc.querySelector('#region-main > div > h2');
            const assignmentTitle = titleElement ? titleElement.textContent.trim() : '';

            // Extract assignment content (description)
            let assignmentContent = '';
            const contentElement = doc.querySelector('#intro, .box.generalbox.boxaligncenter, [id*="intro"]');
            if (contentElement) {
                // Check if there are multiple paragraph tags
                const paragraphs = contentElement.querySelectorAll('p');
                let rawText = '';

                if (paragraphs.length > 1) {
                    // Multiple paragraphs - join with newline marker
                    rawText = Array.from(paragraphs)
                        .map(p => p.textContent.trim())
                        .filter(text => text.length > 0)
                        .join('###NEWLINE###');
                } else {
                    // Single paragraph or no paragraph structure - use text content
                    rawText = contentElement.textContent.trim();
                }

                // Replace newlines with '/' - ensure spacing around slash
                let processedText = rawText.replace(/\n+/g, '###NEWLINE###');
                // Normalize whitespace
                processedText = processedText.replace(/\s+/g, ' ');
                // Replace newline markers with proper spacing
                processedText = processedText.replace(/###NEWLINE###/g, (match, offset, str) => {
                    const before = offset > 0 ? str[offset - 1] : '';
                    const after = offset + match.length < str.length ? str[offset + match.length] : '';
                    const needsBefore = before && before !== ' ';
                    const needsAfter = after && after !== ' ';
                    return (needsBefore ? ' ' : '') + '·' + (needsAfter ? ' ' : '');
                });
                processedText = processedText.trim();
                // Take first 200 characters
                if (processedText.length > 200) {
                    assignmentContent = processedText.substring(0, 200) + '...';
                } else {
                    assignmentContent = processedText;
                }
            }

            if (!submissionStatus && !dueDate) {
                console.error(`[Tracker] Parsing Failed for ${id}. Available Headers:`,
                    Array.from(doc.querySelectorAll('th')).map(th => th.textContent.trim())
                );
            }

            console.log(`[Tracker] Parsed ${id}: Title=${assignmentTitle}, Status=${submissionStatus}, Due=${dueDate}, Content=${assignmentContent}`);

            return {
                id,
                courseId,
                title: assignmentTitle,
                content: assignmentContent,
                deadline: dueDate,
                isSubmitted,
                timestamp: Date.now()
            };
        } catch (e) {
            console.error('Fetch error:', e);
            return null;
        }
    }

    // --- Dashboard Logic ---

    const dashboardState = {
        assignments: {}, // { id: { title, deadline, isSubmitted, link } }
        timer: null,
        rendered: false,
        showContent: false, // Track if content should be displayed
        isLoading: true, // Track if initial data is still loading
        loadedCount: 0, // Track how many assignments have loaded
        totalCount: 0 // Total number of assignments
    };

    // Store references to all assignment info containers for re-rendering
    const assignmentContainers = new Map(); // Map of id -> { container, data, url }

    const DASHBOAD_DEBOUNCE_MS = 500;

    // Load settings from storage
    function loadSettings() {
        chrome.storage.local.get(['showAssignmentContent'], (result) => {
            // Default to true if not set
            dashboardState.showContent = result.showAssignmentContent !== undefined ? result.showAssignmentContent : true;
            renderDashboard();
        });
    }

    // Save settings to storage
    function saveSettings() {
        chrome.storage.local.set({ showAssignmentContent: dashboardState.showContent });
    }

    // Toggle settings modal
    function toggleSettingsModal() {
        let modal = document.getElementById('assignment-settings-modal');
        if (modal) {
            modal.remove();
        } else {
            showSettingsModal();
        }
    }

    // Show settings modal
    function showSettingsModal() {
        const modal = document.createElement('div');
        modal.id = 'assignment-settings-modal';
        modal.className = 'assignment-modal-overlay';

        modal.innerHTML = `
            <div class="assignment-modal-content">
                <div class="assignment-modal-header">
                    <h3>과제 표시 설정</h3>
                    <button class="assignment-modal-close" id="close-modal-btn">&times;</button>
                </div>
                <div class="assignment-modal-body">
                    <label class="assignment-checkbox-label">
                        <input type="checkbox" id="show-content-checkbox" ${dashboardState.showContent ? 'checked' : ''}>
                        <span>과제 본문 표시</span>
                    </label>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        document.getElementById('close-modal-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        document.getElementById('show-content-checkbox').addEventListener('change', (e) => {
            dashboardState.showContent = e.target.checked;
            saveSettings();
            renderDashboard();
            // Broadcast settings change to all assignment components
            broadcastSettingsChange();
        });
    }

    // Broadcast settings change to all assignment info containers
    function broadcastSettingsChange() {
        assignmentContainers.forEach(({ container, data, url }) => {
            if (data) {
                renderAssignmentInfo(container, data, null, url);
            }
        });
    }

    function scheduleDashboardUpdate() {
        if (dashboardState.timer) clearTimeout(dashboardState.timer);
        dashboardState.timer = setTimeout(renderDashboard, DASHBOAD_DEBOUNCE_MS);
    }

    function renderDashboard() {
        // 1. Find Insertion Point (Once)
        let container = document.getElementById('assignment-dashboard-root');
        if (!container) {
            const mainContent = document.querySelector('.course-content');
            // Try to find the list of weeks (ul.weeks or ul.topics)
            const topicsList = mainContent ? mainContent.querySelector('ul.topics, ul.weeks') : null;

            if (topicsList) {
                // Create a List Item that looks like a section
                container = document.createElement('li');
                container.id = 'assignment-dashboard-root';
                container.className = 'section main assignment-dashboard-container'; // mimic standard section classes
                // Insert placement:
                // User wants it AFTER the general section (Notice/QnA).
                // Moodle typically has 'li#section-0' for general stuff.
                const section0 = topicsList.querySelector('#section-0');

                if (section0 && section0.nextSibling) {
                    topicsList.insertBefore(container, section0.nextSibling);
                } else if (section0) {
                    topicsList.appendChild(container);
                } else {
                    // If no section-0, just put at top
                    if (topicsList.firstChild) {
                        topicsList.insertBefore(container, topicsList.firstChild);
                    } else {
                        topicsList.appendChild(container);
                    }
                }
                dashboardState.rendered = true;
            } else {
                return;
            }
        }

        // 2. Aggregate Data
        const assignments = Object.values(dashboardState.assignments);
        const total = assignments.length;

        let completed = 0;
        let urgentList = [];
        let overdueList = [];

        const now = new Date();
        const urgentThresholdMs = 72 * 60 * 60 * 1000; // 72 hours

        assignments.forEach(a => {
            if (a.isSubmitted) {
                completed++;
            } else {
                const dueDate = parseDate(a.deadline);
                if (dueDate) {
                    const diff = dueDate - now;
                    if (diff < 0) {
                        overdueList.push({ ...a, diff });
                    } else if (diff <= urgentThresholdMs) {
                        urgentList.push({ ...a, diff });
                    }
                }
            }
        });

        urgentList.sort((a, b) => a.diff - b.diff);
        overdueList.sort((a, b) => b.diff - a.diff);

        // 3. Render HTML
        const urgentAndOverdue = urgentList.length + overdueList.length;
        const remaining = total - completed - urgentAndOverdue;

        // Header - Simplified
        let html = `
      <div class="content">
        <div class="dashboard-divider"></div>
        <div class="dashboard-header">
          <span>과제 개요</span>
          <button class="dashboard-settings-btn" id="dashboard-settings-btn" title="설정">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
        
        <div class="dashboard-stats">
          <div class="stat-item">
            <div class="stat-value" style="color: #2e7d32">${completed}</div>
            <div class="stat-label">완료</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color: #c62828">${urgentAndOverdue}</div>
            <div class="stat-label">임박/지각</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color: #757575">${remaining}</div>
            <div class="stat-label">남음</div>
          </div>
        </div>
    `;

        // Urgent / Overdue Section
        const itemsToShow = [...overdueList, ...urgentList];

        if (itemsToShow.length === 0) {
            html += `
         <div class="dashboard-empty">
           지금은 마감이 임박하거나 지난 과제가 없습니다.
         </div>
       `;
        } else {
            html += `<div class="task-list-title">임박/지각 과제</div>
                <div class="dashboard-task-list">`;

            itemsToShow.forEach(item => {
                let chipClass = 'status-warning';
                let chipText = '마감임박';
                if (item.diff < 0) {
                    chipClass = 'status-overdue';
                    chipText = '마감지남';
                }

                const dueDate = parseDate(item.deadline);
                const formattedDeadline = item.deadline ? formatDateWithPadding(item.deadline) + '까지' : '';
                const remainingTime = (dueDate && item.diff > 0) ? calculateTimeRemaining(dueDate) : '';

                // Add content if enabled
                const contentHtml = dashboardState.showContent && item.content
                    ? `<div class="task-content">${item.content}</div>`
                    : '';

                html += `
           <a href="${item.link}" class="dashboard-task-item">
             <div class="task-left">
               <span class="assignment-status-chip ${chipClass}">${chipText}</span>
               <div class="task-info">
                 <span class="task-title" title="${item.title}">${item.title}</span>
                 ${contentHtml}
               </div>
             </div>
             <span class="task-due">${formattedDeadline}${remainingTime}</span>
           </a>
         `;
            });
            html += `</div>`;
        }

        html += `</div>`; // Close .content

        container.innerHTML = html;

        // Add event listener for settings button
        const settingsBtn = document.getElementById('dashboard-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', toggleSettingsModal);
        }
    }

    // --- End Dashboard Logic ---

    // Main Logic for an Assignment Link
    function handleAssignmentLink(link) {
        const href = link.href;
        const url = new URL(href);
        const id = url.searchParams.get('id');

        if (!id) return;
        if (link.dataset.trackerProcessed) return;
        link.dataset.trackerProcessed = 'true';

        // Get Title
        let title = link.textContent.trim();
        // Moodle titles often have hidden span "Assignment"
        const hiddenSpan = link.querySelector('.accesshide');
        if (hiddenSpan) {
            // Clone and remove hidden span to get only visible text
            const clone = link.cloneNode(true);
            const hide = clone.querySelector('.accesshide');
            if (hide) hide.remove();
            title = clone.textContent.trim();
        }

        // Register to Dashboard
        dashboardState.assignments[id] = { id, link: href, title, isSubmitted: false, deadline: null, content: '' };
        dashboardState.totalCount++; // Increment total count for loading indicator
        scheduleDashboardUpdate(); // Initial register

        // Create UI container
        const infoContainer = createAssignmentInfoElement();

        // Register container for settings updates
        assignmentContainers.set(id, { container: infoContainer, data: null, url: href });

        // Position: specifically requested "immediately below title label with small gap"
        // Moodle structure: <div class="activityinstance"><a ...><span class="instancename">Title<span class="accesshide">...</span></span></a></div>
        // To minimize gap, we should append INSIDE the anchor tag if possible (block element inside inline might be weird but works)
        // OR append after the .instancename span if the anchor is display:block or flex.
        // Safest and closest is to append to the .activityinstance div, but ensure margin-top is tiny (handled in CSS).

        // Check if this assignment is in the course overview section (section-0)
        const isInOverview = link.closest('#section-0') !== null;

        const activityInstance = link.closest('.activityinstance');
        if (activityInstance) {
            activityInstance.appendChild(infoContainer);
        } else {
            // Fallback
            link.parentElement.appendChild(infoContainer);
        }

        // Capture render to update Dashboard
        const proxyRender = (container, data, error) => {
            // Use compact rendering for overview section, regular for others
            if (isInOverview) {
                renderAssignmentInfoCompact(container, data, error, href);
            } else {
                renderAssignmentInfo(container, data, error, href);
            }

            if (data) {
                // Update container map with latest data
                assignmentContainers.set(id, { container, data, url: href });

                dashboardState.assignments[id] = {
                    ...dashboardState.assignments[id],
                    title: data.title || dashboardState.assignments[id].title,
                    content: data.content || '',
                    isSubmitted: data.isSubmitted,
                    deadline: data.deadline
                };

                // Update loading count
                dashboardState.loadedCount++;
                if (dashboardState.loadedCount >= dashboardState.totalCount) {
                    dashboardState.isLoading = false;
                }

                scheduleDashboardUpdate();
            }
        }

        // Initial Render (Loading)
        proxyRender(infoContainer, null);

        // Check Cache
        const cacheKey = `assignment_${id}`;
        chrome.storage.local.get([cacheKey], (result) => {
            const cached = result[cacheKey];
            const now = Date.now();
            let isValid = false;

            if (cached) {
                const ttl = cached.isSubmitted ? CACHE_TTL_SUBMITTED : CACHE_TTL_DEFAULT;
                if (now - cached.timestamp < ttl) {
                    isValid = true;
                }
            }

            if (isValid) {
                proxyRender(infoContainer, cached);
            } else {
                // Extract course ID from current page URL
                const courseId = (() => {
                    try {
                        const params = new URLSearchParams(window.location.search);
                        return params.get('id') || null;
                    } catch (e) {
                        return null;
                    }
                })();

                // Fetch
                enqueueFetch(async () => {
                    const data = await fetchAssignmentDetails(href, id, href, courseId);
                    if (data) {
                        // Update UI
                        proxyRender(infoContainer, data);
                        // Save Cache
                        chrome.storage.local.set({ [cacheKey]: data });
                    } else {
                        // Error
                        proxyRender(infoContainer, null, true);
                    }
                });
            }
        });
    }

    // Initialize
    function init() {
        // Load settings first
        loadSettings();

        // Find all assignment links
        // URL pattern: mod/assign/view.php?id=...
        const links = document.querySelectorAll('a[href*="mod/assign/view.php?id="]');

        console.log(`Found ${links.length} assignment links`);

        links.forEach(link => {
            // Filter out links that might be irrelevant (e.g. key links, though usually all are valid assignments)
            // Moodle course page: check if it's inside an activity section
            if (link.closest('.activity.assign') || link.closest('.modtype_assign')) {
                handleAssignmentLink(link);
            } else {
                // Sometimes structure is different, let's just try all unique IDs
                handleAssignmentLink(link);
            }
        });
    }

    // Run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
