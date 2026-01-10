<template>
  <div class="chat-container">
    <div class="header">
      <h1>SafeDLBuddy: Real-Time AI-Based File Scanning</h1>
      <div class="control-buttons">
        <button @click="clearChat" class="control-btn clear-btn" :disabled="isProcessing" title="Clear chat history">
          🧹 Clear Chat
        </button>
        <button @click="showExamples" class="control-btn examples-btn" :disabled="isProcessing"
          title="Show example URLs">
          📝 Example URLs
        </button>
       <!-- <button @click="debugProgressData" class="control-btn debug-btn" 
        style="background: orange; color: white;" title="Debug progress data">
        🔍 Debug
      </button> -->

        
       <button 
  @click="stopProcessing" 
  class="control-btn stop-btn"
  :disabled="!isProcessing && operationStatus.activeOperations === 0 || stopRequested"
  :class="{ 
    'stopping': stopRequested,
    'has-operations': operationStatus.activeOperations > 0
  }"
  :title="operationStatus.activeOperations > 0 ? 
    `Stop ${operationStatus.activeOperations} active download(s)/scan(s)` : 
    'Stop the operation'"
>
  <span v-if="stopRequested">⏳ Stopping...</span>
  <span v-else-if="operationStatus.activeOperations > 0">⏹️ Stop </span>
  <span v-else>⏹️ Stop </span>
</button>
        
      </div>
    </div>

    <!-- Example URLs Modal -->
    <div v-if="showExamplesModal" class="modal-overlay" @click="hideExamples">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>📝 Example URLs to Try</h3>
          <button @click="hideExamples" class="close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div v-for="category in exampleUrls" :key="category.category" class="example-category">
            <h4>{{ category.category }}</h4>
            <div class="example-urls">
              <div v-for="url in category.urls" :key="url" class="example-url" @click="useExampleUrl(url)">
                <span class="url-text">{{ url }}</span>
                <button class="use-btn">Use</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Debug Modal -->
<div v-if="showDebugModal" class="modal-overlay" @click="hideDebug">
  <div class="modal-content debug-modal" @click.stop>
    <div class="modal-header">
      <h3>🔍 Debug Information</h3>
      <button @click="hideDebug" class="close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="debug-section">
        <h4>📊 Current Activities ({{ currentActivities.size }})</h4>
        <div v-if="currentActivities.size === 0" class="debug-empty">
          No active operations
        </div>
        <div v-for="[operationId, activity] in currentActivities" :key="operationId" class="debug-activity">
          <div class="debug-operation-id">{{ operationId.slice(-12) }}...</div>
          <div class="debug-activity-type">{{ activity.type }}</div>
          <div class="debug-activity-data">
            <pre>{{ JSON.stringify(activity.data, null, 2) }}</pre>
          </div>
          <div class="debug-timestamp">{{ new Date(activity.timestamp).toLocaleTimeString() }}</div>
        </div>
      </div>
      
      <div class="debug-section">
        <h4>📈 Progress Detection</h4>
        <div class="debug-progress">
          <div>Has Active Download Progress: {{ hasActiveDownloadProgress() }}</div>
          <div>Main Progress Text: {{ getMainProgressText() }}</div>
          <div>Main Progress Percentage: {{ getMainProgressPercentage() }}</div>
          <div>Numeric Progress: {{ getNumericProgressPercentage() }}%</div>
        </div>
      </div>
    </div>
  </div>
</div>

    <div class="messages" ref="messagesContainer">
      <div v-for="(msg, index) in messages" :key="index" :class="msg.sender">
        <div v-if="msg.sender === 'bot' && msg.result">
          <!-- <div class="message-content">{{ msg.text }}</div> -->

          <!-- Display scan results -->
          <div class="result-container" v-if="msg.result">
            <!-- Multiple links case -->
            <div v-if="msg.result.multiple && msg.result.links" class="links-container">
              <div class="result-title">Please select a download link to scan:</div>
              <div v-for="(link, idx) in msg.result.links" :key="idx" class="link-item">
                <div class="link-number">{{ idx + 1 }}</div>
                <div class="link-info">
                  <div class="link-text">{{ formatLinkTitle(link.text, link.url) }}</div>
                  <div class="link-url">{{ link.url }}</div>
                </div>
                <button @click="selectAndDownloadLink(msg.result.originalUrl, idx)" class="download-btn"
                  :disabled="isProcessing">
                  Scan file
                </button>
              </div>
            </div>

            <!-- File download result with scan details -->
            <div v-else-if="msg.result.path && msg.result.filename" class="file-result">
              <div class="file-info">
                <div class="filename">
                  <span class="file-icon">📄</span>
                  <span class="file-name">{{ msg.result.filename }}</span>
                </div>
              </div>

              <!-- AI Verdict Analysis Section -->
              <div v-if="msg.result.scan_result && msg.result.scan_result.ai_verdict" class="ai-analysis-section">
                <div class="ai-header">
                  <div class="ai-title">🧠 AI Security Analysis</div>
                  <div class="ai-verdict" :class="getAIVerdictClass(msg.result.scan_result.ai_verdict)">
                    {{ msg.result.scan_result.ai_verdict }}
                  </div>
                </div>

                <div class="ai-content">
                  <div v-if="msg.result.scan_result.ai_explanation" class="ai-explanation">
                    <span class="ai-label">Analysis:</span>
                    <span class="ai-text">{{ msg.result.scan_result.ai_explanation }}</span>
                  </div>

                  <div v-if="msg.result.scan_result.ai_guidance" class="ai-guidance">
                    <span class="ai-label">Recommendation:</span>
                    <span class="ai-text">{{ msg.result.scan_result.ai_guidance }}</span>
                  </div>
                </div>
              </div>

              <!-- Detailed scan results -->
              <div v-if="msg.result.scan_result" class="scan-result">
                <div class="scan-header">
                  <div class="scan-title">🔍 Technical Scan Results:</div>
                  <div class="scan-status" :class="{ 
                    'scan-success': msg.result.scan_result.success, 
                    'scan-error': !msg.result.scan_result.success 
                  }">
                    {{ msg.result.scan_result.success ? '✅ Scan completed successfully' : '⚠️ Scan failed' }}
                  </div>
                </div>

                <!-- Detailed verdict information -->
                <div v-if="msg.result.scan_result.verdict" class="verdict-container">
                  <div class="verdict-header">
                    <span class="verdict-label">Engine Verdict:</span>
                    <span class="verdict-value" :class="getVerdictClass(msg.result.scan_result.verdict.verdict)">
                      {{ msg.result.scan_result.verdict.verdict }}
                    </span>
                  </div>

                  <!-- Weighted score -->
                  <div class="verdict-item">
                    <span class="verdict-item-label">Weighted Score:</span>
                    <span class="verdict-item-value">{{ msg.result.scan_result.verdict.weightedScore }}/100</span>
                    <div class="score-bar">
                      <div class="score-fill" :style="{ width: msg.result.scan_result.verdict.weightedScore + '%' }">
                      </div>
                    </div>
                  </div>

                  <!-- Valid/Malicious counts -->
                  <div class="count-container">
                    <div class="count-item">
                      <span class="count-value">{{ msg.result.scan_result.verdict.validResultCount }}</span>
                      <span class="count-label">Valid results</span>
                    </div>
                    <div class="count-item" :class="{'alert': msg.result.scan_result.verdict.maliciousCount > 0}">
                      <span class="count-value">{{ msg.result.scan_result.verdict.maliciousCount }}</span>
                      <span class="count-label">Malicious indicators</span>
                    </div>
                  </div>

                  <!-- Allocation results -->
                  <div v-if="msg.result.scan_result.allocation" class="allocation-container">
                    <div class="allocation-header">Scan Allocation:</div>
                    <div class="allocation-items">
                      <div v-for="(value, key) in msg.result.scan_result.allocation" :key="key" class="allocation-item">
                        <span class="allocation-name">{{ formatScannerName(key) }}:</span>
                        <span class="allocation-value">{{ value }}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Detailed results -->
                <div v-if="msg.result.scan_result.results && msg.result.scan_result.results.length > 0"
                  class="details-section">
                  <button @click="toggleDetailsVisible" class="details-toggle-btn">
                    {{ detailsVisible ? 'Hide technical details' : 'Show technical details' }}
                  </button>

                  <div v-if="detailsVisible" class="technical-details">
                    <div v-for="(result, idx) in msg.result.scan_result.results" :key="idx" class="scan-detail-item">
                      <div class="detail-header">Scan Result {{ idx + 1 }}</div>
                      <pre>{{ JSON.stringify(result, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Explanation result -->
            <div v-else-if="msg.result.type === 'explanation'" class="explanation-result">
              <div class="explanation-header">
                <span class="explanation-icon">📚</span>
                <span class="explanation-title">Security Analysis Explanation</span>
                <span v-if="msg.result.referencedScan" class="referenced-file">
                  (Referencing: {{ msg.result.referencedScan }})
                </span>
              </div>
            </div>

            <!-- Error result -->
            <div v-else-if="!msg.result.success" class="error-result">
              <div class="error-icon">⚠️</div>
              <div class="error-message">{{ msg.result.message || msg.result.error || 'An error occurred' }}</div>
              <div v-if="msg.result.details" class="error-details">
                {{ msg.result.details }}
              </div>
            </div>

            <!-- Generic result display -->
            <div v-else class="generic-result">
              <div class="status-message">{{ msg.result.message || 'Processing completed' }}</div>
              <pre v-if="showDetails">{{ JSON.stringify(msg.result, null, 2) }}</pre>
              <button v-if="!showDetails" @click="showDetails = true" class="details-btn">Show technical
                details</button>
              <button v-else @click="showDetails = false" class="details-btn">Hide technical details</button>
            </div>
          </div>
        </div>
        <div v-else class="message-content">{{ msg.text }}</div>
      </div>
    </div>

   <!-- Enhanced Progress Display -->
    <div v-if="(isProcessing || currentActivities.size > 0) && !stopRequested" class="enhanced-processing-indicator">
  <div class="main-progress-section">
    <div class="spinner"></div>
    <div class="processing-info">
      <div class="processing-text">{{ getCurrentProgressText() }}</div>
      <div class="connection-indicator" :class="{ connected: sseConnected }">
        <span class="status-dot"></span>
        {{ sseConnected ? 'Live updates active' : 'Connecting...' }}
      </div>
    </div>
    <button @click="stopProcessing" class="stop-processing-btn">Stop</button>
  </div>

  <!-- NEW: Enhanced Progress Bar Section -->
  <div v-if="hasActiveDownloadProgress()" class="enhanced-progress-section">
    <div class="progress-header">
      <div class="progress-info">
        <span class="progress-text">{{ getMainProgressText() }}</span>
        <span class="progress-percentage">{{ getMainProgressPercentage() }}</span>
      </div>
    </div>
    
   <!-- Enhanced Progress Bar with Percentage Animation -->
<div class="main-progress-bar">
  <div 
    class="progress-fill animated" 
    :style="{ 
      width: getProgressBarWidth(),
      '--progress-percent': getNumericProgressPercentage()
    }"
    :class="getMainProgressBarClass()"
  >
    <!-- Percentage text inside the bar -->
    <span v-if="getNumericProgressPercentage() && getNumericProgressPercentage() > 15" class="progress-inner-text">
      {{ getMainProgressPercentage() }}
    </span>
  </div>
  
  <!-- Percentage label outside bar for small percentages -->
  <div v-if="getNumericProgressPercentage() && getNumericProgressPercentage() <= 15" class="progress-outer-label">
    {{ getMainProgressPercentage() }}
  </div>
</div>
    
    <!-- NEW: Enhanced Progress Details -->
    <div v-if="getMainProgressDetails()" class="progress-details-enhanced">
      <div class="detail-item" v-if="getSpeedInfo()">
        <span class="detail-icon">⚡</span>
        <span class="detail-text">{{ getSpeedInfo() }}</span>
      </div>
      
      <div class="detail-item" v-if="getSizeInfo()">
        <span class="detail-icon">📦</span>
        <span class="detail-text">{{ getSizeInfo() }}</span>
      </div>
      
    </div>
  </div>
</div>

    <form @submit.prevent="sendMessage" class="input-form">
      <input v-model="userInput" placeholder="Enter a download link for AI security analysis, or ask me anything.."
        :disabled="isProcessing" class="message-input" ref="messageInput" />
      <button type="submit" :disabled="isProcessing || !userInput.trim()" class="send-button">
        <span v-if="isProcessing">Processing...</span>
        <span v-else>Send</span>
      </button>
    </form>

    <div class="footer">
      <p>Paste a URL to download files safely with AI-powered real-time security scanning and threat analysis.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted ,onUnmounted} from 'vue';
import axios from 'axios';

const messages = ref([
  { 
    sender: 'bot', 
    text: `👋 Hi! I'm SafeDLBuddy. Enter a link to scan or feel free to ask anything...`


  }
]);

const userInput = ref('');
const isProcessing = ref(false);
const processingText = ref('Processing your request...');
const messagesContainer = ref(null);
const messageInput = ref(null);
const showDetails = ref(false);
const detailsVisible = ref(false);
const selectedLinkIndex = ref(null);
const showExamplesModal = ref(false);
const exampleUrls = ref([]);
const stopRequested = ref(false);
const showDebugModal = ref(false);
const operationStatus = ref({
  activeOperations: 0,
  globalStop: false,
  lastUpdate: null
});
const userSessionId = ref(localStorage.getItem('userSessionId') || crypto.randomUUID());

// Store in localStorage for persistence across page reloads
if (!localStorage.getItem('userSessionId')) {
  localStorage.setItem('userSessionId', userSessionId.value);
}

console.log('🆔 User Session ID:', userSessionId.value);

// ✅ ADD USER-SPECIFIC OPERATION STATUS
const userOperationStatus = ref({
  chatOperations: 0,
  downloadOperations: 0,
  totalOperations: 0,
  lastUpdate: null
});

const sseConnected = ref(false);
const currentActivities = ref(new Map()); // operationId -> latest activity

const openaiUrl = import.meta.env.VITE_OPENAI_API_URL;
const antivirusUrl = import.meta.env.VITE_ANTIVIRUS_API_URL;
console.log('🔗 OpenAI API URL:', openaiUrl);


// Auto-scroll to bottom when messages update
watch(messages, async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}, { deep: true });

