import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { readFile, writeFile, readdir, unlink, access, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CUSTOM_BASE_URL = process.env.PROXYURL;
const KEY2 = process.env.KEY2;

if (CUSTOM_BASE_URL) {
    console.log('代理地址:', CUSTOM_BASE_URL);
} else {
    console.log('代理地址：直连');
}
const historiesDir = path.join(__dirname, "histories");
if (!fs.existsSync(historiesDir)) { fs.mkdirSync(historiesDir); }

let users = [];
let io = null;
const activechat = new Map();
export function initializeGemini(usersArray, ioInstance) {
    users = usersArray;
    io = ioInstance;
    io.on("connection", (socket) => {
        const loginId = socket.request.signedCookies?.session_id?.userId;
        const loginToken = socket.request.signedCookies?.session_id?.sessionToken;
        const loginuser = users.find(user => user.userId === loginId && user.sessionToken === loginToken)
        if (loginuser) {
            socket.user = loginuser;
            socket.userId = loginId;
            socket.historiesList = [];
            activechat.set(socket.id, socket.userId);
            if (loginuser.API_KEY) {
                socket.userApiKey = loginuser.API_KEY;
                socket.userApiKeyCipher = '*'.repeat(20) + socket.userApiKey.slice(35);
                socket.emit("APIKEY", socket.userApiKeyCipher)
            } else {
                socket.emit("tongzhi", "账户没有配置API_KEY，请配置API_KEY");
            }
        } else {
            console.log("Socket.IO 客户端连接成功，但未找到用户 ID 或未认证，跳转登录页面");
            socket.emit('refresh', '/signup.html');
            socket.disconnect();
            return;
        }
        console.log(`用户连接:${loginuser.username}`);
        listHistories(socket, 'login');

        socket.on("newMessage", async (data) => {
            await handleNewMessage(socket, data);
        });

        socket.on("loadHistory", async (data) => {
            await handleLoadHistory(socket, data.chatId);
        });

        socket.on("deleteHistory", async (data) => {
            await handleDeleteHistory(socket, data.chatId);
        });
        socket.on("sendapikey", async (data) => {
            await setapikey(socket, data);
        });
        socket.on("SimpleMessage", async (data) => {
            await Simplemessage(socket, data);
        });
        socket.on("disconnect", () => {
            activechat.delete(socket.id);
        });
    });
};
//简单接口
async function Simplemessage(socket, data) {
    if (!data) return;

    try {
        const ai = new GoogleGenAI({
            apiKey: socket.userApiKey,
            httpOptions: { baseUrl: CUSTOM_BASE_URL }
        });

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-lite',
            contents: [{ role: 'user', parts: [{ text: data }] }],
            config: {}
        });

        let fullResponse = "";

        for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullResponse += chunkText;
                socket.emit("streamChunk", { chunk: chunkText });
            }
        }

        socket.emit("streamEnd");

    } catch (error) {
        let errorMessage = error.message || "未知错误";
        console.error("AI Error:", error);
        socket.emit('tongzhi', `错误状态: ${error.status || 'Error'}，${errorMessage}`);
    }
}
async function shortmessage(socket, historydata) {
    if (!historydata) return;

    try {
        const ai = new GoogleGenAI({
            apiKey: KEY2,
            httpOptions: { baseUrl: CUSTOM_BASE_URL }
        });

        const chat = ai.chats.create({
            model: "gemini-2.5-flash-lite",
            history: historydata,
        });

        const response1 = await chat.sendMessage({
            message: "根据以上对话生成标题。要求：越短越好，只返回标题，不要解释，不要引号，不要任何额外文字，标题不超过20个字",
            config: { temperature: 0.2, maxOutputTokens: 20 }
        });
        // console.log('ai创建标题成功');
        return response1.text;
    } catch (error) {
        // console.log('ai创建标题失败', `错误状态: ${error.status}`);
        return '';
    }
}

