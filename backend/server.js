import dotenv from 'dotenv';
dotenv.config();

// 引入密码认证模块
import { initializeAuth } from './auth.js';

// 将所有 CommonJS 的 require 转换为 ES Module 的 import
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

// 在 ES Module 中，__dirname 和 __filename 不再是全局变量，需要手动获取
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("错误：请在 .env 文件中设置您的 GEMINI_API_KEY");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const historiesDir = path.join(__dirname, "histories"); // __dirname 现在已定义
if (!fs.existsSync(historiesDir)) {
    fs.mkdirSync(historiesDir);
}

app.use(express.json());
initializeAuth(app, process.env.accessPassword, process.env.cookieSecret);
// app.use(express.static(path.join(__dirname, "public"))); 
const cachetime = 120 * 60 * 1000;
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: cachetime,
    etag: true,
}));

io.on("connection", (socket) => {
    // console.log("客户端已连接");
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
        // console.log("客户端已断开");
    });
});

async function handleNewMessage(socket, data) {
    // 将收到的用户消息立即回显给发送方
    const fileCount = data.files ? data.files.length : 0;//接收到文件数量
    socket.emit("userMessageEcho", { prompt: data.prompt, fileCount });

    let { sessionId, prompt, files, model, useWebSearch } = data;
    let isNewSession = false; // 标记是否为新会话

    // 1. 会话和历史记录管理
    if (!sessionId) {
        isNewSession = true;
        sessionId = `${Date.now()}.json`;
        socket.emit("sessionCreated", { sessionId });
        // 不再在这里创建空白文件 fs.writeFileSync(path.join(historiesDir, sessionId), JSON.stringify([]));
    }

    const historyPath = path.join(historiesDir, sessionId);
    let history = []; // 默认历史记录为空数组
    if (!isNewSession && fs.existsSync(historyPath)) { // 如果是旧会话且文件存在，则加载
        history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    }
    // 如果是新会话，或者旧会话但文件不存在，history 依然是 []

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
        console.log('ID:', sessionId, ' modal:', model, ' Web search:', useWebSearch);
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

        const geminiModel = genAI.getGenerativeModel(modelParams);

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

        // 4. 保存历史记录 - 只有当API调用成功后才保存
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

        socket.emit("streamEnd");

        // 在新消息处理完成后，将更新的历史记录列表发送回客户端
        await listHistories(socket);


    } catch (error) {
        console.error("Gemini API 调用失败:", error);

        let clientMessage = "与Gemini的通信出现问题。"; // 默认的通用错误信息
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
        // 关键：如果API失败，且是新会话，history文件不会被创建
    }
}

async function handleLoadHistory(socket, sessionId) {
    const historyPath = path.join(historiesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        try {
            const historyData = fs.readFileSync(historyPath, "utf-8");
            const history = JSON.parse(historyData);
            socket.emit("historyLoaded", { history: history });
        } catch (error) {
            console.error(`加载历史记录失败 ${sessionId}:`, error);
            socket.emit("historyerror", { message: `无法加载会话历史 (${sessionId})，文件可能已损坏。` });
        }
    } else {
        // 如果找不到历史文件，可能需要通知前端
        socket.emit("historyerror", { message: "找不到指定的会话历史,开始新的会话" });
    }
}

async function getHistoriesList() {
    try {
        const files = fs.readdirSync(historiesDir)
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => b.split('.')[0] - a.split('.')[0]); // 按时间戳降序排序

        const historyList = files.map(file => {
            const filePath = path.join(historiesDir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const history = JSON.parse(content);
                const firstUserMessage = history.find(msg => msg.role === 'user');
                const title = firstUserMessage ? firstUserMessage.parts[0].text.substring(0, 50) : '无标题'; // 截取前50个字符
                return { sessionId: file, title };
            } catch (error) {
                console.error(`处理历史文件失败 ${file}:`, error);
                return { sessionId: file, title: '无效的历史记录' }; // 返回一个错误提示
            }
        });
        return historyList;
    } catch (error) {
        console.error("获取历史记录列表失败:", error);
        return [];
    }
}


async function listHistories(socket) {
    const historyList = await getHistoriesList();
    socket.emit('historiesListed', { list: historyList });
}

async function handleDeleteHistory(socket, sessionId) {
    const historyPath = path.join(historiesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
        await listHistories(socket);
    } else {
        socket.emit("error", { message: "找不到要删除的会话历史。" });
    }
}

server.listen(port, host, () => {
    ""
    console.log(`服务器正在 http://${host}:${port} 上运行`);
});