// Focus input on mount
onMounted(() => {
  if (messageInput.value) {
    messageInput.value.focus();
  }

  // Add keyboard shortcut listener
  document.addEventListener('keydown', handleKeydown);

  connectSSE();

  // Check user status every 5 seconds when operations are active
  setInterval(() => {
    if (userOperationStatus.value.totalOperations > 0 || isProcessing.value) {
      checkUserStatus();
    }
  }, 2000)
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  
  if (window.sseConnection) {
    window.sseConnection.close();
  }
  if (window.scanSSEConnection) {
    window.scanSSEConnection.close();
  }

  // Cancel any ongoing requests
  if (window.currentAbortController) {
    window.currentAbortController.abort();
  }
});

const handleKeydown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
    event.preventDefault();
    stopProcessing();
  }
};

// 🧹 Clear Chat Function
const clearChat = async () => {
  if (isProcessing.value) return;
  
  try {
    isProcessing.value = true;
    processingText.value = 'Clearing chat...';
    
    const res = await axios.post(`${openaiUrl}/api/clear-chat`, {
      userSessionId: userSessionId.value  // Send user session ID
    });
    
    // Clear messages and reset to initial state
    messages.value = [
      { 
        sender: 'bot', 
        text: `Chat cleared successfully! Enter a link to scan or feel free to ask anything...`
      }
    ];
    
  } catch (err) {
    console.error('Error clearing chat:', err);
    messages.value.push({
      sender: 'bot',
      text: '⚠️ Error clearing chat: ' + (err.response?.data?.reply || err.message)
    });
  } finally {
    isProcessing.value = false;
  }
};

// 📝 Show Examples Function
const showExamples = async () => {
  if (isProcessing.value) return;
  
  try {
    console.log("openaiUrl: ",openaiUrl);
    const res = await axios.get(`${openaiUrl}/api/example-urls`);
    exampleUrls.value = res.data.examples || [];
    showExamplesModal.value = true;
  } catch (err) {
    console.error('Error fetching examples:', err);
    messages.value.push({
      sender: 'bot',
      text: '⚠️ Error fetching examples: ' + (err.response?.data?.message || err.message)
    });
  }
};

const formatLinkTitle = (text, url) => {
  if (!text || text.toLowerCase().includes('no text')) {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return `Download file from ${domain}`;
    } catch (error) {
      return 'Download file';
    }
  }
  return text;
};

// Hide Examples Modal
const hideExamples = () => {
  showExamplesModal.value = false;
};

// Use Example URL
const useExampleUrl = (url) => {
  userInput.value = url;
  showExamplesModal.value = false;
  if (messageInput.value) {
    messageInput.value.focus();
  }
};

// ⏹️ Stop Processing Function
const stopProcessing = async () => {
  if (!isProcessing.value && operationStatus.value.activeOperations === 0) {
    messages.value.push({
      sender: 'bot',
      text: '⚠️ No active scans.'
    });
    return;
  }
  
  stopRequested.value = true;

  // ✅ Immediately abort current request
  if (window.currentAbortController) {
    console.log('⏹️ Aborting current request...');
    window.currentAbortController.abort();
  }

  // ✅ CLEAR THE PROGRESS INDICATOR IMMEDIATELY
  isProcessing.value = false;
  currentActivities.value.clear(); // Clear all activities
  operationStatus.value.activeOperations = 0;
  userOperationStatus.value = {
    chatOperations: 0,
    downloadOperations: 0,
    totalOperations: 0,
    lastUpdate: Date.now()
  };
  

  try {
    const promises = [];
    
    promises.push(
      axios.post(`${openaiUrl}/api/stop-downloads`, {
        userSessionId: userSessionId.value
      }, { 
        timeout: 10000,
        signal: AbortSignal.timeout(10000)
      })
        .then(res => ({ service: 'all_operations', data: res.data }))
        .catch(err => ({ service: 'all_operations', error: err.message }))
    );
    
    promises.push(
      axios.post(`${antivirusUrl}/stop-all-scans`, {
        userSessionId: userSessionId.value
      }, { 
        timeout: 10000,
        signal: AbortSignal.timeout(10000)
      })
        .then(res => ({ service: 'scans', data: res.data }))
        .catch(err => ({ service: 'scans', error: err.message }))
    );
    
    const results = await Promise.allSettled(promises);
    let totalStopped = 0;
    let serviceMessages = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.data) {
        const value = result.value;
        if (value.service === 'all_operations') {
          const totalOps = value.data.stoppedOperations || 0;
          totalStopped += totalOps;
          if (totalOps > 0) {
            serviceMessages.push(`${totalOps} operations`);
          }
        } else {
          const stopped = value.data.stoppedOperations || value.data.stoppedScans || 0;
          totalStopped += stopped;
          if (stopped > 0) {
            serviceMessages.push(`${stopped} scans`);
          }
        }
      }
    });
    
    const finalMessage = totalStopped > 0 
      ? `Successfully stopped. you can keep chatting!`
      : '✅ All YOUR operations completed or were already stopped.';
    
    messages.value.push({
      sender: 'bot',
      text: finalMessage
    });
    
  } catch (err) {
    console.error('Error stopping operations:', err);
    messages.value.push({
      sender: 'bot',
      text: '⚠️ Some operations may still be stopping. Please wait a moment.'
    });
  } finally {
    stopRequested.value = false;
    
    // ✅ ENSURE PROGRESS INDICATOR IS HIDDEN
    setTimeout(() => {
      isProcessing.value = false;
      currentActivities.value.clear();
      operationStatus.value.activeOperations = 0;
      userOperationStatus.value.totalOperations = 0;
    }, 1000); // Give 1 second for any remaining cleanup
  }
};

