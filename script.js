// DOM Elements
const pasteArea = document.getElementById('pasteArea');
const filledByInput = document.getElementById('filledBy');
const processBtn = document.getElementById('processBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const outputContainer = document.getElementById('outputContainer');
const notification = document.getElementById('notification');

// Column mapping - expected input columns
const INPUT_COLUMNS = {
    NUMBER: 'Number',
    CALLER: 'Caller',
    SHORT_DESCRIPTION: 'Short description',
    PRIORITY: 'Priority',
    CONFIGURATION_ITEM: 'Configuration item',
    STATE: 'State',
    ASSIGNMENT_GROUP: 'Assignment group',
    ASSIGNED_TO: 'Assigned to',
    SLA_DUE: 'SLA due',
    OPENED: 'Opened'
};

// Output columns in order
const OUTPUT_COLUMNS = [
    'Number',
    'State',
    'Priority',
    'Assignment group',
    'filled by',
    'Job name'
];

/**
 * Extract job name from Short description
 * Pattern: Extract text starting with "OMS_" that comes after a colon
 * Example: "UAC Job:wf_StormCaster_DEP_OMS_Feed Application:OMS_STORM_CASTER_DEP_OMS_FEED_Sunday..."
 * Result: "OMS_STORM_CASTER_DEP_OMS_FEED"
 */
function extractJobName(shortDescription) {
    if (!shortDescription || typeof shortDescription !== 'string') {
        return '';
    }

    // Look for pattern: colon followed by optional space, then OMS_ followed by alphanumeric and underscores
    // This ensures we only catch OMS that comes after a colon (like "Application:OMS_STORM_CASTER...")
    const pattern = /:\s*OMS_([A-Z0-9_]+)/gi;
    const matches = Array.from(shortDescription.matchAll(pattern));
    
    if (matches.length === 0) {
        return '';
    }

    // Find the best match (prefer fully uppercase, longer matches)
    let bestMatch = null;
    
    for (const match of matches) {
        const matchedText = 'OMS_' + match[1]; // match[1] is the captured group after OMS_
        
        // Prefer fully uppercase matches (actual job names are uppercase)
        if (matchedText === matchedText.toUpperCase()) {
            if (!bestMatch || matchedText.length > bestMatch.length) {
                bestMatch = matchedText;
            }
        }
    }

    // If no uppercase match found, use the longest one
    if (!bestMatch) {
        bestMatch = matches.reduce((longest, match) => {
            const matchedText = 'OMS_' + match[1];
            return matchedText.length > longest.length ? matchedText : longest;
        }, 'OMS_' + matches[0][1]);
    }

    // Now trim the match to stop before date-like patterns
    // Pattern to detect date-like suffixes: _Sunday, _December, -Sunday, etc.
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dateKeywords = [...daysOfWeek, ...months];
    
    // Check if the match contains a date pattern (like _Sunday, -Sunday, _December, etc.)
    for (const keyword of dateKeywords) {
        // Look for pattern: underscore or dash followed by the keyword
        const datePattern = new RegExp(`(_|-)(?:${keyword})`, 'i');
        const dateMatch = bestMatch.match(datePattern);
        
        if (dateMatch && dateMatch.index !== undefined) {
            // Trim the match to stop before the date pattern
            bestMatch = bestMatch.substring(0, dateMatch.index);
            break;
        }
        
        // Also check for year pattern (4 digits)
        const yearPattern = /(_|-)(\d{4})/;
        const yearMatch = bestMatch.match(yearPattern);
        if (yearMatch && yearMatch.index !== undefined) {
            bestMatch = bestMatch.substring(0, yearMatch.index);
            break;
        }
    }

    return bestMatch.toUpperCase();
}

/**
 * Process Priority column
 * - Remove numbers and special characters
 * - Convert "Moderate" to "Medium"
 * - Keep "High" and "Low" as is
 * Example: "2 - High" → "High", "3 - Moderate" → "Medium"
 */
function processPriority(priority) {
    if (!priority || typeof priority !== 'string') {
        return '';
    }

    // Remove numbers, dashes, and extra spaces
    let processed = priority.replace(/[\d\-]/g, '').trim();
    
    // Replace "Moderate" with "Medium" (case insensitive)
    processed = processed.replace(/moderate/gi, 'Medium');
    
    // Capitalize first letter
    if (processed.length > 0) {
        processed = processed.charAt(0).toUpperCase() + processed.slice(1).toLowerCase();
    }

    return processed;
}

/**
 * Parse tabular data from paste area
 * Handles both tab-separated and space-separated data
 */
function parsePastedData(text) {
    if (!text || !text.trim()) {
        return null;
    }

    const lines = text.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) {
        return null;
    }

    // First line is header
    const headerLine = lines[0];
    const headers = headerLine.split(/\t/).map(h => h.trim());
    
    // Find column indices
    const columnIndices = {};
    headers.forEach((header, index) => {
        const normalizedHeader = header.trim();
        // Try to match with expected columns (case insensitive)
        for (const [key, value] of Object.entries(INPUT_COLUMNS)) {
            if (normalizedHeader.toLowerCase() === value.toLowerCase()) {
                columnIndices[key] = index;
                break;
            }
        }
    });

    // Check if we have at least some required columns
    if (!columnIndices.NUMBER && !columnIndices.SHORT_DESCRIPTION) {
        showNotification('Error: Could not find required columns. Please check your data format.', 'error');
        return null;
    }

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/\t/).map(v => v.trim());
        
        const row = {
            number: columnIndices.NUMBER !== undefined ? values[columnIndices.NUMBER] || '' : '',
            state: columnIndices.STATE !== undefined ? values[columnIndices.STATE] || '' : '',
            priority: columnIndices.PRIORITY !== undefined ? values[columnIndices.PRIORITY] || '' : '',
            assignmentGroup: columnIndices.ASSIGNMENT_GROUP !== undefined ? values[columnIndices.ASSIGNMENT_GROUP] || '' : '',
            shortDescription: columnIndices.SHORT_DESCRIPTION !== undefined ? values[columnIndices.SHORT_DESCRIPTION] || '' : ''
        };

        // Only add row if it has at least a number or short description
        if (row.number || row.shortDescription) {
            data.push(row);
        }
    }

    return data;
}

