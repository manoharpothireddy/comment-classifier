/* ============================================
   CommentIQ — Application Logic
   ============================================ */

// ---- Sample Comments ----
const SAMPLES = {
    spam: "🔥 LIMITED TIME OFFER! Click here to win a FREE iPhone 15! Visit www.totallylegit-prizes.com NOW before this offer expires!!! 💰💰💰",
    question: "Hey, does anyone know how to properly configure CORS headers in Express.js? I've been struggling with this for hours and the documentation isn't very clear about middleware ordering.",
    feedback: "I've been using this app for about 3 months now. The UI is generally clean and intuitive, but I've noticed the search feature could be faster. Also, adding dark mode would be a great improvement. Overall, solid 4/5 experience.",
    toxic: "This is the worst piece of software I've ever seen. The devs clearly have no idea what they're doing. What a complete waste of time and money. Absolutely terrible.",
    appreciation: "Just wanted to say thank you to the entire team! The latest update is phenomenal — everything feels so much smoother and the new features are exactly what I needed. You guys are incredible! 🙌"
};

// ---- Intent Emoji Map ----
const INTENT_EMOJIS = {
    spam: "🛒",
    question: "❓",
    feedback: "💬",
    complaint: "😤",
    appreciation: "❤️",
    suggestion: "💡",
    request: "🙋",
    opinion: "🗣️",
    informational: "ℹ️",
    toxic: "⚠️",
    greeting: "👋",
    humor: "😄",
    promotion: "📢",
    support: "🆘",
    other: "📝"
};

// ---- State ----
let history = JSON.parse(localStorage.getItem('commentiq_history') || '[]');
let classifying = false;

// ---- DOM Elements ----
const commentInput = document.getElementById('commentInput');
const charCount = document.getElementById('charCount');
const classifyBtn = document.getElementById('classifyBtn');
const btnLoader = document.getElementById('btnLoader');
const resultCard = document.getElementById('resultCard');
const resultsSection = document.getElementById('resultsSection');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const statsCount = document.getElementById('statsCount');
const clearHistoryBtn = document.getElementById('clearHistory');

// ---- Init ----
function init() {
    updateStats();
    renderHistory();

    // Event listeners
    commentInput.addEventListener('input', onInputChange);
    classifyBtn.addEventListener('click', classifyComment);
    clearHistoryBtn.addEventListener('click', clearHistory);

    // Sample chips
    document.querySelectorAll('.chip[data-sample]').forEach(chip => {
        chip.addEventListener('click', () => {
            const sample = chip.dataset.sample;
            commentInput.value = SAMPLES[sample] || '';
            onInputChange();
            commentInput.focus();
        });
    });

    // Keyboard shortcut: Ctrl+Enter to classify
    commentInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            classifyComment();
        }
    });
}

// ---- Input Handling ----
function onInputChange() {
    const len = commentInput.value.length;
    charCount.textContent = len;
    classifyBtn.disabled = len === 0 || classifying;
}

// ---- Classification ----
async function classifyComment() {
    const text = commentInput.value.trim();
    if (!text || classifying) return;

    classifying = true;
    classifyBtn.classList.add('loading');
    classifyBtn.disabled = true;

    try {
        const result = await callOpenRouterAPI(text);
        displayResult(result, text);
        addToHistory(result, text);
    } catch (error) {
        console.error('Classification error:', error);
        showToast(error.message || 'Classification failed. Please try again.');
    } finally {
        classifying = false;
        classifyBtn.classList.remove('loading');
        onInputChange();
    }
}

async function callOpenRouterAPI(commentText) {
    const response = await fetch('/api/classify', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ commentText })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Server error occurred during classification.');
    }

    return data;
}

