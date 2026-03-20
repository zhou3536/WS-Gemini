// 定义一个数组，包含所有滑块的ID及其对应的显示值ID
const sliders = [
    { id: 'temperatureSlider', valueId: 'temperatureValue', type: 'float' },
    { id: 'maxOutputTokensSlider', valueId: 'maxOutputTokensValue', type: 'int' },
    { id: 'topPSlider', valueId: 'topPValue', type: 'float' },
    { id: 'topKSlider', valueId: 'topKValue', type: 'int' }
];
let defaultModelConfig = {
    "temperature": 0.5,
    "maxOutputTokens": 4096,
    "topP": 1,
    "topK": 40
};

function restoreModelConfigFromCache() {
    const configString = localStorage.getItem('modelConfigCache');
    if (!configString) {
        console.warn('缓存中未找到模型配置。');
        return;
    }
    defaultModelConfig = JSON.parse(configString);
};
restoreModelConfigFromCache();

function RestoreDefaultsModelConfig() {
    const userConfirmed = confirm(`恢复默认参数？`);
    if (!userConfirmed) { return };
    defaultModelConfig = {
        "temperature": 0.5,
        "maxOutputTokens": 4096,
        "topP": 1,
        "topK": 40
    }
    sliders.forEach(slider => {
        const input = document.getElementById(slider.id);
        const key = slider.id.replace("Slider", "")
        document.getElementById(slider.valueId).innerText = defaultModelConfig[key];
        input.value = defaultModelConfig[key];
    });
    saveModelConfigToCache()
};
function openModelConfig(text) {
    sliders.forEach(slider => {
        const input = document.getElementById(slider.id);
        const valueDisplay = document.getElementById(slider.valueId);
        const key = slider.id.replace("Slider", "")
        valueDisplay.innerText = defaultModelConfig[key];
        input.value = defaultModelConfig[key];
        input.addEventListener('input', () => { valueDisplay.innerText = input.value; });
    });
    if (text) ModelConfig.showModal();
    document.getElementById('yourapikey').blur();
}
openModelConfig()
//获取所有滑块的当前值，并将其转换为对应的类型。
function getModelConfig() {
    sliders.forEach(slider => {
        const input = document.getElementById(slider.id);
        const key = slider.id.replace("Slider", "")
        defaultModelConfig[key] = +input.value;
    });
    saveModelConfigToCache();
    ModelConfig.close();
    console.log(defaultModelConfig);
};




function saveModelConfigToCache() {
    localStorage.setItem('modelConfigCache', JSON.stringify(defaultModelConfig));
};


function DecodeData(part, text) {
    // console.log(text);
    // console.log(part);
    // console.log(part.inlineData.mimeType);
    txtBox.innerText = '';
    const button = document.createElement('button');
    button.innerText = '×';
    button.addEventListener('click', () => txtBox.style.display = 'none');
    txtBox.appendChild(button);
    txtBox.style.display = 'block';

    if (part.inlineData.mimeType === "text/plain") {
        // let text = atob(part.inlineData.data);
        let text = base64Decode(part.inlineData.data);
        const div = document.createElement('div');
        div.innerText = text;
        txtBox.appendChild(div);
    } else if (part.inlineData.mimeType === "image/png") {
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${part.inlineData.data}`;
        txtBox.appendChild(img);
    } else {
        const p = document.createElement('p');
        p.innerText = text + '\n没有预览';
        txtBox.appendChild(p);
    }
}

function base64Decode(str) {
    const binary = atob(str);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
}