//添加和验证API_KEY
async function setapikey(socket, data) {
    if (!data) { return; }
    try {
        const ai = new GoogleGenAI({
            apiKey: data.trim(),
            httpOptions: { baseUrl: CUSTOM_BASE_URL }
        });
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-lite',
            contents: "Hello",
            config: {}
        });
    } catch (error) {
        let errorMessage = "API_KEY无效，未知错误";
        if (error.status === 400) {
            errorMessage = 'API_KEY格式不正确';
        } else if (error.status === 401) {
            errorMessage = 'API_KEY无效、过期、被禁用';
        } else if (error.status === 403) {
            errorMessage = 'API_KEY没有权限或超出免费层级';
        } else if (error.message) {
            errorMessage = `API_KEY无效，${error.message}`;
        };

        if (error.status) {
            socket.emit('tongzhi', `${errorMessage}，错误代码${error.status}`);
        } else {
            socket.emit('tongzhi', '网络连接错误，无法连接到API地址');
        };

        return;
    }
    // API key 验证通过
    const user = users.find(user => user.userId === socket.userId);
    if (user) {
        user.API_KEY = data.trim();
    } else {
        socket.emit('tongzhi', '设置失败');
        return;
    }
    try {
        await writeFile('./users.json', JSON.stringify(users, null, 2), 'utf-8');
        socket.userApiKey = data.trim();
        socket.userApiKeyCipher = '*'.repeat(30) + socket.userApiKey.slice(30);
        socket.emit('tongzhi', 'API_KEY验证成功')
        socket.emit("APIKEY", socket.userApiKeyCipher)
        console.log(socket.user.username, "用户更新API_KEY：", socket.userApiKeyCipher);
    } catch (writeError) {
        console.error(`写入 users.json 失败 (用户: ${socket.userId}):`, writeError);
        socket.emit('tongzhi', 'API_KEY保存失败');
    }
}

async function handleNewMessage(socket, data) {
    const userId = socket.userId;
    const userApiKey = socket.userApiKey;
    socket.emit("userMessageEcho", true);
    if (!userId || !userApiKey) {
        socket.emit("APIerror", { message: "未登录或未配置API_KEY" });
        return;
    }
    const ai = new GoogleGenAI({
        apiKey: userApiKey,
        httpOptions: { baseUrl: CUSTOM_BASE_URL }
    });
    let { chatId, userMessage, model, useWebSearch, defaultModelConfig } = data;
    let isNewSession = false;
    const userHistoriesDir = path.join(historiesDir, userId);
    if (!chatId) {
        isNewSession = true;
        chatId = getTimeId();
    }
    const historyPath = path.join(userHistoriesDir, `${chatId}.json`);
    try {
        await access(userHistoriesDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await mkdir(userHistoriesDir);
        } else {
            console.error(`创建用户历史目录失败 ${userHistoriesDir} (用户: ${userId}):`, error);
            socket.emit('historyLoaded', { message: '无法创建会话目录，请稍后再试。' });
            return;
        }
    }

    let history = [];
    if (!isNewSession) {
        try {
            const historyData = await readFile(historyPath, "utf-8");
            history = JSON.parse(historyData);
        } catch (error) {
            console.error(`加载或解析历史记录失败 ${historyPath} (用户: ${userId}):`, error);
            socket.emit("APIerror", { message: `无法加载会话历史 (${chatId})，文件可能已损坏。请尝试新的会话。` });
            return;
        };
    };

    // 调用Gemini API
    try {
        console.log('User ID:', userId, ' Model:', model);

        let config = defaultModelConfig || {};

        if (useWebSearch) {
            config.tools = [{ googleSearch: {} }];
        }
        const chat = ai.chats.create({
            model: model,
            history: history,
            config
        });
        const responseStream = await chat.sendMessageStream({
            message: userMessage
        });
        // 测试消息
        // const responseStream = {
        //     async *[Symbol.asyncIterator]() {
        //         const texts = [
        //             "你好，",
        //             "这是",
        //             "一条",
        //             "测试消息。"
        //         ];

        //         for (const t of texts) {
        //             await new Promise(r => setTimeout(r, 200)); // 模拟流式延迟
        //             yield { text: t };
        //         }
        //     }
        // };
        let fullResponse = "";
        for await (const chunk of responseStream) {
            const chunkText = chunk.text || "";
            if (chunkText) {
                fullResponse += chunkText;
                socket.emit("streamChunk", { chunk: chunkText });
            }
        }
        socket.emit("streamEnd");
        if (isNewSession) {
            socket.emit("sessionCreated", { chatId });
            const prompt = userMessage.parts[0].text;
            const title = prompt.length > 20 ? prompt.slice(0, 20) + "..." : prompt;
            let NewSessionTitle = { chatId, title };
            if (prompt.length > 20 || userMessage.parts.length > 1) {
                const historytext = [];
                historytext.push(userMessage);
                historytext.push({ role: "model", parts: [{ text: fullResponse }] });
                const res = await shortmessage(socket, historytext);
                if (res) NewSessionTitle = { chatId, title: res };
            }
            await updateHistoriesList(socket, 'add', NewSessionTitle);
        }

        // 保存历史记录
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
        await listHistories(socket);

    } catch (error) {
        console.error("遇到错误。", error);

        let clientMessage = "遇到错误。";
        let statusCode = null;

        if (error.message) {
            clientMessage = error.message;
        }

        if (error.status) {
            statusCode = error.status;
        } else if (error.response && error.response.status) {
            statusCode = error.response.status;
        } else if (error.code) {
            statusCode = error.code;
        }

        if (statusCode) {
            clientMessage += ` (错误代码: ${statusCode})`;
        }

        socket.emit("APIerror", {
            message: clientMessage,
            statusCode: statusCode
        });
    }
}

