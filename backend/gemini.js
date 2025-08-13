import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { readFile, writeFile, readdir, unlink, access, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CUSTOM_BASE_URL = process.env.PROXYURL;

if (CUSTOM_BASE_URL) {
    console.log('代理地址:', CUSTOM_BASE_URL);
} else {
    console.log('代理地址：未配置代理');
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
            socket.userId = loginId;
            activechat.set(socket.id, socket.userId);
            if (loginuser.API_KEY) {
                socket.userApiKey = loginuser.API_KEY;
                socket.userApiKeyCipher = '*'.repeat(30) + socket.userApiKey.slice(30);
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
        console.log(`Socket.IO用户连接:${loginuser.username}`);
        listHistories(socket);

        socket.on("newMessage", async (data) => {
            await handleNewMessage(socket, data);
        });

        socket.on("loadHistory", async (data) => {
            await handleLoadHistory(socket, data.sessionId);
        });

        socket.on("deleteHistory", async (data) => {
            await handleDeleteHistory(socket, data.sessionId);
        });
        socket.on("sendapikey", async (data) => {
            await setapikey(socket, data);
        });
        socket.on("SimpleMessage", async (data) => {
            await Simplemessage(socket, data);
        });
        socket.on("disconnect", () => {
            activechat.delete(socket.id);
            console.log(`Socket.IO用户断开:${loginuser.username}`);
        });
    });
};
//简单接口
async function Simplemessage(socket, data) {
    if (!data) { return }
    try {
        const AI = new GoogleGenerativeAI(socket.userApiKey);
        const Model = AI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }, { baseUrl: CUSTOM_BASE_URL });
        const chat = Model.startChat({ history: [] });
        const result = await chat.sendMessageStream([{ text: data }]);
        let fullResponse = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;
            socket.emit("streamChunk", { chunk: chunkText });
        }
        socket.emit("streamEnd");

    } catch (error) {
        let errorMessage = "未知错误";
        if (error.message) errorMessage = error.message
        socket.emit('tongzhi', `错误代码${error.status}，${errorMessage}`);
    };
}

//添加和验证API_KEY
async function setapikey(socket, data) {
    if (!data) { return; }
    try {
        const testAI = new GoogleGenerativeAI(data.trim());
        const testModel = testAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }, { baseUrl: CUSTOM_BASE_URL });
        const testResult = await testModel.generateContent("Hello");
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
        }
        socket.emit('tongzhi', `错误代码${error.status}，${errorMessage}`);
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
        console.log(socket.userId, "用户更新API_KEY：", socket.userApiKeyCipher);
    } catch (writeError) {
        console.error(`写入 users.json 失败 (用户: ${socket.userId}):`, writeError);
        socket.emit('tongzhi', 'API_KEY保存失败');
    }
}