const sendMessage = async () => {
  if (!userInput.value.trim()) return;
  // Check if system is in stop mode
if (operationStatus.value.globalStop) {
  messages.value.push({
    sender: 'bot',
    text: '⏹️ System is currently stopping operations. Please wait a moment and try again.'
  });
  return;
}
  
  const userMessage = userInput.value.trim();
  messages.value.push({ sender: 'user', text: userMessage });
  isProcessing.value = true;
  processingText.value = 'Processing your request...';
  userInput.value = '';

  // Create abort controller for this request
  const abortController = new AbortController();
  window.currentAbortController = abortController;
  
  try {
    // Find the most recent scan result to provide context
    let lastScanResult = null;
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].result && messages.value[i].result.scan_result) {
        lastScanResult = messages.value[i].result;
        break;
      }
    }
    
    const requestBody = {
      message: userMessage,
      userSessionId: userSessionId.value
    };
    
    // Add scan result context if available
    if (lastScanResult) {
      requestBody.lastScanResult = lastScanResult;
    }
    
    // Update processing text based on message content
    if (userMessage.includes('http')) {
      processingText.value = 'Analyzing URL and preparing download...';
    } else if (/explain|what|how|why/i.test(userMessage)) {
      processingText.value = 'Generating explanation...';
    }else {
      processingText.value = 'Thinking...';
    }
    
    // Make request with abort signal
    const res = await axios.post(`${openaiUrl}/api/chat`, requestBody, {
      signal: abortController.signal
    });

    if (res.data.operationCompleted) {
  console.log('✅ Chat operation auto-completed by server');
  isProcessing.value = false;
  processingText.value = 'Processing your request...';

  // ✅ CLEAR ACTIVITIES WHEN OPERATION COMPLETES
  setTimeout(() => {
    currentActivities.value.clear();
  }, 2000); // Clear after 2 seconds to show completion
  
  // Update operation status immediately
  operationStatus.value.activeOperations = Math.max(0, operationStatus.value.activeOperations - 1);
  userOperationStatus.value.chatOperations = Math.max(0, userOperationStatus.value.chatOperations - 1);
  userOperationStatus.value.totalOperations = Math.max(0, userOperationStatus.value.totalOperations - 1);
}
    
    // Store the original URL in the result for later use with link selection
    if (res.data.result && res.data.result.multiple && res.data.result.links) {
      // Make sure the original URL is set in the result
      if (!res.data.result.originalUrl) {
        res.data.result.originalUrl = userMessage;
      }
    }
    
    // Check if the response contains a result
    if (res.data.result) {
      messages.value.push({ 
        sender: 'bot', 
        text: res.data.reply,
        result: res.data.result
      });
    } else {
      // Regular chat response
      messages.value.push({ 
        sender: 'bot', 
        text: res.data.reply
      });
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
     console.log('⏹️ Request was cancelled');
     if (processingText.value.includes('download') || processingText.value.includes('scan') || processingText.value.includes('Analyzing URL')) {
       messages.value.push({ 
         sender: 'bot', 
         text: '⏹️ Operation cancelled.',
         result: { success: false, error: 'Operation cancelled' }
       });
     } else {
       messages.value.push({ 
         sender: 'bot', 
         text: '⏹️ Request was cancelled.',
         result: { success: false, error: 'Cancelled' }
       });
     }
   } else {
     console.error('Error sending message:', err);
     messages.value.push({ 
       sender: 'bot', 
       text: '⚠️ Error: ' + (err.response?.data?.reply || err.message || 'Unable to connect to the server'),
       result: {
         success: false,
         error: err.message
       }
     });
   }
  } finally {
    if (isProcessing.value) {
      isProcessing.value = false;
    }
    processingText.value = 'Processing your request...';
    window.currentAbortController = null;
  }
};

// Fixed selectAndDownloadLink method in ChatBot.vue
const selectAndDownloadLink = async (originalUrl, linkIndex) => {
  // Check if system is in stop mode
  if (operationStatus.value.globalStop) {
    messages.value.push({
      sender: 'bot',
      text: '⏹️ System is currently stopping operations. Please wait a moment and try again.'
    });
    return;
  }
  
  if (isProcessing.value) return;
  
  // ✅ FIX 1: Immediately set processing state and add fake activity
  isProcessing.value = true;
  processingText.value = `processing link ${linkIndex + 1}...`;
  
  // ✅ FIX 2: Immediately add a fake activity to show progress indicator
  const fakeOperationId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  currentActivities.value.set(fakeOperationId, {
    type: `processing_link_${linkIndex + 1}`,
    data: { linkIndex: linkIndex + 1 },
    timestamp: Date.now(),
    metadata: { source: 'frontend' }
  });

  // ✅ FIX 3: Update operation status immediately
  operationStatus.value.activeOperations += 1;
  userOperationStatus.value.downloadOperations += 1;
  userOperationStatus.value.totalOperations += 1;

  // Create abort controller for this request
  const abortController = new AbortController();
  window.currentAbortController = abortController;
  
  try {
    // First add a message showing what we're selecting
    messages.value.push({ 
      sender: 'user', 
      text: `Selecting and processing link ${linkIndex + 1}`
    });
    
    // Call the endpoint to select and download a specific link
    console.log(`Sending request to /api/select-link with url: ${originalUrl}, linkIndex: ${linkIndex}`);
    const res = await axios.post(`${openaiUrl}/api/select-link`, {
      url: originalUrl,
      linkIndex: linkIndex,
      userSessionId: userSessionId.value
    }, {
      signal: abortController.signal,
    });
    
    console.log('Response from /api/select-link:', res.data);

    // ✅ FIX 4: Remove fake activity when real operation starts
    currentActivities.value.delete(fakeOperationId);

    if (res.data.operationCompleted) {
      console.log('✅ Link selection operation auto-completed by server');
      isProcessing.value = false;
      processingText.value = 'Processing your request...';
      
      // Update operation status immediately
      operationStatus.value.activeOperations = Math.max(0, operationStatus.value.activeOperations - 1);
      userOperationStatus.value.downloadOperations = Math.max(0, userOperationStatus.value.downloadOperations - 1);
      userOperationStatus.value.totalOperations = Math.max(0, userOperationStatus.value.totalOperations - 1);
    }
    
    messages.value.push({ 
      sender: 'bot', 
      text: res.data.reply,
      result: res.data.result
    });
  } catch (err) {
    // ✅ FIX 5: Clean up fake activity on error
    currentActivities.value.delete(fakeOperationId);
    
    if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
      console.log('⏹️ Scan was cancelled');
      messages.value.push({ 
        sender: 'bot', 
        text: '⏹️ Scan cancelled. You can continue chatting or select another link.',
        result: { success: false, error: 'Scan cancelled' }
      });
    } else {
      console.error('Error selecting and downloading link:', err);
      messages.value.push({ 
        sender: 'bot', 
        text: '⚠️ Error selecting and downloading link: ' + (err.response?.data?.reply || err.message),
        result: {
          success: false,
          error: err.message
        }
      });
    }
  } finally {
    // ✅ FIX 6: Ensure cleanup happens
    currentActivities.value.delete(fakeOperationId);
    
    if (isProcessing.value) {
      isProcessing.value = false;
    }
    processingText.value = 'Processing your request...';
    window.currentAbortController = null;
    
    // ✅ FIX 7: Ensure operation counts are decremented
    operationStatus.value.activeOperations = Math.max(0, operationStatus.value.activeOperations - 1);
    userOperationStatus.value.downloadOperations = Math.max(0, userOperationStatus.value.downloadOperations - 1);
    userOperationStatus.value.totalOperations = Math.max(0, userOperationStatus.value.totalOperations - 1);
  }
};

const checkUserStatus = async () => {
  try {
    const res = await axios.get(`${openaiUrl}/api/user-status/${userSessionId.value}`);
    if (res.data.success) {

       const newTotal = res.data.activeOperations.total || 0;
      
      // ✅ ADD: Immediate detection of stopped operations
      if (stopRequested.value && newTotal === 0) {
        stopRequested.value = false;
        isProcessing.value = false;
      }

      userOperationStatus.value = {
        chatOperations: res.data.activeOperations.chat || 0,
        downloadOperations: res.data.activeOperations.download || 0,
        scanOperations: res.data.activeOperations.scan || 0,
        totalOperations: res.data.activeOperations.total || 0,
        lastUpdate: Date.now()
      };
      
      // Update main operation status for button state
      operationStatus.value = {
        activeOperations: res.data.activeOperations.total || 0,
        globalStop: res.data.globalStop || false,
        lastUpdate: Date.now()
      };
    }
  } catch (err) {
    console.warn('User status check failed:', err.message);
    if (stopRequested.value) {
      stopRequested.value = false;
    }
  }
};


// Toggle technical details visibility
const toggleDetailsVisible = () => {
  detailsVisible.value = !detailsVisible.value;
};

// Format scanner name for display
const formatScannerName = (name) => {
  switch (name) {
    case 'bytescale':
      return 'ByteScale';
    case 'cloudmersive':
      return 'CloudMersive';
    case 'clamav':
      return 'ClamAV';
    default:
      return name.charAt(0).toUpperCase() + name.slice(1);
  }
};

// Get verdict CSS class based on verdict value
const getVerdictClass = (verdict) => {
  if (!verdict) return '';
  
  verdict = verdict.toLowerCase();
  if (verdict.includes('clean') || verdict.includes('safe')) {
    return 'verdict-safe';
  } else if (verdict.includes('suspicious') || verdict.includes('insufficient')) {
    return 'verdict-warning';
  } else if (verdict.includes('malicious') || verdict.includes('danger')) {
    return 'verdict-danger';
  }
  return '';
};

// Get AI verdict CSS class based on AI verdict value
const getAIVerdictClass = (verdict) => {
  if (!verdict) return '';
  
  verdict = verdict.toLowerCase();
  if (verdict === 'safe') {
    return 'ai-verdict-safe';
  } else if (verdict === 'suspicious') {
    return 'ai-verdict-warning';
  } else if (verdict === 'unsafe') {
    return 'ai-verdict-danger';
  } else if (verdict === 'unknown') {
    return 'ai-verdict-unknown';
  }
  return '';
};



