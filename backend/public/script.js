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
const modelSelect = document.getElementById('gemini-v');
modelSelect.addEventListener('change', function () {
    localStorage.setItem('selectedModel', this.value);
});
const savedValue = localStorage.getItem('selectedModel');
if (savedValue) {
    modelSelect.value = savedValue;
}

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
    const a = document.getElementById("sidebar");
    const opbtn = document.getElementById("history-b");
    opbtn.addEventListener("click", function () {
        if (delhistorybox.style.display === 'block') {
            delhistorybox.style.display = 'none';
        } else if (!historylistdsiplay) {
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
    if (window.innerWidth > 800) return;
    const a = document.getElementById("sidebar");
    const opbtn = document.getElementById("history-b");
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
            // 2. 为了不区分大小写，将文本转换为小写进行检查
            const lowerCaseText = textToProcess.toLowerCase();
            const containsHtmlBoilerplate =
                lowerCaseText.includes('<html') &&
                lowerCaseText.includes('</html>') &&
                lowerCaseText.includes('<head') &&
                lowerCaseText.includes('</head>') &&
                lowerCaseText.includes('<body') &&
                lowerCaseText.includes('</body>');

            // 3. 网页元素结构修改为先创建div，在div里创建按钮。
            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('pre-buttons-container');
            // 语言类型
            const languagetypep = document.createElement('p');
            if (firstClassName) {
                languagetypep.innerText = languagetype.toUpperCase();
                buttonContainer.appendChild(languagetypep);
            }
            // 创建复制按钮
            const copyButton = document.createElement('button');
            copyButton.classList.add('copy-button');
            copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path d="M12.668 10.667C12.668 9.95614 12.668 9.46258 12.6367 9.0791C12.6137 8.79732 12.5758 8.60761 12.5244 8.46387L12.4688 8.33399C12.3148 8.03193 12.0803 7.77885 11.793 7.60254L11.666 7.53125C11.508 7.45087 11.2963 7.39395 10.9209 7.36328C10.5374 7.33197 10.0439 7.33203 9.33301 7.33203H6.5C5.78896 7.33203 5.29563 7.33195 4.91211 7.36328C4.63016 7.38632 4.44065 7.42413 4.29688 7.47559L4.16699 7.53125C3.86488 7.68518 3.61186 7.9196 3.43555 8.20703L3.36524 8.33399C3.28478 8.49198 3.22795 8.70352 3.19727 9.0791C3.16595 9.46259 3.16504 9.95611 3.16504 10.667V13.5C3.16504 14.211 3.16593 14.7044 3.19727 15.0879C3.22797 15.4636 3.28473 15.675 3.36524 15.833L3.43555 15.959C3.61186 16.2466 3.86474 16.4807 4.16699 16.6348L4.29688 16.6914C4.44063 16.7428 4.63025 16.7797 4.91211 16.8027C5.29563 16.8341 5.78896 16.835 6.5 16.835H9.33301C10.0439 16.835 10.5374 16.8341 10.9209 16.8027C11.2965 16.772 11.508 16.7152 11.666 16.6348L11.793 16.5645C12.0804 16.3881 12.3148 16.1351 12.4688 15.833L12.5244 15.7031C12.5759 15.5594 12.6137 15.3698 12.6367 15.0879C12.6681 14.7044 12.668 14.211 12.668 13.5V10.667ZM13.998 12.665C14.4528 12.6634 14.8011 12.6602 15.0879 12.6367C15.4635 12.606 15.675 12.5492 15.833 12.4688L15.959 12.3975C16.2466 12.2211 16.4808 11.9682 16.6348 11.666L16.6914 11.5361C16.7428 11.3924 16.7797 11.2026 16.8027 10.9209C16.8341 10.5374 16.835 10.0439 16.835 9.33301V6.5C16.835 5.78896 16.8341 5.29563 16.8027 4.91211C16.7797 4.63025 16.7428 4.44063 16.6914 4.29688L16.6348 4.16699C16.4807 3.86474 16.2466 3.61186 15.959 3.43555L15.833 3.36524C15.675 3.28473 15.4636 3.22797 15.0879 3.19727C14.7044 3.16593 14.211 3.16504 13.5 3.16504H10.667C9.9561 3.16504 9.46259 3.16595 9.0791 3.19727C8.79739 3.22028 8.6076 3.2572 8.46387 3.30859L8.33399 3.36524C8.03176 3.51923 7.77886 3.75343 7.60254 4.04102L7.53125 4.16699C7.4508 4.32498 7.39397 4.53655 7.36328 4.91211C7.33985 5.19893 7.33562 5.54719 7.33399 6.00195H9.33301C10.022 6.00195 10.5791 6.00131 11.0293 6.03809C11.4873 6.07551 11.8937 6.15471 12.2705 6.34668L12.4883 6.46875C12.984 6.7728 13.3878 7.20854 13.6533 7.72949L13.7197 7.87207C13.8642 8.20859 13.9292 8.56974 13.9619 8.9707C13.9987 9.42092 13.998 9.97799 13.998 10.667V12.665ZM18.165 9.33301C18.165 10.022 18.1657 10.5791 18.1289 11.0293C18.0961 11.4302 18.0311 11.7914 17.8867 12.1279L17.8203 12.2705C17.5549 12.7914 17.1509 13.2272 16.6553 13.5313L16.4365 13.6533C16.0599 13.8452 15.6541 13.9245 15.1963 13.9619C14.8593 13.9895 14.4624 13.9935 13.9951 13.9951C13.9935 14.4624 13.9895 14.8593 13.9619 15.1963C13.9292 15.597 13.864 15.9576 13.7197 16.2939L13.6533 16.4365C13.3878 16.9576 12.9841 17.3941 12.4883 17.6982L12.2705 17.8203C11.8937 18.0123 11.4873 18.0915 11.0293 18.1289C10.5791 18.1657 10.022 18.165 9.33301 18.165H6.5C5.81091 18.165 5.25395 18.1657 4.80371 18.1289C4.40306 18.0962 4.04235 18.031 3.70606 17.8867L3.56348 17.8203C3.04244 17.5548 2.60585 17.151 2.30176 16.6553L2.17969 16.4365C1.98788 16.0599 1.90851 15.6541 1.87109 15.1963C1.83431 14.746 1.83496 14.1891 1.83496 13.5V10.667C1.83496 9.978 1.83432 9.42091 1.87109 8.9707C1.90851 8.5127 1.98772 8.10625 2.17969 7.72949L2.30176 7.51172C2.60586 7.0159 3.04236 6.6122 3.56348 6.34668L3.70606 6.28027C4.04237 6.136 4.40303 6.07083 4.80371 6.03809C5.14051 6.01057 5.53708 6.00551 6.00391 6.00391C6.00551 5.53708 6.01057 5.14051 6.03809 4.80371C6.0755 4.34588 6.15483 3.94012 6.34668 3.56348L6.46875 3.34473C6.77282 2.84912 7.20856 2.44514 7.72949 2.17969L7.87207 2.11328C8.20855 1.96886 8.56979 1.90385 8.9707 1.87109C9.42091 1.83432 9.978 1.83496 10.667 1.83496H13.5C14.1891 1.83496 14.746 1.83431 15.1963 1.87109C15.6541 1.90851 16.0599 1.98788 16.4365 2.17969L16.6553 2.30176C17.151 2.60585 17.5548 3.04244 17.8203 3.56348L17.8867 3.70606C18.031 4.04235 18.0962 4.40306 18.1289 4.80371C18.1657 5.25395 18.165 5.81091 18.165 6.5V9.33301Z"></path></svg>复制';
            copyButton.addEventListener('click', () => {
                copyToClipboard(textToProcess);
            });
            buttonContainer.appendChild(copyButton);

            // 如果包含HTML样板，则创建预览按钮
            if (containsHtmlBoilerplate && languagetype === 'html') {
                const previewCodeButton = document.createElement('button');
                previewCodeButton.classList.add('preview-button');
                previewCodeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="shrink-0" aria-hidden="true"><path d="M10 4C14.0285 4 16.6432 7.30578 17.6602 8.86621L17.7402 8.99902C18.0858 9.62459 18.0858 10.3754 17.7402 11.001L17.6602 11.1338C16.6432 12.6942 14.0285 16 10 16C6.22298 16 3.68865 13.0942 2.54883 11.4453L2.33985 11.1338C1.88802 10.4404 1.88802 9.55955 2.33985 8.86621L2.54883 8.55469C3.68865 6.90581 6.22298 4 10 4ZM10 5C6.74739 5 4.47588 7.53 3.38086 9.11035L3.17774 9.41211C2.94217 9.77359 2.94217 10.2264 3.17774 10.5879L3.38086 10.8896C4.47588 12.47 6.74739 15 10 15C13.4691 15 15.8223 12.1222 16.8223 10.5879L16.8994 10.4482C17.0321 10.1621 17.0321 9.83791 16.8994 9.55176L16.8223 9.41211C15.8223 7.87782 13.4691 5 10 5ZM10 7C11.6569 7 13 8.34315 13 10C13 11.6569 11.6569 13 10 13C8.34315 13 7 11.6569 7 10C7 8.34315 8.34315 7 10 7ZM10 8C8.89543 8 8 8.89543 8 10C8 11.1046 8.89543 12 10 12C11.1046 12 12 11.1046 12 10C12 8.89543 11.1046 8 10 8Z"></path></svg>预览';
                previewCodeButton.addEventListener('click', () => {
                    preview(textToProcess);
                });
                buttonContainer.appendChild(previewCodeButton);
            } else if (firstClassName) {
                const eiditorButton = document.createElement('button');
                eiditorButton.classList.add('editor-buttom');
                eiditorButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path d="M12.0303 4.11328C13.4406 2.70317 15.7275 2.70305 17.1377 4.11328C18.5474 5.52355 18.5476 7.81057 17.1377 9.2207L10.8457 15.5117C10.522 15.8354 10.2868 16.0723 10.0547 16.2627L9.82031 16.4395C9.61539 16.5794 9.39783 16.7003 9.1709 16.7998L8.94141 16.8916C8.75976 16.9582 8.57206 17.0072 8.35547 17.0518L7.59082 17.1865L5.19727 17.5859C5.05455 17.6097 4.90286 17.6358 4.77441 17.6455C4.67576 17.653 4.54196 17.6555 4.39648 17.6201L4.24707 17.5703C4.02415 17.4746 3.84119 17.3068 3.72559 17.0957L3.67969 17.0029C3.59322 16.8013 3.59553 16.6073 3.60547 16.4756C3.61519 16.3473 3.6403 16.1963 3.66406 16.0537L4.06348 13.6602C4.1638 13.0582 4.22517 12.6732 4.3584 12.3096L4.45117 12.0791C4.55073 11.8521 4.67152 11.6346 4.81152 11.4297L4.9873 11.1953C5.17772 10.9632 5.4146 10.728 5.73828 10.4043L12.0303 4.11328ZM6.67871 11.3447C6.32926 11.6942 6.14542 11.8803 6.01953 12.0332L5.90918 12.1797C5.81574 12.3165 5.73539 12.4618 5.66895 12.6133L5.60742 12.7666C5.52668 12.9869 5.48332 13.229 5.375 13.8789L4.97656 16.2725L4.97559 16.2744H4.97852L7.37207 15.875L8.08887 15.749C8.25765 15.7147 8.37336 15.6839 8.4834 15.6436L8.63672 15.5811C8.78817 15.5146 8.93356 15.4342 9.07031 15.3408L9.2168 15.2305C9.36965 15.1046 9.55583 14.9207 9.90527 14.5713L14.8926 9.58301L11.666 6.35742L6.67871 11.3447ZM16.1963 5.05371C15.3054 4.16304 13.8616 4.16305 12.9707 5.05371L12.6074 5.41602L15.833 8.64258L16.1963 8.2793C17.0869 7.38845 17.0869 5.94456 16.1963 5.05371Z"></path><path d="M4.58301 1.7832C4.72589 1.7832 4.84877 1.88437 4.87695 2.02441C4.99384 2.60873 5.22432 3.11642 5.58398 3.50391C5.94115 3.88854 6.44253 4.172 7.13281 4.28711C7.27713 4.3114 7.38267 4.43665 7.38281 4.58301C7.38281 4.7295 7.27723 4.8546 7.13281 4.87891C6.44249 4.99401 5.94116 5.27746 5.58398 5.66211C5.26908 6.00126 5.05404 6.43267 4.92676 6.92676L4.87695 7.1416C4.84891 7.28183 4.72601 7.38281 4.58301 7.38281C4.44013 7.38267 4.31709 7.28173 4.28906 7.1416C4.17212 6.55728 3.94179 6.04956 3.58203 5.66211C3.22483 5.27757 2.72347 4.99395 2.0332 4.87891C1.88897 4.85446 1.7832 4.72938 1.7832 4.58301C1.78335 4.43673 1.88902 4.3115 2.0332 4.28711C2.72366 4.17203 3.22481 3.88861 3.58203 3.50391C3.94186 3.11638 4.17214 2.60888 4.28906 2.02441L4.30371 1.97363C4.34801 1.86052 4.45804 1.78333 4.58301 1.7832Z"></path></svg>编辑';
                eiditorButton.addEventListener('click', () => {
                    editor(textToProcess, languagetype);
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
    function editor(code, type) {
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
                    xstongzhi('已成功复制到剪贴板');
                })
                .catch(err => {
                    console.error('复制失败: ', err);
                    xstongzhi('复制失败');
                });
        } else {
            xstongzhi('复制失败');
        }
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
    generateUserMessageIndex();
    wrapTablesInGeminiMessages();
    copycode();
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
        span.title = item.sessionId.replace('.json', '');
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
            li.style.opacity = '0';
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
    const userConfirmed = confirm('您确定要退出登录吗？');
    if (!userConfirmed) { return }
    try {
        const response = await fetch('/user/postlogout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
        });
        // const json = await response.json();
        if (response.ok) {
            window.location.href = '/signup.html';
        }
    } catch (error) {
        console.error('Error during login:', error);
    }
};

//显示通知
function xstongzhi(text, time) {
    if (!text) { return };
    console.log(text);
    const xstime = time || 1000;
    const tongzhi = document.getElementById('tongzhi');
    const p = document.createElement('p');
    p.innerText = text;
    tongzhi.prepend(p);
    setTimeout(() => { p.remove() }, xstime);
}
//清理缓存
function cleanOldCache() {
    const now = Date.now();
    const timeout = 24 * 60 * 60 * 1000; //24小时
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (/^\d{13}$/.test(key)) {
            const timestamp = parseInt(key, 10);
            if (!isNaN(timestamp) && now - timestamp > timeout) {
                localStorage.removeItem(key);
            }
        }
    }
}
window.addEventListener('load', cleanOldCache);
//设置apikey
function sendyouapikey(text) {
    if (text === 'close') { setapikeybox.style.display = 'none'; return };
    const apikey = yourapikey.value;
    if (!apikey) { setapikeybox.style.display = 'none'; return };
    if (apikey.length < 36 || apikey.length > 45 || !apikey.startsWith('AI')) { xstongzhi('请输入正确格式的API_KEY'); return };
    socket.emit('sendapikey', apikey);
    yourapikey.value = '';
    xstongzhi('正在验证，请稍后...', 2000)
}
