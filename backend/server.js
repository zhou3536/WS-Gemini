import dotenv from 'dotenv';
dotenv.config();

import { initializeAuth } from './auth.js';

import express from "express";
import http from "http";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import cookieParser from 'cookie-parser';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;
const COOKIE_SECRET = process.env.cookieSecret;
const CUSTOM_BASE_URL = process.env.PROXYURL;

let users;


if (CUSTOM_BASE_URL) { console.log('代理地址：', CUSTOM_BASE_URL); }
const historiesDir = path.join(__dirname, "histories");
if (!fs.existsSync(historiesDir)) { fs.mkdirSync(historiesDir); }

app.use(express.json());
const loadJson = async () => {
    try {
        const content = await readFile('./users.json', 'utf-8');
        users = JSON.parse(content);
    } catch (err) {
        console.error("用户配置文件./users.json，读取失败", err);
        process.exit(1);
    }
};

const cachetime = 120 * 60 * 1000;
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: cachetime,
    etag: true,
}));

const io = new Server(server, {
    cors: {
        origin: "*", // 根据你的前端地址调整
        methods: ["GET", "POST"]
    },
    // 将 cookieParser 作为中间件添加到 Socket.IO 握手阶段
    allowRequest: (req, callback) => {
        cookieParser(COOKIE_SECRET)(req, {}, () => {
            // 在这里，req.signedCookies 就会被解析
            callback(null, true);
        });
    }
});


io.on("connection", (socket) => {
    const userId = socket.request.signedCookies && socket.request.signedCookies.user_id;
    if (userId) {
        socket.userId = userId;
        const loginuser = users.find(user => user.userId === userId);
        if (loginuser && loginuser.API_KEY) {
            socket.userApiKey = loginuser.API_KEY;
            socket.userApiKeyCipher = '*'.repeat(30) + socket.userApiKey.slice(30);
            socket.emit("APIKEY", socket.userApiKeyCipher)
        } else {
            socket.emit("tongzhi", "账户没有配置API_KEY，请配置API_KEY");
        }
    } else {
        console.log("Socket.IO 客户端连接成功，但未找到用户 ID 或未认证，跳转登录页面");
        socket.emit('refresh', '/login.html');
        socket.emit("error", { message: "登录已过期，请刷新网页重新登录，如果你刚刚登录过了，可能是你的浏览器禁用了cookie！" });
        socket.disconnect();
        return;
    }
    console.log('Socket.IO 客户端连接成功 用户ID:', userId);
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

    socket.on("disconnect", () => {
        console.log(`Socket.IO 客户端连接断开，${socket.userId ? `用户ID: ${socket.userId}` : ''}`);
    });
});

//添加和验证API_KEY
async function setapikey(socket, data) {
    if (!data) { return; }

    // 验证 API key 是否可用
    try {
        const testAI = new GoogleGenerativeAI(data.trim());
        const testModel = testAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }, { baseUrl: CUSTOM_BASE_URL });
        const testResult = await testModel.generateContent("Hello");
    } catch (error) {
        let errorMessage = "API_KEY 无效，未知错误";
        if (error.status > 399) {
            errorMessage = `Gemini返回错误代码${error.status}
            400：API_KEY格式不正确，
            401：API_KEY无效、过期、被禁用，
            403：API_KEY没有足够的权限或者超出免费层级。`;
        } else if (error.message) {
            errorMessage = `API_KEY 无效，${error.message}`;
        }
        socket.emit('tongzhi', errorMessage);
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

    await writeFile('./users.json', JSON.stringify(users, null, 2), 'utf-8');

    socket.userApiKey = data.trim();
    socket.userApiKeyCipher = '*'.repeat(30) + socket.userApiKey.slice(30);
    socket.emit('tongzhi', 'API_KEY验证成功')
    socket.emit("APIKEY", socket.userApiKeyCipher)

    console.log(socket.userId, "用户更新API_KEY：", socket.userApiKeyCipher);
}

