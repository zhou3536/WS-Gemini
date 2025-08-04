// --- 文件处理逻辑 
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// 允许的文本文件扩展名
const ALLOWED_TEXT_EXTENSIONS = [
    // 通用文本和文档
    'txt', 'md', 'rst', 'text', 'log',
    // 网页开发
    'html', 'htm', 'css', 'js', 'jsx', 'tsx', 'vue', 'svelte', 'pug', 'ejs',
    // 编程语言
    'java', 'py', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rb', 'php', 'swift', 'kt', 'rs', 'scala', 'perl', 'pl', 'lua', 'ts',
    // 配置文件和脚本
    'properties', 'ini', 'conf', 'yml', 'yaml', 'json', 'xml', 'sql', 'sh', 'bat', 'ps1', 'bash', 'zsh', 'env', 'gitignore', 'dockerfile', 'editorconfig',
    // 数据交换和格式
    'csv', 'tsv',
    // 字幕文件
    'vtt', 'srt', 'ass', 'lrc',
    // 其他
    'strm'
];

// 允许的文件扩展名
const ALLOWED_OTHER_EXTENSIONS = [
    'jpg', 'tiff', 'jpeg', 'png', 'bmp', 'svg', 'ico', 'webp',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'pdf', 'zip', 'rar'
];

// 获取文件扩展名
function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

// 检查文件类型是否允许
function isAllowedFileType(filename) {
    const extension = getFileExtension(filename);
    return ALLOWED_TEXT_EXTENSIONS.includes(extension) || ALLOWED_OTHER_EXTENSIONS.includes(extension);
}

// 根据文件扩展名设置文件类型
function setFileType(file) {
    const extension = getFileExtension(file.name);

    if (ALLOWED_TEXT_EXTENSIONS.includes(extension)) {
        // 为文本文件创建新的File对象，设置type为'text/plain'
        return new File([file], file.name, {
            type: 'text/plain',
            lastModified: file.lastModified
        });
    } else if (ALLOWED_OTHER_EXTENSIONS.includes(extension)) {
        // 其他文件保持原有类型
        return file;
    }

    return file;
}

function processFiles(files) {
    let largeFilesDetected = false;
    let unsupportedFilesDetected = false;
    const newFiles = Array.from(files);

    newFiles.forEach(file => {
        // 检查文件大小
        if (file.size > MAX_FILE_SIZE_BYTES) {
            largeFilesDetected = true;
            return;
        }

        // 检查文件类型
        if (!isAllowedFileType(file.name)) {
            unsupportedFilesDetected = true;
            return;
        }

        // 检查是否重复
        const isDuplicate = selectedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!isDuplicate) {
            // 设置文件类型并添加到列表
            const processedFile = setFileType(file);
            selectedFiles.push(processedFile);
        }
    });

    // 显示错误信息
    if (largeFilesDetected) {
        alert('请选择小于5MB的文件。');
    }

    if (unsupportedFilesDetected) {
        alert('不支持的文件格式。');
    }

    renderFilePreviews();
}

addFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
    processFiles(event.target.files);
    fileInput.value = '';
});

//更新显示
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

//拖入文件
inputarea.addEventListener('dragover', (e) => { e.preventDefault(); inputarea.classList.add('drag-over'); });
inputarea.addEventListener('dragleave', () => inputarea.classList.remove('drag-over'));
inputarea.addEventListener('drop', (e) => {
    e.preventDefault();
    inputarea.classList.remove('drag-over');
    processFiles(e.dataTransfer.files);
});

//输入框粘贴文件
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
    } else if (!SearchOn) {
        aaa.classList.add('SearchON');
        SearchOn = true;
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
    const chatWindow = document.getElementById('chat-window');
    const preElements = chatWindow.querySelectorAll('pre');
    preElements.forEach(preElement => {
        const codeElements = preElement.querySelectorAll('code');
        codeElements.forEach(codeElement => {
            if (codeElement.dataset.wrapped) { return; };

            // 1. 获取pre元素内的所有文本，textContent 属性会自动去除 HTML 标签
            const textToProcess = codeElement.textContent;
            const firstClassName = codeElement.classList.value.split(' ')[0];
            const languagetype = firstClassName.substring(9);
            // 2. 检查如含有 <!DOCTYPE html><head></head><body></body> 就添加一个预览按钮
            // 为了不区分大小写，将文本转换为小写进行检查
            const lowerCaseText = textToProcess.toLowerCase();
            const containsHtmlBoilerplate =
                lowerCaseText.startsWith('<!doctype html>') &&
                lowerCaseText.includes('<html') &&
                lowerCaseText.includes('</html>') &&
                lowerCaseText.includes('<head') &&
                lowerCaseText.includes('</head>') &&
                lowerCaseText.includes('<body') &&
                lowerCaseText.includes('</body>');

            // 3. 网页元素结构修改为先创建div，在div里创建按钮。
            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('pre-buttons-container'); // 可以添加一个类名以便样式化
            // 语言类型
            const languagetypep = document.createElement('p');
            languagetypep.innerText = languagetype;
            buttonContainer.appendChild(languagetypep);
            // 创建复制按钮
            const copyButton = document.createElement('button');
            copyButton.classList.add('copy-button');
            // copyButton.textContent = '复制'; 
            copyButton.addEventListener('click', () => {
                copyToClipboard(textToProcess);
                copyButton.classList.add('copy-button-OK');
                setTimeout(() => {
                    copyButton.classList.remove('copy-button-OK');
                }, 1500);
            });
            buttonContainer.appendChild(copyButton);

            // 如果包含HTML样板，则创建预览按钮
            if (containsHtmlBoilerplate) {
                const previewCodeButton = document.createElement('button');
                previewCodeButton.classList.add('preview-button');
                previewCodeButton.addEventListener('click', () => {
                    preview(textToProcess);
                });
                buttonContainer.appendChild(previewCodeButton);
            } else {
                const eiditorButton = document.createElement('button');
                eiditorButton.classList.add('editor-buttom')
                eiditorButton.addEventListener('click', () => {
                    editor(textToProcess,languagetype);
                });
                buttonContainer.appendChild(eiditorButton);
            }

            // 将创建的 div 容器插入到 pre 元素之前
            preElement.parentNode.insertBefore(buttonContainer, preElement);

            // 标记 pre 元素已被处理，防止重复添加按钮
            codeElement.dataset.wrapped = 'true';
        });
    });
    // 预览按钮点击执行函数
    function preview(code) {
        const Key = Date.now();
        localStorage.setItem(Key, code);
        window.open(`/preview.html?code=${Key}`, '_blank');
    }
    function editor(code,type) {
        const Key = Date.now();
        localStorage.setItem(Key, code);
        window.open(`/editor.html?code=${Key}&type=${type}`, '_blank');
    };
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
    const geminiMessages = document.querySelectorAll('div.model-message');

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
    closebtn.innerText = '返回主页';
    closebtn.addEventListener('click', function () { delhistorybox.style.display = 'none' });
    delhistorybox.appendChild(closebtn);
    list.forEach((item, index) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.title = `文件名：${item.sessionId}`;
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
            deleteBtn.style.opacity = '0.3';
            deleteBtn.disabled = true;
            socket.emit('deleteHistory', { sessionId: item.sessionId });
        });
        li.appendChild(span);
        li.appendChild(deleteBtn);
        delhistorybox.appendChild(li);
    });
}

//退出登录
async function gmmlogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // alert('You have been logged out.');
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Error during logout:', error);
    }
}