const connectSSE = () => {
  console.log('🔗 Connecting to SSE...');
  
  // Main SSE connection (existing)
  const eventSource = new EventSource(`${openaiUrl}/api/events/${userSessionId.value}`);
  
  eventSource.onopen = () => {
    console.log('✅ Real-time updates connected');
    sseConnected.value = true;
  };
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'activity') {
        console.log('📊 Activity update received:', {
          operationId: data.operationId?.slice(-8) + '...',
          activityType: data.activityType,
          hasData: !!data.data,
          progressData: data.data,
          timestamp: data.timestamp
        });
        
        // Update current activities with enhanced data validation
        currentActivities.value.set(data.operationId, {
          type: data.activityType,
          data: data.data || {},
          timestamp: data.timestamp || Date.now(),
          metadata: data.metadata || {}
        });
        
        // Clear completed/error activities after delay
        if (data.activityType.includes('complete') || 
            data.activityType.includes('error') || 
            data.activityType.includes('cancelled') ||
            data.activityType.includes('timeout')) {
          setTimeout(() => {
            currentActivities.value.delete(data.operationId);
            
            if (currentActivities.value.size === 0) {
              isProcessing.value = false;
            }
          }, 5000);
        }
        
        // Update main processing text
        updateProcessingTextFromActivity(data.activityType, data.data);
      } else if (data.type === 'keepalive') {
        console.log('💓 SSE keepalive received');
      }
    } catch (error) {
      console.error('❌ SSE message parse error:', error);
      console.log('Raw SSE data:', event.data);
    }
  };
  
  eventSource.onerror = () => {
    console.log('❌ SSE connection error, will reconnect...');
    sseConnected.value = false;
    setTimeout(connectSSE, 3000);
  };
  
  // 🆕 ADD: Scan SSE connection for antivirus updates
  console.log('🔗 Connecting to scan SSE...');
  const scanEventSource = new EventSource(`${antivirusUrl}/scan-events/${userSessionId.value}`);
  
  scanEventSource.onopen = () => {
    console.log('✅ Scan updates connected');
  };
  
  scanEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'scan_activity') {
        console.log('🛡️ Scan activity update received:', {
          scanId: data.scanId?.slice(-8) + '...',
          activityType: data.activityType,
          data: data.data
        });
        
        // Add to current activities with scan operation ID
        currentActivities.value.set(data.scanId, {
          type: data.activityType,
          data: data.data || {},
          timestamp: data.timestamp || Date.now(),
          metadata: { source: 'antivirus' }
        });
        
        // Clear scan activities after delay
        if (data.activityType.includes('complete') || 
            data.activityType.includes('error')) {
          setTimeout(() => {
            currentActivities.value.delete(data.scanId);
          }, 3000); // Shorter delay for scan activities
        }
        
        // Update main processing text for scan activities
        updateProcessingTextFromActivity(data.activityType, data.data);
      } else if (data.type === 'keepalive') {
        console.log('💓 Scan SSE keepalive received');
      }
    } catch (error) {
      console.error('❌ Scan SSE message parse error:', error);
      console.log('Raw Scan SSE data:', event.data);
    }
  };
  
  scanEventSource.onerror = () => {
    console.log('❌ Scan SSE connection error, will reconnect...');
    setTimeout(() => {
      // Reconnect scan SSE
      if (window.scanSSEConnection) {
        window.scanSSEConnection.close();
      }
      // The main connectSSE will handle reconnection
    }, 3000);
  };
  
  // Store both connections globally
  window.sseConnection = eventSource;
  window.scanSSEConnection = scanEventSource;
};

// Update the processing text handler to show actual progress
const updateProcessingTextFromActivity = (activityType, data) => {
  // For progress activities, show actual data
  if (activityType.includes('download_progress') || activityType.includes('downloading')) {
    const serviceName = getServiceName(activityType);
    
    if (data?.percent !== undefined && data?.loaded && data?.total) {
      processingText.value = `${serviceName}: ${data.percent}% (${data.loaded}/${data.total})${data.speed ? ` at ${data.speed}` : ''}`;
      return;
    } else if (data?.loaded) {
      processingText.value = `${serviceName}: ${data.loaded} downloaded${data.speed ? ` at ${data.speed}` : ''}`;
      return;
    }
  }

  // Standard messages for other activities
  const messages = {
    'axios_download_start': 'Starting direct HTTP download...',
    'axios_downloading': 'Direct download in progress...',
    'axios_download_complete': 'Direct download completed!',
    'browser_download_started': 'Browser download started...',
    'browser_downloading': 'Browser download in progress...',
    'browser_download_complete': 'Browser download completed!',
    'analyzing_message': 'Analyzing your message...',
    'calling_openai': 'Getting AI response...',
    'openai_response_received': 'Processing response...',
    'url_analysis_complete': 'URL analysis complete',
    'onedrive_start': 'Connecting to OneDrive...',
    'onedrive_page_loaded': 'OneDrive page loaded...',
    'onedrive_button_clicked': 'Starting OneDrive download...',
    'dropbox_start': 'Connecting to Dropbox...',
    'dropbox_page_loaded': 'Dropbox page loaded...',
    'github_start': 'Connecting to GitHub...',
    'scanning_start': 'Starting security scan...',
    'scanning_complete': 'Security scan complete!',
    'axios_download_start': 'Download starting...',
    'axios_download_complete': 'Download completed!'
  };
  
  if (messages[activityType]) {
    processingText.value = messages[activityType];
  }
};

const formatActivity = (activityType, data = {}) => {
  // Handle progress activities with actual data
  if (activityType.includes('progress') || activityType.includes('downloading')) {
    const serviceName = getServiceName(activityType);
    
    // Show detailed progress if available
    // Show detailed progress if available
  if (data?.percent !== undefined && data?.downloadedFormatted && data?.totalFormatted) {
    return `📊 ${serviceName}: ${data.percent}% (${data.downloadedFormatted}/${data.totalFormatted})${data.speed ? ` - ${data.speed}` : ''}`;
  }
    // Show size data if available
    else if (data?.loaded) {
      const loadedText = typeof data.loaded === 'string' ? data.loaded : `${(data.loaded / 1024 / 1024).toFixed(1)} MB`;
      return `📊 ${serviceName}: ${loadedText}${data.speed ? ` - ${data.speed}` : ''}`;
    }
    // Show percentage only
    else if (data?.percent !== undefined) {
      return `📊 ${serviceName}: ${data.percent}%`;
    }
    // Fallback
    else {
      return `📊 ${serviceName} downloading`;
    }
  }

  // Handle completion with file info
  if (activityType.includes('complete') && data?.filename) {
    const serviceName = getServiceName(activityType);
    const sizeText = data.sizeFormatted || (data.size ? `${data.size}` : '');
    return `✅ ${serviceName} complete${sizeText ? ` (${sizeText})` : ''} - ${data.filename}`;
  }

  // Enhanced activity mapping
  const activityMap = {
    'analyzing_message': '🔍 Analyzing your message',
    'calling_openai': '🤖 Getting AI response',
    'openai_response_received': '📝 Processing AI response',
    'url_analysis_complete': '✅ URL analysis complete',
    'file_validation_start': '📋 Validating file',
    'file_validation_complete': '✅ File validation complete',
    
    // Download initiation
    'direct_download_start': '📥 Starting direct download',
    'axios_download_start': '📥 Download starting',
    'axios_download_complete': '✅ Download complete',
    
    // Service-specific activities
    'google_drive_start': '☁️ Connecting to Google Drive',
    'google_drive_metadata_received': '📋 Getting file information',
    'google_drive_download_start': '📥 Starting Google Drive download',
    'google_drive_download_complete': '✅ Google Drive download complete',
    
    'dropbox_start': '📦 Connecting to Dropbox',
    'dropbox_init': '📦 Initializing Dropbox',
    'dropbox_page_loaded': '📄 Dropbox page loaded',
    'dropbox_download_initiated': '🚀 Dropbox download started',
    'dropbox_download_complete': '✅ Dropbox download complete',
    
    'github_start': '🐙 Connecting to GitHub',
    'github_init': '🐙 Initializing GitHub',
    'github_page_loaded': '📄 GitHub page loaded',
    'github_download_initiated': '🚀 GitHub download started',
    'github_download_complete': '✅ GitHub download complete',
    
    'meganz_start': '🗄️ Connecting to MEGA',
    'meganz_init': '🗄️ Initializing MEGA',
    'meganz_page_loaded': '📄 MEGA page loaded',
    'meganz_button_clicked': '🖱️ Starting MEGA download',
    'meganz_download_complete': '✅ MEGA download complete',
    
    'onedrive_start': '☁️ Connecting to OneDrive',
    'onedrive_init': '☁️ Initializing OneDrive',
    'onedrive_page_loaded': '📄 OneDrive page loaded',
    'onedrive_button_clicked': '🖱️ Starting OneDrive download',
    'onedrive_download_complete': '✅ OneDrive download complete',
    
     // Scanning activities
  'bytescale_upload_start': '☁️ Uploading to Bytescale',
  'bytescale_upload_rejected': '❌ Bytescale rejected file',
  'bytescale_scan_start': '🛡️ Bytescale scanning',
  'bytescale_scan_complete': '✅ Bytescale scan complete',
  'clamav_scan_start': '🦠 ClamAV scanning',
  'clamav_scan_complete': '✅ ClamAV scan complete',
  'clamav_scan_error': '❌ ClamAV scan error',
  'cloudmersive_scan_start': '☁️ Cloudmersive scanning',
  'cloudmersive_scan_complete': '✅ Cloudmersive scan complete',
  'cloudmersive_scan_error': '❌ Cloudmersive scan error',
    'scanning_start': '🔍 Starting security scan',
    'multi_engine_scan_start': '🛡️ Running multi-engine scan',
    'all_scans_complete': '✅ All scans complete',
    'scanning_complete': '✅ Security scan complete',
    
    'bytescale_scan_start': '🛡️ Bytescale scanning',
    'bytescale_scan_complete': '✅ Bytescale scan complete',
    'clamav_scan_start': '🦠 ClamAV scanning',
    'clamav_scan_complete': '✅ ClamAV scan complete',
    'cloudmersive_scan_start': '☁️ Cloudmersive scanning',
    'cloudmersive_scan_complete': '✅ Cloudmersive scan complete',
    
    // Link analysis
    'href_analysis_start': '🔍 Analyzing page for download links',
    'href_page_loaded': '📄 Page loaded, scanning for files',
    'href_validation_start': '✅ Validating download links',
    'href_validation_complete': '✅ Link validation complete',
    
    // General activities
    'processing_selected_link': '🔗 Processing selected link',
    'mapping_ai_verdict': '🧠 Analyzing security results',
    'generating_explanation': '📚 Generating explanation'
  };
  
  return activityMap[activityType] || 
         activityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};
