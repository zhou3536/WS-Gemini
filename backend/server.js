import dotenv from 'dotenv';
dotenv.config();

import { initializeAuth } from './auth.js';

import express from "express";
import http from "http";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import cookieParser from 'cookie-parser'; // <--- 新增：引入 cookie-parser

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const COOKIE_SECRET = process.env.cookieSecret;
const CUSTOM_BASE_URL = process.env.PROXYURL;
const users = JSON.parse(process.env.users);

if (!API_KEY) {
    console.error("错误：请在 .env 文件中设置您的 GEMINI_API_KEY");
    process.exit(1);
}
if(CUSTOM_BASE_URL){console.log('代理地址：',CUSTOM_BASE_URL);}
const genAI = new GoogleGenerativeAI(API_KEY);
const historiesDir = path.join(__dirname, "histories");
if (!fs.existsSync(historiesDir)) {
    fs.mkdirSync(historiesDir);
}

app.use(express.json());
initializeAuth(app, users, COOKIE_SECRET);

const cachetime = 120 * 60 * 1000;
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: cachetime,
    etag: true,
}));

// <--- 新增：将 cookieParser 应用到 Socket.IO 的握手阶段
// 这样在 Socket.IO 连接时，它的 req 对象也会被解析 signed cookies
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
    // console.log("客户端已连接");

    // <--- 在这里获取用户 ID
    const userId = socket.request.signedCookies && socket.request.signedCookies.user_id;
    if (userId) {
        console.log(`Socket.IO 客户端连接成功，用户ID: ${userId}`);
        // 你可以将 userId 存储在 socket 对象上，以便后续事件处理函数使用
        socket.userId = userId;
    } else {
        console.log("Socket.IO 客户端连接成功，但未找到用户 ID 或未认证，断开连接。");
        socket.emit("error", { message: "登录已过期，请刷新网页重新登录，如果你刚刚登录过了，可能是你的浏览器禁用了cookie！" });
        socket.disconnect();
        return;
    }

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

    socket.on("disconnect", () => {
        console.log(`Socket.IO 客户端连接断开，${socket.userId ?`用户ID: ${socket.userId}` : ''}`);
    });
});

async function handleNewMessage(socket, data) {
    // 确保从 socket 对象获取 userId
    const userId = socket.userId;
    if (!userId) {
        console.error('未认证用户尝试发送消息。');
        socket.emit("APIerror", { message: "未认证，请重新登录。" });
        return;
    }
    // ... 原有的逻辑 ...
    // 将收到的用户消息立即回显给发送方
    const fileCount = data.files ? data.files.length : 0;
    socket.emit("userMessageEcho", { prompt: data.prompt, fileCount });

    let { sessionId, prompt, files, model, useWebSearch } = data;
    let isNewSession = false; // 标记是否为新会话

    // 1. 会话和历史记录管理
    // 现在需要根据 userId 来管理历史记录
    // 例如：将 historiesDir 调整为 histories/userId/
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
        console.log('User ID:', userId, 'Session ID:', sessionId, ' Model:', model, ' Websearch:', useWebSearch); // <--- 增加用户ID日志
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

server.listen(port, host, () => {
    console.log(`服务器正在 http://${host}:${port} 上运行`);
});