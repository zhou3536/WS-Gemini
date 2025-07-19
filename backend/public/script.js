
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

