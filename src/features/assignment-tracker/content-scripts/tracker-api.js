// tracker-api.js
(function () {
    'use strict';

    window.GistAssignmentTracker = window.GistAssignmentTracker || {};

    const Utils = window.GistAssignmentTracker.Utils;
    // We assume Config and Utils are loaded

    window.GistAssignmentTracker.Api = {
        fetchAssignmentDetails: async function (url, id, containerUrl, courseId) {
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
                    return null;
                }

                // Improved scraper logic
                const getValueByHeader = (headerText) => {
                    // Try searching in the submission summary table specifically first (most reliable)
                    const summaryTable = doc.querySelector('.submissionsummarytable');
                    if (summaryTable) {
                        const cells = Array.from(summaryTable.querySelectorAll('th, td.cell.c0, td.c0'));
                        const targetCell = cells.find(cell => cell.textContent.includes(headerText));

                        if (targetCell) {
                            const row = targetCell.closest('tr');
                            if (row) {
                                const valueCell = row.querySelector('td.cell.c1, td.c1, td:not(.c0):not(.cell)');
                                if (valueCell) return valueCell.textContent.trim();

                                const nextTd = targetCell.nextElementSibling;
                                if (nextTd && nextTd.tagName === 'TD') return nextTd.textContent.trim();
                            }
                        }
                    }

                    // Fallback to old th search
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
                    const parsedDueDate = Utils.parseDate(dueDate);
                    if (parsedDueDate) {
                        const now = new Date();
                        isSubmitted = now > parsedDueDate;
                    } else {
                        isSubmitted = false;
                    }
                } else {
                    isSubmitted = submissionStatus && (submissionStatus.includes('제출함') || submissionStatus.includes('제출 완료'));
                }

                // Extract assignment title
                const titleElement = doc.querySelector('#region-main > div > h2');
                const assignmentTitle = titleElement ? titleElement.textContent.trim() : '';

                // Extract assignment content
                let assignmentContent = '';
                const contentElement = doc.querySelector('#intro, .box.generalbox.boxaligncenter, [id*="intro"]');
                if (contentElement) {
                    const paragraphs = contentElement.querySelectorAll('p');
                    let rawText = '';

                    if (paragraphs.length > 1) {
                        rawText = Array.from(paragraphs)
                            .map(p => p.textContent.trim())
                            .filter(text => text.length > 0)
                            .join(' · ');
                    } else {
                        rawText = contentElement.textContent.trim();
                    }

                    let processedText = rawText.replace(/\n+/g, ' · ');
                    processedText = processedText.replace(/\s+/g, ' ');
                    processedText = processedText.trim();

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
    };
})();