// Helper function to extract service name from activity type
const getServiceName = (activityType) => {
  if (activityType.includes('axios')) return 'Direct Download';
  if (activityType.includes('browser_content')) return 'Direct Download (Content)';
  if (activityType.includes('browser')) return 'Direct Download (Browser)';
  if (activityType.includes('direct_download')) return 'Direct Download';
  if (activityType.includes('onedrive')) return 'OneDrive';
  if (activityType.includes('dropbox')) return 'Dropbox';
  if (activityType.includes('google_drive') || activityType.includes('gdrive')) return 'Google Drive';
  if (activityType.includes('github')) return 'GitHub';
  if (activityType.includes('meganz') || activityType.includes('mega')) return 'MEGA';
  if (activityType.includes('axios')) return 'Direct Download';
  if (activityType.includes('torrent')) return 'Torrent';
  return 'Download';
};


const getCurrentProgressText = () => {
  if (currentActivities.value.size === 0) {
    return processingText.value;
  }
  
  // Find the most recent download activity with progress
  let downloadActivity = null;
  let latestActivity = null;
  let latestTime = 0;
  
  for (const [operationId, activity] of currentActivities.value) {
    // Prioritize download activities with progress data
    if (hasProgressData(activity) && activity.timestamp > latestTime) {
      downloadActivity = activity;
      latestTime = activity.timestamp;
    } else if (activity.timestamp > latestTime) {
      latestActivity = activity;
      latestTime = activity.timestamp;
    }
  }
  
  // Show download progress if available, otherwise show latest activity
  const activityToShow = downloadActivity || latestActivity;
  
  if (activityToShow) {
    return formatActivity(activityToShow.type, activityToShow.data);
  }
  
  return processingText.value;
};

const hasActiveDownloadProgress = () => {
  for (const [operationId, activity] of currentActivities.value) {
    // Check for any real progress data - ENHANCED detection
    if (activity.data?.percent !== undefined || 
        activity.data?.loaded !== undefined ||
        activity.data?.downloadedFormatted !== undefined ||
        activity.type.includes('downloading') ||
        activity.type.includes('progress') ||
        activity.type.includes('onedrive_download') ||
        activity.type.includes('dropbox_download') ||
        activity.type.includes('github_download') ||
        activity.type.includes('google_drive_download') ||
        activity.type.includes('axios_download')) {
      return true;
    }
  }
  return false;
};

const getMainProgressText = () => {
  for (const [operationId, activity] of currentActivities.value) {
    if (hasProgressData(activity)) {
      const serviceName = getServiceName(activity.type);
      
      // Try to get filename from different possible locations
      const filename = activity.data?.filename || 
                      activity.metadata?.filename || 
                      extractFilenameFromActivity(activity) ||
                      'file';
      
      return `${serviceName}: ${filename}`;
    }
  }
  
  // If no progress data, show the service that's currently active
  for (const [operationId, activity] of currentActivities.value) {
    if (activity.type.includes('download') || activity.type.includes('scan')) {
      const serviceName = getServiceName(activity.type);
      return `${serviceName}: Preparing...`;
    }
  }
  
  return 'Processing...';
};

const getMainProgressPercentage = () => {
  const percentage = getNumericProgressPercentage();
  if (percentage !== null && !isNaN(percentage)) {
    return `${Math.round(percentage)}%`;
  }
  
  for (const [operationId, activity] of currentActivities.value) {
    if (activity.data?.loaded || activity.data?.downloadedFormatted) {
      return 'Downloading...';
    }
  }
  
  return 'Processing...';
};

const getMainProgressDetails = () => {
  for (const [operationId, activity] of currentActivities.value) {
    if (hasProgressData(activity)) {
      const details = [];
      
      // Add size information - ENHANCED handling
      if (activity.data?.downloadedFormatted && activity.data?.totalFormatted) {
        details.push(`${activity.data.downloadedFormatted} / ${activity.data.totalFormatted}`);
      } else if (activity.data?.loaded) {
        let loadedText, totalText;
        
        // Handle formatted strings vs raw numbers
        if (typeof activity.data.loaded === 'string') {
          loadedText = activity.data.loaded;
        } else {
          loadedText = `${(activity.data.loaded / 1024 / 1024).toFixed(1)} MB`;
        }
        
        if (activity.data?.total) {
          if (typeof activity.data.total === 'string') {
            totalText = activity.data.total;
          } else {
            totalText = `${(activity.data.total / 1024 / 1024).toFixed(1)} MB`;
          }
          details.push(`${loadedText} / ${totalText}`);
        } else {
          details.push(`Downloaded: ${loadedText}`);
        }
      }
      
      // Add speed information
      if (activity.data?.speed) {
        details.push(`${activity.data.speed}`);
      }
      
      // Add time information
      if (activity.data?.elapsed) {
        const time = typeof activity.data.elapsed === 'number' 
          ? `${activity.data.elapsed}s` 
          : activity.data.elapsed;
        details.push(`Time: ${time}`);
      }
      
      // Add ETA if available
      if (activity.data?.eta) {
        details.push(`ETA: ${activity.data.eta}`);
      }
      
      return details.join(' • ');
    }
  }
  return '';
};

const getMainProgressBarClass = () => {
  const percentage = getNumericProgressPercentage();
  
  // If no percentage available, use static blue bar (no animation)
  if (percentage === null || isNaN(percentage)) {
    return 'progress-indeterminate';
  }
  
  // Color based on percentage
  if (percentage < 25) return 'progress-low';
  if (percentage < 75) return 'progress-medium';
  return 'progress-high';
};

// NEW: Debug Progress Data Function
const debugProgressData = () => {
  console.log('🔍 DEBUG: Current Activities Data');
  console.log('Activities count:', currentActivities.value.size);
  console.log('Is Processing:', isProcessing.value);
  console.log('SSE Connected:', sseConnected.value);
  console.log('Operation Status:', operationStatus.value);
  
  for (const [operationId, activity] of currentActivities.value) {
    console.log(`📊 Operation ${operationId.slice(-8)}:`, {
      type: activity.type,
      data: activity.data,
      timestamp: new Date(activity.timestamp).toLocaleString(),
      rawData: JSON.stringify(activity.data, null, 2)
    });
  }
  
  // Show debug modal
  showDebugModal.value = true;
};

// NEW: Hide Debug Modal
const hideDebug = () => {
  showDebugModal.value = false;
};