/**
 * Process the data and return processed rows
 */
function processData(rawData, filledBy) {
    return rawData.map(row => {
        const jobName = extractJobName(row.shortDescription);
        const processedPriority = processPriority(row.priority);

        return {
            number: row.number,
            state: row.state,
            priority: processedPriority,
            assignmentGroup: row.assignmentGroup,
            filledBy: filledBy || '',
            jobName: jobName
        };
    });
}

/**
 * Create and display output table
 */
function displayOutput(processedData) {
    if (!processedData || processedData.length === 0) {
        outputContainer.innerHTML = '<div class="placeholder"><p>No data to display</p></div>';
        return;
    }

    let html = '<table class="output-table"><thead><tr>';
    
    // Create header row
    OUTPUT_COLUMNS.forEach(column => {
        html += `<th>${escapeHtml(column)}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Create data rows
    processedData.forEach(row => {
        html += '<tr>';
        html += `<td>${escapeHtml(row.number)}</td>`;
        html += `<td>${escapeHtml(row.state)}</td>`;
        html += `<td>${escapeHtml(row.priority)}</td>`;
        html += `<td>${escapeHtml(row.assignmentGroup)}</td>`;
        html += `<td>${escapeHtml(row.filledBy)}</td>`;
        html += `<td>${escapeHtml(row.jobName)}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    outputContainer.innerHTML = html;
    copyBtn.disabled = false;
}

/**
 * Generate tab-separated output for copying
 */
function generateTabSeparatedOutput(processedData) {
    if (!processedData || processedData.length === 0) {
        return '';
    }

    // Header row
    let output = OUTPUT_COLUMNS.join('\t') + '\n';

    // Data rows
    processedData.forEach(row => {
        const values = [
            row.number,
            row.state,
            row.priority,
            row.assignmentGroup,
            row.filledBy,
            row.jobName
        ];
        output += values.join('\t') + '\n';
    });

    return output;
}

/**
 * Copy output to clipboard
 */
async function copyToClipboard() {
    const table = outputContainer.querySelector('.output-table');
    if (!table) {
        showNotification('No data to copy', 'error');
        return;
    }

    // Get processed data from table
    const rows = table.querySelectorAll('tbody tr');
    const processedData = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
            number: cells[0].textContent.trim(),
            state: cells[1].textContent.trim(),
            priority: cells[2].textContent.trim(),
            assignmentGroup: cells[3].textContent.trim(),
            filledBy: cells[4].textContent.trim(),
            jobName: cells[5].textContent.trim()
        };
    });

    const tabSeparated = generateTabSeparatedOutput(processedData);

    try {
        await navigator.clipboard.writeText(tabSeparated);
        showNotification('Copied to clipboard!', 'success');
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = tabSeparated;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showNotification('Copied to clipboard!', 'success');
        } catch (err) {
            showNotification('Failed to copy. Please select and copy manually.', 'error');
        }
        document.body.removeChild(textArea);
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show notification
 */
function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

/**
 * Clear all inputs and output
 */
function clearAll() {
    pasteArea.value = '';
    filledByInput.value = '';
    outputContainer.innerHTML = '<div class="placeholder"><p>Processed data will appear here...</p></div>';
    copyBtn.disabled = true;
    pasteArea.focus();
}

// Store processed data globally for copy function
let currentProcessedData = [];

// Event Listeners
processBtn.addEventListener('click', () => {
    const pastedText = pasteArea.value.trim();
    
    if (!pastedText) {
        showNotification('Please paste some data first', 'error');
        return;
    }

    const rawData = parsePastedData(pastedText);
    if (!rawData) {
        return;
    }

    const filledBy = filledByInput.value.trim();
    currentProcessedData = processData(rawData, filledBy);
    displayOutput(currentProcessedData);
    showNotification(`Processed ${currentProcessedData.length} rows successfully!`, 'success');
});

copyBtn.addEventListener('click', copyToClipboard);

clearBtn.addEventListener('click', clearAll);

// Allow Enter key to process (Ctrl+Enter)
pasteArea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        processBtn.click();
    }
});

// Auto-focus on paste area when page loads
window.addEventListener('load', () => {
    pasteArea.focus();
});

