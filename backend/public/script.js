
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
        aaa.classList.remove('SearchON');
        SearchOn = false;
        console.log(SearchOn);
    } else if (!SearchOn) {
        aaa.classList.add('SearchON');
        SearchOn = true;
        console.log(SearchOn);
    }
});

renderFilePreviews();

//缓存选择
// const modelSelect = document.getElementById('gemini-v');
// modelSelect.addEventListener('change', function () {
//     localStorage.setItem('selectedModel', this.value);
// });
// const savedValue = localStorage.getItem('selectedModel');
// if (savedValue) {
//     modelSelect.value = savedValue;
// }
// 动态调整输入框高度
promptInput.addEventListener('input', function () {
    this.style.height = '0';
    this.style.height = this.scrollHeight + 'px';
});

window.addEventListener('load', () => {
    promptInput.style.height = '0';
    promptInput.style.height = promptInput.scrollHeight + 'px';
});

//打开关闭历史列表
let historylistdsiplay = false;
document.addEventListener('DOMContentLoaded', function () {
    const a = document.getElementById("history-list");
    const opbtn = document.getElementById("history-b");
    opbtn.addEventListener("click", function () {
        if (!historylistdsiplay) {
            a.style.width = '300px';
            a.style.borderRight = '1px solid var(--df-01)';
            a.style.transition = 'all 0.3s ease';
            opbtn.classList.add('hisbtn2');
            historylistdsiplay = true;
        } else if (historylistdsiplay) {
            a.style.width = '0';
            a.style.borderRight = 'none';
            opbtn.classList.remove('hisbtn2');
            historylistdsiplay = false;
        }
    });

});
function closehislist() {
    const a = document.getElementById("history-list");
    const opbtn = document.getElementById("history-b");
    if (window.innerWidth > 800) { return }
    a.style.width = '0';
    a.style.borderRight = 'none';
    a.style.transition = 'none';
    opbtn.classList.remove('hisbtn2');
    historylistdsiplay = false;

};

//对话导航
function generateUserMessageIndex() {
    const indexList = document.getElementById('list-dhdh');
    const userMessages = document.querySelectorAll('#chat-window .message.user-message');
    indexList.innerHTML = '';
    if (userMessages.length === 0) {
        const listTitle = document.createElement('h4');
        listTitle.textContent = '新的对话';
        indexList.appendChild(listTitle);
        return;
    }
    const listTitle = document.createElement('h4');
    listTitle.textContent = '对话导航';
    indexList.appendChild(listTitle);
    userMessages.forEach((messageDiv, index) => {
        const messageId = `user-msg-${index}`;
        messageDiv.id = messageId;
        let messageText = messageDiv.querySelector('p')?.textContent || messageDiv.textContent;
        messageText = messageText.trim();
        if (!messageText) return;
        const displayText = messageText.length > 25 ? messageText.substring(0, 22) + '...' : messageText;
        const listItem = document.createElement('li');
        listItem.textContent = displayText;
        listItem.title = messageText;
        listItem.addEventListener('click', (event) => {
            const targetMessage = document.getElementById(messageId);
            if (targetMessage) {
                targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
        indexList.appendChild(listItem);
    });
};
let dhdh = false;
if (window.innerWidth >= 1220) { dhdh = true };
function opendhdh() {
    const listdhdh = document.getElementById('list-dhdh')
    if (dhdh) {
        listdhdh.style.width = '0';
        listdhdh.style.borderWidth = '0';
        dhdh = false;
    } else if (!dhdh) {
        listdhdh.style.width = '200px';
        listdhdh.style.borderWidth = '1px';
        dhdh = true;
    }
}

function copycode() {
    const messageElements = document.querySelectorAll('.message');
    messageElements.forEach(messageElement => {
        const preElements = messageElement.querySelectorAll('pre');
        preElements.forEach(preElement => {
            if (preElement.dataset.wrapped) { return; };
            const copyButton = document.createElement('button');
            copyButton.classList.add('copy-button');
            copyButton.addEventListener('click', () => {
                // 获取pre元素内的所有文本，去除 HTML 标签
                const textToCopy = preElement.textContent;
                // 调用复制到剪贴板函数
                copyToClipboard(textToCopy);
                copyButton.classList.add('copy-button-OK');
                setTimeout(() => { copyButton.classList.remove('copy-button-OK'); }, 1500);
            });
            preElement.parentNode.insertBefore(copyButton, preElement);  // 在pre元素之前插入
            preElement.dataset.wrapped = 'true';
        });
    });
    // 复制到剪贴板的函数
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            // 现代浏览器推荐使用 Clipboard API
            navigator.clipboard.writeText(text)
                .then(() => {
                    console.log('已复制');
                })
                .catch(err => {
                    console.error('Failed to copy text: ', err);
                    // 如果 Clipboard API 失败，则使用 fallback 方法
                    fallbackCopyToClipboard(text);
                });
        } else {
            // 较旧的浏览器使用 fallback 方法
            fallbackCopyToClipboard(text);
        }
    }
    // Clipboard API 的 Fallback 实现
    function fallbackCopyToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // 避免页面滚动
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            const msg = successful ? 'successful' : 'unsuccessful';
            console.log('Fallback: Copying text command was ' + msg);
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
    }
}
//给<table>套div
function wrapTablesInGeminiMessages() {
    const geminiMessages = document.querySelectorAll('div.gemini-message');

    geminiMessages.forEach(message => {
        const tables = message.querySelectorAll('table');

        tables.forEach(table => {
            if (table.dataset.wrapped) { return; }
            const tableBox = document.createElement('div');
            tableBox.classList.add('table-box');
            table.parentNode.replaceChild(tableBox, table);
            tableBox.appendChild(table);
            table.dataset.wrapped = 'true';
        });
    });
}
function addcopy() {
    generateUserMessageIndex()
    wrapTablesInGeminiMessages();
    copycode()
}

//删除历史
function delHistories(list) {
    delhistorybox.innerHTML = '';

    const closebtn = document.createElement('button')
    closebtn.innerText = '返回';
    closebtn.addEventListener('click', function () { delhistorybox.style.display = 'none' });
    list.forEach((item, index) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        // span.textContent = item.title;
        span.textContent = `${index + 1}. ${item.title}`
        li.dataset.sessionId = item.sessionId;
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✕';
        deleteBtn.classList.add('delete-history-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.sessionId === sessionId) {
                newChatBtn.click();
            }
            socket.emit('deleteHistory', { sessionId: item.sessionId });
        });
        li.appendChild(span);
        li.appendChild(deleteBtn);
        delhistorybox.appendChild(closebtn);
        delhistorybox.appendChild(li);
    });
}