// Helper function to extract filename from activity data
const extractFilenameFromActivity = (activity) => {
  // Try different ways to extract filename
  if (activity.data?.filename) return activity.data.filename;
  if (activity.metadata?.filename) return activity.metadata.filename;
  
  // Extract from activity type or other data
  const activityStr = JSON.stringify(activity);
  const filenameMatch = activityStr.match(/filename['":][\s]*['"]([^'"]+)['"]/i);
  if (filenameMatch) return filenameMatch[1];
  
  return null;
};

// Enhanced hasProgressData function - UPDATE your existing one
const hasProgressData = (activity) => {
  return activity.data?.percent !== undefined || 
         activity.data?.loaded !== undefined ||
         activity.data?.downloaded !== undefined ||
         activity.data?.downloadedFormatted !== undefined ||
         (activity.data?.total !== undefined && activity.data?.loaded !== undefined) ||
         activity.type.includes('progress') ||
         activity.type.includes('downloading') ||
         activity.type.includes('axios_downloading') ||
         activity.type.includes('browser_downloading') ||
         // Add specific service progress detection
         activity.type.includes('onedrive_download_progress') ||
         activity.type.includes('dropbox_downloading') ||
         activity.type.includes('github_downloading') ||
         activity.type.includes('google_drive_downloading') ||
         activity.type.includes('axios_downloading');
};

// 🔧 IMPROVE: Better progress percentage display
const getProgressPercentage = (activity) => {
  if (activity.data?.percent !== undefined) {
    return `${activity.data.percent}%`;
  } else if (activity.data?.loaded) {
    return 'Downloading...';
  }
  return '';
};
// ENHANCED: Better numeric percentage calculation
const getNumericProgressPercentage = () => {
  for (const [operationId, activity] of currentActivities.value) {
    // Check for 'percent' field
    if (activity.data?.percent !== undefined) {
      const percent = parseFloat(activity.data.percent);
      if (!isNaN(percent)) {
        return Math.min(Math.max(percent, 0), 100);
      }
    }
    
    // Check for 'percentage' field (different spelling)
    if (activity.data?.percentage !== undefined) {
      const percent = parseFloat(activity.data.percentage);
      if (!isNaN(percent)) {
        return Math.min(Math.max(percent, 0), 100);
      }
    }
    
    // Calculate from loaded/total
    if (activity.data?.loaded !== undefined && activity.data?.total !== undefined) {
      let loaded, total;
      
      if (typeof activity.data.loaded === 'string') {
        // Extract numbers from strings like "45.78 MB"
        const loadedMatch = activity.data.loaded.match(/[\d.]+/);
        loaded = loadedMatch ? parseFloat(loadedMatch[0]) : 0;
      } else {
        loaded = parseFloat(activity.data.loaded) || 0;
      }
      
      if (typeof activity.data.total === 'string') {
        // Extract numbers from strings like "310.32 MB"
        const totalMatch = activity.data.total.match(/[\d.]+/);
        total = totalMatch ? parseFloat(totalMatch[0]) : 0;
      } else {
        total = parseFloat(activity.data.total) || 0;
      }
      
      if (total > 0 && loaded >= 0) {
        const percentage = (loaded / total) * 100;
        return Math.min(Math.max(percentage, 0), 100);
      }
    }
  }
  
  return null;
};

const getProgressBarWidth = () => {
  const percentage = getNumericProgressPercentage();
  if (percentage === null || isNaN(percentage)) {
    return '30%';
  }
  return `${Math.max(2, Math.min(100, percentage))}%`;
};

const getSpeedInfo = () => {
  for (const [operationId, activity] of currentActivities.value) {
    if (activity.data?.speed) {
      return activity.data.speed;
    }
  }
  return null;
};
// Update the activity display in template to show more detail
const getProgressDetails = (activity) => {
  if (!activity.data) return '';
  
  const details = [];
  
  if (activity.data.percent !== undefined) {
    details.push(`${activity.data.percent}%`);
  }
  
  if (activity.data.loaded && activity.data.total) {
    details.push(`${activity.data.loaded}/${activity.data.total}`);
  } else if (activity.data.loaded) {
    details.push(`${activity.data.loaded} downloaded`);
  }
  
  if (activity.data.speed) {
    details.push(activity.data.speed);
  }
  
  if (activity.data.elapsed) {
    details.push(`${activity.data.elapsed}s elapsed`);
  }
  
  return details.join(' • ');
};

// ✅ ADD: Auto-hide progress indicator when no activities
const checkAndHideProgress = () => {
  if (currentActivities.value.size === 0 && 
      !isProcessing.value && 
      operationStatus.value.activeOperations === 0) {
    // Hide progress indicator
    console.log('🔄 Auto-hiding progress indicator - no active operations');
  }
};

// ADD these missing methods:
const getSizeInfo = () => {
  for (const [operationId, activity] of currentActivities.value) {
    if (activity.data?.downloadedFormatted && activity.data?.totalFormatted) {
      return `${activity.data.downloadedFormatted} / ${activity.data.totalFormatted}`;
    } else if (activity.data?.loaded && activity.data?.total) {
      let loadedText = typeof activity.data.loaded === 'string' 
        ? activity.data.loaded 
        : `${(activity.data.loaded / 1024 / 1024).toFixed(1)} MB`;
      let totalText = typeof activity.data.total === 'string' 
        ? activity.data.total 
        : `${(activity.data.total / 1024 / 1024).toFixed(1)} MB`;
      return `${loadedText} / ${totalText}`;
    }
  }
  return null;
};

const getTimeInfo = () => {
  for (const [operationId, activity] of currentActivities.value) {
    if (activity.data?.elapsed) {
      const time = typeof activity.data.elapsed === 'number' 
        ? `${activity.data.elapsed}s` 
        : activity.data.elapsed;
      return `Elapsed: ${time}`;
    }
  }
  return null;
};

const getETAInfo = () => {
  for (const [operationId, activity] of currentActivities.value) {
    if (activity.data?.eta) {
      return `ETA: ${activity.data.eta}`;
    }
  }
  return null;
};

// ✅ ADD: Watch for changes and auto-hide
watch([currentActivities, isProcessing, operationStatus], () => {
  if (currentActivities.value.size === 0 && 
      !isProcessing.value && 
      operationStatus.value.activeOperations === 0 &&
      !stopRequested.value) {
    // Small delay to prevent flickering
    setTimeout(() => {
      if (currentActivities.value.size === 0 && !isProcessing.value) {
        console.log('🔄 Progress indicator auto-hidden');
      }
    }, 1000);
  }
}, { deep: true });
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');

.progress-meta {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-top: 0.5rem;
  font-size: 0.8rem;
}

.speed-indicator {
  background: #e3f2fd;
  color: #1976d2;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-weight: 500;
  font-family: monospace;
}

.time-indicator {
  background: #f3e5f5;
  color: #7b1fa2;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-weight: 500;
}

.estimation-badge {
  background: #fff3e0;
  color: #f57c00;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-weight: 500;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.progress-details {
  font-size: 0.85rem;
  color: #666;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.progress-percentage {
  font-weight: 700;
  font-size: 1.2rem;
  color: #1976d2;
  min-width: 50px;
}

/* Enhanced progress bar animations */
.progress-fill {
  position: relative;
  overflow: hidden;
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: progressShine 2s infinite;
}

@keyframes progressShine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Enhanced activity text styling */
.activity-text {
  flex: 1;
  margin: 0 1rem;
  font-weight: 500;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

/* Mobile responsive progress display */
@media (max-width: 768px) {
  .progress-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }
  
  .progress-details {
    max-width: 100%;
    font-size: 0.8rem;
  }
  
  .progress-meta {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .activity-header-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }
  
  .activity-text {
    margin: 0;
    font-size: 0.9rem;
  }
}

.activity-updates {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-size: 0.85rem;
}

.operation-id {
  font-family: monospace;
  background: rgba(255, 255, 255, 0.2);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.7rem;
}

.activity-text {
  flex: 1;
  color: #e0e0e0;
}

.progress-badge {
  background: #4caf50;
  color: white;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: bold;
}

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #ccc;
  margin-top: 0.8rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f44336;
}

.connection-indicator.connected .status-dot {
  background: #4caf50;
  animation: pulse 2s infinite;
}

.processing-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem;
  background: #e3f2fd;
  border-radius: 8px;
  margin-bottom: 1rem;
  animation: pulse 2s infinite;
}

.chat-container {
  width: 80vw;
  height: 100vh;
  margin: 0;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  animation: fadeIn 0.8s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e0e0e0;
}