async function handleNewMessage(socket, data) {
    // 确保从 socket 对象获取 userId
    const userId = socket.userId;
    const userApiKey = socket.userApiKey;
    if (!userId && !userApiKey) {
        console.error('未登录或未配置API_KEY');
        socket.emit("APIerror", { message: "未登录或未配置API_KEY" });
        return;
    }
    const genAI = new GoogleGenerativeAI(userApiKey);
    // 将收到的用户消息立即回显给发送方
    const fileCount = data.files ? data.files.length : 0;
    socket.emit("userMessageEcho", { prompt: data.prompt, fileCount });

    let { sessionId, prompt, files, model, useWebSearch } = data;
    let isNewSession = false; // 标记是否为新会话

    // 1. 现在需要根据 userId 来管理历史记录
    const userHistoriesDir = path.join(historiesDir, userId);
    if (!fs.existsSync(userHistoriesDir)) {
        fs.mkdirSync(userHistoriesDir);
    }

    if (!sessionId) {
        isNewSession = true;
        sessionId = `${Date.now()}.json`;
        socket.emit("sessionCreated", { sessionId });
    }

    const historyPath = path.join(userHistoriesDir, sessionId); // <--- 修改：使用用户专属目录
    let history = [];
    if (!isNewSession && fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    }

    // 2. 构建请求
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

    // 3. 调用Gemini API
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

        // 4. 保存历史记录
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

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
    const userHistoriesDir = path.join(historiesDir, userId); // <--- 修改：使用用户专属目录
    const historyPath = path.join(userHistoriesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        try {
            const historyData = fs.readFileSync(historyPath, "utf-8");
            const history = JSON.parse(historyData);
            socket.emit("historyLoaded", { history: history });
        } catch (error) {
            console.error(`加载历史记录失败 ${sessionId} (用户: ${userId}):`, error);
            socket.emit("historyerror", { message: `无法加载会话历史 (${sessionId})，文件可能已损坏。` });
        }
    } else {
        socket.emit("historyerror", { message: "找不到指定的会话历史,开始新的会话" });
        await listHistories(socket);
    }
}

async function getHistoriesList(userId) { // <--- 修改：接收 userId 参数
    if (!userId) {
        console.error('未认证用户尝试获取历史列表。');
        return [];
    }
    const userHistoriesDir = path.join(historiesDir, userId); // <--- 修改：使用用户专属目录
    if (!fs.existsSync(userHistoriesDir)) {
        fs.mkdirSync(userHistoriesDir); // 如果用户目录不存在，创建它
        return []; // 返回空列表
    }
    try {
        const files = fs.readdirSync(userHistoriesDir) // <--- 修改：读取用户专属目录
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => b.split('.')[0] - a.split('.')[0]);

        const historyList = files.map(file => {
            const filePath = path.join(userHistoriesDir, file); // <--- 修改：路径
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const history = JSON.parse(content);
                const firstUserMessage = history.find(msg => msg.role === 'user');
                const title = firstUserMessage ? firstUserMessage.parts[0].text.substring(0, 50) : '无标题';
                return { sessionId: file, title };
            } catch (error) {
                console.error(`处理历史文件失败 ${file} (用户: ${userId}):`, error);
                return { sessionId: file, title: '无效的历史记录' };
            }
        });
        return historyList;
    } catch (error) {
        console.error("获取历史记录列表失败:", error);
        return [];
    }
}


async function listHistories(socket) {
    const userId = socket.userId; // <--- 从 socket 获取 userId
    const historyList = await getHistoriesList(userId); // <--- 传递 userId
    socket.emit('historiesListed', { list: historyList });
}

async function handleDeleteHistory(socket, sessionId) {
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试删除历史。');
        socket.emit("error", { message: "未认证，无法删除历史。" });
        return;
    }
    const userHistoriesDir = path.join(historiesDir, userId); // <--- 修改：使用用户专属目录
    const historyPath = path.join(userHistoriesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
        await listHistories(socket);
    } else {
        await listHistories(socket);
        socket.emit("error", { message: "找不到要删除的会话历史。" });
    }
}

const startServer = async () => {
    await loadJson();
    initializeAuth(app, users, COOKIE_SECRET);
    server.listen(port, host, () => {
        console.log(`服务器正在 http://${host}:${port} 上运行`);
    });
};

startServer();