async function handleNewMessage(socket, data) {
    const userId = socket.userId;
    const userApiKey = socket.userApiKey;
    const fileCount = data.files ? data.files.length : 0;
    socket.emit("userMessageEcho", { prompt: data.prompt, fileCount });
    if (!userId || !userApiKey) {
        socket.emit("APIerror", { message: "未登录或未配置API_KEY" });
        return;
    }
    const genAI = new GoogleGenerativeAI(userApiKey);
    let { sessionId, prompt, files, model, useWebSearch } = data;
    let isNewSession = false;

    const userHistoriesDir = path.join(historiesDir, userId);
    if (!sessionId) {
        isNewSession = true;
        sessionId = `${Date.now()}.json`;
        socket.emit("sessionCreated", { sessionId });
    }
    const historyPath = path.join(userHistoriesDir, sessionId);
    try {
        await access(userHistoriesDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await mkdir(userHistoriesDir);
        } else {
            console.error(`创建用户历史目录失败 ${userHistoriesDir} (用户: ${userId}):`, error);
            socket.emit('historyerror', { message: '无法创建会话目录，请稍后再试。' });
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
            socket.emit("APIerror", { message: `无法加载会话历史 (${sessionId})，文件可能已损坏。请尝试新的会话。` });
            return;
        }
    }

    // 构建请求
    const userMessage = { role: "user", parts: [{ text: prompt }] };
    if (files && files.length > 0) {
        const fileParts = files.map(file => ({
            inlineData: {
                data: file.data,
                mimeType: file.mimeType,
            },
        }));
        userMessage.parts.push(...fileParts);
    }

    // 调用Gemini API
    try {
        console.log('User ID:', userId, 'Session ID:', sessionId, ' Model:', model, ' Websearch:', useWebSearch, ' API_KEY:', socket.userApiKeyCipher);
        const generationConfig = { temperature: 0.5, topP: 0.8, topK: 40, maxOutputTokens: 20480 };

        // 构建模型参数对象
        const modelParams = {
            model,
            generationConfig,
        };

        // 根据 useWebSearch 条件添加 tools
        if (useWebSearch) {
            modelParams.tools = [{ google_search: {} }];
        }

        const geminiModel = genAI.getGenerativeModel(modelParams, { baseUrl: CUSTOM_BASE_URL },);

        // 如果是新会话，history 在这里是空数组
        // 如果是旧会话，history 包含了之前的内容
        const chat = geminiModel.startChat({
            history: history,
            generationConfig: {
                // 可由前端传递参数
            },
        });

        const result = await chat.sendMessageStream(userMessage.parts);

        let fullResponse = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;
            socket.emit("streamChunk", { chunk: chunkText });
        }

        // 保存历史记录
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');

        socket.emit("streamEnd");
        await listHistories(socket);

    } catch (error) {
        console.error("Gemini API 调用失败:", error);

        let clientMessage = "与Gemini的通信出现问题。";
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

async function handleLoadHistory(socket, sessionId) {
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试加载历史。');
        socket.emit("historyerror", { message: "未认证，无法加载历史。" });
        return;
    }
    const userHistoriesDir = path.join(historiesDir, userId);
    const historyPath = path.join(userHistoriesDir, sessionId);
    try {
        await access(historyPath);
        const historyData = await readFile(historyPath, "utf-8");
        const history = JSON.parse(historyData);
        socket.emit("historyLoaded", { history: history });
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`尝试加载不存在的历史文件: ${historyPath}`);
            socket.emit("historyerror", { message: "找不到指定的会话历史, 请开始新的会话。" });
        } else {
            console.error(`加载或解析历史记录失败 ${historyPath} (用户: ${userId}):`, error);
            socket.emit("historyerror", { message: `无法加载会话历史 (${sessionId})，文件可能已损坏。` });
        }
        await listHistories(socket);
    }
}

async function getHistoriesList(userId) {
    if (!userId) {
        console.error('未认证用户尝试获取历史列表。');
        return [];
    }
    const userHistoriesDir = path.join(historiesDir, userId);
    try {
        await mkdir(userHistoriesDir, { recursive: true });
        const files = await readdir(userHistoriesDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        const historyListPromises = jsonFiles.map(async (file) => {
            const filePath = path.join(userHistoriesDir, file);
            try {
                const content = await readFile(filePath, 'utf-8');
                const history = JSON.parse(content);
                const firstUserMessage = history.find(msg => msg.role === 'user');
                const title = firstUserMessage && firstUserMessage.parts && firstUserMessage.parts[0] && firstUserMessage.parts[0].text
                    ? firstUserMessage.parts[0].text.substring(0, 30)
                    : '无标题';
                return { sessionId: file, title };
            } catch (error) {
                console.error(`处理历史文件失败 ${file} (用户: ${userId}):`, error);
                return { sessionId: file, title: '无效的历史记录' };
            }
        });
        const historyList = await Promise.all(historyListPromises);
        historyList.sort((a, b) => {
            return parseInt(b.sessionId, 10) - parseInt(a.sessionId, 10);
        });
        return historyList;
    } catch (error) {
        console.error("获取历史记录列表失败:", error);
        return [];
    }
}

async function listHistories(socket) {
    const userId = socket.userId;
    const historyList = await getHistoriesList(userId);
    socket.emit('historiesListed', { list: historyList });
}

async function handleDeleteHistory(socket, sessionId) {
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试删除历史。');
        socket.emit("error", { message: "未认证，无法删除历史。" });
        return;
    }
    const userHistoriesDir = path.join(historiesDir, userId);
    const historyPath = path.join(userHistoriesDir, sessionId);
    try {
        await unlink(historyPath);
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
        await listHistories(socket);
    }
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