.header h1 {
  margin: 0;
  color: #333;
  font-size: 1.8rem;
  font-weight: 600;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

.control-btn {
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.clear-btn {
  background: #e3f2fd;
  color: #1976d2;
  border: 1px solid #bbdefb;
}

.clear-btn:hover:not(:disabled) {
  background: #bbdefb;
  transform: translateY(-1px);
}

.examples-btn {
  background: #f3e5f5;
  color: #7b1fa2;
  border: 1px solid #ce93d8;
}

.examples-btn:hover:not(:disabled) {
  background: #ce93d8;
  transform: translateY(-1px);
}

.stop-btn {
  background: #ffebee;
  color: #d32f2f;
  border: 1px solid #ffcdd2;
}

.stop-btn:hover:not(:disabled) {
  background: #ffcdd2;
  transform: translateY(-1px);
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: modalFadeIn 0.3s ease-out;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 80vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalSlideIn {
  from { transform: translateY(-20px) scale(0.95); }
  to { transform: translateY(0) scale(1); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  color: #333;
  font-size: 1.3rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  padding: 0.2rem;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.modal-body {
  padding: 1.5rem;
}

.example-category {
  margin-bottom: 1.5rem;
}

.example-category h4 {
  margin: 0 0 0.8rem 0;
  color: #555;
  font-size: 1.1rem;
  font-weight: 600;
}

.example-urls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.example-url {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
  cursor: pointer;
  transition: all 0.2s ease;
}

.example-url:hover {
  background: #e9ecef;
  transform: translateY(-1px);
}

.url-text {
  flex: 1;
  font-family: monospace;
  font-size: 0.9rem;
  color: #333;
  word-break: break-all;
  margin-right: 1rem;
}

.use-btn {
  background: #1976d2;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.use-btn:hover {
  background: #1565c0;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  margin-bottom: 1rem;
  background-color: #ffffff;
  border-radius: 12px;
  border: 1px solid #eaeaea;
  scroll-behavior: smooth;
}

.user, .bot {
  margin: 0.5rem 0;
  padding: 0.8rem;
  border-radius: 10px;
  max-width: 80%;
  word-break: break-word;
  animation: slideIn 0.3s ease-in;
}

@keyframes slideIn {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.user {
  margin-left: auto;
  background: #1e88e5;
  color: white;
}

.bot {
  margin-right: auto;
  background: #f5f5f5;
  color: #333;
}

/* AI Analysis Section Styles */
.ai-analysis-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 1rem;
  margin: 1rem 0;
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.ai-title {
  font-weight: 600;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ai-verdict {
  padding: 0.3rem 0.8rem;
  border-radius: 20px;
  font-weight: bold;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  animation: aiVerdictSlide 0.4s ease-out;
}

.ai-verdict-safe {
  background: #4caf50;
  color: white;
}

.ai-verdict-warning {
  background: #ff9800;
  color: white;
}

.ai-verdict-danger {
  background: #f44336;
  color: white;
}

.ai-verdict-unknown {
  background: #9e9e9e;
  color: white;
}

.ai-content {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.ai-explanation, .ai-guidance {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.ai-label {
  font-weight: 600;
  font-size: 0.9rem;
  opacity: 0.9;
}

.ai-text {
  font-size: 0.95rem;
  line-height: 1.4;
  background: rgba(255, 255, 255, 0.1);
  padding: 0.5rem;
  border-radius: 6px;
  border-left: 3px solid rgba(255, 255, 255, 0.3);
}

/* Explanation Result Styles */
.explanation-result {
  background: linear-gradient(135deg, #e8f5e8 0%, #f0f8f0 100%);
  border-radius: 8px;
  padding: 1rem;
  margin: 0.5rem 0;
  border-left: 4px solid #4caf50;
}

.explanation-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.explanation-icon {
  font-size: 1.2rem;
}

.explanation-title {
  font-weight: 600;
  color: #2e7d32;
}

.referenced-file {
  font-size: 0.8rem;
  color: #666;
  font-style: italic;
}

/* Enhanced existing styles */
.links-container {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  margin: 0.5rem 0;
  background: #fafafa;
}

.result-title {
  font-weight: 600;
  margin-bottom: 0.8rem;
  color: #333;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  background: white;
}

.link-number {
  background: #0066ff;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
  flex-shrink: 0;
}

.link-info {
  flex: 1;
  min-width: 0;
}

.link-text {
  font-weight: 500;
  color: #333;
  margin-bottom: 0.2rem;
}

.link-url {
  font-size: 0.75rem;
  color: #888;
  word-break: break-all;
}

.download-btn {
  background: #1e88e5;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.download-btn:hover:not(:disabled) {
  background: #1565c0;
}

.download-btn:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.file-result {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  margin: 0.5rem 0;
  background: white;
}

.file-info {
  margin-bottom: 1rem;
}

.filename {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  margin-bottom: 0.3rem;
}

.file-icon {
  font-size: 1.2rem;
}

.filepath {
  font-size: 0.8rem;
  color: #666;
  font-family: monospace;
}

.scan-result {
  border-top: 1px solid #eee;
  padding-top: 1rem;
  margin-top: 1rem;
}

.scan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
}

.scan-title {
  font-weight: 600;
  color: #333;
}

.scan-status {
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.scan-success {
  background: #e8f5e8;
  color: #2e7d32;
}

.scan-error {
  background: #ffebee;
  color: #c62828;
}

.verdict-container {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 0.8rem;
  margin: 0.5rem 0;
}

.verdict-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.verdict-label {
  font-weight: 500;
  color: #555;
}

.verdict-value {
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: bold;
}

.verdict-safe {
  background: #e8f5e8;
  color: #2e7d32;
}

.verdict-warning {
  background: #fff3e0;
  color: #ef6c00;
}

.verdict-danger {
  background: #ffebee;
  color: #c62828;
}

.verdict-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0.3rem 0;
}

.verdict-item-label {
  font-size: 0.9rem;
  color: #666;
}

.verdict-item-value {
  font-weight: 500;
}

.score-bar {
  width: 100px;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
  margin-left: 0.5rem;
}

.score-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s ease;
}

.count-container {
  display: flex;
  gap: 1rem;
  margin: 0.5rem 0;
}

.count-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.3rem;
  border-radius: 4px;
  background: #f0f0f0;
  min-width: 80px;
}

.count-item.alert {
  background: #ffebee;
}

.count-value {
  font-weight: bold;
  font-size: 1.2rem;
  color: #333;
}

.count-item.alert .count-value {
  color: #c62828;
}

.count-label {
  font-size: 0.7rem;
  color: #666;
  text-align: center;
}

.allocation-container {
  margin: 0.5rem 0;
}

.allocation-header {
  font-weight: 500;
  margin-bottom: 0.3rem;
  color: #555;
}

.allocation-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.allocation-item {
  background: #e3f2fd;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
}

.allocation-name {
  font-weight: 500;
  color: #1565c0;
}

.allocation-value {
  color: #0d47a1;
}

.details-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.details-toggle-btn {
  background: #e0e0e0;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  color: #555;
  transition: background-color 0.2s;
}

.details-toggle-btn:hover {
  background: #d0d0d0;
}

.technical-details {
  margin-top: 0.8rem;
}

.scan-detail-item {
  background: #f8f9fa;
  border-radius: 4px;
  padding: 0.8rem;
  margin-bottom: 0.5rem;
}

.detail-header {
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #333;
}

.scan-detail-item pre {
  font-size: 0.7rem;
  color: #666;
  background: white;
  padding: 0.5rem;
  border-radius: 3px;
  border: 1px solid #e0e0e0;
  overflow-x: auto;
  margin: 0;
}

.error-result {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: #ffebee;
  border: 1px solid #ffcdd2;
  border-radius: 6px;
  margin: 0.5rem 0;
}

.error-icon {
  font-size: 1.2rem;
}

.error-message {
  color: #c62828;
  font-weight: 500;
}

.error-details {
  font-size: 0.8rem;
  color: #666;
  margin-top: 0.3rem;
}

.generic-result {
  padding: 1rem;
  background: #f0f0f0;
  border-radius: 6px;
  margin: 0.5rem 0;
}

.status-message {
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.details-btn {
  background: #0066ff;
  color: white;
  border: none;
  padding: 0.3rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.processing-indicator {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem;
  background: #e3f2fd;
  border-radius: 8px;
  margin-bottom: 1rem;
  animation: pulse 2s infinite;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e3f2fd;
  border-top: 2px solid #1976d2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.stop-btn.has-operations {
  background: #ff4444 !important;
  color: white !important;
  border-color: #cc0000 !important;
  animation: pulse 1.5s infinite;
}

.stop-btn.stopping {
  background: #666 !important;
  color: #ccc !important;
  cursor: not-allowed !important;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.processing-text {
  color: #1565c0;
  font-weight: 500;
  flex: 1;
}

.stop-processing-btn {
  background: #f44336;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.stop-processing-btn:hover {
  background: #d32f2f;
}

.input-form {
  display: flex;
  gap: 0.5rem;
}

.message-input {
  flex: 1;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
}

.message-input:focus {
  outline: none;
  border-color: #0066ff;
  box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.2);
}

.send-button {
  padding: 0.8rem 1.2rem;
  background-color: #0066ff;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.2s;
  min-width: 80px;
}

.send-button:hover {
  background-color: #0055cc;
  transform: translateY(-2px);
}

.send-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.footer {
  text-align: center;
  color: #666;
  font-size: 0.8rem;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .chat-container {
    padding: 1rem;
    height: 100dvh;
  }

  .header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .header h1 {
    font-size: 1.5rem;
  }

  .control-buttons {
    flex-wrap: wrap;
    width: 100%;
    justify-content: center;
  }

  .control-btn {
    flex: 1;
    min-width: 100px;
    justify-content: center;
    font-size: 0.8rem;
    padding: 0.5rem 0.8rem;
  }

  .modal-content {
    max-width: 95vw;
    max-height: 90vh;
    margin: 1rem;
  }

  .modal-header {
    padding: 1rem;
  }

  .modal-header h3 {
    font-size: 1.1rem;
  }

  .modal-body {
    padding: 1rem;
  }

  .example-url {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .url-text {
    margin-right: 0;
    font-size: 0.8rem;
  }

  .use-btn {
    align-self: stretch;
    text-align: center;
  }

  .message-input, .send-button {
    font-size: 14px;
  }

  .message-content {
    font-size: 0.9rem;
  }

  .messages {
    padding: 0.6rem;
  }

  .ai-analysis-section {
    padding: 0.8rem;
    margin: 0.8rem 0;
  }

  .ai-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .ai-title {
    font-size: 1rem;
  }

  .ai-verdict {
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
  }

  .ai-text {
    font-size: 0.9rem;
    padding: 0.4rem;
  }

  .link-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.6rem;
  }

  .link-number {
    align-self: flex-start;
  }

  .download-btn {
    align-self: stretch;
    text-align: center;
  }

  .count-container {
    flex-direction: column;
    gap: 0.5rem;
  }

  .allocation-items {
    flex-direction: column;
  }

  .verdict-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .verdict-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
  }

  .score-bar {
    width: 100%;
    margin-left: 0;
    margin-top: 0.2rem;
  }

  .scan-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .scan-detail-item pre {
    font-size: 0.6rem;
    overflow-x: scroll;
  }

  .explanation-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .processing-indicator {
    flex-direction: column;
    text-align: center;
    gap: 0.5rem;
  }

  .processing-text {
    text-align: center;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .ai-analysis-section {
    background: #000;
    color: #fff;
    border: 2px solid #fff;
  }

  .ai-verdict-safe {
    background: #00ff00;
    color: #000;
  }

  .ai-verdict-warning {
    background: #ffff00;
    color: #000;
  }

  .ai-verdict-danger {
    background: #ff0000;
    color: #fff;
  }

  .ai-verdict-unknown {
    background: #888;
    color: #fff;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .chat-container {
    background: rgba(30, 30, 30, 0.95);
    color: #fff;
  }

  .header h1 {
    color: #fff;
  }

  .header {
    border-bottom-color: #404040;
  }

  .clear-btn {
    background: #1a3a5c;
    color: #90caf9;
    border-color: #1976d2;
  }

  .examples-btn {
    background: #4a1a4a;
    color: #ce93d8;
    border-color: #7b1fa2;
  }

  .stop-btn {
    background: #4a1a1a;
    color: #ffcdd2;
    border-color: #d32f2f;
  }

  .modal-content {
    background: #2a2a2a;
    color: #fff;
  }

  .modal-header {
    border-bottom-color: #404040;
  }

  .modal-header h3 {
    color: #fff;
  }

  .close-btn {
    color: #ccc;
  }

  .close-btn:hover {
    background: #404040;
    color: #fff;
  }

  .example-category h4 {
    color: #ccc;
  }

  .example-url {
    background: #3a3a3a;
    border-color: #505050;
  }

  .example-url:hover {
    background: #404040;
  }

  .url-text {
    color: #e0e0e0;
  }

  .messages {
    background-color: #2a2a2a;
    border-color: #404040;
  }

  .bot {
    background: #3a3a3a;
    color: #fff;
  }

  .ai-analysis-section {
    background: linear-gradient(135deg, #4a5568 0%, #553c9a 100%);
  }

  .file-result, .links-container {
    background: #2a2a2a;
    border-color: #404040;
  }

  .link-item {
    background: #3a3a3a;
    border-color: #505050;
  }

  .link-text {
    color: #e0e0e0;
  }

  .verdict-container {
    background: #3a3a3a;
  }

  .scan-detail-item {
    background: #3a3a3a;
  }

  .scan-detail-item pre {
    background: #2a2a2a;
    border-color: #505050;
    color: #e0e0e0;
  }

  .details-toggle-btn {
    background: #505050;
    color: #e0e0e0;
  }

  .details-toggle-btn:hover {
    background: #606060;
  }

  .message-input {
    background: #2a2a2a;
    border-color: #505050;
    color: #fff;
  }

  .message-input:focus {
    border-color: #4a90e2;
  }

  .footer {
    color: #ccc;
    border-top-color: #404040;
  }

  .explanation-result {
    background: linear-gradient(135deg, #2d4a2d 0%, #3a4a3a 100%);
    border-left-color: #4caf50;
  }

  .explanation-title {
    color: #81c784;
  }

  .processing-indicator {
    background: #2a4a6a;
  }

  .processing-text {
    color: #90caf9;
  }
}

/* Animation for AI verdict appearance */
@keyframes aiVerdictSlide {
  from {
    transform: translateX(20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Pulsing animation for processing */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

/* Smooth transitions */
* {
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

button {
  transition: all 0.2s ease;
}

/* Focus styles for accessibility */
button:focus-visible,
input:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

/* Reduce motion for users who prefer it */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

.enhanced-processing-indicator {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border: 1px solid #2196f3;
  animation: fadeInUp 0.3s ease-out;
}

.main-progress-section {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.processing-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.processing-text {
  color: #1565c0;
  font-weight: 500;
  font-size: 1rem;
}

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #666;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f44336;
  transition: background-color 0.3s ease;
}

.connection-indicator.connected .status-dot {
  background: #4caf50;
  animation: pulse 2s infinite;
}

.stop-processing-btn {
  background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(244, 67, 54, 0.3);
}

.stop-processing-btn:hover {
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4);
}

/* Single Progress Section */
.single-progress-section {
  border-top: 1px solid #90caf9;
  padding-top: 1rem;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.progress-text {
  font-weight: 600;
  color: #1976d2;
  font-size: 0.95rem;
}

.progress-percentage {
  font-weight: 700;
  font-size: 1.1rem;
  color: #1976d2;
  min-width: 50px;
  text-align: right;
}

.main-progress-bar {
  width: 100%;
  height: 12px;
  background: #e3f2fd;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  transition: width 0.5s ease;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: progressShine 2s infinite;
}

.progress-low {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
}

.progress-medium {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
}

.progress-high {
  background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
}

.progress-details {
  font-size: 0.85rem;
  color: #666;
  font-family: 'Monaco', 'Menlo', monospace;
  text-align: center;
  padding: 0.3rem;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 6px;
}

@keyframes progressShine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Mobile Responsive Updates */
@media (max-width: 768px) {
  .main-progress-section {
    flex-direction: column;
    gap: 0.8rem;
    text-align: center;
  }
  
  .stop-processing-btn {
    align-self: stretch;
  }
  
  .progress-info {
    flex-direction: column;
    gap: 0.3rem;
    text-align: center;
  }
  
  .progress-text,
  .progress-percentage {
    font-size: 0.9rem;
  }
  
  .processing-text {
    font-size: 0.9rem;
  }
}


.progress-section {
  margin: 0.8rem 0;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.progress-percentage {
  font-weight: 700;
  font-size: 1.2rem;
  color: #1976d2;
}

.progress-details {
  font-size: 0.85rem;
  color: #666;
  font-family: 'Monaco', 'Menlo', monospace;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e3f2fd;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  transition: width 0.5s ease;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.progress-low {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
}

.progress-medium {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
}

.progress-high {
  background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
}

.progress-bar.indeterminate {
  background: #e3f2fd;
}

.progress-fill-indeterminate {
  width: 30%;
  height: 100%;
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  border-radius: 4px;
  animation: indeterminateProgress 2s ease-in-out infinite;
}



.status-active .status-indicator {
  background: #2196f3;
  animation: pulse 2s infinite;
}


.status-progress .status-indicator {
  background: #ff9800;
  animation: progressPulse 1.5s infinite;
}

.status-success .status-indicator {
  background: #4caf50;
}


.status-error .status-indicator {
  background: #f44336;
  animation: errorBlink 1s infinite;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.stop-processing-btn {
  background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(244, 67, 54, 0.3);
}

.stop-processing-btn:hover {
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4);
}

/* Enhanced main progress bar */
.main-progress-bar {
  width: 100%;
  height: 16px; /* Slightly taller for better visibility */
  background: #e3f2fd;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  margin-bottom: 0.5rem;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Enhanced progress fill */
.progress-fill {
  height: 100%;
  transition: width 0.3s ease-out; /* Smoother animation */
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  min-width: 2px; /* Ensure visibility even at 0% */
}
.progress-indeterminate {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  width: 30% !important;
}

@keyframes indeterminateSlide {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(250%); }
  100% { transform: translateX(-100%); }
}

/* Enhanced progress bar colors based on percentage */
.progress-low {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  box-shadow: 0 2px 4px rgba(255, 152, 0, 0.3);
}

.progress-medium {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
}

.progress-high {
  background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
  box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
}

/* Enhanced shine effect for active downloads */
.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  animation: progressShine 2.5s infinite;
}

@keyframes progressShine {
  0% { transform: translateX(-100%); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0; }
}

/* Enhanced progress percentage display */
.progress-percentage {
  font-weight: 700;
  font-size: 1.2rem;
  color: #1976d2;
  min-width: 60px;
  text-align: right;
  font-family: 'Monaco', 'Menlo', monospace;
}

/* Enhanced progress details */
.progress-details {
  font-size: 0.85rem;
  color: #555;
  font-family: 'Monaco', 'Menlo', monospace;
  text-align: center;
  padding: 0.4rem 0.8rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  border: 1px solid rgba(33, 150, 243, 0.2);
  backdrop-filter: blur(4px);
  margin-top: 0.5rem;
}

/* Enhanced progress text with emoji */
.progress-text {
  font-weight: 600;
  color: #1976d2;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.progress-text::before {
  content: '📥';
  font-size: 1.1rem;
}

/* Add pulsing effect for active downloads */
.single-progress-section {
  border-top: 1px solid #90caf9;
  padding-top: 1rem;
  animation: progressPulse 3s ease-in-out infinite;
}

@keyframes progressPulse {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(33, 150, 243, 0.03); }
}

.enhanced-progress-section {
  border-top: 1px solid rgba(33, 150, 243, 0.3);
  padding-top: 1rem;
  margin-top: 1rem;
}

.progress-header {
  margin-bottom: 0.8rem;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.progress-text {
  font-weight: 600;
  color: #1976d2;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.progress-text::before {
  content: '📥';
  font-size: 1.1rem;
}

.progress-percentage {
  font-weight: 700;
  font-size: 1.3rem;
  color: #1976d2;
  min-width: 70px;
  text-align: right;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  background: rgba(255, 255, 255, 0.8);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  border: 1px solid rgba(33, 150, 243, 0.3);
}

/* Enhanced Progress Bar */
.main-progress-bar {
  position: relative;
  width: 100%;
  height: 20px;
  background: linear-gradient(135deg, #e3f2fd 0%, #f5f5f5 100%);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(33, 150, 243, 0.2);
}

.progress-fill {
  height: 100%;
  border-radius: 10px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
  overflow: hidden;
}

.progress-fill.animated {
  position: relative;
}

/* Animated shine effect */
.progress-fill.animated::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  animation: progressShine 2.5s infinite;
}

/* Progress text inside the bar */
.progress-inner-text {
  position: relative;
  z-index: 2;
  color: white;
  font-weight: 700;
  font-size: 0.85rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
}

/* Progress text outside the bar for small percentages */
.progress-outer-label {
  position: absolute;
  left: calc(var(--progress-percent, 0) * 1% + 8px);
  top: 50%;
  transform: translateY(-50%);
  color: #1976d2;
  font-weight: 700;
  font-size: 0.85rem;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  background: rgba(255, 255, 255, 0.9);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  border: 1px solid rgba(33, 150, 243, 0.3);
  pointer-events: none;
}

/* Progress Bar Colors based on percentage */
.progress-low {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  box-shadow: 0 2px 8px rgba(255, 152, 0, 0.4);
}

.progress-medium {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
}

.progress-high {
  background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
}


/* Enhanced Progress Details */
.progress-details-enhanced {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 0.8rem;
  padding: 0.6rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 10px;
  border: 1px solid rgba(33, 150, 243, 0.2);
  backdrop-filter: blur(4px);
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: rgba(33, 150, 243, 0.1);
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  border: 1px solid rgba(33, 150, 243, 0.2);
}

.detail-icon {
  font-size: 0.9rem;
}

.detail-text {
  font-weight: 500;
  color: #1976d2;
}

/* Animations */
@keyframes progressShine {
  0% { 
    left: -100%; 
    opacity: 0; 
  }
  50% { 
    opacity: 1; 
  }
  100% { 
    left: 100%; 
    opacity: 0; 
  }
}

@keyframes indeterminateSlide {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(250%); }
  100% { transform: translateX(-100%); }
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .progress-info {
    flex-direction: column;
    gap: 0.4rem;
    text-align: center;
  }
  
  .progress-percentage {
    font-size: 1.1rem;
    min-width: auto;
  }
  
  .main-progress-bar {
    height: 16px;
  }
  
  .progress-inner-text {
    font-size: 0.75rem;
  }
  
  .progress-details-enhanced {
    flex-direction: column;
    gap: 0.4rem;
  }
  
  .detail-item {
    justify-content: center;
    font-size: 0.8rem;
  }
  
  .progress-text {
    font-size: 0.9rem;
  }
  
  .progress-text::before {
    font-size: 1rem;
  }
}
/* Debug Modal Styles */
.debug-modal {
  max-width: 90vw;
  max-height: 90vh;
}

.debug-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #007bff;
}

.debug-section h4 {
  margin: 0 0 0.8rem 0;
  color: #333;
  font-size: 1.1rem;
  font-weight: 600;
}

.debug-empty {
  color: #666;
  font-style: italic;
  padding: 0.5rem;
  text-align: center;
  background: #fff;
  border-radius: 4px;
}

.debug-activity {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 0.8rem;
  margin-bottom: 0.5rem;
}

.debug-activity-data pre {
  margin: 0;
  font-size: 0.75rem;
  color: #495057;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8f9fa;
  padding: 0.5rem;
  border-radius: 4px;
}

.debug-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(255, 152, 0, 0.3);
}

</style>