// ---- Display Result ----
function displayResult(result, originalText) {
    // Intent badge
    const emoji = INTENT_EMOJIS[result.intent?.toLowerCase()] || '📝';
    document.getElementById('intentEmoji').textContent = emoji;
    document.getElementById('intentName').textContent = capitalizeFirst(result.intent || 'Unknown');

    // Confidence ring
    const confidence = Math.round(result.confidence || 0);
    document.getElementById('confidenceValue').textContent = confidence + '%';

    // Create gradient for ring
    const ringFill = document.getElementById('ringFill');
    ringFill.setAttribute('stroke-dasharray', `${confidence}, 100`);

    // Ensure SVG gradient exists
    ensureRingGradient();

    // Sentiment
    const sentimentIcon = {
        positive: '😊', negative: '😞', neutral: '😐', mixed: '🤔'
    };
    document.getElementById('sentimentIcon').textContent = sentimentIcon[result.sentiment?.toLowerCase()] || '😐';
    document.getElementById('sentimentValue').textContent = capitalizeFirst(result.sentiment || 'Neutral');

    const sentimentScore = ((result.sentiment_score || 0) + 100) / 2; // normalize to 0-100
    document.getElementById('sentimentBar').style.width = sentimentScore + '%';

    // Toxicity
    const toxicity = Math.round(result.toxicity_score || 0);
    document.getElementById('toxicityValue').textContent = toxicity + '% risk';
    document.getElementById('toxicityBar').style.width = toxicity + '%';

    // Category & Action
    document.getElementById('categoryValue').textContent = result.category || 'General';
    document.getElementById('actionValue').textContent = result.action_required || 'None';

    // Tags
    const tagsContainer = document.getElementById('resultTags');
    tagsContainer.innerHTML = '';

    // Intent tag
    const intentTag = createTag(result.intent, 'tag-intent');
    tagsContainer.appendChild(intentTag);

    // Sentiment tag
    const sentimentTagClass = result.sentiment?.toLowerCase() === 'positive' ? 'tag-sentiment-positive'
        : result.sentiment?.toLowerCase() === 'negative' ? 'tag-sentiment-negative'
            : 'tag-sentiment-neutral';
    tagsContainer.appendChild(createTag(result.sentiment, sentimentTagClass));

    // Additional tags
    if (result.tags && Array.isArray(result.tags)) {
        result.tags.slice(0, 4).forEach(tag => {
            tagsContainer.appendChild(createTag(tag, 'tag-topic'));
        });
    }

    // Explanation
    document.getElementById('explanationText').textContent = result.explanation || 'No explanation available.';

    // Timestamp
    document.getElementById('resultTimestamp').textContent = new Date().toLocaleTimeString();

    // Show result card
    resultCard.style.display = '';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function createTag(text, className) {
    const tag = document.createElement('span');
    tag.className = `tag ${className}`;
    tag.textContent = capitalizeFirst(text || '');
    return tag;
}

function ensureRingGradient() {
    const svg = document.querySelector('.confidence-ring svg');
    if (!svg) return;

    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.prepend(defs);
    }

    if (!defs.querySelector('#ringGradient')) {
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.id = 'ringGradient';
        grad.setAttribute('x1', '0%');
        grad.setAttribute('y1', '0%');
        grad.setAttribute('x2', '100%');
        grad.setAttribute('y2', '100%');

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', '#6366f1');

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', '#a855f7');

        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defs.appendChild(grad);
    }
}

// ---- History ----
function addToHistory(result, text) {
    const item = {
        id: Date.now(),
        text: text.substring(0, 200),
        intent: result.intent,
        confidence: result.confidence,
        sentiment: result.sentiment,
        timestamp: new Date().toISOString(),
        fullResult: result
    };

    history.unshift(item);
    if (history.length > 50) history.pop(); // Cap at 50

    localStorage.setItem('commentiq_history', JSON.stringify(history));
    updateStats();
    renderHistory();
}

function renderHistory() {
    if (history.length === 0) {
        historySection.style.display = 'none';
        return;
    }

    historySection.style.display = '';
    historyList.innerHTML = '';

    history.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.style.animationDelay = `${i * 0.05}s`;

        const emoji = INTENT_EMOJIS[item.intent?.toLowerCase()] || '📝';
        const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        el.innerHTML = `
            <span class="history-emoji">${emoji}</span>
            <div class="history-content">
                <div class="history-text">${escapeHtml(item.text)}</div>
                <div class="history-meta">
                    <span class="history-intent">${capitalizeFirst(item.intent || 'Unknown')}</span>
                    <span class="history-time">${time}</span>
                </div>
            </div>
            <span class="history-confidence">${Math.round(item.confidence || 0)}%</span>
        `;

        // Click to re-show result
        el.addEventListener('click', () => {
            displayResult(item.fullResult, item.text);
            commentInput.value = item.text;
            onInputChange();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        historyList.appendChild(el);
    });
}

function clearHistory() {
    if (!confirm('Clear all classification history?')) return;
    history = [];
    localStorage.removeItem('commentiq_history');
    updateStats();
    renderHistory();
    resultCard.style.display = 'none';
}

function updateStats() {
    const total = history.length;
    statsCount.textContent = total;
}

// ---- Toast ----
function showToast(message, type = 'error') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// ---- Utilities ----
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