async function handleLoadHistory(socket, chatId) {
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试加载历史。');
        socket.emit("historyLoaded", { message: "未认证，无法加载历史。" });
        return;
    }
    const userHistoriesDir = path.join(historiesDir, userId);
    const historyPath = path.join(userHistoriesDir, `${chatId}.json`);
    try {
        await access(historyPath);
        const historyData = await readFile(historyPath, "utf-8");
        const history = JSON.parse(historyData);
        socket.emit("historyLoaded", { status: true, history: history });
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`尝试加载不存在的历史文件: ${historyPath}`);
            socket.emit("historyLoaded", { message: "找不到指定的会话历史, 请开始新的会话。" });
        } else {
            console.error(`加载或解析历史记录失败 ${historyPath} (用户: ${userId}):`, error);
            socket.emit("historyLoaded", { message: `无法加载会话历史 (${chatId})，文件可能已损坏。` });
        }
        await updateHistoriesList(socket, 'del', chatId);
        await listHistories(socket);
    };
};

async function listHistories(socket, text) {
    if (text === 'login') {
        const dir = path.join(__dirname, "histories", socket.userId);
        const file = path.join(dir, "historiesList.json");
        let data;
        try {
            data = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (err) {
            // console.log(err.message)
            data = [];
        }
        socket.historiesList.push(...data);
    }
    socket.emit('historiesListed', { list: socket.historiesList });
}

async function handleDeleteHistory(socket, chatId) {
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试删除历史。');
        socket.emit("error", { message: "未认证，无法删除历史。" });
        return;
    }
    const userHistoriesDir = path.join(historiesDir, userId);
    const historyPath = path.join(userHistoriesDir, `${chatId}.json`);
    try {
        await unlink(historyPath);
        await updateHistoriesList(socket, 'del', chatId)

        await listHistories(socket);
        console.log(`成功删除历史文件: ${historyPath}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`尝试删除不存在的历史文件: ${historyPath}`);
            socket.emit("error", { message: "找不到要删除的会话历史。" });
        } else {
            console.error(`删除历史文件失败 ${historyPath} (用户: ${userId}):`, error);
            socket.emit("error", { message: "删除会话历史时发生错误。" });
        }
        await updateHistoriesList(socket, 'del', chatId)
        await listHistories(socket);
    }
}
async function updateHistoriesList(socket, text, data) {
    const userHistoriesDir = path.join(historiesDir, socket.userId);
    const historiesList = path.join(userHistoriesDir, 'historiesList.json');

    if (text === 'del') {
        const index = socket.historiesList.findIndex(item => item.chatId === data);
        if (index !== -1) {
            socket.historiesList.splice(index, 1);
        }
    } else if (text === 'add') {
        socket.historiesList.push(data)
    }
    await writeFile(historiesList, JSON.stringify(socket.historiesList, null, 2), 'utf-8');
};

function getTimeId() {
    const d = new Date(Date.now());
    const YY = String(d.getFullYear()).slice(-2);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const SSS = String(d.getMilliseconds()).padStart(3, '0');
    return YY + MM + DD + HH + mm + ss + SSS;
}

//强制下线
export function disconnectChat(userId) {
    for (const [socketId, uid] of activechat) {
        if (uid === userId) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.disconnect(true);
            activechat.delete(socketId);
        }
    }
}
