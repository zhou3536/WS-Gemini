const ws = new WebSocket(`ws://${window.location.host}`);
let sessionId = localStorage.getItem('sessionId');
let currentModelResponseElement = null; // 用于追踪当前模型响应的DOM元素

// --- WebSocket 事件处理 ---
ws.onopen = () => {
    console.log('WebSocket连接已建立');
    if (sessionId) {
        ws.send(JSON.stringify({ type: 'loadHistory', sessionId }));
    } else {
        welcome.style.display = 'block';
    }
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
        case 'sessionCreated':
            sessionId = data.sessionId;
            localStorage.setItem('sessionId', sessionId);
            break;
        case 'historyLoaded':
            renderHistory(data.history);
            break;
        case 'streamChunk':
            appendStreamChunk(data.chunk);
            break;
        case 'streamEnd':
            currentModelResponseElement = null; // 重置当前响应元素
            hljs.highlightAll(); // 高亮所有代码块
            break;
        case 'error':
            console.error('服务器错误:', data.message);
            alert(`发生错误: ${data.message}`);
            break;
    }
};

ws.onclose = () => {
    console.log('WebSocket连接已关闭');
    // 可以在这里尝试重连
};

ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
};

// --- UI渲染函数 ---
function renderHistory(history) {
    welcome.style.display = 'none';
    chatWindow.innerHTML = '';
    history.forEach(message => {
        if (message.role === 'user') {
            appendMessage(message.parts[0].text, 'user');
        } else if (message.role === 'model') {
            appendMessage(message.parts[0].text, 'model');
        }
    });
    hljs.highlightAll();
}

function appendMessage(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.innerHTML = marked.parse(text);
    pre.appendChild(code);
    messageElement.appendChild(pre);

    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return messageElement; // 返回创建的元素以便流式追加
}

function appendStreamChunk(chunk) {
    if (!currentModelResponseElement) {
        // 如果是流的开始，创建一个新的消息元素
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'model-message');
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        pre.appendChild(code);
        messageElement.appendChild(pre);
        chatWindow.appendChild(messageElement);
        currentModelResponseElement = code; // 设置当前响应元素
    }
    // 将新的块附加到当前响应中
    currentModelResponseElement.innerHTML += marked.parse(chunk);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}


// --- 发送消息 ---
sendBtn.addEventListener('click', sendMessage);
promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const prompt = promptInput.value.trim();
    if (prompt === '' && selectedFiles.length === 0) return;

    welcome.style.display = 'none';
    appendMessage(prompt, 'user');

    const filePromises = selectedFiles.map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    data: e.target.result.split(',')[1], // Base64 data
                    mimeType: file.type
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    });

    const files = await Promise.all(filePromises);
    const model = document.getElementById('gemini-v').value;

    ws.send(JSON.stringify({
        type: 'newMessage',
        sessionId,
        prompt,
        files,
        model,
        useWebSearch: SearchOn
    }));

    promptInput.value = '';
    selectedFiles = [];
    renderFilePreviews();
    promptInput.focus();
}

// --- 新建对话 ---
newChatBtn.addEventListener('click', () => {
    sessionId = null;
    localStorage.removeItem('sessionId');
    chatWindow.innerHTML = '';
    welcome.style.display = 'block';
});


// --- 文件处理逻辑 (与之前类似，保持不变) ---
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function processFiles(files) {
    let largeFilesDetected = false;
    const newFiles = Array.from(files);

    newFiles.forEach(file => {
        if (file.size > MAX_FILE_SIZE_BYTES) {
            largeFilesDetected = true;
        } else {
            const isDuplicate = selectedFiles.some(f => f.name === file.name && f.size === file.size);
            if (!isDuplicate) {
                selectedFiles.push(file);
            }
        }
    });

    if (largeFilesDetected) {
        alert('请选择小于5MB的文件。');
    }
    renderFilePreviews();
}

addFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
    processFiles(event.target.files);
    fileInput.value = '';
});

function renderFilePreviews() {
    filePreviewArea.innerHTML = '';
    if (selectedFiles.length > 0) {
        filePreviewArea.style.display = 'block';
    } else {
        filePreviewArea.style.display = 'none';
        return;
    }

    selectedFiles.forEach((file, index) => {
        const preview = document.createElement('div');
        preview.classList.add('file-preview-item');
        const fileName = document.createElement('span');
        fileName.textContent = file.name;
        preview.appendChild(fileName);
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
            selectedFiles.splice(index, 1);
            renderFilePreviews();
        });
        preview.appendChild(removeBtn);
        filePreviewArea.appendChild(preview);
    });
}

inputarea.addEventListener('dragover', (e) => { e.preventDefault(); inputarea.classList.add('drag-over'); });
inputarea.addEventListener('dragleave', () => inputarea.classList.remove('drag-over'));
inputarea.addEventListener('drop', (e) => {
    e.preventDefault();
    inputarea.classList.remove('drag-over');
    processFiles(e.dataTransfer.files);
});

promptInput.addEventListener('paste', (e) => {
    const files = e.clipboardData.files;
    if (files.length > 0) {
        e.preventDefault();
        processFiles(files);
    }
});

//搜索开关
Searchbtn.addEventListener("click", function () {
    const aaa = document.getElementById('Search');
    if (SearchOn) {
        aaa.classList.remove('SearchON')
        SearchOn = false
    } else if (!SearchOn) {
        aaa.classList.add('SearchON')
        SearchOn = true
    }
});

renderFilePreviews();

